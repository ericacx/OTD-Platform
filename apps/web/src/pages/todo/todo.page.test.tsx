import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("today page (M00)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 21, 10, 0) });
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the greeting, KPIs, status distribution, todo groups, focus and deadlines", async () => {
    let doneId: string | null = null;
    server.use(
      http.post("*/todos/:id/done", ({ params }) => {
        doneId = String(params.id);
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/todo" });
    expect(await screen.findByRole("heading", { name: /王芳/ })).toBeInTheDocument();
    expect(screen.getByText(/2026-10-21 星期三/)).toBeInTheDocument();
    expect(screen.getByText(/数据范围：仅本人 · 授权客户/)).toBeInTheDocument();
    expect(screen.getByText("订单 5 · 其他 1")).toBeInTheDocument();
    expect(screen.getByText("待确认 1 · 待发货 0")).toBeInTheDocument();

    const status = screen.getByRole("list", { name: "订单状态分布" });
    expect(within(status).getByText("生产中").closest("li")).toHaveTextContent("1");
    expect(within(status).getByText("已完成").closest("li")).toHaveTextContent("0");
    expect(screen.getByRole("table", { name: "客户在手订单分布" })).toHaveTextContent("北岸运动3.71 万双 · 1 张");

    expect(await screen.findByText("已逾期 2")).toBeInTheDocument();
    expect(screen.getByText("今日到期 1")).toBeInTheDocument();
    expect(screen.getByText("任务逾期 2 天")).toBeInTheDocument();
    expect(screen.getByText("后续待办 · 显示 3 / 共 3")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /待船司确认订舱/ })).toHaveAttribute(
      "href",
      "/shipments/bookings?status=PENDING_CARRIER",
    );
    expect(screen.getByRole("link", { name: /订舱 BK-2610-018 船期/ })).toHaveTextContent("已超 3 天");

    const manual = screen.getByText("整理样品寄送清单").closest("li")!;
    await user.click(within(manual).getByRole("button", { name: "完成" }));
    await expect.poll(() => doneId).toBe("t-6");
  });
});
