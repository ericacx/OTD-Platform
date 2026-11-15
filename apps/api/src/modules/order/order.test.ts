import { customerFlowVersions, customerFlows, handoverPackages, orderStageLogs, shipments, todos } from "@otd/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "../../core/access/access.service.js";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { XLSX, factoryIdOf, makeStyle, pdfBuffer, xlsxBuffer } from "./order.fixtures.js";
import { OrderService, factoryReplyTodo, reviewTodo } from "./order.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

const PO_ROWS = (poNo: string, styleNo: string) => [
  ["Purchase Order", null],
  ["PO No", poNo],
  ["Customer", "NorthShore"],
  ["Season", "AW26"],
  ["Rev", "Rev.1"],
  ["Incoterm", "FOB Shanghai · Incoterms 2020"],
  ["Payment Terms", "月结 60 天"],
  ["Currency", "USD"],
  ["Order Date", "2026-10-20"],
  ["Delivery Date", "2026/12/20"],
  ["Ship Mode", "中欧班列 Rail"],
  ["Destination", "Sète, FR"],
  [],
  ["Style", "Color", "Size", "SKU", "Qty", "Unit Price"],
  [styleNo, "Black", "S", `NSR-${styleNo}-BLK-S`, 1200, 0.92],
  [styleNo, "Black", "M", `NSR-${styleNo}-BLK-M`, 1200, 0.92],
  ["T9999", "Navy", "L", "NSR-T9999-NVY-L", 600, 1.1],
  ["Total", null, null, null, 3000, null],
];

async function backdate(orderId: string, status: string, days: number) {
  await t.db
    .update(orderStageLogs)
    .set({ at: new Date(t.clock.now().getTime() - days * 86_400_000) })
    .where(and(eq(orderStageLogs.orderId, orderId), eq(orderStageLogs.status, status)));
}

async function greenOrder(poNo = "PO0091001", extra: Record<string, unknown> = {}) {
  const sales = await t.as("sales");
  const styleId = await makeStyle(t, `G${poNo.slice(-4)}`, { handedOver: true, acceptedUsd: 0.9 });
  const res = await sales.post("/orders", {
    customerId: t.refs.customers.NSR,
    poNo,
    customerDueDate: "2026-12-20",
    orderDate: "2026-10-20",
    factoryId: await factoryIdOf(t, "NH5"),
    currency: "USD",
    lines: [
      { styleId, color: "Black", size: "M", quantity: 3000, unitPrice: 0.92 },
      { styleId, color: "Black", size: "L", quantity: 3000, unitPrice: 0.92 },
    ],
    ...extra,
  });
  expect(res.status).toBe(201);
  return { sales, order: res.body.data, styleId };
}

