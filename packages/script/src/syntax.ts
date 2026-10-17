/**
 * Anivo Script syntax: lexer and parser (docs/09 "Anivo Script").
 *
 * One statement on one line. An indent of 2 spaces makes a line a child of
 * the line above it (container children, step actions). A hand-written
 * parser gives clear errors with a line, a column, and a hint.
 */

export interface Pos {
  line: number;
  col: number;
}

export interface ScriptError extends Pos {
  message: string;
  hint?: string;
}

export type Token =
  | { t: "word"; v: string; pos: Pos }
  | { t: "string"; v: string; pos: Pos }
  | { t: "arrow"; pos: Pos }
  | { t: "comma"; pos: Pos }
  | { t: "delay"; v: string; pos: Pos }
  | { t: "kv"; k: string; v: string; quoted: boolean; pos: Pos };

export interface Line {
  indent: number;
  tokens: Token[];
  pos: Pos;
  children: Line[];
}

export class SyntaxErrors extends Error {
  constructor(readonly errors: ScriptError[]) {
    super(errors[0]?.message ?? "Syntax error");
  }
}

const WORD = /[A-Za-z0-9_.:*#@/-]/;

/** Tokens of one line. Comments start with # at the start of a token. */
function lexLine(text: string, line: number, errors: ScriptError[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  const pos = () => ({ line, col: i + 1 });
  const readString = (): string | null => {
    const start = i;
    i++; // opening quote
    let s = "";
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && i + 1 < text.length) {
        const n = text[i + 1]!;
        s += n === "n" ? "\n" : n;
        i += 2;
      } else s += text[i++];
    }
    if (text[i] !== '"') {
      errors.push({ line, col: start + 1, message: "The string has no closing quote.", hint: 'Add a " at the end of the text.' });
      return null;
    }
    i++;
    return s;
  };

  while (i < text.length) {
    const c = text[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "#" && (i === 0 || text[i - 1] === " ")) break; // comment
    const p = pos();
    if (c === '"') {
      const s = readString();
      if (s === null) return out;
      out.push({ t: "string", v: s, pos: p });
      continue;
    }
    if (c === "-" && text[i + 1] === ">") {
      out.push({ t: "arrow", pos: p });
      i += 2;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma", pos: p });
      i++;
      continue;
    }
    if (c === "+" && /[0-9.]/.test(text[i + 1] ?? "")) {
      i++;
      let v = "";
      while (i < text.length && /[0-9.a-z]/.test(text[i]!)) v += text[i++];
      out.push({ t: "delay", v, pos: p });
      continue;
    }
    if (WORD.test(c)) {
      let w = "";
      // A word can contain "->" for a connector reference: user->lb.
      while (i < text.length && (WORD.test(text[i]!) || (text[i] === "-" && text[i + 1] === ">") || (text[i] === ">" && text[i - 1] === "-") || text[i] === ",")) {
        if (text[i] === "," && !w.includes("=")) break;
        w += text[i++];
      }
      if (w === "") {
        // No progress: report the character and move on, so the lexer always ends.
        errors.push({ line, col: i + 1, message: `The character '${text[i]}' is not valid here.` });
        i++;
        continue;
      }
      if (text[i] === "=") {
        i++;
        if (text[i] === '"') {
          const s = readString();
          if (s === null) return out;
          out.push({ t: "kv", k: w, v: s, quoted: true, pos: p });
        } else {
          let v = "";
          while (i < text.length && text[i] !== " " && text[i] !== "\t") v += text[i++];
          out.push({ t: "kv", k: w, v, quoted: false, pos: p });
        }
        continue;
      }
      if (w.includes("=")) {
        const [k, ...rest] = w.split("=");
        out.push({ t: "kv", k: k!, v: rest.join("="), quoted: false, pos: p });
      } else out.push({ t: "word", v: w, pos: p });
      continue;
    }
    errors.push({ line, col: i + 1, message: `The character '${c}' is not valid here.`, hint: "Use words, quoted strings, numbers, key=value, ->, and commas." });
    i++;
  }
  return out;
}

/** Split text into lines with indents, and build the child tree. */
export function parseLines(text: string): { lines: Line[]; errors: ScriptError[] } {
  const errors: ScriptError[] = [];
  const roots: Line[] = [];
  const stack: Line[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (raw.trim() === "" || raw.trim().startsWith("#")) return;
    if (/^\t/.test(raw)) {
      errors.push({ line: lineNo, col: 1, message: "The line starts with a tab.", hint: "Use 2 spaces for each indent level." });
      return;
    }
    const indent = raw.length - raw.trimStart().length;
    if (indent % 2 !== 0) {
      errors.push({ line: lineNo, col: 1, message: `The indent is ${indent} spaces.`, hint: "Use 2 spaces for each indent level." });
      return;
    }
    const tokens = lexLine(raw, lineNo, errors);
    if (tokens.length === 0) return;
    const line: Line = { indent: indent / 2, tokens, pos: { line: lineNo, col: indent + 1 }, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= line.indent) stack.pop();
    if (line.indent === 0) roots.push(line);
    else {
      const parent = stack[stack.length - 1];
      if (!parent || parent.indent !== line.indent - 1) {
        errors.push({ line: lineNo, col: 1, message: "The indent is too deep.", hint: "Indent a child line by 2 spaces more than its parent line." });
        return;
      }
      parent.children.push(line);
    }
    stack.push(line);
  });
  return { lines: roots, errors };
}
