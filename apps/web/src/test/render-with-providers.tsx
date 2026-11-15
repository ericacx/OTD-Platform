import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { RouterProvider } from "react-router";

import { AuthProvider } from "@/app/providers/auth-provider";
import { createAppRouter } from "@/app/router";
import { createAppI18n } from "@/lib/i18n/i18n";
import { createQueryClient } from "@/lib/query/query-client";

import type { RenderOptions } from "@testing-library/react";

interface RenderWithProvidersOptions {
  route?: string;
  renderOptions?: Omit<RenderOptions, "wrapper">;
}

export async function renderWithProviders({ route = "/", renderOptions }: RenderWithProvidersOptions = {}) {
  const i18n = await createAppI18n({ lng: "zh-CN" });
  const queryClient = createQueryClient();
  const router = createAppRouter({ initialEntries: [route] });
  const result = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </I18nextProvider>,
    renderOptions,
  );

  return {
    ...result,
    i18n,
    queryClient,
    router,
  };
}
