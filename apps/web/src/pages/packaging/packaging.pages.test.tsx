import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockPlans } from "@/mocks/handlers/packaging";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("packaging pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists packing plans with version and status", async () => {
    await renderWithProviders({ route: "/packaging" });
    expect(await screen.findByRole("heading", { name: "包装方案" }, { timeout: 5000 })).toBeInTheDocument();
    const row = (await screen.findByText("PK-2610-009")).closest("tr")!;
    expect(within(row).getByText("v3")).toBeInTheDocument();
    expect(within(row).getByText("已确认")).toBeInTheDocument();
    expect(within(row).getByText("PO0010459")).toBeInTheDocument();
  });

  it("creates a plan for an order and opens its detail", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/packaging/plans", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: mockPlans[0], requestId: "t" }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/packaging" });
    await user.click(await screen.findByRole("button", { name: "新建方案" }, { timeout: 5000 }));
    const dialog = await screen.findByRole("dialog");
    const order = within(dialog).getByLabelText("订单");
    await within(order).findByRole("option", { name: "PO0010459 · 北岸运动" });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect((await within(dialog).findAllByText("必填")).length).toBeGreaterThanOrEqual(2);
    expect(body).toBeNull();

    await user.selectOptions(order, "o-1");
    await user.type(within(dialog).getByLabelText("包装方法"), "平铺装箱");
    const perCarton = within(dialog).getByLabelText("每箱双数");
    await user.clear(perCarton);
    await user.type(perCarton, "100");
    await user.type(within(dialog).getByLabelText("目的仓"), "NSR Hamburg DC");
    await user.click(within(dialog).getByRole("button", { name: "添加要求" }));
    await user.type(within(dialog).getByLabelText("要求项"), "尾箱");
    await user.type(within(dialog).getByLabelText("要求内容"), "尾箱贴 ODD");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      orderId: "o-1",
      method: "平铺装箱",
      title: "平铺装箱",
      pairsPerCarton: 100,
      destination: "NSR Hamburg DC",
      cartonSize: null,
      requirements: [{ title: "尾箱", content: "尾箱贴 ODD" }],
    });
    expect(
      await screen.findByRole("heading", { name: "PK-2610-009 · Crew · 罗纹中筒袜翻折卡装" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({ docType: "packaging", docId: "pk-1", docNo: "PK-2610-009" });
  });

  it("shows the confirmed plan with field grid, version history and a field-level version diff", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/packaging/pk-1" });
    expect(
      await screen.findByRole("heading", { name: "PK-2610-009 · Crew · 罗纹中筒袜翻折卡装" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("C 型单层瓦楞纸箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "包装方法已确认" })).toBeDisabled();
    expect(screen.getByText(/每箱双数 100 → 120（客户要求）/)).toBeInTheDocument();
    expect(screen.getByText(/v3 修改 · 客户已确认 · 当前执行/)).toBeInTheDocument();
    const compare = screen.getByRole("heading", { name: "版本对比" }).closest("section")!;
    const diffRow = (await within(compare).findByText("每箱双数")).closest("tr")!;
    expect(within(diffRow).getByText("100")).toBeInTheDocument();
    expect(within(diffRow).getByText("120")).toBeInTheDocument();
    await user.selectOptions(within(compare).getByRole("combobox", { name: "对比起始版本" }), "2");
    await waitFor(() => expect(within(compare).queryByText("每箱双数")).not.toBeInTheDocument());
    expect(await within(compare).findByText("内袋")).toBeInTheDocument();
  });

  it("records the customer confirmation with the plan version", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/packaging/plans/pk-2/confirm", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/packaging/pk-2" });
    await user.click(await screen.findByRole("button", { name: "登记客户确认" }, { timeout: 5000 }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("客户确认人"), "陈晓");
    await user.selectOptions(within(dialog).getByLabelText("确认方式"), "CUSTOMER_SYSTEM");
    await user.click(within(dialog).getByRole("button", { name: "登记确认" }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ version: 2, confirmedBy: "陈晓", method: "CUSTOMER_SYSTEM" });
  });

  it("lists carton lists with ranges and starts packing with the row version", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/packaging/cartons/ct-2/start", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/packaging/cartons?orderId=o-9631" });
    expect(await screen.findByText("装箱齐套", undefined, { timeout: 5000 })).toBeInTheDocument();
    const row = (await screen.findByText("CT-2610-032")).closest("tr")!;
    expect(within(row).getByText("43–84")).toBeInTheDocument();
    expect(within(row).getByText("待装箱")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "开始装箱" }));
    await waitFor(() => expect(body).toEqual({ version: 1 }));
  });
});
