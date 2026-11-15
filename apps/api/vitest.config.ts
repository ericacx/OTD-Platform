import { sourceResolve } from "@otd/config/vitest";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" }, jsc: { target: "es2023", parser: { syntax: "typescript", decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  ...sourceResolve,
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    server: { deps: { inline: [/@otd\//] } },
  },
});
