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

import { TagletError, taglet } from "./index.js";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

describe("taglet", () => {
  test("basic substitution", () => {
    assert.equal(taglet`1 ${2} 3`.toString(), "1 2 3");
  });
  test("basic transformation", () => {
    assert.equal(
      taglet`1 ${2} 3`.transform((x) => (typeof x === "number" ? x * 2 : x)).toString(),
      "1 4 3",
    );
  });
  test("preserves whitespace", () => {
    assert.equal(
      taglet`1
      2
      3
      4`.toString(),
      `1
      2
      3
      4`,
    );
  });
  describe("block templates", () => {
    describe("block header", () => {
      test("chomping indicator can precede indention indicator", () => {
        assert.equal(
          taglet`|-12
            1
          `.toString(),
          "1",
        );
      });
      test("indention indicator can precede chomping indicator", () => {
        assert.equal(
          taglet`|12-
            1
          `.toString(),
          "1",
        );
      });
      test("whitespace before header is treated as inline", () => {
        assert.equal(
          taglet` |
            1
          `.toString(),
          " |\n            1\n          ",
        );
      });
      test("whitespace between header indicators is illegal", () => {
        assert.throws(
          () => taglet`| 2
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
        assert.throws(
          () => taglet`| -
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
        assert.throws(
          () => taglet`|2 +
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
        assert.throws(
          () => taglet`|- 2
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
        assert.throws(
          () => taglet`| + 2
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
        assert.throws(
          () => taglet`| 2 -
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
      });
      test("whitespace after header is illegal", () => {
        assert.throws(
          () => taglet`| 
            1
            2
            3
          `,
          (e) => e instanceof TagletError.BlockHeaderError,
        );
      });
    });
    describe("indention inference", () => {
      test("empty leading lines are ignored", () => {
        assert.equal(
          taglet`|

  
    
      
        
          
            1
              2
                3
          `.toString(),
          "\n\n\n\n\n\n1\n  2\n    3\n",
        );
      });
      test("non-empty blank leading lines are illegal", () => {
        assert.throws(
          () => taglet`|
              
            1
              2
                3
          `,
          {
            message:
              "[line 1] WhiteSpaceError: too much whitespace on line prior to first non-empty line",
          },
        );
      });
      test("all non-blank lines following the first non-blank line must share its indention", () => {
        assert.throws(
          () => taglet`|
              
                1
              2
            3
          `,
          {
            message: "[line 3] WhiteSpaceError: insufficient indentation",
          },
        );
      });
    });
    describe("literal block templates", () => {
      describe("indention", () => {
        test("strips indention", () => {
          assert.equal(
            taglet`|
              1
              2
              3
            `.toString(),
            "1\n2\n3\n",
          );
        });
        test("preserves semantic indention", () => {
          assert.equal(
            taglet`|
              1
                2
              3
            `.toString(),
            "1\n  2\n3\n",
          );
        });
        test("allows indention with tabs", () => {
          assert.equal(
            taglet`|
              1
                2
              3
        `.toString(),
            "1\n  2\n3\n",
          );
        });
        test("allows indention with tabs and spaces", () => {
          assert.equal(
            taglet`|
              1
                2
              3
        `.toString(),
            "1\n  2\n3\n",
          );
        });
        test("preserves indention for arguments with new lines", () => {
          assert.equal(
            taglet`|
              1
                ${"2\n3"}
              4
            `.toString(),
            "1\n  2\n  3\n4\n",
          );
        });
        test("semantic whitespace before the first non-empty line is illegal", () => {
          assert.throws(() =>
            taglet`|
                
              1
              2
            `.toString(),
          );
        });
      });
    });
    describe("folded block templates", () => {
      test("folds adjacent non-blank lines", () => {
        assert.equal(
          taglet`>
          1
          2
          3
        `.toString(),
          "1 2 3\n",
        );
      });
      test("doesn't fold blank lines", () => {
        assert.equal(
          taglet`>
          1

          2
          3
        `.toString(),
          "1\n\n2 3\n",
        );
      });
      test("doesn't fold lines with semantic indention", () => {
        assert.equal(
          taglet`>
          1
            2
        `.toString(),
          "1\n  2\n",
        );
        assert.equal(
          taglet`>8
          1
          2
        `.toString(),
          "  1\n  2\n",
        );
      });
      test("an escaped line ending prevents folding", () => {
        assert.equal(
          taglet`>
          line one\
          line two
        `.toString(),
          "line one\nline two\n",
        );
      });
    });
    describe("chomping: clip", () => {
      test("leaves one trailing new line", () => {
        assert.equal(
          taglet`|
            1`.toString(),
          "1\n",
        );
        assert.equal(
          taglet`|
            1
          `.toString(),
          "1\n",
        );
        assert.equal(
          taglet`|
            1
    
          `.toString(),
          "1\n",
        );
        assert.equal(
          taglet`|
            1
    
    
    
    
    
    
          `.toString(),
          "1\n",
        );
      });
      test("preserves whitespace beyond the trimmed indention", () => {
        assert.equal(
          taglet`|
            1
              
          `.toString(),
          "1\n  \n",
        );
      });
      test("treats non-empty blank line as any other non-empty line", () => {
        assert.equal(
          taglet`|
            1
            2
            
            
              
          `.toString(),
          "1\n2\n\n\n  \n",
        );
      });
      test("an escaped line ending folds two lines without a space", () => {
        assert.equal(
          taglet`|
          line one\
          -thousand
        `.toString(),
          "line one-thousand\n",
        );
      });
      test("semantic whitespace before first non-blank line is illegal", () => {
        assert.throws(
          () => taglet`|
          
        1
        2
        3
      `,
        );
      });
    });
    describe("chomping: strip", () => {
      test("trims all trailing new lines", () => {
        assert.equal(
          taglet`|-
          1`.toString(),
          "1",
        );
        assert.equal(
          taglet`|-
          1
        `.toString(),
          "1",
        );
        assert.equal(
          taglet`|-
          1
    
        `.toString(),
          "1",
        );
        assert.equal(
          taglet`|-
          1
    
    
    
    
    
    
        `.toString(),
          "1",
        );
      });
    });
    describe("chomping: keep", () => {
      test("leaves trailing new lines intact", () => {
        assert.equal(
          taglet`|+
          1`.toString(),
          "1",
        );
        assert.equal(
          taglet`|+
          1
        `.toString(),
          "1\n",
        );
        assert.equal(
          taglet`|+
          1
    
        `.toString(),
          "1\n\n",
        );
        assert.equal(
          taglet`|+
          1
    
    
    
    
    
    
        `.toString(),
          "1\n\n\n\n\n\n\n",
        );
      });
      test("treats non-empty blank line as any other non-empty line", () => {
        assert.equal(
          taglet`|-
          1
          2
          
          
            
        `.toString(),
          "1\n2\n\n\n  ",
        );
      });
    });
  });
  describe("escaping", () => {
    test("backslashes normally do not need escaping", () => {
      assert.equal(taglet`a\b`.toString(), String.raw`a\b`);
    });
    test("line endings can be escaped", () => {
      assert.equal(
        taglet`|-
          1\
          2
        `.toString(),
        "12",
      );
      assert.equal(
        taglet`>-
          1\
          2
        `.toString(),
        "1\n2",
      );
    });
    test("backslashes preceding end of line or escaped end of line must be escaped", () => {
      assert.equal(
        taglet`|-
          1\\
          2
        `.toString(),
        "1\\\n2",
      );
      assert.equal(
        taglet`>-
          1\\
          2
        `.toString(),
        String.raw`1\ 2`,
      );
      assert.equal(
        taglet`|-
          1\\\
          2
        `.toString(),
        String.raw`1\2`,
      );
      assert.equal(
        taglet`>-
          1\\\
          2
        `.toString(),
        "1\\\n2",
      );
      assert.equal(
        taglet`|-
          1\\\\
          2
        `.toString(),
        "1\\\\\n2",
      );
      assert.equal(
        taglet`>-
          1\\\\
          2
        `.toString(),
        String.raw`1\\ 2`,
      );
    });
  });
});
