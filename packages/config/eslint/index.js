import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export function nodeConfig({ ignores = [], decorators = false } = {}) {
  return tseslint.config(
    { ignores: ["dist/**", "coverage/**", "migrations/**", ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "@typescript-eslint/consistent-type-imports": decorators ? "off" : ["error", { fixStyle: "inline-type-imports" }],
        "no-console": ["error", { allow: ["warn", "error"] }],
      },
    },
    prettier,
  );
}
