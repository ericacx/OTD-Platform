import { sourceResolve } from "@otd/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...sourceResolve,
  test: { include: ["src/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000, server: { deps: { inline: [/@otd\//] } } },
});
