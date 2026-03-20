# taglet

taglet is a zero-dependency utility for generating code, written in TypeScript.
It _mostly_ exists to improve the ergonomics of native ECMAScript [tagged
templates][ecmascript]. It can also be used to generate _partially_ abstract
code which is useful when the same code has multiple target formats (such as
TypeScript and JavaScript).

[ecmascript]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates

## Usage

taglet exports a single tagged template function called `taglet()` which returns
has special accommodations for multiline templates and returns
a `taglet.Taglet` — an object whose `toString()` function renders the template,
but which also exposes the ability to transform the arguments before rendering.

### Inline templates

Inline templates provide lazy evaluation and transformation, but do not modify
whitespace:

```javascript
const line = taglet`items[${1}] = ${2};`;

// render as-is:
console.log(line.toString());
// items[1] = 2;

// transform numbers:
const newLine = line.transform((arg) => (typeof arg === "number" ? arg * 2 : arg));
console.log(newLine.toString());
// items[2] = 4;

// supply substitute arguments at render-time:
console.log(line.toString(8, '"hippo"'));
// items[8] = "hippo";
```

With some narrow exceptions, all characters are preserved literally, including
backslashes. This means you don't have to double-backslash in most
circumstances:

```javascript
const line = taglet`const regexp = /\//;`;
console.log(line.toString());
// const regexp = /\//;
```

### Block templates

In addition to minimal escaping, lazy evaluation, and argument transformation,
block templates add several conveniences for multiline templates. First and
foremost, block templates trim excess indentation, allowing templates to flow
with code:

```javascript
function f() {
  return taglet`|
    const x = 1;
    const y = 2;
  `;
}

console.log(f().toString());
```

```javascript
const x = 1;
const y = 2;
```

Block templates also maintain indention for arguments that evaluate to multiple
lines:

```javascript
block = taglet`|
  function f(x) {
    ${["const c = 1;", "return x + c;"].join("\n")}
  }
`;

console.log(block.toString());
```

```javascript
function f(x) {
  const c = 1;
  return x + c;
}
```

Block templates are formatted very similarly to [block scalars in
YAML][yaml-block-scalars]. They begin with a header line consisting of:

1. A _style_ indicator: `|` for "literal" or `>` for "folded."
2. An optional _indention_ indicator: the number of spaces of non-semantic
   indention for the content. If omitted, the indention amount is inferred to be
   the leading whitespace of the first non-blank line.
3. An optional _chomping_ indicator: `-` to strip trailing empty lines and `+`
   to keep trailing empty lines. If omitted, a single trailing empty line is
   preserved or appended.

Like YAML, when both optional indicators are present, they may be in either
order. Unlike YAML, any whitespace in the header line is illegal.

[yaml-block-scalars]: https://yaml.org/spec/1.2.2/#81-block-scalar-styles

#### Indention

Like YAML:

- When an indention indicator is present, the non-semantic indention prefix is
  the number of _spaces_ indicated.
- Blank lines that consist of the indention prefix or any truncation of the
  indention prefix are treated equivalently: as empty lines.
- Any other line which does not begin with the indention prefix is illegal.
- Non-empty blank lines preceding the first non-blank line are illegal.

Unlike YAML, when indention is inferred, the prefix may consist of tabs or
even a mixture of spaces and tabs.

```javascript
const block = taglet`|
  const x =
    y >= 0 ? 1 : -1;
`;

console.log(block.toString());
```

```javascript
const x = y >= 0 ? 1 : -1;
```

```javascript
const block = taglet`|0
  const x =
    y >= 0 ? 1 : -1;
`;

console.log(block.toString());
```

```javascript
const x = y >= 0 ? 1 : -1;
```

### Chomping

Like YAML:

- The strip indicator (`-`) truncates all trailing empty lines
- The keep indicator (`+`) preserves all trailing empty lines
- The default behavior is to preserve or, if necessary, append a single trailing
  empty line.

Also like YAML, all non-empty lines are treated the same even if they are blank.

```javascript
const block = taglet`|
  const x = 1;
  const y = 2;


`;

console.log(block.toString());
```

```javascript
const x = 1;
const y = 2;
```

```javascript
const block2 = taglet`|
  const x = 1;
  const y = 2;`;

console.log(block.toString());
```

```javascript
const x = 1;
const y = 2;
```

```javascript
const block = taglet`|+
  const x = 1;
  const y = 2;


`;

console.log(block.toString());
```

```javascript
const x = 1;
const y = 2;
```

```javascript
const block = taglet`|-
  const x = 1;
  const y = 2;


`;

console.log(block.toString());
```

```javascript
const x = 1;
const y = 2;
```

#### Folding

Like YAML, for two adjacent lines to be folded, neither can have any semantic
leading whitespace. Unlike YAML, both lines must be non-empty.

```javascript
const block = taglet`>
  first
  second
  third
`;

console.log(block.toString());
```

```
first second third

```

```javascript
const block = taglet`>
  first
  second
  
  third
  fourth
`;

console.log(block.toString());
```

```
first second

third fourth

```

Folding behavior may be controlled directly with backslash-escaped line endings:

- For literal block templates, this folds a line with the subsequent line,
  _without inserting a space_.
- For folded block templates, this ensures a line will not be folded.

Backslash-escaping is illegal on empty lines.

```javascript
const block = taglet`>
  first
  second\
  third
`;

console.log(block.toString());
```

```
first second
third

```

```javascript
const block = taglet`|
  one\
  -thousand
`;

console.log(block.toString());
```

```
one-thousand

```

### Glossary

- **blank line**: A line containing only whitespace
- **empty line**: A line containing no semantic characters
- **semantic** Preserved in a processed template
- **folding** Concatenating two lines together, separated by a space
- **chomping** Truncating trailing empty lines
