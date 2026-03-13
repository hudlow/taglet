/*
 * © Copyright 2026 Dan Hudlow
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the “Software”), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 * NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
 * OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/*
 * A tagged-template function to improve the ergonomics and apply
 * lazy evaluation to templates used for code generation.
 *
 * @param TemplateStringsArray segments the static template segments created with the template
 * @param {...Arguments} args the lazily rendered arguments rendered in the template
 */
export function taglet<T extends taglet.Arguments>(
  segments: TemplateStringsArray,
  ...args: taglet.Arguments<T>
): taglet.Taglet<T> {
  return taglet.exec(segments, ...args);
}

export namespace taglet {
  /*
   * Anything with a `.toString()` method can be used as a template argument.
   */
  export interface Argument {
    toString(): string;
  }

  /*
   * A fixed-length argument tuple.
   */
  export type Arguments<T extends readonly Argument[] = readonly Argument[]> = readonly [
    ...{ [K in keyof T]: Argument },
  ];

  /*
   * A function to transform an argument
   */
  export type Transformer = (
    /*
     * The input argument to be transformed
     */
    arg: Argument,
    /*
     * The zero-indexed position of the argument in the `Taglet`'s argument tuple.
     */
    index: number,
    /*
     * The `Taglet`'s full argument tuple
     */
    args: Arguments<readonly Argument[]>,
  ) => Argument;

  /*
   * A `Taglet` is the result of using the `taglet` tagged template function. It
   * Can be rendered or transformed and its arguments can be interrogated, but
   * the template itself is opaque.
   */
  export interface Taglet<T extends readonly Argument[] = readonly Argument[]> {
    /*
     * The arguments that can be dynamically transformed and are not part of the
     * static template.
     */
    readonly args: Arguments<T>;
    /*
     * A function to create a new `Taglet` by transforming this one's arguments
     * with a mapping function.
     */
    transform(transformer: Transformer): Taglet<Arguments<T>>;
    /*
     * Renders the `Taglet` to a string using its built-in arguments.
     */
    toString(): string;
    /*
     * Renders the `Taglet` to a string using a fresh set of arguments.
     */
    toString(...args: Arguments<T>): string;
  }

  /*
   * See taglet()
   */
  export function exec<T extends readonly Argument[]>(
    segments: TemplateStringsArray,
    ...args: Arguments<T>
  ): Taglet<T> {
    // if
    if (segments.raw[0][0] === "|" || segments.raw[0][0] === ">") {
      return block(segments.raw, args);
    }

    return inline(segments.raw, args);
  }

  // similar to https://yaml.org/spec/1.2.2/#81-block-scalar-styles
  enum Style {
    LITERAL, // retain line endings as-is
    FOLDED, // fold lines without semantic indention
  }

  // https://yaml.org/spec/1.2.2/#8112-block-chomping-indicator
  enum Chomp {
    CLIP, // ensure one new line at the end
    STRIP, // strip new lines from the end
    KEEP, // keep new lines at the end
  }

  interface BlockComponents {
    style: Style;
    chomp: Chomp;
    prefix: string;
    segments: readonly string[];
  }

  function inline<T extends readonly Argument[]>(segments: readonly string[], args: Arguments<T>) {
    return new TagletImplementation(
      segments
        .map((segment, index) => {
          if (index === 0) {
            return applyPrefixEscapes(applyRawEscapes(segment, Style.LITERAL));
          }

          return [index - 1, applyRawEscapes(segment, Style.LITERAL)];
        })
        .flat(),
      args,
    );
  }

