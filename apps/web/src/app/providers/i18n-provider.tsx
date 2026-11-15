import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";

import { i18n, i18nReady } from "@/lib/i18n/i18n";

import type { PropsWithChildren } from "react";

// Rendered while i18n is initializing so the app never flashes a blank page
// (matters when `VITE_I18N_BACKEND=saki` fetches over the network). No text
// on purpose — the i18n instance isn't ready yet to translate anything.
function I18nBootstrapFallback() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 flex items-center justify-center bg-background"
      role="presentation"
      style={{ colorScheme: "light dark" }}
    >
      <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(i18n.isInitialized);

  useEffect(() => {
    let mounted = true;

    void i18nReady.then(() => {
      if (mounted) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return <I18nBootstrapFallback />;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
