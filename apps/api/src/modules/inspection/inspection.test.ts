import { addDays } from "@otd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scheduler } from "../../core/scheduler.js";
import { type Caller, PHONES, type TestApp, createTestApp } from "../../testing/test-app.js";

const NOW = "2026-11-15T01:00:00Z";
const TODAY = "2026-11-15";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: NOW });
});
afterEach(async () => {
  await t.close();
});

async function db() {
  return { ...(await import("@otd/db")), ...(await import("drizzle-orm")) };
}

async function styleId(code: string, styleNo: string): Promise<string> {
  const { styles, and, eq } = await db();
  return (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers[code]!), eq(styles.styleNo, styleNo))))[0]!.id;
}

async function factoryId(code: string): Promise<string> {
  const { factories, eq } = await db();
  return (await t.db.select().from(factories).where(eq(factories.code, code)))[0]!.id;
}

let poSeq = 0;
async function makeOrder(opts: { customer?: string; owner?: keyof typeof PHONES; org?: string; factory?: string; dueOffset?: number; sizes?: string[] } = {}) {
  const { customerOrders, orderLines, styles } = await db();
  const customer = opts.customer ?? "MRN";
  const own = { ownerId: t.refs.users[PHONES[opts.owner ?? "sales"]]!, orgId: t.refs.orgs[opts.org ?? "ORG003"]!, customerId: t.refs.customers[customer]! };
  const seq = String(++poSeq).padStart(4, "0");
  const sid = (await t.db.insert(styles).values({ styleNo: `T${seq}`, nameZh: `测试袜 ${seq}`, nameEn: `Test Sock ${seq}`, seasonCode: "HO26", ...own }).returning())[0]!.id;
  const sizes = opts.sizes ?? ["S", "M", "L"];
  const order = (
    await t.db
      .insert(customerOrders)
      .values({ poNo: `PO-T${seq}`, currency: "EUR", customerDueDate: addDays(TODAY, opts.dueOffset ?? 40), factoryId: await factoryId(opts.factory ?? "NH5"), totalPairs: 3000, status: "IN_PRODUCTION", ...own })
      .returning()
  )[0]!;
  for (const size of sizes) await t.db.insert(orderLines).values({ orderId: order.id, styleId: sid, color: "Black", size, sku: `${customer}-BLK-${size}`, quantity: 1000, unitPrice: 1.86 });
  return { order, styleId: sid, sizes };
}

let docSeq = 0;
async function readyReports(sid: string, validUntil: string, result = "PASS", base: { owner: keyof typeof PHONES; customer: string; linkedFrom?: string } = { owner: "sales", customer: "MRN" }) {
  const { testReports, testReportLinks } = await db();
  docSeq += 1;
  const origin = base.linkedFrom ?? sid;
  const report = (
    await t.db
      .insert(testReports)
      .values({ docNo: `RPT-T-${docSeq}`, agencyReportNo: `SGS-25-9${String(docSeq).padStart(3, "0")}`, styleId: origin, items: ["COLORFAST"], result, issuedDate: addDays(TODAY, -60 + docSeq), validUntil, ownerId: t.refs.users[PHONES[base.owner]]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers[base.customer]! })
      .returning()
  )[0]!;
  await t.db.insert(testReportLinks).values({ reportId: report.id, styleId: sid });
  return report;
}

async function readyPacking(orderId: string, sid: string, sizes: string[], status = "CONFIRMED", customer = "MRN", effectiveVersion: number | null = status === "CONFIRMED" ? 3 : null) {
  const { packagingPlans, cartons, orderLines, and, eq } = await db();
  docSeq += 1;
  const own = { ownerId: t.refs.users[PHONES.sales]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers[customer]! };
  await t.db.insert(packagingPlans).values({ docNo: `PK-T-${docSeq}`, orderId, title: "包装方案", currentVersion: 3, effectiveVersion, status, ...own });
  for (const size of sizes) {
    docSeq += 1;
    const line = (await t.db.select().from(orderLines).where(and(eq(orderLines.orderId, orderId), eq(orderLines.styleId, sid), eq(orderLines.size, size))))[0]!;
    await t.db.insert(cartons).values({ docNo: `CT-T-${docSeq}`, orderId, styleId: sid, orderLineId: line.id, color: line.color, size, pairs: 1000, pairsPerCarton: 50, cartonCount: 20, status: "PACKED", ...own });
  }
}

