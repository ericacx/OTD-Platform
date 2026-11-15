import { z } from "zod";

const forbiddenPublicEnvPattern = /^VITE_.*(TOKEN|SECRET|PASSWORD).*$/i;

const configSchema = z.object({
  VITE_APP_NAME: z.string().min(1).default("OTD 订单交付平台"),
  VITE_API_BASE_URL: z.string().default("/api/v1"),
  VITE_ENABLE_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  VITE_RESPONSE_ADAPTER: z.enum(["bipo", "rest"]).default("bipo"),
  VITE_SHOW_DEMO_ACCOUNTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ResponseAdapterKind = "bipo" | "rest";

export type AppConfig = {
  appName: string;
  apiBaseUrl: string;
  enableMock: boolean;
  responseAdapter: ResponseAdapterKind;
  showDemoAccounts: boolean;
};

export function createConfig(env: Record<string, string | boolean | undefined>): AppConfig {
  const forbiddenKeys = Object.keys(env).filter((key) => forbiddenPublicEnvPattern.test(key));

  if (forbiddenKeys.length > 0) {
    throw new Error(`Secret-like VITE variables are not allowed: ${forbiddenKeys.join(", ")}`);
  }

  const parsed = configSchema.parse(env);

  return {
    appName: parsed.VITE_APP_NAME,
    apiBaseUrl: parsed.VITE_API_BASE_URL,
    enableMock: parsed.VITE_ENABLE_MOCK,
    responseAdapter: parsed.VITE_RESPONSE_ADAPTER,
    showDemoAccounts: parsed.VITE_SHOW_DEMO_ACCOUNTS || env.DEV === true,
  };
}

export const config = createConfig(import.meta.env);
