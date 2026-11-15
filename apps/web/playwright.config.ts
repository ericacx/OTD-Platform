import { defineConfig, devices } from "@playwright/test";

// The template ships MSW only in DEV builds. For the smoke test we therefore
// exercise the Vite dev server (with `VITE_ENABLE_MOCK=true`) so mocked auth
// and users endpoints resolve. Production `pnpm preview` builds intentionally
// exclude MSW; if you need a preview-mode smoke run, wire a real backend or
// build with a mock-enabled define.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? "5173");
const HOST = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "zh-CN",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `pnpm dev --host ${HOST} --port ${PORT}`,
    env: {
      VITE_ENABLE_MOCK: "true",
      VITE_SHOW_DEMO_ACCOUNTS: "true",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: BASE_URL,
  },
});
