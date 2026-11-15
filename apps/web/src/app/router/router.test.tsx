import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearTokenInfo, getTokenInfo, setTokenInfo } from "@/lib/auth/token-storage";
import { renderWithProviders } from "@/test/render-with-providers";

describe("app router", () => {
  beforeEach(() => {
    clearTokenInfo();
  });

  it("redirects unauthenticated users to login", async () => {
    const { router } = await renderWithProviders({ route: "/system/roles" });

    expect(await screen.findByRole("heading", { name: "欢迎登录" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("logs in with a demo account and lands on the first allowed page", async () => {
    const user = userEvent.setup();
    const { router } = await renderWithProviders({ route: "/login" });

    await user.click(await screen.findByRole("button", { name: "业务员 · 王芳" }));
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/todo"));
    expect(getTokenInfo()?.refreshToken).toBe("mock-refresh-13800000001");
    expect(await screen.findByRole("heading", { name: /王芳/ })).toBeInTheDocument();
  });

  it("filters the side navigation by permission", async () => {
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
    await renderWithProviders({ route: "/todo" });

    const nav = (await screen.findAllByRole("navigation", { name: "主导航" }))[0]!;
    expect(within(nav).getByText("企划管理")).toBeInTheDocument();
    expect(within(nav).queryByText("系统管理")).not.toBeInTheDocument();
    expect(within(nav).queryByText("数据同步")).not.toBeInTheDocument();
  });

  it("shows the forbidden view for routes outside the user's permissions", async () => {
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
    await renderWithProviders({ route: "/system/roles" });

    expect(await screen.findByRole("heading", { name: "无权限访问" })).toBeInTheDocument();
  });

  it("renders placeholder pages for modules that are not built yet", async () => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
    await renderWithProviders({ route: "/sync/tasks" });

    expect(await screen.findByRole("heading", { name: "同步任务管理" })).toBeInTheDocument();
    expect(screen.getByText("该功能正在建设中")).toBeInTheDocument();
    expect(screen.getByText("模块 M18 将在后续迭代上线")).toBeInTheDocument();
  });
});