describe("orders · PO upload and extraction", () => {
  it("uploads an Excel PO, extracts it offline and creates a pending order with unmatched lines kept", async () => {
    const sales = await t.as("sales");
    await makeStyle(t, "T1001", { handedOver: true, acceptedUsd: 0.9 });
    const res = await sales.upload("/orders/upload", { filename: "PO0090001.xlsx", contentType: XLSX, data: await xlsxBuffer(PO_ROWS("PO0090001", "T1001")) });
    expect(res.status).toBe(201);
    const o = res.body.data;
    expect(o).toMatchObject({ poNo: "PO0090001", status: "PENDING_CONFIRM", customerName: "北岸运动", seasonCode: "AW26", tradeTerm: "FOB Shanghai · Incoterms 2020", currency: "USD", customerDueDate: "2026-12-20", orderDate: "2026-10-20", transportMode: "RAIL", destination: "Sète, FR", totalPairs: 3000, revision: 1 });
    expect(o.lines).toHaveLength(2);
    expect(o.lines[0]).toMatchObject({ styleNo: "T1001", color: "Black", quantity: 1200, unitPrice: 0.92 });
    expect(o.unmatchedLines).toEqual([{ styleNo: "T9999", color: "Navy", size: "L", sku: "NSR-T9999-NVY-L", quantity: 600, unitPrice: 1.1 }]);
    expect(o.styleNos).toEqual(["T1001", "T9999"]);
    expect(o.extraction.poNo).toMatchObject({ value: "PO0090001", confidence: 0.9 });
    expect(o.sourceFileId).toBeTruthy();
    const handover = o.ruleCheck.find((r: { key: string }) => r.key === "stylesHandedOver");
    expect(handover.passed).toBe(false);
    expect(handover.detail).toContain("未关联开发资料：#T9999");
    expect(o.stages[0]).toMatchObject({ status: "PENDING_CONFIRM", state: "CURRENT" });
    expect(o.stages[0].logs[0]).toMatchObject({ action: "上传客户 PO 并识别字段，进入「待确认」", operatorName: "系统识别", at: "2026-10-21T01:00:00.000Z" });
    expect(o.stageIndex).toBe(1);

    const board = (await sales.get("/todos/board")).body.data;
    const todo = [...board.later, ...board.today, ...board.overdue].find((i: { docNo: string }) => i.docNo === "PO0090001");
    expect(todo).toMatchObject({ title: "复核客户 PO", docType: "order", link: `/orders/${o.id}`, dueAt: "2026-10-23T01:00:00.000Z" });

    const dup = await sales.upload("/orders/upload", { filename: "again.xlsx", contentType: XLSX, data: await xlsxBuffer(PO_ROWS("PO0090001", "T1001")) });
    expect(dup.status).toBe(409);
    expect(dup.body.errcode).toBe("COMMON_DUPLICATE");
  });

  it("falls back to the filename for PDFs and reports extraction failures", async () => {
    const sales = await t.as("sales");
    const res = await sales.upload("/orders/upload", { filename: "PO0090002_AW26.pdf", contentType: "application/pdf", data: pdfBuffer() }, { customerId: t.refs.customers.NSR! });
    expect(res.status).toBe(201);
    const o = res.body.data;
    expect(o.poNo).toBe("PO0090002");
    expect(o.seasonCode).toBe("AW26");
    expect(o.lines).toEqual([]);
    expect(o.extraction.dueDate.confidence).toBe(0);
    expect(o.customerDueDate).toBe("2026-12-20");
    expect(o.ruleCheck.find((r: { key: string }) => r.key === "quantityMatches").passed).toBe(false);

    const noCustomer = await sales.upload("/orders/upload", { filename: "PO0090003.pdf", contentType: "application/pdf", data: pdfBuffer() });
    expect(noCustomer.body.errcode).toBe("ORDER_CUSTOMER_UNRESOLVED");

    t.ai.onExtract("order.extract", () => {
      throw new Error("model timeout");
    });
    const failed = await sales.upload("/orders/upload", { filename: "PO0090004.pdf", contentType: "application/pdf", data: pdfBuffer() }, { customerId: t.refs.customers.NSR! });
    expect(failed.status).toBe(422);
    expect(failed.body.errcode).toBe("ORDER_EXTRACTION_FAILED");

    const word = await sales.upload("/orders/upload", { filename: "po.txt", contentType: "text/plain", data: Buffer.from("hello") });
    expect(word.body.errcode).toBe("ORDER_FILE_UNSUPPORTED");
  });

  it("accepts an already uploaded file id", async () => {
    const sales = await t.as("sales");
    await makeStyle(t, "T1002", { handedOver: true });
    const file = await sales.upload("/files", { filename: "po.xlsx", contentType: XLSX, data: await xlsxBuffer(PO_ROWS("PO0090005", "T1002")) });
    const res = await sales.post("/orders/upload", { fileId: file.body.data.id, customerId: t.refs.customers.NSR });
    expect(res.status).toBe(201);
    expect(res.body.data.poNo).toBe("PO0090005");
    expect(res.body.data.sourceFileId).toBe(file.body.data.id);
  });
});

