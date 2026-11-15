import { describe, expect, it } from "vitest";

import { createConfig } from "./config";

describe("createConfig", () => {
  it("parses public frontend configuration", () => {
    expect(
      createConfig({
        VITE_APP_NAME: "OTD",
        VITE_API_BASE_URL: "/api/v1",
        VITE_ENABLE_MOCK: "true",
        VITE_RESPONSE_ADAPTER: "bipo",
        VITE_SHOW_DEMO_ACCOUNTS: "true",
      }),
    ).toEqual({
      appName: "OTD",
      apiBaseUrl: "/api/v1",
      enableMock: true,
      responseAdapter: "bipo",
      showDemoAccounts: true,
    });
  });

  it("supplies safe defaults when optional keys are omitted", () => {
    expect(createConfig({})).toEqual({
      appName: "OTD 订单交付平台",
      apiBaseUrl: "/api/v1",
      enableMock: false,
      responseAdapter: "bipo",
      showDemoAccounts: false,
    });
  });

  it("shows demo accounts in dev builds", () => {
    expect(createConfig({ DEV: true }).showDemoAccounts).toBe(true);
  });

  it("rejects browser-visible secret-like variables", () => {
    expect(() =>
      createConfig({
        VITE_APP_NAME: "OTD",
        VITE_OTD_TOKEN: "secret",
      }),
    ).toThrow("Secret-like VITE variables are not allowed");
  });
});