  function block<T extends readonly Argument[]>(
    rawSegments: readonly string[],
    args: Arguments<T>,
  ) {
    const { style, prefix, chomp, segments } = parseBlockHeader(rawSegments);

    let taglet = new TagletImplementation([], args);
    let chompedTaglet = taglet;
    let currentSourceLine = 1;

    try {
      let currentIndention = "";
      let [lineContent, terminal, remainder] = parseLine(segments[0], prefix, style);

      // Each segment may be a part of a single line or it may span multiple
      // lines. As we iterate over segments, we're going to intersperse argument
      // indices into the sequence.
      //
      // Notice we do not increment `i` in the loop header. This is because we
      // use at least one loop iteration per line, so sometimes we stick around
      // on the same segment peeling lines off its head.
      for (let i = 0; i < segments.length; ) {
        taglet = taglet.withSegment(lineContent);

        // preserve a reference to the last taglet without empty trailing lines
        if (lineContent !== "") {
          chompedTaglet = taglet;
        }

        // there are additional lines in the segment
        if (terminal !== Terminal.NONE) {
          currentSourceLine++;

          // we need to look at the next line, but we're not quite done with
          // the previous line...
          let newTerminal;
          [lineContent, newTerminal, remainder] = parseLine(remainder, prefix, style);
          const newIndention = getIndention(lineContent);

          // ...because we may need to fold them together, based on the rules
          // for the block style we're using
          let suffix;
          if (
            style === Style.FOLDED &&
            terminal !== Terminal.ESCAPED &&
            currentIndention === "" &&
            newIndention === "" &&
            lineContent !== "" &&
            chompedTaglet === taglet // true only if previous line was empty
          ) {
            suffix = " ";
          } else if (style === Style.LITERAL && terminal === Terminal.ESCAPED) {
            suffix = "";
          } else {
            // either style is folded but the line wasn't eligible for folding
            // or style is literal and the line ending wasn't escaped
            suffix = "\n";
          }

          taglet = taglet.withSegment(suffix);
          currentIndention = newIndention;
          terminal = newTerminal;
        } else {
          // we just completed a segment...

          // increment the segment index
          i++;

          // if it's not the last segment...
          if (i < segments.length) {
            // inject the preceding argument
            taglet = taglet.withArg(i - 1, currentIndention);

            // and parse the first line of the next segment
            [lineContent, terminal, remainder] = parseLine(segments[i] ?? "", prefix, style);
          }
        }
      }
    } catch (e) {
      throw new error.ErrorOnLine(e, currentSourceLine);
    }

    switch (chomp) {
      case Chomp.KEEP:
        return taglet;
      case Chomp.STRIP:
        return chompedTaglet;
      case Chomp.CLIP:
        return chompedTaglet.withSegment("\n");
    }
  }

  function getIndention(content: string) {
    return content.match(/^[ \t]+/)?.[0] ?? "";
  }

  function parseBlockHeader(segments: readonly string[]): BlockComponents {
    const [head, ...tail] = segments;

    // prefix and chomp can be in either order
    const match =
      head.match(/^(?<style>\||>)(?<prefix>[0-9]+)?(?<chomp>-|\+)?\n/) ??
      head.match(/^(?<style>\||>)(?<chomp>-|\+)?(?<prefix>[0-9]+)?\n/);

    if (match === null) {
      throw new error.BlockHeaderError(head.slice(0, head.search(/\n|$/)));
    }

    const newHead = head.slice(match[0].length);
    const style = match.groups?.style === "|" ? Style.LITERAL : Style.FOLDED;

    const prefixSpaceCount = parseInt(match.groups?.prefix ?? "-1");

    let prefix;
    if (prefixSpaceCount !== -1) {
      prefix = " ".repeat(prefixSpaceCount);
    } else {
      const firstNonWhiteSpaceIndex = newHead.search(/[^ \t\n]|$/);
      const blanks = newHead.slice(0, firstNonWhiteSpaceIndex).split("\n");

      // the whitespace prefix on the first non-blank line (or, the whitespace
      // content of the last line if all are blank)
      prefix = blanks.at(-1) ?? "";

      // blank lines preceding the first non-blank line and longer than the
      // inferred prefix are illegal
      const tooLong = blanks.findIndex((l) => l.length > prefix.length);
      if (tooLong !== -1) {
        throw new error.ErrorOnLine(
          new error.WhiteSpaceError("too much whitespace on line prior to first non-empty line"),
          tooLong + 1,
        );
      }
    }

    const chompDirective = match.groups?.chomp;
    const chomp = chompDirective ? (chompDirective === "-" ? Chomp.STRIP : Chomp.KEEP) : Chomp.CLIP;

    return {
      style,
      prefix,
      chomp,
      segments: [newHead, ...tail],
    };
  }