describe("orders · rule pack, confirm and override", () => {
  it("checks every rule of the PO review pack", async () => {
    const { order } = await greenOrder();
    expect(order.ruleCheck.map((r: { key: string; passed: boolean }) => [r.key, r.passed])).toEqual([
      ["stylesHandedOver", true],
      ["quantityMatches", true],
      ["leadTime", true],
      ["priceMatchesQuote", true],
      ["factoryAssigned", true],
    ]);
    expect(order.ruleCheckPassed).toBe(true);

    const sales = await t.as("sales");
    const red = await makeStyle(t, "R2001", { acceptedUsd: 0.9 });
    const noQuote = await makeStyle(t, "R2002", { handedOver: true });
    const res = await sales.post("/orders", {
      customerId: t.refs.customers.NSR,
      poNo: "PO0092001",
      customerDueDate: "2026-11-02",
      orderDate: "2026-10-20",
      currency: "USD",
      lines: [
        { styleId: red, quantity: 500, unitPrice: 1.0 },
        { styleId: noQuote, quantity: 500, unitPrice: 1.0 },
      ],
    });
    const rules = Object.fromEntries(res.body.data.ruleCheck.map((r: { key: string }) => [r.key, r]));
    expect(rules.stylesHandedOver).toMatchObject({ passed: false, detail: "未完成开发移交：#R2001" });
    expect(rules.quantityMatches.passed).toBe(true);
    expect(rules.leadTime).toMatchObject({ passed: false, detail: "下单日 2026-10-20，客户交期 2026-11-02，相差 13 天" });
    expect(rules.priceMatchesQuote.passed).toBe(false);
    expect(rules.priceMatchesQuote.detail).toContain("#R2001 单价 1 与报价 QT-R2001-01 0.9 偏差 11.1%");
    expect(rules.factoryAssigned).toMatchObject({ passed: false, detail: "未指定承做工厂" });

    const only = await sales.post("/orders", { customerId: t.refs.customers.NSR, poNo: "PO0092002", customerDueDate: "2026-12-20", orderDate: "2026-10-20", currency: "USD", lines: [{ styleId: noQuote, quantity: 100, unitPrice: 2 }] });
    const price = only.body.data.ruleCheck.find((r: { key: string }) => r.key === "priceMatchesQuote");
    expect(price.passed).toBe(true);
    expect(price.detail).toContain("#R2002 无已接受报价，未比对（提示，不阻断）");
  });

  it("confirms an all-green order, binds the customer flow version and hands work to the merchandiser", async () => {
    const production = t.refs.users["13800000012"]!;
    const versionId = (await t.db.insert(customerFlowVersions).values({ customerId: t.refs.customers.NSR!, versionNo: 3, snapshot: { modules: [], params: {} } }).returning({ id: customerFlowVersions.id }))[0]!.id;
    await t.db.insert(customerFlows).values({ customerId: t.refs.customers.NSR!, currentVersionId: versionId, draft: { modules: [], params: {} }, status: "PUBLISHED" });
    const { sales, order } = await greenOrder("PO0091002", { merchandiserId: production });

    await backdate(order.id, "PENDING_CONFIRM", 1);
    const res = await sales.post(`/orders/${order.id}/confirm`, { version: order.version });
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o).toMatchObject({ status: "TO_SCHEDULE", confirmedAt: "2026-10-21T01:00:00.000Z", flowVersionId: versionId, overrideReason: null, stageIndex: 2, version: order.version + 1 });
    expect(o.stages[0]).toMatchObject({ state: "DONE", elapsedDays: 1 });
    expect(o.stages[1].logs[0].action).toBe("PO 复核规则包全绿，确认订单，进入「待排产」");
    expect(o.nextStatus).toBe("IN_PRODUCTION");

    const review = (await t.db.select().from(todos).where(eq(todos.fingerprint, reviewTodo(order.id))))[0]!;
    expect(review.status).toBe("DONE");
    const reply = (await t.db.select().from(todos).where(eq(todos.fingerprint, factoryReplyTodo(order.id))))[0]!;
    expect(reply).toMatchObject({ assigneeId: production, status: "OPEN", title: "登记工厂交期回复" });
    expect(reply.dueAt?.toISOString()).toBe("2026-10-24T01:00:00.000Z");

    const again = await sales.post(`/orders/${order.id}/confirm`, { version: o.version });
    expect(again.status).toBe(409);
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("rejects a red rule pack unless overridden with a reason by someone holding the confirm permission", async () => {
    const sales = await t.as("sales");
    const styleId = await makeStyle(t, "R3001");
    const order = (await sales.post("/orders", { customerId: t.refs.customers.NSR, poNo: "PO0093001", customerDueDate: "2026-11-05", lines: [{ styleId, quantity: 800 }] })).body.data;

    const denied = await sales.post(`/orders/${order.id}/confirm`, { version: order.version });
    expect(denied.status).toBe(422);
    expect(denied.body.errcode).toBe("ORDER_RULE_PACK_FAILED");
    expect(denied.body.errParams?.failedRules).toEqual(["stylesHandedOver", "leadTime", "factoryAssigned"]);

    const salesCtx = (await t.app.get(AccessService).load(sales.userId))!;
    const withoutConfirm = { ...salesCtx, permissions: new Set([...salesCtx.permissions].filter((p) => p !== "order.order.confirm")) };
    await expect(t.app.get(OrderService).confirm(withoutConfirm, order.id, { version: order.version, overrideReason: "客户急单，经理口头同意" })).rejects.toMatchObject({ def: { code: "IAM_FORBIDDEN" } });

    const ok = await sales.post(`/orders/${order.id}/confirm`, { version: order.version, overrideReason: "客户急单，经理口头同意" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "TO_SCHEDULE", overrideReason: "客户急单，经理口头同意" });
    expect(ok.body.data.stages[1].logs[0].action).toContain("例外确认（客户急单，经理口头同意）");

    const admin = await t.as("admin");
    const logs = await admin.get(`/system/audit-logs?keyword=PO0093001`);
    expect(logs.body.data.items.map((l: { action: string }) => l.action)).toContain("order.order.confirm");
  });

  it("detects version conflicts", async () => {
    const { sales, order } = await greenOrder("PO0091003");
    const stale = await sales.post(`/orders/${order.id}/confirm`, { version: order.version - 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const upd = await sales.put(`/orders/${order.id}`, { version: 99, note: "x" });
    expect(upd.body.errcode).toBe("COMMON_VERSION_CONFLICT");
  });
});

describe("orders · stages, replies, revisions, cancel", () => {
  it("advances along the state machine, rejects illegal jumps and reports elapsed vs average", async () => {
    const { sales, order } = await greenOrder("PO0094001");
    const viaAdvance = await sales.post(`/orders/${order.id}/advance`, { version: order.version, to: "TO_SCHEDULE" });
    expect(viaAdvance.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    let o = (await sales.post(`/orders/${order.id}/confirm`, { version: order.version })).body.data;
    const jump = await sales.post(`/orders/${order.id}/advance`, { version: o.version, to: "TO_SHIP" });
    expect(jump.status).toBe(409);
    expect(jump.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect(jump.body.errParams).toMatchObject({ from: "TO_SCHEDULE", action: "advance" });

    await backdate(order.id, "PENDING_CONFIRM", 6);
    await backdate(order.id, "TO_SCHEDULE", 3);
    o = (await sales.post(`/orders/${order.id}/advance`, { version: o.version })).body.data;
    expect(o.status).toBe("IN_PRODUCTION");
    expect(o.stages[1]).toMatchObject({ state: "DONE", elapsedDays: 3, avgDays: 3 });
    expect(o.stages[2]).toMatchObject({ state: "CURRENT", elapsedDays: 0, avgDays: 40 });
    expect(o.stages[2].logs[0].action).toBe("排产确认，进入「生产中」");

    const progress = await sales.post(`/orders/${order.id}/production`, { reportDate: "2026-10-24", knittedPairs: 3000, packedPairs: 1000 });
    expect(progress.status).toBe(201);
    expect(progress.body.data.completionRate).toBe(0.5);

    await backdate(order.id, "IN_PRODUCTION", 2);
    o = (await sales.post(`/orders/${order.id}/advance`, { version: o.version, note: "尾验放行" })).body.data;
    expect(o.status).toBe("TO_SHIP");
    expect(o.stages[2].elapsedDays).toBe(2);
    expect(o.stages[1].elapsedDays).toBe(1);
    expect(o.stages[0]).toMatchObject({ state: "DONE", elapsedDays: 3, avgDays: 3, slowerThanAvg: false });
    o = (await sales.post(`/orders/${order.id}/advance`, { version: o.version })).body.data;
    expect(o.status).toBe("COMPLETED");
    expect(o.nextStatus).toBeNull();
    expect(o.stageIndex).toBe(5);
    const more = await sales.post(`/orders/${order.id}/advance`, { version: o.version });
    expect(more.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect(o.production).toHaveLength(1);
  });

  it("records factory replies as versions with delay days", async () => {
    const { sales, order } = await greenOrder("PO0094002");
    let o = (await sales.post(`/orders/${order.id}/factory-replies`, { version: order.version, replyDate: "2026-12-20" })).body.data;
    expect(o).toMatchObject({ factoryReplyDate: "2026-12-20", delayDays: 0 });
    o = (await sales.post(`/orders/${order.id}/factory-replies`, { version: o.version, replyDate: "2026-12-25", note: "染色排队" })).body.data;
    expect(o).toMatchObject({ factoryReplyDate: "2026-12-25", delayDays: 5 });
    expect(o.factoryReplies.map((r: { versionNo: number; delayDays: number }) => [r.versionNo, r.delayDays])).toEqual([
      [2, 5],
      [1, 0],
    ]);
    expect(o.stages[0].logs.map((l: { action: string }) => l.action)).toEqual(["手工新建订单，进入「待确认」", "登记工厂交期回复 V1：2026-12-20（持平）", "登记工厂交期回复 V2：2026-12-25（延期 5 天）"]);
    const quality = await t.as("quality");
    expect((await quality.post(`/orders/${order.id}/factory-replies`, { version: o.version, replyDate: "2026-12-26" })).status).toBe(403);
  });

  it("revises the PO, keeps the previous version as a snapshot and re-runs the rule pack", async () => {
    const { sales, order, styleId } = await greenOrder("PO0094003");
    const o = (await sales.post(`/orders/${order.id}/revise`, { version: order.version, customerDueDate: "2026-12-28", lines: [{ styleId, color: "Navy", size: "M", quantity: 7000, unitPrice: 0.91 }], note: "客户追加数量" })).body.data;
    expect(o).toMatchObject({ revision: 2, revisionDate: "2026-10-21", customerDueDate: "2026-12-28", totalPairs: 7000, fobAmount: 6370 });
    expect(o.revisions).toHaveLength(1);
    expect(o.revisions[0]).toMatchObject({ revision: 1, note: "客户追加数量", createdByName: "王芳" });
    expect(o.revisions[0].snapshot).toMatchObject({ customerDueDate: "2026-12-20", totalPairs: 6000 });
    expect(o.revisions[0].snapshot.lines).toHaveLength(2);
    expect(o.stages[0].logs.at(-1).action).toBe("PO 改版 Rev.2：客户交期 2026-12-20 → 2026-12-28；总双数 6000 → 7000；明细 2 行 → 1 行");
    expect(o.ruleCheckPassed).toBe(true);
  });

  it("registers the customer confirmation and re-runs the rule pack on demand", async () => {
    const sales = await t.as("sales");
    const styleId = await makeStyle(t, "C4001", { acceptedUsd: 0.9 });
    const order = (await sales.post("/orders", { customerId: t.refs.customers.NSR, poNo: "PO0094010", customerDueDate: "2026-12-20", orderDate: "2026-10-20", factoryId: await factoryIdOf(t, "NH5"), lines: [{ styleId, quantity: 1000, unitPrice: 0.9 }] })).body.data;
    expect(order.ruleCheckPassed).toBe(false);
    const confirmed = await sales.post(`/orders/${order.id}/customer-confirm`, { version: order.version, method: "EMAIL", note: "客户邮件确认 Rev.1" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toMatchObject({ customerConfirmMethod: "EMAIL", customerConfirmedAt: "2026-10-21T01:00:00.000Z", version: order.version + 1 });
    expect(confirmed.body.data.stages[0].logs.at(-1)).toMatchObject({ action: "登记客户确认 Rev.1（邮件）", note: "客户邮件确认 Rev.1", operatorName: "王芳" });
    expect((await sales.post(`/orders/${order.id}/customer-confirm`, { version: order.version, method: "EMAIL" })).body.errcode).toBe("COMMON_VERSION_CONFLICT");

    await t.db.insert(handoverPackages).values({ docNo: "DH-T-C4001", styleId, status: "HANDED_OVER", checklist: {}, ownerId: sales.userId, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers.NSR! });
    const rechecked = await sales.post(`/orders/${order.id}/rule-check`);
    expect(rechecked.status).toBe(200);
    expect(rechecked.body.data).toMatchObject({ ruleCheckPassed: true, version: order.version + 1 });
    expect((await (await t.as("sales3")).post(`/orders/${order.id}/rule-check`)).status).toBe(404);
  });

  it("locks key fields after confirmation but allows edits before", async () => {
    const { sales, order, styleId } = await greenOrder("PO0094004");
    const edited = (await sales.put(`/orders/${order.id}`, { version: order.version, lines: [{ styleId, quantity: 100, unitPrice: 0.92 }], destination: "Lyon, FR" })).body.data;
    expect(edited).toMatchObject({ totalPairs: 100, destination: "Lyon, FR" });
    const confirmed = (await sales.post(`/orders/${order.id}/confirm`, { version: edited.version })).body.data;
    const locked = await sales.put(`/orders/${order.id}`, { version: confirmed.version, customerDueDate: "2027-01-05" });
    expect(locked.body.errcode).toBe("ORDER_KEY_FIELD_LOCKED");
    expect((await sales.put(`/orders/${order.id}`, { version: confirmed.version, currency: "EUR" })).body.errcode).toBe("ORDER_KEY_FIELD_LOCKED");
    expect((await sales.put(`/orders/${order.id}`, { version: confirmed.version, tradeTerm: "FOB Ningbo" })).body.errcode).toBe("ORDER_KEY_FIELD_LOCKED");
    const same = await sales.put(`/orders/${order.id}`, { version: confirmed.version, currency: confirmed.currency, customerDueDate: confirmed.customerDueDate, destination: "Paris, FR" });
    expect(same.status).toBe(200);
    expect(same.body.data.destination).toBe("Paris, FR");
    const note = await sales.put(`/orders/${order.id}`, { version: same.body.data.version, note: "改备注可以" });
    expect(note.body.data.note).toBe("改备注可以");
  });

  it("cannot be cancelled once shipped; cancelling needs the cancel permission and closes todos", async () => {
    const { sales, order } = await greenOrder("PO0094005");
    const forbidden = await sales.post(`/orders/${order.id}/cancel`, { version: order.version, reason: "客户取消" });
    expect(forbidden.status).toBe(403);

    const manager = await t.as("manager");
    const other = await greenOrder("PO0094006");
    await t.db.insert(shipments).values({ docNo: "SH-2610-901", orderId: other.order.id, status: "BOOKED", ownerId: other.order.ownerId, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers.NSR! });
    const shipped = await manager.post(`/orders/${other.order.id}/cancel`, { version: other.order.version, reason: "客户取消" });
    expect(shipped.status).toBe(409);
    expect(shipped.body.errcode).toBe("ORDER_HAS_SHIPMENTS");

    const ok = await manager.post(`/orders/${order.id}/cancel`, { version: order.version, reason: "客户取消该季" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "CANCELLED", cancelReason: "客户取消该季", cancelledAt: "2026-10-21T01:00:00.000Z" });
    const open = await t.db.select().from(todos).where(and(eq(todos.docId, order.id), eq(todos.status, "OPEN")));
    expect(open).toHaveLength(0);
    const logs = await t.db.select().from(orderStageLogs).where(eq(orderStageLogs.orderId, order.id));
    expect(logs.at(-1)).toMatchObject({ status: "CANCELLED", action: "取消订单：客户取消该季" });
    const again = await manager.post(`/orders/${order.id}/cancel`, { version: ok.body.data.version, reason: "再取消" });
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });
});

describe("orders · list, permissions and data scope", () => {
  it("filters by customer, status, due range, factory and keyword", async () => {
    const { sales, order } = await greenOrder("PO0095001");
    const second = (await greenOrder("PO0095002", { customerDueDate: "2027-01-15" })).order;
    await sales.post(`/orders/${second.id}/confirm`, { version: second.version });
    const ids = (q: string) => sales.get(`/orders?${q}`).then((r) => r.body.data.items.map((i: { poNo: string }) => i.poNo).sort());
    expect(await ids("")).toEqual(["PO0095001", "PO0095002"]);
    expect(await ids("status=PENDING_CONFIRM")).toEqual(["PO0095001"]);
    expect(await ids("status=PENDING_CONFIRM,TO_SCHEDULE")).toEqual(["PO0095001", "PO0095002"]);
    expect(await ids("dueFrom=2027-01-01")).toEqual(["PO0095002"]);
    expect(await ids("dueTo=2026-12-31")).toEqual(["PO0095001"]);
    expect(await ids(`factoryId=${await factoryIdOf(t, "NH5")}`)).toEqual(["PO0095001", "PO0095002"]);
    expect(await ids(`factoryId=${await factoryIdOf(t, "DC1")}`)).toEqual([]);
    expect(await ids(`customerId=${t.refs.customers.MRN}`)).toEqual([]);
    expect(await ids("keyword=5001")).toEqual(["PO0095001"]);
    expect(await ids("keyword=%23G5002")).toEqual(["PO0095002"]);
    const item = (await sales.get("/orders?keyword=PO0095001")).body.data.items[0];
    expect(item).toMatchObject({ customerName: "北岸运动", styleNos: ["G5001"], styleCount: 1, factoryName: "南湖五厂", ownerName: "王芳", currentNode: { code: "N06", state: "IN_PROGRESS" } });
    expect(item.id).toBe(order.id);
  });

  it("returns 404 outside the data scope and 403 without the permission", async () => {
    const { order } = await greenOrder("PO0096001");
    const sales3 = await t.as("sales3");
    expect((await sales3.get(`/orders/${order.id}`)).status).toBe(404);
    expect((await sales3.get("/orders")).body.data.total).toBe(0);
    expect((await sales3.post(`/orders/${order.id}/confirm`, { version: order.version })).status).toBe(404);
    const quality = await t.as("quality");
    expect((await quality.get("/orders")).status).toBe(403);
    expect((await quality.post("/orders", {})).status).toBe(403);
    const manager = await t.as("manager");
    expect((await manager.get(`/orders/${order.id}`)).status).toBe(200);
    const sales = await t.as("sales");
    const otherCustomer = await sales.post("/orders", { customerId: t.refs.customers.SSH, poNo: "PO0096002", customerDueDate: "2026-12-20", lines: [{ styleId: order.lines[0].styleId, quantity: 1 }] });
    expect(otherCustomer.status).toBe(404);
  });
});
