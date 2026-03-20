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

/*
 * Anything with a `.toString()` method can be used as a template argument.
 */
export interface Argument {
  toString(): string;
}

/*
 * A fixed-length argument tuple.
 */
export type ArgumentTuple<
  Tuple extends readonly [...unknown[]],
  R extends Argument = Argument,
> = readonly [
  ...{
    [Index in keyof Tuple]: R;
  },
];

/*
 * A function to transform an argument
 */
export type Transformer<R extends Argument> = (
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
  args: readonly Argument[],
) => R;

export class TagletError extends Error {
  static ErrorOnLine = class extends TagletError {
    constructor(cause: unknown, line: number) {
      super(`[line ${line}] ${cause}`, { cause });
    }
  };

  static BlockHeaderError = class extends TagletError {
    readonly name = "BlockHeaderError";

    constructor(header: string) {
      super(`invalid block header: ${header}`);
    }
  };

  static WhiteSpaceError = class extends TagletError {
    readonly name = "WhiteSpaceError";
  };

  static UnreachableError = class extends TagletError {
    readonly name = "UnreachableError";

    constructor() {
      super("by design, this error should be unreachable");
    }
  };
}

export function applyRawEscapes(s: string, escapeToFold = true): string {
  return s.replaceAll(/((\\\\)*)\\(`|\$\{|\n)/g, (_0, $1, _2, $3) => {
    const backslashes = $1.slice($1.length / 2);
    if (escapeToFold && $3 === "\n") {
      return backslashes;
    }

    return backslashes + $3;
  });
}

function indentAdditionalLines(content: string, indention: string): string {
  if (indention === "") {
    return content;
  }

  return content.replaceAll("\n", `\n${indention}`);
}

export class TagletImplementation<T extends readonly Argument[]> {
  constructor(
    readonly sequence: readonly (string | number)[],
    readonly args: T,
    readonly indentions: Record<number, string> = {},
  ) {}

  toString(): string;
  toString(...args: ArgumentTuple<T>): string;
  toString(...args: ArgumentTuple<T>): string {
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

  transform<R extends Argument>(
    transformer: Transformer<R>,
  ): TagletImplementation<ArgumentTuple<T, R>> {
    return new TagletImplementation(
      this.sequence,
      this.args.map(transformer) as ArgumentTuple<T, R>,
    );
  }

  withSegment(segment: string): TagletImplementation<T> {
    if (segment === "") {
      return this;
    }

    return new TagletImplementation([...this.sequence, segment], this.args, this.indentions);
  }

  withArg(index: number, indention = ""): TagletImplementation<T> {
    return new TagletImplementation([...this.sequence, index], this.args, {
      ...this.indentions,
      [index]: indention,
    });
  }
}
