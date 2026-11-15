import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockTest } from "@/mocks/handlers/testing";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("testing pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists test records with overdue flags", async () => {
    await renderWithProviders({ route: "/tests" });
    expect(await screen.findByRole("heading", { name: "测试记录" }, { timeout: 5000 })).toBeInTheDocument();
    const row = (await screen.findByText("TST-2610-026")).closest("tr")!;
    expect(within(row).getByText("超期")).toBeInTheDocument();
    expect(within(row).getByText("测试中")).toBeInTheDocument();
    expect(within(row).getByText("色牢度、功能性检测")).toBeInTheDocument();
  });

  it("shows progress, reuse check and related reports, and records the result", async () => {
    let completed: Record<string, unknown> | null = null;
    server.use(
      http.post("*/tests/:id/complete", async ({ request }) => {
        completed = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          errcode: 0,
          requestId: "t",
          data: { ...mockTest, status: "COMPLETED", result: "PASS" },
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/tests/t-1" });

    expect(await screen.findByRole("heading", { name: "测试详情" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("寄样并申请").closest("li")).toHaveAttribute("data-state", "done");
    expect(usePageDocStore.getState().doc).toEqual({ docType: "testRequest", docId: "t-1", docNo: "TST-2610-026" });
    expect(screen.getByText("机构检测").closest("li")).toHaveAttribute("data-state", "current");
    expect(await screen.findByText("可复用")).toBeInTheDocument();
    expect(screen.getAllByText("BV-26-10523").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "登记结果" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("机构报告号"), "BV-26-10999");
    await user.type(within(dialog).getByLabelText("出具日"), "2026-10-21");
    await user.click(within(dialog).getByRole("button", { name: "登记结果" }));
    await waitFor(() =>
      expect(completed).toMatchObject({
        result: "PASS",
        version: 3,
        report: { agencyReportNo: "BV-26-10999", issuedDate: "2026-10-21" },
      }),
    );
  });

  it("shows report validity statuses with KPIs", async () => {
    await renderWithProviders({ route: "/tests/reports" });
    expect(await screen.findByRole("heading", { name: "报告管理" }, { timeout: 5000 })).toBeInTheDocument();
    expect((await screen.findAllByText("ITS-25-2810")).length).toBeGreaterThan(0);
    expect(screen.getByText("已过期 12 天")).toBeInTheDocument();
    expect(screen.getByText("剩 20 天")).toBeInTheDocument();
    expect(screen.getAllByText("即将过期").length).toBeGreaterThan(0);
  });
});
