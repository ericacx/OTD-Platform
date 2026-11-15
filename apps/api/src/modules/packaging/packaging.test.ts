import { customerOrders, orderLines, styles, todos } from "@otd/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { PackagingService } from "./packaging.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

let seq = 0;
async function fixtureOrder(quantities: number[] = [300, 720, 100], owner = "13800000001", org = "ORG003", customer = "NSR") {
  seq += 1;
  const ref = { ownerId: t.refs.users[owner]!, orgId: t.refs.orgs[org]!, customerId: t.refs.customers[customer]! };
  const style = (await t.db.insert(styles).values({ styleNo: `T${seq}`, nameZh: "测试款", ...ref }).returning())[0]!;
  const order = (
    await t.db
      .insert(customerOrders)
      .values({ poNo: `PO-T${seq}`, customerDueDate: "2026-12-01", factoryReplyDate: "2026-11-25", totalPairs: quantities.reduce((a, b) => a + b, 0), status: "TO_SCHEDULE", ...ref })
      .returning()
  )[0]!;
  const sizes = ["S", "M", "L", "XL"];
  for (const [i, q] of quantities.entries()) {
    await t.db.insert(orderLines).values({ orderId: order.id, styleId: style.id, color: "Black", size: sizes[i % 4]!, sku: `${customer}-T${seq}-BLK-${sizes[i % 4]}`, quantity: q });
  }
  return { order, style };
}

const planBody = (orderId: string, pairsPerCarton = 100) => ({
  orderId,
  title: "Crew · 罗纹中筒袜翻折卡装",
  method: "罗纹中筒袜翻折卡装",
  pairsPerCarton,
  cartonSize: "56 × 42 × 38 cm",
  cartonType: "C 型单层瓦楞纸箱",
  strength: "44 ECT",
  innerBag: "OPP 平口袋",
  destination: "NSR Hamburg DC",
  requirements: [{ title: "装箱方式", content: "单 SKU 装箱" }],
});

async function confirmedPlan(orderId: string, pairsPerCarton = 120) {
  const sales = await t.as("sales");
  const created = (await sales.post("/packaging/plans", planBody(orderId, pairsPerCarton))).body.data;
  const submitted = (await sales.post(`/packaging/plans/${created.id}/submit`, { version: created.version })).body.data;
  return (await sales.post(`/packaging/plans/${created.id}/confirm`, { version: submitted.version, confirmedBy: "Milena Ortiz", method: "EMAIL" })).body.data;
}

