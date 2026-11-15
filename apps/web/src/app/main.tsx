import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { config } from "@/lib/config";
import "@/styles/globals.css";

import { App } from "./App";

async function enableMocking() {
  // Vite constant-folds `import.meta.env.DEV`, so this whole branch (and the
  // dynamic import of `@/mocks/browser`) gets dead-code-eliminated from the
  // production bundle. MSW must never ship to prod.
  if (!import.meta.env.DEV) {
    return;
  }

  if (!config.enableMock) {
    return;
  }

  const { worker } = await import("@/mocks/browser");

  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: {
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
  });
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

void enableMocking().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
