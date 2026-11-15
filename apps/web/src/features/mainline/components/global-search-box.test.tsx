import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { createAppI18n } from "@/lib/i18n/i18n";
import { createQueryClient } from "@/lib/query/query-client";

import { GlobalSearchBox } from "./global-search-box";

describe("global search box", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("groups results by type and opens the first one on Enter", async () => {
    const i18n = await createAppI18n({ lng: "zh-CN" });
    const router = createMemoryRouter([
      { path: "/", element: <GlobalSearchBox /> },
      { path: "/orders/:id", element: <p>detail</p> },
    ]);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    const input = screen.getByRole("combobox", { name: "搜索订单号、款号、单号…" });
    await user.type(input, "P");
    expect(await screen.findByText("输入至少 2 个字符")).toBeInTheDocument();
    await user.type(input, "O00");
    expect(await screen.findByRole("group", { name: "订单" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /PO0010459/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /PO0009631/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/orders/o-2"));
  });

  it("shows an empty state for unknown keywords", async () => {
    const i18n = await createAppI18n({ lng: "zh-CN" });
    const router = createMemoryRouter([{ path: "/", element: <GlobalSearchBox /> }]);
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    await user.type(screen.getByRole("combobox"), "ZZZ-404");
    expect(await screen.findByText("没有找到「ZZZ-404」相关的单据")).toBeInTheDocument();
  });
});