describe("packaging plans", () => {
  it("runs draft → customer → confirmed and revises into a new version with field diff", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder();
    const created = await sales.post("/packaging/plans", planBody(order.id));
    expect(created.status).toBe(201);
    const p = created.body.data;
    expect(p.docNo).toMatch(/^PK-2610-\d{3}$/);
    expect(p.status).toBe("DRAFT");
    expect(p.currentVersion).toBe(1);
    expect(p.poNo).toBe(order.poNo);
    expect(p.customerCode).toBe("NSR");
    expect(p.versions).toHaveLength(1);

    const early = await sales.post(`/packaging/plans/${p.id}/confirm`, { version: p.version, confirmedBy: "Milena", method: "EMAIL" });
    expect(early.status).toBe(409);
    expect(early.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    const submitted = await sales.post(`/packaging/plans/${p.id}/submit`, { version: p.version });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("PENDING_CUSTOMER");
    expect(submitted.body.data.submittedAt).toBe("2026-10-21T01:00:00.000Z");

    const stale = await sales.post(`/packaging/plans/${p.id}/confirm`, { version: p.version, confirmedBy: "Milena", method: "EMAIL" });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const locked = await sales.put(`/packaging/plans/${p.id}`, { version: submitted.body.data.version, pairsPerCarton: 90 });
    expect(locked.body.errcode).toBe("PACKAGING_NOT_EDITABLE");

    const confirmed = (await sales.post(`/packaging/plans/${p.id}/confirm`, { version: submitted.body.data.version, confirmedBy: "Milena Ortiz", method: "EMAIL", note: "邮件确认" })).body.data;
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.effectiveVersion).toBe(1);
    expect(confirmed.versions[0].customerConfirmed).toBe(true);
    expect(confirmed.versions[0].confirmedBy).toBe("Milena Ortiz");

    const noNote = await sales.put(`/packaging/plans/${p.id}`, { version: confirmed.version, pairsPerCarton: 120 });
    expect(noNote.status).toBe(422);
    expect(noNote.body.errcode).toBe("PACKAGING_CHANGE_NOTE_REQUIRED");

    const revised = (await sales.put(`/packaging/plans/${p.id}`, { version: confirmed.version, pairsPerCarton: 120, innerBag: "OPP 自立袋 · 0.06mm", changeNote: "每箱双数 100 → 120（客户要求）" })).body.data;
    expect(revised.status).toBe("DRAFT");
    expect(revised.currentVersion).toBe(2);
    expect(revised.effectiveVersion).toBe(1);
    expect(revised.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([1, 2]);
    expect(revised.versions[1].changeNote).toBe("每箱双数 100 → 120（客户要求）");
    expect(revised.versions[1].changedByName).toBe("王芳");
    expect(revised.versions[0].snapshot.pairsPerCarton).toBe(100);

    const tweak = (await sales.put(`/packaging/plans/${p.id}`, { version: revised.version, tape: "BOPP 封箱胶带 · 宽 60mm" })).body.data;
    expect(tweak.currentVersion).toBe(2);

    const diff = (await sales.get(`/packaging/plans/${p.id}/compare?from=1&to=2`)).body.data;
    expect(diff.diffs).toEqual([
      { field: "pairsPerCarton", from: 100, to: 120 },
      { field: "innerBag", from: "OPP 平口袋", to: "OPP 自立袋 · 0.06mm" },
      { field: "tape", from: null, to: "BOPP 封箱胶带 · 宽 60mm" },
    ]);
    const missing = await sales.get(`/packaging/plans/${p.id}/compare?from=1&to=7`);
    expect(missing.status).toBe(404);
    expect(missing.body.errcode).toBe("PACKAGING_VERSION_NOT_FOUND");

    const s2 = (await sales.post(`/packaging/plans/${p.id}/submit`, { version: tweak.version })).body.data;
    const c2 = (await sales.post(`/packaging/plans/${p.id}/confirm`, { version: s2.version, confirmedBy: "Milena Ortiz", method: "CUSTOMER_SYSTEM" })).body.data;
    expect(c2.effectiveVersion).toBe(2);
    expect(c2.versions.filter((v: { effective: boolean }) => v.effective).map((v: { versionNo: number }) => v.versionNo)).toEqual([2]);

    const admin = await t.as("admin");
    const logs = (await admin.get(`/system/audit-logs?keyword=${p.docNo}&pageSize=50`)).body.data.items.map((l: { action: string }) => l.action);
    expect(logs).toEqual(expect.arrayContaining(["packaging.plan.create", "packaging.plan.submit", "packaging.plan.confirm", "packaging.plan.revise"]));
  });

  it("lets the customer send a plan back to draft", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder();
    const p = (await sales.post("/packaging/plans", planBody(order.id))).body.data;
    const s = (await sales.post(`/packaging/plans/${p.id}/submit`, { version: p.version })).body.data;
    const back = await sales.post(`/packaging/plans/${p.id}/return`, { version: s.version, reason: "尺码贴颜色待定" });
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe("DRAFT");
    expect(back.body.data.currentVersion).toBe(1);
    const again = await sales.post(`/packaging/plans/${p.id}/return`, { version: back.body.data.version });
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("applies permission and data scope", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder();
    const p = (await sales.post("/packaging/plans", planBody(order.id))).body.data;
    const other = await t.as("sales3");
    expect((await other.get(`/packaging/plans/${p.id}`)).status).toBe(404);
    expect((await other.get("/packaging/plans")).body.data.total).toBe(0);
    expect((await other.post("/packaging/plans", planBody(order.id))).status).toBe(404);
    const manager = await t.as("manager");
    expect((await manager.get(`/packaging/plans/${p.id}`)).status).toBe(200);
    expect((await manager.get("/packaging/plans?keyword=" + order.poNo)).body.data.items.map((x: { id: string }) => x.id)).toEqual([p.id]);
    const tech = await t.as("tech");
    const denied = await tech.get("/packaging/plans");
    expect(denied.status).toBe(403);
    expect(denied.body.errcode).toBe("IAM_FORBIDDEN");
    const customs = await t.as("customs");
    expect((await customs.post("/packaging/plans", planBody(order.id))).status).toBe(403);
    expect((await sales.post("/packaging/plans", { method: "x" })).body.errcode).toBe("PACKAGING_SOURCE_REQUIRED");
  });

  it("raises a todo for the sales rep when the customer has not confirmed for 5 days", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder();
    const p = (await sales.post("/packaging/plans", planBody(order.id))).body.data;
    const s = (await sales.post(`/packaging/plans/${p.id}/submit`, { version: p.version })).body.data;
    const service = t.app.get(PackagingService);
    expect(await service.remindPendingCustomer()).toBe(0);
    t.clock.set("2026-10-27T02:00:00Z");
    expect(await service.remindPendingCustomer()).toBe(1);
    expect(await service.remindPendingCustomer()).toBe(1);
    const open = await t.db.select().from(todos).where(eq(todos.docId, p.id));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ assigneeId: sales.userId, status: "OPEN", docNo: p.docNo, dueAt: new Date("2026-10-26T01:00:00Z") });
    expect(open[0]!.title).toContain("催客户确认包装方案");
    t.clock.set("2026-10-21T01:00:00Z");
    await sales.post(`/packaging/plans/${p.id}/confirm`, { version: s.version, confirmedBy: "Milena", method: "OFFLINE" });
    expect((await t.db.select().from(todos).where(eq(todos.docId, p.id)))[0]!.status).toBe("DONE");
  });
});

