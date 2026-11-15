import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("capacity pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("shows the latest version with KPIs, tight rows, source tags and tasks", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/capacity" });
    expect(await screen.findByRole("heading", { name: "产能台账" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("116.0")).toBeInTheDocument();
    expect(screen.getByText("紧张针型").parentElement).toHaveTextContent("2");
    const table = screen.getByRole("heading", { name: "编织产能空余量表" }).closest("section")!;
    const tight = within(table).getByText("200N").closest("tr")!;
    expect(tight).toHaveAttribute("data-tight", "true");
    expect(within(tight).getByText("9.0%")).toBeInTheDocument();
    expect(within(tight).getByText("手填")).toBeInTheDocument();
    expect(within(table).getByText(/口径：下机时间/)).toBeInTheDocument();
    expect(screen.getByText(/逾期 2 天，已升级告警/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "对比版本" }), "cv-25");
    expect(await within(table).findByText("空余较对比版")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /包装订单情况表/ }));
    expect(await screen.findByText("95%")).toBeInTheDocument();
  });

  it("publishes the draft as the group summary with its version", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/capacity/versions/cv-26/publish", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/capacity" });
    await user.click(await screen.findByRole("button", { name: "汇总集团总表" }, { timeout: 5000 }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /确认/ }));
    await waitFor(() => expect(body).toEqual({ version: 1 }));
  });

  it("completes a ledger task from the tasks page", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/capacity/tasks/lt-2/complete", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/capacity/tasks" });
    const row = (await screen.findByText("刺绣等特殊工序产能表", undefined, { timeout: 5000 })).closest("tr")!;
    expect(within(row).getByText("已逾期")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "完成更新" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "完成更新" }));
    await waitFor(() => expect(body).toMatchObject({ version: 3, currentVersion: "V26" }));
  });
});
