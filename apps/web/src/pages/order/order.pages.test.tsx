import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockLookups } from "@/mocks/handlers/masterdata";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("order pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists orders with status, current node and status filters in the URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderWithProviders({ route: "/orders" });
    expect(await screen.findByRole("heading", { name: "订单列表" })).toBeInTheDocument();
    const row = (await screen.findByRole("link", { name: "PO0010459" })).closest("tr")!;
    expect(within(row).getByText("#11506 等 2 款")).toBeInTheDocument();
    expect(within(row).getByText("待确认")).toBeInTheDocument();
    expect(within(row).getByText("N06 PO 复核")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PO0009631" }).closest("tr")).toHaveTextContent("Rev.2");

    await user.click(screen.getByRole("button", { name: "生产中" }));
    await waitFor(() => expect(router.state.location.search).toContain("status=IN_PRODUCTION"));
    await waitFor(() => expect(screen.queryByRole("link", { name: "PO0010459" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "PO0009631" })).toBeInTheDocument();
  });

  it("shows the order detail and requires an override reason when the rule pack is red", async () => {
    let confirmBody: { version: number; overrideReason?: string } | null = null;
    server.use(
      http.get("*/lookups", () =>
        HttpResponse.json({
          errcode: 0,
          data: {
            ...mockLookups,
            dictionaries: {
              ...mockLookups.dictionaries,
              transportMode: [{ code: "RAIL", label: { zh: "中欧班列", en: "Rail" } }],
            },
          },
          requestId: "t",
        }),
      ),
      http.post("*/orders/:id/confirm", async ({ request }) => {
        confirmBody = (await request.json()) as typeof confirmBody;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/orders/o-1" });
    expect(await screen.findByText(/PO0010459 · 北岸运动/)).toBeInTheDocument();
    expect(screen.getByText("第 1 / 5 阶段 · 共 1 条流转", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("上传客户 PO 并识别字段，进入「待确认」")).toBeInTheDocument();
    expect(screen.getAllByText("未完成开发移交：#12810").length).toBeGreaterThan(0);
    expect(await screen.findByText("中欧班列")).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({ docType: "order", docId: "o-1", docNo: "PO0010459" });

    await user.click(screen.getByRole("button", { name: /推进到「待排产」/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("1 项未通过")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认订单" }));
    expect(await within(dialog).findByText("规则包有未通过项，请填写例外理由")).toBeInTheDocument();
    expect(confirmBody).toBeNull();
    await user.type(within(dialog).getByLabelText("例外理由"), "客户急单，经理已同意");
    await user.click(within(dialog).getByRole("button", { name: "确认订单" }));
    await waitFor(() => expect(confirmBody).toEqual({ version: 1, overrideReason: "客户急单，经理已同意" }));
  });

  it("shows replies, revisions and production for an order in production", async () => {
    await renderWithProviders({ route: "/orders/o-2" });
    expect(await screen.findByText(/PO0009631 · 晨跑者/)).toBeInTheDocument();
    expect(screen.getByText("客户追加 600 双（Rev.2）")).toBeInTheDocument();
    expect(screen.getByText("延期 5 天")).toBeInTheDocument();
    expect(screen.getByText("12.0%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /推进到「待发货」/ })).toBeInTheDocument();
  });

  it("sends version-checked bodies from the factory reply, production and advance dialogs", async () => {
    const bodies: Record<string, unknown> = {};
    const capture =
      (name: string) =>
      async ({ request }: { request: Request }) => {
        bodies[name] = await request.json();
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      };
    server.use(
      http.post("*/orders/:id/factory-replies", capture("reply")),
      http.post("*/orders/:id/production", capture("production")),
      http.post("*/orders/:id/advance", capture("advance")),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/orders/o-2" });
    await screen.findByText(/PO0009631 · 晨跑者/);

    await user.click(screen.getByRole("button", { name: "登记工厂回复" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("登记工厂交期回复 V3")).toBeInTheDocument();
    const date = within(dialog).getByLabelText("回复交期");
    expect(date).toHaveValue("2026-11-03");
    await user.clear(date);
    await user.type(date, "2026-11-10");
    await user.type(within(dialog).getByLabelText("备注（可选）"), "加班赶工");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(bodies.reply).toEqual({ version: 1, replyDate: "2026-11-10", note: "加班赶工" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "登记生产进度" }));
    dialog = await screen.findByRole("dialog");
    const knitted = within(dialog).getByLabelText("累计已织（双）");
    expect(knitted).toHaveValue(1512);
    await user.clear(knitted);
    await user.type(knitted, "6300");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(bodies.production).toMatchObject({ knittedPairs: 6300, packedPairs: 0 }));
    expect(typeof (bodies.production as { reportDate: string }).reportDate).toBe("string");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "推进到「待发货」" }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "推进到「待发货」" }));
    await waitFor(() => expect(bodies.advance).toEqual({ version: 1 }));
  });

  it("uploads a PO file and shows the extraction and rule pack result", async () => {
    server.use(
      http.post("*/files", () =>
        HttpResponse.json(
          {
            errcode: 0,
            data: {
              id: "file-1",
              filename: "PO0090001.xlsx",
              contentType: "application/pdf",
              size: 10,
              createdAt: "2026-10-21T01:00:00.000Z",
            },
            requestId: "t",
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/orders" });
    await user.click(await screen.findByRole("button", { name: "上传客户 PO" }));
    const dialog = await screen.findByRole("dialog");
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["%PDF-1.4"], "PO0090001.pdf", { type: "application/pdf" }));
    expect(await within(dialog).findByText("已上传：PO0090001.xlsx")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "开始识别" }));
    expect(await within(dialog).findByText("识别完成：PO0090001")).toBeInTheDocument();
    expect(within(dialog).getByText("1 行款号未关联开发资料")).toBeInTheDocument();
    expect(within(dialog).getByText(/请核对低置信度字段：客户交期/)).toBeInTheDocument();
    expect(within(dialog).getByText("款号均已完成开发移交")).toBeInTheDocument();
  });

  it("creates an order manually with a picked customer and style", async () => {
    let createBody: Record<string, unknown> | null = null;
    server.use(
      http.post("*/orders", async ({ request }) => {
        createBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { errcode: 0, data: { id: "o-created", poNo: "PO0090100", version: 1 }, requestId: "t" },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    const { router } = await renderWithProviders({ route: "/orders" });
    await user.click(await screen.findByRole("button", { name: "手工新建" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "手工新建订单" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "手工新建订单" }));
    expect(await within(dialog).findAllByText("必填")).not.toHaveLength(0);

    await user.selectOptions(within(dialog).getByLabelText("客户"), "c-nsr");
    await user.type(within(dialog).getByLabelText("PO 号"), "PO0090100");
    await user.type(within(dialog).getByLabelText("客户交期"), "2026-12-20");
    await user.selectOptions(within(dialog).getByLabelText("款号 1"), "st-12593");
    await user.type(within(dialog).getByLabelText("数量 1"), "1200");
    await user.type(within(dialog).getByLabelText("目的地"), "Sète, FR");
    await user.click(within(dialog).getByRole("button", { name: "手工新建订单" }));
    await waitFor(() =>
      expect(createBody).toMatchObject({
        customerId: "c-nsr",
        poNo: "PO0090100",
        customerDueDate: "2026-12-20",
        currency: "USD",
        destination: "Sète, FR",
        lines: [{ styleId: "st-12593", quantity: 1200, unitPrice: null }],
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/orders/o-created"));
  });

  it("edits a pending order including key fields and sends only the diff", async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put("*/orders/:id", async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/orders/o-1" });
    await screen.findByText(/PO0010459 · 北岸运动/);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("编辑订单 PO0010459")).toBeInTheDocument();
    const due = within(dialog).getByLabelText("客户交期");
    expect(due).toHaveValue("2026-12-16");
    await user.clear(due);
    await user.type(due, "2026-12-20");
    await user.clear(within(dialog).getByLabelText("目的地"));
    await user.type(within(dialog).getByLabelText("目的地"), "Hamburg, DE");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(putBody).toMatchObject({ version: 1, customerDueDate: "2026-12-20", destination: "Hamburg, DE" }),
    );
    expect(Object.keys(putBody!)).not.toContain("lines");
  });

  it("hides key fields when editing a confirmed order and revises it instead", async () => {
    let putBody: Record<string, unknown> | null = null;
    let reviseBody: Record<string, unknown> | null = null;
    server.use(
      http.put("*/orders/:id", async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
      http.post("*/orders/:id/revise", async ({ request }) => {
        reviseBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/orders/o-2" });
    await screen.findByText(/PO0009631 · 晨跑者/);

    await user.click(screen.getByRole("button", { name: "编辑" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("客户交期")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("款号 1")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("订单已确认，交期、币种、贸易/付款条款和明细已锁定，修改请走 PO 改版"),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("目的地"));
    await user.type(within(dialog).getByLabelText("目的地"), "Rotterdam, NL");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(putBody).toMatchObject({ version: 1, destination: "Rotterdam, NL" }));
    expect(Object.keys(putBody!)).not.toContain("customerDueDate");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "PO 改版" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("PO 改版：PO0009631 → Rev.3")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "PO 改版" }));
    expect(await within(dialog).findByText("请填写改版说明（至少 2 个字）")).toBeInTheDocument();
    expect(reviseBody).toBeNull();
    await user.type(within(dialog).getByLabelText("改版说明"), "客户追加 300 双");
    const due = within(dialog).getByLabelText("客户交期");
    await user.clear(due);
    await user.type(due, "2026-11-20");
    await user.click(within(dialog).getByRole("button", { name: "PO 改版" }));
    await waitFor(() =>
      expect(reviseBody).toMatchObject({ version: 1, note: "客户追加 300 双", customerDueDate: "2026-11-20" }),
    );
  });

  it("monitors an order: empty state, 10-node timeline with gates and a not-found state", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/orders/monitor" });
    expect(await screen.findByText("输入订单号后点击搜索")).toBeInTheDocument();
    await user.type(screen.getByLabelText("输入订单号，如 PO0010459"), "po0010459");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByText("已完成 5 / 10 步 · 当前节点：PO 复核")).toBeInTheDocument();
    const steps = document.querySelectorAll("li[data-state]");
    expect(steps).toHaveLength(10);
    expect([...steps].map((s) => s.getAttribute("data-state"))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "blocked",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(screen.getAllByLabelText("闸门节点")).toHaveLength(2);
    expect(screen.getByText("款号均已完成开发移交：未完成开发移交：#12810")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PO0010459" })).toHaveAttribute("href", "/orders/o-1");

    await user.clear(screen.getByLabelText("输入订单号，如 PO0010459"));
    await user.type(screen.getByLabelText("输入订单号，如 PO0010459"), "PO404");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByText("没有找到订单 PO404")).toBeInTheDocument();
  });
});
