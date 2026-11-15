import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockPurchases } from "@/mocks/handlers/purchase";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("purchase pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("flags overdue purchases in the list", async () => {
    await renderWithProviders({ route: "/purchases" });
    expect(await screen.findByRole("heading", { name: "采购单" }, { timeout: 5000 })).toBeInTheDocument();
    const row = (await screen.findByText("PUR-2610-003")).closest("tr")!;
    expect(within(row).getByText("逾期 3 天")).toBeInTheDocument();
    expect(within(row).getByText("已下单")).toBeInTheDocument();
    const partial = screen.getByText("PUR-2610-004").closest("tr")!;
    expect(within(partial).getByText("56%")).toBeInTheDocument();
  });

  it("creates a purchase order with a material line and opens it", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/purchases", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: mockPurchases[0], requestId: "t" }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/purchases" });
    await user.click(await screen.findByRole("button", { name: "新建采购单" }, { timeout: 5000 }));
    const dialog = await screen.findByRole("dialog", undefined, { timeout: 5000 });
    const order = within(dialog).getByLabelText("关联订单");
    await within(order).findByRole("option", { name: "PO0010459 · 北岸运动" });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect((await within(dialog).findAllByText("必填")).length).toBeGreaterThanOrEqual(3);
    expect(within(dialog).getByText("未选物料时须填写名称和单位")).toBeInTheDocument();
    expect(body).toBeNull();

    await user.selectOptions(order, "o-1");
    await user.selectOptions(within(dialog).getByLabelText("类别"), "YARN");
    await user.type(within(dialog).getByLabelText("供应商"), "恒力化纤");
    fireEvent.change(within(dialog).getByLabelText("承诺到货日"), { target: { value: "2026-11-25" } });
    await user.selectOptions(within(dialog).getByLabelText("物料"), "m-1");
    expect(within(dialog).getByLabelText("名称")).toHaveValue("70D 锦纶包覆纱");
    expect(within(dialog).getByLabelText("单位")).toHaveValue("kg");
    const qty = within(dialog).getByLabelText("数量");
    await user.clear(qty);
    await user.type(qty, "50");
    await user.click(within(dialog).getByRole("button", { name: "添加明细" }));
    const names = within(dialog).getAllByLabelText("名称");
    await user.type(names[1]!, "70D 锦纶纱样品");
    await user.type(within(dialog).getAllByLabelText("单位")[1]!, "kg");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      orderId: "o-1",
      supplier: "恒力化纤",
      category: "YARN",
      promisedDate: "2026-11-25",
      deliveryPlace: null,
      lines: [
        { materialId: "m-1", name: "70D 锦纶包覆纱", spec: "70D", quantity: 50, unit: "kg", unitPrice: 56 },
        { materialId: null, name: "70D 锦纶纱样品", quantity: 1, unit: "kg", unitPrice: null },
      ],
    });
    expect(
      await screen.findByRole("heading", { name: "PUR-2610-003 · 恒力化纤" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({ docType: "purchase", docId: "pur-1", docNo: "PUR-2610-003" });
  });

  it("records a partial receipt per line and shows the material shortage", async () => {
    let body: { version: number; lines: { lineId: string; quantity: number }[] } | null = null;
    server.use(
      http.post("*/purchases/pur-2/receive", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/purchases/pur-2" });
    expect(
      await screen.findByRole("heading", { name: "PUR-2610-004 · 联达辅料" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    const req = (await screen.findByRole("heading", { name: "用料需求与缺口" })).closest("section")!;
    const cartonRow = (await within(req).findByText("纸箱")).closest("tr")!;
    expect(within(cartonRow).getByText("建议补采")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "登记到货" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("硅胶防滑点 本次到货数量"), "3000");
    await user.click(within(dialog).getByRole("button", { name: "登记到货" }));
    expect(await within(dialog).findByText("超出未到数量 2400")).toBeInTheDocument();
    const input = within(dialog).getByLabelText("硅胶防滑点 本次到货数量");
    await user.clear(input);
    await user.type(input, "1200");
    await user.click(within(dialog).getByRole("button", { name: "登记到货" }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.version).toBe(2);
    expect(body!.lines).toEqual([{ lineId: "pl-2", quantity: 1200 }]);
  });

  it("lists pending purchases and receipt history on the receiving page", async () => {
    await renderWithProviders({ route: "/purchases/receipts" });
    expect(await screen.findByRole("heading", { name: "到货登记" }, { timeout: 5000 })).toBeInTheDocument();
    const pending = screen.getByRole("heading", { name: "待到货采购单" }).closest("section")!;
    expect(await within(pending).findByText("PUR-2610-003")).toBeInTheDocument();
    expect(await screen.findByText("首批到货")).toBeInTheDocument();
  });
});
