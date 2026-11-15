import { AuthProvider } from "./auth-provider";
import { I18nProvider } from "./i18n-provider";
import { QueryProvider } from "./query-provider";
import { RouterProvider } from "./router-provider";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./toast-provider";

import type { PropsWithChildren } from "react";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>{children ?? <RouterProvider />}</ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
