import { nodeConfig } from "@otd/config/eslint";

export default [
  ...nodeConfig({ decorators: true }),
  {
    files: ["src/testing/**/*.ts", "src/**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];