  function applyPrefixEscapes(s: string) {
    return s.replace(/^((\\\\)*)\\(>|\|)/g, (_0, $1, _2, $3) => $1.slice($1.length / 2) + $3);
  }

  function applyRawEscapes(s: string, style: Style) {
    return s.replace(/((\\\\)*)\\(`|\$\{|\n)/g, (_0, $1, _2, $3) => {
      const backslashes = $1.slice($1.length / 2);
      if (style === Style.LITERAL && $3 === "\n") {
        return backslashes;
      }

      return backslashes + $3;
    });
  }

  function indentAdditionalLines(content: string, indention: string) {
    if (indention === "") return content;

    return content.replace(/\n/g, `\n${indention}`);
  }

  enum Terminal {
    NONE,
    NORMAL,
    ESCAPED,
  }

  function parseLine(
    input: string,
    indention: string,
    style: Style,
  ): [lineContent: string, terminal: Terminal, remainder: string] {
    const match = input.match(
      /(?<content>^|^[^\n]*[^\\\n])((?<pairs>(\\\\)*)(?<terminal>\\?\n|$))/,
    ) ?? [""];

    const pairs = match.groups?.pairs ?? "";
    const indentedLine = (match.groups?.content ?? "") + pairs.slice(pairs.length / 2);
    const remainder = input.slice(match[0].length);

    let terminal: Terminal;
    switch (match.groups?.terminal) {
      case "\n":
        terminal = Terminal.NORMAL;
        break;
      case "\\\n":
        terminal = Terminal.ESCAPED;
        break;
      case "":
        terminal = Terminal.NONE;
        break;
      default:
        // the above cases are exhaustive based on the regular expression
        throw new error.UnreachableError();
    }

    if (indentedLine.indexOf(indention) !== 0 && indention.indexOf(indentedLine) !== 0) {
      throw new error.WhiteSpaceError("insufficient indentation");
    }

    return [applyRawEscapes(indentedLine.slice(indention.length), style), terminal, remainder];
  }

  class TagletImplementation<
    T extends readonly Argument[] = readonly Argument[],
  > implements Taglet<T> {
    constructor(
      readonly sequence: readonly (string | number)[],
      readonly args: Arguments<T>,
      readonly indentions: Record<number, string> = {},
    ) {}

    toString(): string;
    toString(...args: Arguments<T>): string;
    toString(...args: Arguments<T>) {
      let result = "";
      for (const item of this.sequence) {
        if (typeof item === "number") {
          result += indentAdditionalLines(
            (args.length > 0 ? args : this.args)[item].toString(),
            this.indentions[item] ?? "",
          );
        } else {
          result += item;
        }
      }

      return result;
    }

    transform(transformer: Transformer) {
      return new TagletImplementation(this.sequence, this.args.map(transformer) as Arguments<T>);
    }

    withSegment(segment: string) {
      if (segment === "") {
        return this;
      }

      return new TagletImplementation(this.sequence.concat([segment]), this.args, this.indentions);
    }

    withArg(index: number, indention = "") {
      return new TagletImplementation(this.sequence.concat([index]), this.args, {
        ...this.indentions,
        [index]: indention,
      });
    }
  }

  export namespace error {
    export class Error extends globalThis.Error {}

    export class ErrorOnLine extends Error {
      constructor(cause: unknown, line: number) {
        super(`[line ${line}] ${cause}`, { cause });
      }
    }

    export class BlockHeaderError extends Error {
      readonly name = "BlockHeaderError";

      constructor(header: string) {
        super(`invalid block header: ${header}`);
      }
    }

    export class WhiteSpaceError extends Error {
      readonly name = "WhiteSpaceError";

      constructor(message: string) {
        super(message);
      }
    }

    export class UnreachableError extends Error {
      readonly name = "UnreachableError";

      constructor() {
        super("by design, this error should be unreachable");
      }
    }
  }
}
