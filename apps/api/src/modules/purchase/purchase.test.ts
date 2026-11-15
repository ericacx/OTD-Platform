import { customerOrders, materials, orderLines, styles, todos } from "@otd/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { PurchaseService } from "./purchase.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

let seq = 0;
async function fixtureOrder(quantities: number[] = [300, 720, 100]) {
  seq += 1;
  const ref = { ownerId: t.refs.users["13800000001"]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers.NSR! };
  const style = (await t.db.insert(styles).values({ styleNo: `P${seq}`, nameZh: "测试款", ...ref }).returning())[0]!;
  const order = (await t.db.insert(customerOrders).values({ poNo: `PO-P${seq}`, customerDueDate: "2026-12-01", totalPairs: quantities.reduce((a, b) => a + b, 0), status: "TO_SCHEDULE", ...ref }).returning())[0]!;
  for (const [i, q] of quantities.entries()) await t.db.insert(orderLines).values({ orderId: order.id, styleId: style.id, color: "Black", size: `S${i}`, sku: `NSR-P${seq}-${i}`, quantity: q });
  return order;
}

async function material(code: string) {
  return (await t.db.select().from(materials).where(eq(materials.code, code)))[0]!;
}

describe("purchase orders", () => {
  it("lets the buyer order for a sales order and receive it partially then fully", async () => {
    const buyer = await t.as("buyer");
    const order = await fixtureOrder();
    const yarn = await material("Y-40S-T80C20");
    const created = await buyer.post("/purchases", {
      orderId: order.id,
      supplier: "华茂纱业",
      category: "YARN",
      promisedDate: "2026-10-30",
      lines: [
        { materialId: yarn.id, quantity: 50 },
        { name: "70D 锦纶包覆纱", unit: "kg", quantity: 8.5, unitPrice: 56 },
      ],
    });
    expect(created.status).toBe(201);
    const p = created.body.data;
    expect(p.docNo).toMatch(/^PUR-2610-\d{3}$/);
    expect(p).toMatchObject({ status: "ORDERED", poNo: order.poNo, customerName: "北岸运动", orderedAt: "2026-10-21", overdue: false, lineCount: 2, ownerName: "周涛" });
    expect(p.lines[0]).toMatchObject({ name: "40S/1*2 T80C20 纱线", unit: "kg", unitPrice: 42.5, materialCode: "Y-40S-T80C20", remainingQty: 50 });
    expect(p.amount).toBe(2601);
    const [l1, l2] = p.lines;

    const partial = await buyer.post(`/purchases/${p.id}/receive`, { version: p.version, qcResult: "PASS", lines: [{ lineId: l1.id, quantity: 20 }] });
    expect(partial.status).toBe(200);
    expect(partial.body.data.status).toBe("PARTIAL");
    expect(partial.body.data.lines[0].receivedQty).toBe(20);
    expect(partial.body.data.receivedRate).toBeCloseTo(20 / 58.5, 4);

    expect((await buyer.post(`/purchases/${p.id}/receive`, { version: p.version, lines: [{ lineId: l1.id, quantity: 1 }] })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const over = await buyer.post(`/purchases/${p.id}/receive`, { version: partial.body.data.version, lines: [{ lineId: l1.id, quantity: 31 }] });
    expect(over.status).toBe(422);
    expect(over.body.errcode).toBe("PURCHASE_RECEIVE_EXCEEDS");

    const second = (await buyer.post(`/purchases/${p.id}/receive`, { version: partial.body.data.version, lines: [{ lineId: l2.id, quantity: 4 }] })).body.data;
    expect(second.status).toBe("PARTIAL");
    const done = (await buyer.post(`/purchases/${p.id}/receive`, { version: second.version, receivedAt: "2026-10-22", lines: [{ lineId: l1.id, quantity: 30 }, { lineId: l2.id, quantity: 4.5 }] })).body.data;
    expect(done.status).toBe("RECEIVED");
    expect(done.receivedAt).toBe("2026-10-22");
    expect(done.receivedRate).toBe(1);
    expect(done.receipts).toHaveLength(4);

    expect((await buyer.post(`/purchases/${p.id}/receive`, { version: done.version, lines: [{ lineId: l1.id, quantity: 1 }] })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await buyer.post(`/purchases/${p.id}/cancel`, { version: done.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    const receipts = (await buyer.get(`/purchases/receipts?purchaseId=${p.id}`)).body.data;
    expect(receipts.total).toBe(4);
    expect(receipts.items[0]).toMatchObject({ purchaseDocNo: p.docNo, supplier: "华茂纱业", createdByName: "周涛" });
    expect((await buyer.get(`/purchases?keyword=${order.poNo}`)).body.data.items.map((x: { id: string }) => x.id)).toEqual([p.id]);
  });

  it("cancels an ordered purchase only once", async () => {
    const buyer = await t.as("buyer");
    const order = await fixtureOrder();
    const p = (await buyer.post("/purchases", { orderId: order.id, supplier: "宏达包装", category: "PACKAGING", promisedDate: "2026-10-25", lines: [{ name: "吊卡", unit: "个", quantity: 1000 }] })).body.data;
    const cancelled = await buyer.post(`/purchases/${p.id}/cancel`, { version: p.version, reason: "客户改用客供吊卡" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({ status: "CANCELLED", cancelReason: "客户改用客供吊卡" });
    expect((await buyer.post(`/purchases/${p.id}/cancel`, { version: cancelled.body.data.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await buyer.post("/purchases", { supplier: "x", category: "TRIM", promisedDate: "2026-10-25", lines: [{ name: "a", unit: "个", quantity: 1 }] })).body.errcode).toBe("PURCHASE_SOURCE_REQUIRED");
    expect((await buyer.post("/purchases", { orderId: order.id, supplier: "x", category: "TRIM", promisedDate: "2026-10-25", lines: [{ quantity: 1 }] })).body.errcode).toBe("PURCHASE_LINE_NAME_REQUIRED");
  });

  it("flags overdue purchases and raises a todo for the buyer until fully received", async () => {
    const buyer = await t.as("buyer");
    const order = await fixtureOrder();
    const late = (await buyer.post("/purchases", { orderId: order.id, supplier: "联达辅料", category: "TRIM", orderedAt: "2026-10-05", promisedDate: "2026-10-18", lines: [{ name: "硅胶防滑点", unit: "双", quantity: 1120 }] })).body.data;
    await buyer.post("/purchases", { orderId: order.id, supplier: "宏达包装", category: "PACKAGING", promisedDate: "2026-10-28", lines: [{ name: "吊卡", unit: "个", quantity: 1120 }] });
    expect(late).toMatchObject({ overdue: true, overdueDays: 3 });
    const flagged = (await buyer.get("/purchases?overdue=true")).body.data;
    expect(flagged.items.map((x: { id: string }) => x.id)).toEqual([late.id]);

    expect(await t.app.get(PurchaseService).scanOverdue()).toBe(1);
    const open = await t.db.select().from(todos).where(eq(todos.docId, late.id));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ assigneeId: buyer.userId, status: "OPEN", docNo: late.docNo });
    expect(open[0]!.description).toContain("已逾期 3 天");
    const board = (await buyer.get("/todos/board")).body.data;
    expect(board.overdue[0].overdueDays).toBe(3);

    await buyer.post(`/purchases/${late.id}/receive`, { version: late.version, lines: [{ lineId: late.lines[0].id, quantity: 1120 }] });
    expect((await t.db.select().from(todos).where(eq(todos.docId, late.id)))[0]!.status).toBe("DONE");
  });

  it("explodes material requirements from order lines and compares with ordered quantities", async () => {
    const buyer = await t.as("buyer");
    const sales = await t.as("sales");
    const order = await fixtureOrder([300, 720, 100]);
    const base = (await buyer.get(`/purchases/requirements?orderId=${order.id}`)).body.data;
    expect(base).toMatchObject({ totalPairs: 1120, pairsPerCarton: 120, pairsPerCartonSource: "DEFAULT" });

    const plan = (await sales.post("/packaging/plans", { orderId: order.id, method: "平铺装箱", pairsPerCarton: 100 })).body.data;
    const sub = (await sales.post(`/packaging/plans/${plan.id}/submit`, { version: plan.version })).body.data;
    await sales.post(`/packaging/plans/${plan.id}/confirm`, { version: sub.version, confirmedBy: "Milena", method: "EMAIL" });

    const yarn = await material("Y-40S-T80C20");
    const opp = await material("P-OPP-BAG");
    await buyer.post("/purchases", { orderId: order.id, supplier: "华茂纱业", category: "YARN", promisedDate: "2026-10-30", lines: [{ materialId: yarn.id, quantity: 20 }] });
    await buyer.post("/purchases", { orderId: order.id, supplier: "宏达包装", category: "PACKAGING", promisedDate: "2026-10-30", lines: [{ materialId: opp.id, quantity: 1200 }] });
    const cancelled = (await buyer.post("/purchases", { orderId: order.id, supplier: "宏达包装", category: "PACKAGING", promisedDate: "2026-10-30", lines: [{ name: "C 型纸箱", unit: "个", quantity: 12 }] })).body.data;
    await buyer.post(`/purchases/${cancelled.id}/cancel`, { version: cancelled.version });

    const req = (await buyer.get(`/purchases/requirements?orderId=${order.id}`)).body.data;
    expect(req).toMatchObject({ poNo: order.poNo, totalPairs: 1120, pairsPerCarton: 100, pairsPerCartonSource: "PLAN" });
    const by = Object.fromEntries(req.items.map((i: { key: string }) => [i.key, i]));
    expect(by.YARN).toMatchObject({ unit: "kg", required: 29.232, ordered: 20, shortage: 9.232, materialCode: "Y-40S-T80C20", suggestion: "建议补采 9.232 kg" });
    expect(by.OPP_BAG).toMatchObject({ required: 1120, ordered: 1200, shortage: 0, suggestion: null });
    expect(by.CARTON).toMatchObject({ required: 3 + 8 + 1, ordered: 0, shortage: 12 });
  });

  it("applies permission and data scope", async () => {
    const buyer = await t.as("buyer");
    const order = await fixtureOrder();
    const p = (await buyer.post("/purchases", { orderId: order.id, supplier: "华茂纱业", category: "YARN", promisedDate: "2026-10-30", lines: [{ name: "纱线", unit: "kg", quantity: 10 }] })).body.data;
    const sales = await t.as("sales");
    const denied = await sales.get("/purchases");
    expect(denied.status).toBe(403);
    expect(denied.body.errcode).toBe("IAM_FORBIDDEN");
    expect((await sales.post("/purchases", { orderId: order.id, supplier: "x", category: "YARN", promisedDate: "2026-10-30", lines: [{ name: "a", unit: "kg", quantity: 1 }] })).status).toBe(403);
    const planner = await t.as("planner");
    expect((await planner.get(`/purchases/${p.id}`)).status).toBe(200);
    expect((await planner.post(`/purchases/${p.id}/receive`, { version: p.version, lines: [{ lineId: p.lines[0].id, quantity: 1 }] })).status).toBe(403);
    const manager = await t.as("manager");
    expect((await manager.get(`/purchases/${p.id}`)).status).toBe(404);
    expect((await manager.get("/purchases")).body.data.total).toBe(0);
    expect((await manager.get("/purchases/receipts")).body.data.total).toBe(0);
    const gm = await t.as("gm");
    expect((await gm.get(`/purchases/${p.id}`)).status).toBe(200);
  });
});
