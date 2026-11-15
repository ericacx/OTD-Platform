import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const conditions = ["@otd/source", "browser", "module", "development"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
    conditions,
  },
  ssr: { resolve: { conditions: ["@otd/source"] } },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: true,
    server: { deps: { inline: [/@otd\//] } },
    testTimeout: 15_000,
  },
});
