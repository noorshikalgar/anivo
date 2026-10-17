import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "assets/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Core packages must stay deterministic and isomorphic (docs/06, docs/10).
    files: ["packages/{schema,ops,engine,layout,render,script,lint}/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Core code is deterministic. Use the element seed." },
        { object: "Date", property: "now", message: "Core code is deterministic. Use the timeMs argument." },
        { object: "performance", property: "now", message: "Core code is deterministic. Use the timeMs argument." },
      ],
      "no-restricted-globals": ["error", "window", "document", "process", "Buffer"],
    },
  },
);
