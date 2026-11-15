import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const restrictedImports = {
  lib: ["@/app/*", "@/pages/*", "@/features/*", "@/components/*", "@/stores/*"],
  components: ["@/app/*", "@/pages/*", "@/features/*", "@/stores/*"],
  features: ["@/app/*", "@/pages/*"],
  pages: ["@/pages/*"],
};

function restrictedImportRule(patterns) {
  return [
    "error",
    {
      patterns: patterns.map((pattern) => ({
        group: [pattern],
        message: "Import violates the template dependency direction. Move shared code down a layer.",
      })),
    },
  ];
}

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "e2e-reports/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      import: importPlugin,
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.app.json", "./tsconfig.node.json"],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "object", "type"],
          "newlines-between": "always",
        },
      ],
      "import/no-cycle": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      // React hooks return plain callbacks (e.g. `t` from useTranslation);
      // destructuring them fires this rule with false positives across the app.
      "@typescript-eslint/unbound-method": "off",
      // We use TS types instead of runtime propTypes.
      "react/prop-types": "off",
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImportRule(restrictedImports.lib),
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImportRule(restrictedImports.components),
    },
  },
  {
    // shadcn/ui generated primitives and companion hooks — relax rules that
    // fight with their forwardRef + spread-children patterns, library-owned
    // data-attributes, and React-Compiler heuristics that flag legitimate
    // upstream code.
    files: ["src/components/ui/**/*.{ts,tsx}", "src/lib/hooks/**/*.{ts,tsx}"],
    rules: {
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
      "react/no-unknown-property": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/incompatible-library": "off",
      // recharts + shadcn Chart plumbing use `any` internally — this file is
      // upstream code we mirror; do not police its type erasure.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImportRule(restrictedImports.features),
    },
  },
  {
    files: ["src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImportRule(restrictedImports.pages),
    },
  },
  {
    files: ["*.config.{js,ts}", "commitlint.config.cjs", "eslint.config.js", "scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
