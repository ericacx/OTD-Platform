import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { buildStatementCsv } from "@/features/receivable/statement";
import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockReceivables } from "@/mocks/handlers/receivable";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("receivable pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("shows the ledger KPIs and records a receipt for the outstanding balance", async () => {
    let submitted: { version: number; amount: number; currency: string } | null = null;
    server.use(
      http.post("*/receivables/:id/receipts", async ({ request }) => {
        submitted = (await request.json()) as { version: number; amount: number; currency: string };
        return HttpResponse.json({
          errcode: 0,
          data: { ...mockReceivables[1], status: "PAID", version: 3 },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/receivables" });

    expect(await screen.findByRole("heading", { name: "应收台账" })).toBeInTheDocument();
    expect(await screen.findByText("662,201")).toBeInTheDocument();
    expect(screen.getByText("平均逾期 13 天")).toBeInTheDocument();
    const overdueRow = (await screen.findByText("AR-202609-021")).closest("tr")!;
    expect(within(overdueRow).getByText("42 天")).toBeInTheDocument();
    expect(within(overdueRow).getByText("争议挂起")).toBeInTheDocument();
    const offsetRow = screen.getByText("AR-202610-008").closest("tr")!;
    expect(within(offsetRow).getByText("待冲抵")).toBeInTheDocument();
    expect(within(offsetRow).getByRole("button", { name: "冲抵" })).toBeInTheDocument();

    const partialRow = screen.getByText("AR-202610-003").closest("tr")!;
    await user.click(within(partialRow).getByRole("button", { name: "登记收款" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("收款金额（EUR）")).toHaveValue("28900");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted).toMatchObject({ version: 2, amount: 28900, currency: "EUR" });
  });

  it("switches collection tabs and logs a follow-up", async () => {
    let submitted: { channel: string; result: string } | null = null;
    server.use(
      http.post("*/receivables/:id/collections", async ({ request }) => {
        submitted = (await request.json()) as { channel: string; result: string };
        return HttpResponse.json({ errcode: 0, data: mockReceivables[0], requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    const { router } = await renderWithProviders({ route: "/receivables/collection" });
    expect(await screen.findByRole("heading", { name: "催收工作台" })).toBeInTheDocument();
    expect(await screen.findByText("340,969")).toBeInTheDocument();
    const row = (await screen.findByText("AR-202609-021")).closest("tr")!;
    expect(within(row).getByText(/ · 争议中$/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /团队视图/ }));
    await waitFor(() => expect(router.state.location.search).toContain("tab=team"));
    expect(await screen.findByText("团队逾期分布")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "记录催收" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted).toMatchObject({ channel: "EMAIL", result: "PROMISED" });
  });

  it("shows the receivable detail and publishes the current document", async () => {
    await renderWithProviders({ route: "/receivables/ar-overdue" });
    expect(await screen.findByRole("heading", { name: "应收详情" })).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({
      docType: "receivable",
      docId: "ar-overdue",
      docNo: "AR-202609-021",
    });
    expect(screen.getByRole("button", { name: "解除争议挂起" })).toBeInTheDocument();
    expect(screen.getByText("客户称短装")).toBeInTheDocument();
  });

  it("lists invoices", async () => {
    await renderWithProviders({ route: "/receivables/invoices" });
    expect(await screen.findByText("INV-26-0001")).toBeInTheDocument();
    expect(screen.getByText("AR-202610-003")).toBeInTheDocument();
  });

  it("builds a statement CSV grouped by customer and entity with subtotals", () => {
    const csv = buildStatementCsv(mockReceivables, {
      headers: ["客户", "主体", "单号", "类型", "来源", "币种", "应收", "已收", "未收", "到期", "逾期", "状态"],
      subtotal: "小计",
      type: (c) => c,
      status: (c) => c,
    });
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(1 + mockReceivables.length + 1);
    expect(lines.at(-1)).toContain("小计");
    expect(lines.at(-1)).toContain("147200.00");
  });
});
