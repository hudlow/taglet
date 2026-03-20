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

import type { Argument, ArgumentTuple, Transformer } from "./common.js";
import { block } from "./block.js";
import { inline } from "./inline.js";

/*
 * A `Taglet` is the result of using the `taglet` tagged template function. It
 * Can be rendered or transformed and its arguments can be interrogated, but
 * the template itself is opaque.
 */
export interface Taglet<T extends readonly Argument[]> {
  /*
   * The arguments that can be dynamically transformed and are not part of the
   * static template.
   */
  readonly args: T;
  /*
   * A function to create a new `Taglet` by transforming this one's arguments
   * with a mapping function.
   */
  transform<R extends Argument>(transformer: Transformer<R>): Taglet<ArgumentTuple<T, R>>;
  /*
   * Renders the `Taglet` to a string using its built-in arguments.
   */
  toString(): string;
  /*
   * Renders the `Taglet` to a string using a fresh set of arguments.
   */
  toString(...args: ArgumentTuple<T>): string;
}

/*
 * A tagged-template function to improve the ergonomics and apply
 * lazy evaluation to templates used for code generation.
 *
 * @param TemplateStringsArray segments the static template segments created with the template
 * @param {...ArgumentTuple} args the lazily rendered arguments rendered in the template
 */
export function taglet<T extends readonly Argument[]>(
  segments: TemplateStringsArray,
  ...args: T
): Taglet<T> {
  if (segments.raw[0][0] === "|" || segments.raw[0][0] === ">") {
    return block(segments.raw, args);
  }

  return inline(segments.raw, args);
}

export default taglet;
