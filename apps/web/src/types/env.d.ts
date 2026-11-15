/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENABLE_MOCK: "true" | "false";
  readonly VITE_RESPONSE_ADAPTER: "bipo" | "rest";
  readonly VITE_SHOW_DEMO_ACCOUNTS?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
