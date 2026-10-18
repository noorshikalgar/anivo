/**
 * A small synchronous syntax highlighter (decision 0003). The renderer must
 * be synchronous and give the same result in the browser and in Node, so it
 * does not use Shiki (asynchronous, WASM). Tokens: keyword, string, comment,
 * number, function, type, punctuation, plain.
 */
export type TokenKind = "keyword" | "string" | "comment" | "number" | "function" | "type" | "punct" | "plain";
export interface CodeToken {
  text: string;
  kind: TokenKind;
}

const KEYWORDS: Record<string, string[]> = {
  js: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "new", "class", "extends", "import", "from", "export", "default", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of", "this", "null", "undefined", "true", "false", "yield"],
  ts: ["interface", "type", "enum", "implements", "public", "private", "protected", "readonly", "as", "keyof", "namespace", "declare", "abstract"],
  py: ["def", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "is", "import", "from", "as", "class", "try", "except", "finally", "raise", "with", "lambda", "yield", "async", "await", "None", "True", "False", "pass", "break", "continue", "self"],
  go: ["func", "package", "import", "return", "if", "else", "for", "range", "switch", "case", "default", "go", "defer", "chan", "select", "struct", "interface", "map", "type", "var", "const", "nil", "true", "false", "err"],
  rust: ["fn", "let", "mut", "pub", "use", "mod", "struct", "enum", "impl", "trait", "match", "if", "else", "for", "while", "loop", "return", "self", "Self", "async", "await", "move", "ref", "true", "false", "Some", "None", "Ok", "Err"],
  java: ["public", "private", "protected", "class", "interface", "extends", "implements", "static", "final", "void", "return", "new", "if", "else", "for", "while", "try", "catch", "throw", "throws", "import", "package", "null", "true", "false", "this"],
  sql: ["select", "from", "where", "join", "left", "right", "inner", "outer", "on", "group", "by", "order", "having", "insert", "into", "values", "update", "set", "delete", "create", "table", "index", "primary", "key", "and", "or", "not", "null", "as", "limit"],
  bash: ["if", "then", "else", "fi", "for", "do", "done", "while", "case", "esac", "function", "return", "export", "echo", "cd", "sudo"],
  yaml: ["true", "false", "null"],
  json: ["true", "false", "null"],
};

const ALIASES: Record<string, string> = {
  javascript: "js", jsx: "js", typescript: "ts", tsx: "ts", python: "py", golang: "go", rs: "rust", shell: "bash", sh: "bash", zsh: "bash", yml: "yaml", kotlin: "java",
};

function keywordsFor(language: string): Set<string> {
  const lang = ALIASES[language] ?? language;
  const words = [...(KEYWORDS[lang] ?? []), ...(lang === "ts" ? KEYWORDS["js"]! : [])];
  return new Set(lang === "sql" ? words.flatMap((w) => [w, w.toUpperCase()]) : words);
}

function commentStart(language: string): string[] {
  const lang = ALIASES[language] ?? language;
  if (lang === "py" || lang === "bash" || lang === "yaml") return ["#"];
  if (lang === "sql") return ["--"];
  if (lang === "json") return [];
  return ["//"];
}

/** Tokens of one line. Block comments are not tracked across lines. */
export function highlightLine(line: string, language: string): CodeToken[] {
  const keywords = keywordsFor(language);
  const comments = commentStart(language);
  const out: CodeToken[] = [];
  let i = 0;
  const push = (text: string, kind: TokenKind) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  while (i < line.length) {
    const rest = line.slice(i);
    const c = line[i]!;
    const comment = comments.find((m) => rest.startsWith(m));
    if (comment) {
      push(rest, "comment");
      break;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === "\\" ? 2 : 1;
      push(line.slice(i, j + 1), "string");
      i = j + 1;
      continue;
    }
    const num = /^\d[\d_.]*(e[+-]?\d+)?/i.exec(rest);
    if (num && !/[\w$]/.test(line[i - 1] ?? "")) {
      push(num[0], "number");
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const w = word[0];
      const next = line[i + w.length];
      if (keywords.has(w)) push(w, "keyword");
      else if (next === "(") push(w, "function");
      else if (/^[A-Z]/.test(w)) push(w, "type");
      else if (language === "yaml" && line.slice(i + w.length).startsWith(":")) push(w, "function");
      else push(w, "plain");
      i += w.length;
      continue;
    }
    push(c, /[{}()[\];,.:=<>+\-*/%!&|?]/.test(c) ? "punct" : "plain");
    i++;
  }
  return out;
}

/** Theme token for each token kind. */
export const TOKEN_COLORS: Record<TokenKind, string> = {
  keyword: "accent",
  string: "success",
  comment: "muted",
  number: "warning",
  function: "purple",
  type: "teal",
  punct: "muted",
  plain: "text",
};

/** Line diff (longest common subsequence): same, removed, or added lines. */
export function diffLines(a: string[], b: string[]): { kind: "same" | "removed" | "added"; text: string }[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: { kind: "same" | "removed" | "added"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      out.push({ kind: "added", text: b[j]! });
      j++;
    } else {
      out.push({ kind: "removed", text: a[i]! });
      i++;
    }
  }
  return out;
}
