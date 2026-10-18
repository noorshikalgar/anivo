# 0003 — Built-in syntax highlighter for code blocks

- Status: accepted
- Date: 2026-10-18
- Changes: [04](../04-features.md) FR-CANVAS-12 ("Shiki for 30 languages")

## Context

FR-CANVAS-12 said: syntax colors with Shiki for 30 languages.
The renderer must be synchronous and must give the same frame in the browser and in Node (docs/06 "Core rule", decision 0002).
Shiki is asynchronous and loads a WASM engine and grammar files.

## Decision

Use a small built-in highlighter (`packages/render/src/highlight.ts`): keywords, strings, comments, numbers, function names, type names, and punctuation.
It supports TypeScript, JavaScript, Python, Go, Rust, Java (and Kotlin), SQL, Bash, YAML, and JSON.
Token colors are theme tokens, so code blocks follow the scene theme.

## Reasons

1. It is synchronous and deterministic, with no new dependency.
2. Explainer videos show short snippets. Simple token colors are enough for them.
3. The colors come from the scene theme, so a theme change updates the code.

## Consequences

- Block comments and multi-line strings are not tracked across lines.
- More languages need a keyword list and a comment marker in `highlight.ts`.
- Shiki can come back later as an optional pre-tokenizer that writes tokens into the scene, if users need exact VS Code colors.