async function createFri(sales: Caller, orderId: string, sid: string, stage = "FRI") {
  const res = await sales.post("/inspections", { orderId, styleId: sid, stage, method: "认证 QC 代检", channel: "Inspectorio" });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function inspected(orderId: string, sid: string, result: "PASS" | "FAIL", stage = "FRI") {
  const sales = await t.as("sales");
  const planner = await t.as("planner");
  const quality = await t.as("quality");
  const created = await createFri(sales, orderId, sid, stage);
  const scheduled = (await planner.post(`/inspections/${created.id}/schedule`, { version: created.version, plannedDate: addDays(TODAY, 3) })).body.data;
  const res = await quality.post(`/inspections/${created.id}/result`, { version: scheduled.version, result, actualDate: addDays(TODAY, 3), actualSampleQty: 315, defectQty: result === "FAIL" ? 7 : 0, defectNote: result === "FAIL" ? "对色不符" : null });
  expect(res.status).toBe(200);
  return res.body.data;
}

describe("inspections M10", () => {
  it("ships demo data with the video DPI round-2 failure", async () => {
    const sales = await t.as("sales");
    const list = (await sales.get("/inspections?keyword=PO0009631&pageSize=50")).body.data.items;
    const dpi = list.find((i: { stage: string }) => i.stage === "DPI");
    expect(dpi).toMatchObject({ roundNo: 2, result: "FAIL", defectNote: "对色不符", correctiveAction: "换片重缝并全检", status: "INSPECTED", defectQty: 7, actualSampleQty: 315 });
    expect(list.some((i: { stage: string; status: string }) => i.stage === "FRI" && i.status === "TO_SCHEDULE")).toBe(true);
    const detail = (await sales.get(`/inspections/${dpi.id}`)).body.data;
    expect(detail.rounds).toHaveLength(2);
    expect(detail.logs.at(-1).action).toBe("result");
    const quality = await t.as("quality");
    const all = (await quality.get("/inspections?pageSize=200")).body.data.items;
    const released = all.filter((i: { status: string }) => i.status === "RELEASED");
    expect(released.length).toBeGreaterThanOrEqual(1);
    const snapshot = (await quality.get(`/inspections/${released[0].id}/release-check`)).body.data;
    expect(snapshot.items.map((i: { passed: boolean }) => i.passed)).toEqual([true, true, true]);
    expect(snapshot.releasable).toBe(false);
  });

  it("walks request → schedule → fail → rework → pass → G2 release with logs, audit and event", async () => {
    const sales = await t.as("sales");
    const planner = await t.as("planner");
    const quality = await t.as("quality");
    const { order, styleId: sid, sizes } = await makeOrder();
    const created = await createFri(sales, order.id, sid);
    expect(created.docNo).toMatch(/^INSP-2611-\d{3}$/);
    expect(created.status).toBe("TO_SCHEDULE");
    expect(created.factoryName).toBe("南湖五厂");
    expect(created.orderQty).toBe(3000);
    expect(created.plannedExFactory).toBe(addDays(TODAY, 40));

    expect((await sales.post(`/inspections/${created.id}/schedule`, { version: created.version, plannedDate: addDays(TODAY, 3) })).status).toBe(403);
    const scheduled = await planner.post(`/inspections/${created.id}/schedule`, { version: created.version, plannedDate: addDays(TODAY, 3), inspector: "张磊" });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.data.status).toBe("SCHEDULED");
    expect(scheduled.body.data.scheduleWarning).toBeNull();

    const stale = await quality.post(`/inspections/${created.id}/result`, { version: created.version, result: "FAIL", actualDate: addDays(TODAY, 3), actualSampleQty: 315, defectQty: 7 });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await sales.post(`/inspections/${created.id}/result`, { version: scheduled.body.data.version, result: "PASS", actualDate: TODAY, actualSampleQty: 315, defectQty: 0 })).status).toBe(403);

    const failed = await quality.post(`/inspections/${created.id}/result`, { version: scheduled.body.data.version, result: "FAIL", actualDate: addDays(TODAY, 3), actualSampleQty: 315, defectQty: 7, defectNote: "对色不符", correctiveAction: "换片重缝并全检" });
    expect(failed.status).toBe(200);
    expect(failed.body.data.status).toBe("INSPECTED");
    expect(failed.body.data.roundNo).toBe(1);
    expect(failed.body.data.defectRate).toBeCloseTo(0.0222, 4);

    const blocked = await quality.post(`/inspections/${created.id}/release`, { version: failed.body.data.version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errcode).toBe("FLOW_GATE_BLOCKED");
    expect(blocked.body.errParams?.missingKeys).toEqual(["终验结论合格", "测试报告在有效期内且合格", "包装方案已确认且装箱齐套"]);
    const afterBlock = (await quality.get(`/inspections/${created.id}`)).body.data;
    expect(afterBlock.version).toBe(failed.body.data.version);
    expect(afterBlock.releaseCheck.map((i: { passed: boolean }) => i.passed)).toEqual([false, false, false]);

    const reworked = await quality.post(`/inspections/${created.id}/rework`, { version: failed.body.data.version, correctiveAction: "换片重缝并全检", plannedDate: addDays(TODAY, 6) });
    expect(reworked.body.data.status).toBe("REWORK");
    const passed = await quality.post(`/inspections/${created.id}/result`, { version: reworked.body.data.version, result: "PASS", actualDate: addDays(TODAY, 6), actualSampleQty: 315, defectQty: 1 });
    expect(passed.body.data.roundNo).toBe(2);
    expect(passed.body.data.result).toBe("PASS");

    await readyReports(sid, addDays(TODAY, 365));
    await readyPacking(order.id, sid, sizes);
    const check = (await sales.get(`/inspections/${created.id}/release-check`)).body.data;
    expect(check.passed).toBe(true);
    expect(check.releasable).toBe(true);
    expect(check.items[0].detail).toContain("第 2 轮合格");

    const released = await quality.post(`/inspections/${created.id}/release`, { version: passed.body.data.version });
    expect(released.status).toBe(200);
    expect(released.body.data.status).toBe("RELEASED");
    expect(released.body.data.concession).toBe(false);
    expect(released.body.data.releasedAt).toBe("2026-11-15T01:00:00.000Z");

    const detail = (await sales.get(`/inspections/${created.id}`)).body.data;
    expect(detail.rounds.map((r: { result: string }) => r.result)).toEqual(["FAIL", "PASS"]);
    expect(detail.logs.map((l: { action: string }) => l.action)).toEqual(["create", "schedule", "result", "release_blocked", "rework", "result", "release"]);
    expect(detail.sameOrder.map((s: { id: string }) => s.id)).toEqual([created.id]);

    const { domainEvents, eq } = await db();
    const events = await t.db.select().from(domainEvents).where(eq(domainEvents.aggregateId, created.id));
    expect(events.map((e) => e.type)).toContain("inspection.inspection.released");
    const admin = await t.as("admin");
    const logs = await admin.get(`/system/audit-logs?keyword=${created.docNo}`);
    expect(logs.body.data.items.map((l: { action: string }) => l.action)).toContain("inspection.inspection.release");
  });

  it("checks G2 conditions item by item", async () => {
    const quality = await t.as("quality");
    const { order, styleId: sid, sizes } = await makeOrder();
    const insp = await inspected(order.id, sid, "PASS");

    let check = (await quality.get(`/inspections/${insp.id}/release-check`)).body.data;
    expect(check.items.map((i: { passed: boolean }) => i.passed)).toEqual([true, false, false]);
    expect(check.items[1].detail).toContain("没有测试报告");
    expect(check.items[2].detail).toBe("订单尚未建立包装方案");

    await readyReports(sid, addDays(TODAY, 20));
    check = (await quality.get(`/inspections/${insp.id}/release-check`)).body.data;
    expect(check.refDate).toBe(addDays(TODAY, 40));
    expect(check.items[1].passed).toBe(false);
    expect(check.items[1].detail).toMatch(/将于 2026-12-05 过期，早于计划出厂日 2026-12-25/);

    await readyReports(sid, addDays(TODAY, 365), "FAIL");
    check = (await quality.get(`/inspections/${insp.id}/release-check`)).body.data;
    expect(check.items[1].detail).toContain("结论不合格");

    const linked = await readyReports(sid, addDays(TODAY, 365), "PASS", { owner: "sales", customer: "MRN", linkedFrom: await styleId("NSR", "12593") });
    await readyPacking(order.id, sid, sizes.slice(0, 2), "PENDING_CUSTOMER");
    check = (await quality.get(`/inspections/${insp.id}/release-check`)).body.data;
    expect(check.items[1].passed).toBe(true);
    expect(check.items[1].detail).toContain(linked.agencyReportNo);
    expect(check.items[2].detail).toContain("待客户确认");

    await readyPacking(order.id, sid, sizes.slice(0, 2), "DRAFT", "MRN", 2);
    check = (await quality.get(`/inspections/${insp.id}/release-check`)).body.data;
    expect(check.items[2].passed).toBe(false);
    expect(check.items[2].detail).toMatch(/^装箱单未覆盖 #T\d{4} Black\/L$/);

    const blocked = await quality.post(`/inspections/${insp.id}/release`, { version: insp.version });
    expect(blocked.body.errcode).toBe("FLOW_GATE_BLOCKED");
    expect(blocked.body.errParams?.missingKeys).toEqual(["包装方案已确认且装箱齐套"]);

    await readyPacking(order.id, sid, sizes.slice(2), "DRAFT", "MRN", 2);
    check = (await quality.get(`/inspections/${insp.id}/release-check`)).body.data;
    expect(check.items[2].passed).toBe(true);
    expect(check.items[2].detail).toMatch(/^PK-T-\d+ v2 · /);
    expect(check.passed).toBe(true);
  });

  it("only releases final inspections; IPI / DPI just record results", async () => {
    const quality = await t.as("quality");
    const { order, styleId: sid, sizes } = await makeOrder();
    await readyReports(sid, addDays(TODAY, 365));
    await readyPacking(order.id, sid, sizes);
    const dpi = await inspected(order.id, sid, "PASS", "DPI");
    const res = await quality.post(`/inspections/${dpi.id}/release`, { version: dpi.version });
    expect(res.status).toBe(409);
    expect(res.body.errcode).toBe("INSPECTION_RELEASE_FINAL_ONLY");
    expect((await quality.get(`/inspections/${dpi.id}/release-check`)).body.data.releasable).toBe(false);
  });

  it("supports concession release for a failed FRI when the customer agrees", async () => {
    const quality = await t.as("quality");
    const sales = await t.as("sales");
    const { order, styleId: sid, sizes } = await makeOrder();
    await readyReports(sid, addDays(TODAY, 365));
    await readyPacking(order.id, sid, sizes);
    const fri = await inspected(order.id, sid, "FAIL");

    const plain = await quality.post(`/inspections/${fri.id}/release`, { version: fri.version });
    expect(plain.body.errParams?.missingKeys).toEqual(["终验结论合格"]);
    expect((await quality.get(`/inspections/${fri.id}/release-check`)).body.data.concessionAvailable).toBe(true);
    expect((await sales.post(`/inspections/${fri.id}/release`, { version: fri.version, concessionReason: "客户邮件同意" })).status).toBe(403);

    const ok = await quality.post(`/inspections/${fri.id}/release`, { version: fri.version, concessionReason: "客户 2026-11-14 邮件同意按现状出货" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("RELEASED");
    expect(ok.body.data.concession).toBe(true);
    expect(ok.body.data.concessionReason).toContain("邮件同意");

    const other = await makeOrder();
    await readyReports(other.styleId, addDays(TODAY, 365));
    await readyPacking(other.order.id, other.styleId, other.sizes);
    const pass = await inspected(other.order.id, other.styleId, "PASS");
    const notNeeded = await quality.post(`/inspections/${pass.id}/release`, { version: pass.version, concessionReason: "无需" });
    expect(notNeeded.body.errcode).toBe("INSPECTION_CONCESSION_NOT_NEEDED");
  });

  it("enforces the same-factory same-day cap and warns when FRI is too close to ex-factory", async () => {
    const sales = await t.as("sales");
    const planner = await t.as("planner");
    const { inspections } = await db();
    const { order, styleId: sid } = await makeOrder();
    const day = addDays(TODAY, 8);
    const nh5 = await factoryId("NH5");
    for (let i = 0; i < 5; i++) {
      await t.db.insert(inspections).values({ docNo: `INSP-CAP-${i}`, orderId: order.id, styleId: crypto.randomUUID(), stage: "DPI", factoryId: nh5, plannedDate: day, status: "SCHEDULED", ownerId: order.ownerId, orgId: order.orgId, customerId: order.customerId });
    }
    const created = await createFri(sales, order.id, sid);
    const full = await planner.post(`/inspections/${created.id}/schedule`, { version: created.version, plannedDate: day });
    expect(full.status).toBe(409);
    expect(full.body.errcode).toBe("INSPECTION_DAILY_LIMIT");
    expect(full.body.errParams).toMatchObject({ count: 5, limit: 5 });

    const late = await planner.post(`/inspections/${created.id}/schedule`, { version: created.version, plannedDate: addDays(TODAY, 30) });
    expect(late.status).toBe(200);
    expect(late.body.data.scheduleWarning).toContain("晚于工厂交期前 12 天");

    const view = (await planner.get(`/inspections/schedule?from=${day}&to=${addDays(TODAY, 30)}`)).body.data;
    const capDay = view.days.find((d: { date: string; factoryId: string }) => d.date === day && d.factoryId === nh5);
    expect(capDay.styleCount).toBe(5);
    expect(capDay.full).toBe(true);
    expect(view.days.some((d: { items: { id: string }[] }) => d.items.some((i) => i.id === created.id))).toBe(true);
  });

  it("rejects illegal transitions and cancels with a reason", async () => {
    const sales = await t.as("sales");
    const quality = await t.as("quality");
    const { order, styleId: sid } = await makeOrder();
    const created = await createFri(sales, order.id, sid);
    const early = await quality.post(`/inspections/${created.id}/result`, { version: created.version, result: "PASS", actualDate: TODAY, actualSampleQty: 100, defectQty: 0 });
    expect(early.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const tooMany = await quality.post(`/inspections/${created.id}/result`, { version: created.version, result: "FAIL", actualDate: TODAY, actualSampleQty: 10, defectQty: 11 });
    expect(tooMany.body.errcode).toBe("INSPECTION_DEFECT_EXCEEDS_SAMPLE");

    const passed = await inspected(order.id, sid, "PASS");
    const rework = await quality.post(`/inspections/${passed.id}/rework`, { version: passed.version });
    expect(rework.body.errcode).toBe("INSPECTION_REWORK_FAILED_ONLY");

    expect((await sales.post(`/inspections/${created.id}/cancel`, { version: created.version, reason: "客户取消" })).status).toBe(403);
    const cancelled = await quality.post(`/inspections/${created.id}/cancel`, { version: created.version, reason: "客户取消" });
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect(cancelled.body.data.cancelReason).toBe("客户取消");
    const again = await quality.post(`/inspections/${created.id}/cancel`, { version: cancelled.body.data.version, reason: "重复" });
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("follows the customer flow: disabled stages are rejected and trimmed G2 conditions are not applicable", async () => {
    const sales2 = await t.as("sales2");
    const quality = await t.as("quality");
    const planner = await t.as("planner");
    const { order, styleId: sid, sizes } = await makeOrder({ customer: "BBY", owner: "sales2", factory: "DC1" });
    const dpi = await sales2.post("/inspections", { orderId: order.id, styleId: sid, stage: "DPI" });
    expect(dpi.body.errcode).toBe("INSPECTION_STAGE_NOT_ENABLED");
    const fri = (await sales2.post("/inspections", { orderId: order.id, styleId: sid, stage: "FRI" })).body.data;
    expect(fri.aql).toBe("AQL 2.5 Level II");
    const scheduled = (await planner.post(`/inspections/${fri.id}/schedule`, { version: fri.version, plannedDate: addDays(TODAY, 3) })).body.data;
    const passed = (await quality.post(`/inspections/${fri.id}/result`, { version: scheduled.version, result: "PASS", actualDate: addDays(TODAY, 3), actualSampleQty: 200, defectQty: 0 })).body.data;
    await readyPacking(order.id, sid, sizes, "CONFIRMED", "BBY");
    const check = (await quality.get(`/inspections/${fri.id}/release-check`)).body.data;
    const reports = check.items.find((i: { key: string }) => i.key === "reportsValid");
    expect(reports).toMatchObject({ applicable: false, passed: true });
    expect(check.passed).toBe(true);
    const released = await quality.post(`/inspections/${fri.id}/release`, { version: passed.version });
    expect(released.body.data.status).toBe("RELEASED");
    expect(released.body.data.releaseCheck.find((i: { key: string }) => i.key === "reportsValid").applicable).toBe(false);
  });

  it("applies data scope: other reps get 404, functional and managers can see", async () => {
    const sales = await t.as("sales");
    const { order, styleId: sid } = await makeOrder();
    const created = await createFri(sales, order.id, sid);
    const other = await t.as("sales3");
    expect((await other.get(`/inspections/${created.id}`)).status).toBe(404);
    expect((await other.get(`/inspections?orderId=${order.id}`)).body.data.total).toBe(0);
    expect((await other.post("/inspections", { orderId: order.id, styleId: sid, stage: "FRI" })).status).toBe(404);
    expect((await (await t.as("manager")).get(`/inspections/${created.id}`)).status).toBe(200);
    expect((await (await t.as("quality")).get(`/inspections?orderId=${order.id}`)).body.data.total).toBe(1);
    expect((await (await t.as("finance")).get("/inspections")).status).toBe(403);
    const kpis = (await sales.get("/inspections/kpis")).body.data;
    expect(kpis.toSchedule).toBeGreaterThanOrEqual(1);
  });

  it("daily job raises result and rework todos for quality, closed by the next action", async () => {
    const sales = await t.as("sales");
    const planner = await t.as("planner");
    const quality = await t.as("quality");
    const { order, styleId: sid } = await makeOrder();
    const created = await createFri(sales, order.id, sid);
    const scheduled = (await planner.post(`/inspections/${created.id}/schedule`, { version: created.version, plannedDate: addDays(TODAY, -2) })).body.data;
    const scheduler = t.app.get(Scheduler);
    await scheduler.runNow("inspection.daily");
    await scheduler.runNow("inspection.daily");
    const open = async () => {
      const board = (await quality.get("/todos/board")).body.data;
      return [...board.overdue, ...board.today, ...board.later].filter((i: { docId: string }) => i.docId === created.id).map((i: { action: string }) => i.action);
    };
    expect(await open()).toEqual(["inspection.result"]);
    const failed = (await quality.post(`/inspections/${created.id}/result`, { version: scheduled.version, result: "FAIL", actualDate: addDays(TODAY, -2), actualSampleQty: 200, defectQty: 9, defectNote: "对色不符" })).body.data;
    expect(await open()).toEqual(["inspection.rework"]);
    const salesNotes = (await sales.get("/notifications")).body.data.items;
    expect(salesNotes.some((n: { title: string }) => n.title.includes(created.docNo))).toBe(true);
    await quality.post(`/inspections/${created.id}/rework`, { version: failed.version });
    expect(await open()).toEqual([]);
  });
});
