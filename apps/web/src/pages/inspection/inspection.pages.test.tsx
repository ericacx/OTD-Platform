import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockInspections } from "@/mocks/handlers/inspection";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("inspection pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists inspections with the four KPIs", async () => {
    await renderWithProviders({ route: "/inspections" });
    expect(await screen.findByRole("heading", { name: "验货记录" })).toBeInTheDocument();
    expect(await screen.findByText("IPI 0 · DPI 1 · FRI 2")).toBeInTheDocument();
    const row = (await screen.findByText("INSP-2611-002")).closest("tr")!;
    expect(within(row).getByText("不合格")).toBeInTheDocument();
    expect(within(row).getByText("中期验货 DPI")).toBeInTheDocument();
    expect(within(row).getByText("第 2 轮")).toBeInTheDocument();
  });

  it("shows the G2 gate with a not-applicable condition and releases with the row version", async () => {
    let submitted: { version: number } | null = null;
    server.use(
      http.post("*/inspections/:id/release", async ({ request }) => {
        submitted = (await request.json()) as { version: number };
        return HttpResponse.json({
          errcode: 0,
          data: { ...mockInspections[1], status: "RELEASED", version: 4 },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/inspections/insp-fri" });

    expect(await screen.findByRole("heading", { name: "验货详情" })).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({
      docType: "inspection",
      docId: "insp-fri",
      docNo: "INSP-2611-003",
    });
    const gate = await screen.findByTestId("gate-checklist");
    expect(within(gate).getByText("当前满足 2 / 2")).toBeInTheDocument();
    expect(within(gate).getByText("可放行")).toBeInTheDocument();
    const na = within(gate)
      .getByText(/测试报告在有效期内且合格/)
      .closest("li")!;
    expect(na).toHaveAttribute("data-state", "na");
    expect(within(na).getAllByText("不适用").length).toBeGreaterThan(0);
    expect(screen.getByText("工厂交期前 12 天完成；同 PO 同款合并一份报告、齐色齐码")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "登记放行" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByTestId("gate-checklist");
    await user.click(within(dialog).getByRole("button", { name: "登记放行" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!.version).toBe(3);
  });

  it("marks IPI / DPI as no release verdict and disables release", async () => {
    await renderWithProviders({ route: "/inspections/insp-dpi" });
    const gate = await screen.findByTestId("gate-checklist");
    expect(within(gate).getByText("不出放行结论")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登记放行" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "整改复验" })).toBeEnabled();
    expect(screen.getByText("换片重缝并全检", { selector: "dd" })).toBeInTheDocument();
  });

  it("shows the schedule board with plant-day usage", async () => {
    await renderWithProviders({ route: "/inspections/schedule" });
    expect(await screen.findByRole("heading", { name: "验货排期" })).toBeInTheDocument();
    expect(await screen.findByText("5 / 5 款")).toBeInTheDocument();
    expect(screen.getByText("已满")).toBeInTheDocument();
    expect(screen.getByText("INSP-2611-004")).toBeInTheDocument();
  });
});