describe("cartons", () => {
  it("generates one list per order line with ceil carton counts and continuous ranges", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder([300, 720, 100]);
    const none = await sales.post("/packaging/cartons/generate", { orderId: order.id });
    expect(none.status).toBe(422);
    expect(none.body.errcode).toBe("PACKAGING_PLAN_REQUIRED");

    const before = (await sales.get(`/packaging/cartons/coverage?orderId=${order.id}`)).body.data;
    expect(before.covered).toBe(false);
    expect(before.missing).toHaveLength(3);

    const plan = await confirmedPlan(order.id, 120);
    const gen = await sales.post("/packaging/cartons/generate", { orderId: order.id });
    expect(gen.status).toBe(201);
    const rows = gen.body.data;
    expect(rows.map((r: { cartonCount: number }) => r.cartonCount)).toEqual([3, 6, 1]);
    expect(rows.map((r: { cartonRange: string }) => r.cartonRange)).toEqual(["1–3", "4–9", "10–10"]);
    expect(rows.map((r: { tailPairs: number }) => r.tailPairs)).toEqual([60, 0, 100]);
    expect(rows[0].docNo).toMatch(/^CT-2610-\d{3}$/);
    expect(rows[0].planDocNo).toBe(plan.docNo);
    expect(rows[0].planVersion).toBe(1);
    expect(rows[0].packDueDate).toBe("2026-11-25");
    expect(rows[0].status).toBe("TO_PACK");

    expect((await sales.post("/packaging/cartons/generate", { orderId: order.id })).body.data).toEqual([]);
    const after = (await sales.get(`/packaging/cartons/coverage?orderId=${order.id}`)).body.data;
    expect(after).toMatchObject({ covered: true, lineCount: 3, coveredLineCount: 3, missing: [] });
    const detail = (await sales.get(`/packaging/plans/${plan.id}`)).body.data;
    expect(detail.applicable).toEqual({ cartonLines: 3, pairs: 1120, cartons: 10 });

    const adjusted = await sales.put(`/packaging/cartons/${rows[0].id}`, { version: rows[0].version, pairsPerCarton: 50 });
    expect(adjusted.body.data.cartonCount).toBe(6);
    expect(adjusted.body.data.cartonRange).toBe("1–6");
    const list = (await sales.get(`/packaging/cartons?orderId=${order.id}&pageSize=10`)).body.data.items;
    expect(list.map((r: { rangeStart: number; cartonRange: string }) => [r.rangeStart, r.cartonRange]).sort((a: [number], b: [number]) => a[0] - b[0]).map((x: [number, string]) => x[1])).toEqual(["1–6", "7–12", "13–13"]);

    const c = list.find((r: { id: string }) => r.id === rows[2].id);
    const bad = await sales.post(`/packaging/cartons/${c.id}/finish`, { version: c.version });
    expect(bad.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const started = (await sales.post(`/packaging/cartons/${c.id}/start`, { version: c.version })).body.data;
    expect(started.status).toBe("PACKING");
    expect((await sales.post(`/packaging/cartons/${c.id}/finish`, { version: c.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const packed = (await sales.post(`/packaging/cartons/${c.id}/finish`, { version: started.version })).body.data;
    expect(packed.status).toBe("PACKED");
    expect(packed.packedAt).toBe("2026-10-21T01:00:00.000Z");
    expect((await sales.put(`/packaging/cartons/${c.id}`, { version: packed.version, pairsPerCarton: 10 })).body.errcode).toBe("PACKAGING_CARTON_NOT_EDITABLE");

    const bySku = (await sales.get(`/packaging/cartons?keyword=${rows[1].customerSku}`)).body.data.items;
    expect(bySku.map((r: { id: string }) => r.id)).toEqual([rows[1].id]);
    const byPo = (await sales.get(`/packaging/cartons?keyword=${order.poNo}&status=PACKED`)).body.data.items;
    expect(byPo.map((r: { id: string }) => r.id)).toEqual([c.id]);
  });

  it("uses the confirmed version while a revision is still in draft", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder([250]);
    const plan = await confirmedPlan(order.id, 100);
    await sales.put(`/packaging/plans/${plan.id}`, { version: plan.version, pairsPerCarton: 50, changeNote: "改小箱" });
    const rows = (await sales.post("/packaging/cartons/generate", { orderId: order.id })).body.data;
    expect(rows[0]).toMatchObject({ pairsPerCarton: 100, cartonCount: 3, planVersion: 1, tailPairs: 50 });
  });

  it("applies data scope to cartons", async () => {
    const sales = await t.as("sales");
    const { order } = await fixtureOrder([240]);
    await confirmedPlan(order.id, 120);
    const rows = (await sales.post("/packaging/cartons/generate", { orderId: order.id })).body.data;
    const other = await t.as("sales3");
    expect((await other.get(`/packaging/cartons/${rows[0].id}`)).status).toBe(404);
    expect((await other.get("/packaging/cartons")).body.data.total).toBe(0);
    expect((await other.post("/packaging/cartons/generate", { orderId: order.id })).status).toBe(404);
    expect((await other.get(`/packaging/cartons/coverage?orderId=${order.id}`)).status).toBe(404);
    const finance = await t.as("finance");
    expect((await finance.get("/packaging/cartons")).status).toBe(403);
    const customs = await t.as("customs");
    expect((await customs.post("/packaging/cartons/generate", { orderId: order.id })).status).toBe(403);
  });
});
