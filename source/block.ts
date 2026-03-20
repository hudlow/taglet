/*
 * © Copyright 2026 Dan Hudlow
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the “Software”), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { type Argument, TagletError, TagletImplementation, applyRawEscapes } from "./common.js";

// similar to https://yaml.org/spec/1.2.2/#81-block-scalar-styles
enum Style {
  LITERAL = 0, // retain line endings as-is
  FOLDED = 1, // fold lines without semantic indention
}

// similar to https://yaml.org/spec/1.2.2/#8112-block-chomping-indicator
enum Chomp {
  CLIP = 0, // ensure one new line at the end
  STRIP = 1, // strip new lines from the end
  KEEP = 2, // keep new lines at the end
}

enum Terminal {
  NONE = 0,
  NORMAL = 1,
  ESCAPED = 2,
}

interface BlockComponents {
  style: Style;
  chomp: Chomp;
  prefix: string;
  segments: readonly string[];
}

function parseBlockComponents(segments: readonly string[]): BlockComponents {
  const [head, ...tail] = segments;

  // prefix and chomp can be in either order
  const match =
    head.match(/^(?<style>\||>)(?<prefix>[0-9]+)?(?<chomp>-|\+)?\n/) ??
    head.match(/^(?<style>\||>)(?<chomp>-|\+)?(?<prefix>[0-9]+)?\n/);

  if (match === null) {
    throw new TagletError.BlockHeaderError(head.slice(0, head.search(/\n|$/)));
  }

  const newHead = head.slice(match[0].length);
  const style = match.groups?.style === "|" ? Style.LITERAL : Style.FOLDED;

  const prefixSpaceCount = Number.parseInt(match.groups?.prefix ?? "-1", 10);

  let prefix: string;
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
      throw new TagletError.ErrorOnLine(
        new TagletError.WhiteSpaceError(
          "too much whitespace on line prior to first non-empty line",
        ),
        tooLong + 1,
      );
    }
  }

  const chompDirective = match.groups?.chomp;

  let chomp = Chomp.CLIP;
  if (chompDirective) {
    chomp = chompDirective === "+" ? Chomp.KEEP : Chomp.STRIP;
  }

  return {
    chomp,
    prefix,
    segments: [newHead, ...tail],
    style,
  };
}

function getIndention(content: string): string {
  return content.match(/^[ \t]+/)?.[0] ?? "";
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
  //
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
      throw new TagletError.UnreachableError();
  }

  if (indentedLine.indexOf(indention) !== 0 && indention.indexOf(indentedLine) !== 0) {
    throw new TagletError.WhiteSpaceError("insufficient indentation");
  }

  return [
    applyRawEscapes(indentedLine.slice(indention.length), style === Style.LITERAL),
    terminal,
    remainder,
  ];
}

export function block<T extends readonly Argument[]>(
  rawSegments: readonly string[],
  args: T,
): TagletImplementation<T> {
  const { style, prefix, chomp, segments } = parseBlockComponents(rawSegments);

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
        let newTerminal: Terminal;
        [lineContent, newTerminal, remainder] = parseLine(remainder, prefix, style);
        const newIndention = getIndention(lineContent);

        // ...because we may need to fold them together, based on the rules
        // for the block style we're using
        let suffix: string;
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
        // we just completed a segment, so...

        // increment the segment index
        i++;

        // and if it's not the last segment
        if (i < segments.length) {
          // inject the preceding argument...
          taglet = taglet.withArg(i - 1, currentIndention);

          // and parse the first line of the next segment
          [lineContent, terminal, remainder] = parseLine(segments[i] ?? "", prefix, style);
        }
      }
    }
  } catch (error) {
    throw new TagletError.ErrorOnLine(error, currentSourceLine);
  }

  switch (chomp) {
    case Chomp.KEEP:
      return taglet;
    case Chomp.STRIP:
      return chompedTaglet;
    case Chomp.CLIP:
      return chompedTaglet.withSegment("\n");
    default:
      throw new TagletError.UnreachableError();
  }
}
