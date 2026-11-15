import { baseMachines, bases, customerOrders, factories, ledgerTasks, needleTypes, notifications, orderLines, plannings, productionProgress, styles, todos } from "@otd/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { LedgerTaskService, nextDue } from "./ledger-task.service.js";

let t: TestApp;
afterEach(async () => {
  await t.close();
});

async function machineCells() {
  const rows = await t.db.select({ base: bases.code, needle: needleTypes.code, needles: needleTypes.needles }).from(baseMachines).innerJoin(bases, eq(bases.id, baseMachines.baseId)).innerJoin(needleTypes, eq(needleTypes.id, baseMachines.needleTypeId));
  return rows.sort((a, b) => a.base.localeCompare(b.base) || a.needles - b.needles).map((r) => `${r.base}-${r.needle}`);
}

async function ids() {
  const b = Object.fromEntries((await t.db.select().from(bases)).map((x) => [x.code, x.id]));
  const n = Object.fromEntries((await t.db.select().from(needleTypes)).map((x) => [x.code, x.id]));
  const f = Object.fromEntries((await t.db.select().from(factories)).map((x) => [x.code, x.id]));
  return { b, n, f };
}

async function seedOrders() {
  const { f } = await ids();
  const ref = { ownerId: t.refs.users["13800000001"]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers.NSR! };
  const styleA = (await t.db.insert(styles).values({ styleNo: "CAP-A", nameZh: "A", ...ref }).returning())[0]!;
  const styleB = (await t.db.insert(styles).values({ styleNo: "CAP-B", nameZh: "B", ...ref }).returning())[0]!;
  await t.db.insert(plannings).values({ docNo: "BR-TEST-001", styleId: styleA.id, styleNo: "CAP-A", status: "CONFIRMED", needleCount: "120N", ...ref });
  const order = async (poNo: string, factory: string, status: string, totalPairs: number, lines: [string, number][]) => {
    const o = (await t.db.insert(customerOrders).values({ poNo, factoryId: f[factory]!, status, totalPairs, customerDueDate: "2026-12-20", ...ref }).returning())[0]!;
    for (const [styleId, quantity] of lines) await t.db.insert(orderLines).values({ orderId: o.id, styleId, quantity });
    return o;
  };
  const o1 = await order("CAP-1", "DC1", "IN_PRODUCTION", 10000, [[styleA.id, 6000], [styleB.id, 4000]]);
  await t.db.insert(productionProgress).values({ orderId: o1.id, reportDate: "2026-10-10", knittedPairs: 1000 });
  await t.db.insert(productionProgress).values({ orderId: o1.id, reportDate: "2026-10-18", knittedPairs: 3000 });
  await order("CAP-2", "DC2", "TO_SCHEDULE", 5000, []);
  await order("CAP-3", "DC1", "PENDING_CONFIRM", 9999, [[styleA.id, 9999]]);
  await order("CAP-4", "HP3", "TO_SCHEDULE", 2000, [[styleA.id, 2000]]);
  await order("CAP-5", "NH5", "COMPLETED", 8000, [[styleB.id, 8000]]);
  return { o1 };
}

type Row = { baseCode: string; needleCode: string; ledger: string; [k: string]: unknown };
const cell = (rows: Row[], base: string, needle: string) => rows.find((r) => r.ledger === "KNIT" && r.baseCode === base && r.needleCode === needle)!;

describe("capacity ledger", () => {
  beforeEach(async () => {
    t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
  });

  it("computes the knitting free-capacity table from machines, orders and latest progress", async () => {
    const { o1 } = await seedOrders();
    const planner = await t.as("planner");
    const cells = await machineCells();
    expect(cells).toEqual(expect.arrayContaining(["DC-96N", "DC-120N", "DC-144N", "NH-96N", "VN-120N"]));
    const created = await planner.post("/capacity/versions", { note: "周更新" });
    expect(created.status).toBe(201);
    const d = created.body.data;
    expect(d.version).toMatchObject({ versionNo: 1, label: "V1", asOfDate: "2026-10-21", windowDays: 60, status: "DRAFT", rowCounts: { KNIT: cells.length, PACKING: 0, SPECIAL: 0 } });
    const rows = d.rows as Row[];
    expect(rows.map((r) => `${r.baseCode}-${r.needleCode}`)).toEqual(cells);

    const dc120 = cell(rows, "DC", "120N");
    expect(dc120).toMatchObject({ leadDays: 7, availableDays: 53, machineCount: 253, dailyOutput: 192.8, unproducedQty: 4200 });
    expect(dc120.cumulativeCapacity).toBeCloseTo(53 * 192.8 * 253, 3);
    expect(dc120.spareCapacity).toBeCloseTo(53 * 192.8 * 253 - 4200, 3);
    expect(dc120.spareRate).toBeCloseTo((53 * 192.8 * 253 - 4200) / (53 * 192.8 * 253), 4);
    expect(dc120.sources).toEqual({ leadDays: "DEFAULT", machineCount: "MANUAL", dailyOutput: "SYNC", unproducedQty: "SYNC", erpBacklog: "SYNC" });
    expect(dc120).toMatchObject({ otdUnproducedQty: 4200, erpBacklog: 0 });
    expect(cell(rows, "DC", "144N")).toMatchObject({ unproducedQty: 2800 + 5000, cumulativeCapacity: 53 * 188.5 * 276 });
    expect(cell(rows, "VN", "120N")).toMatchObject({ leadDays: 10, availableDays: 50, unproducedQty: 2000 });
    expect(cell(rows, "NH", "96N")).toMatchObject({ leadDays: 8, availableDays: 52, unproducedQty: 0 });
    expect(cell(rows, "NH", "144N").unproducedQty).toBe(0);

    const knit = rows.filter((r) => r.ledger === "KNIT");
    const cap = knit.reduce((s, r) => s + (r.cumulativeCapacity as number), 0);
    const spare = knit.reduce((s, r) => s + (r.spareCapacity as number), 0);
    expect(d.kpis.groupSpare).toBeCloseTo(spare, 2);
    expect(d.kpis.groupSpareWan).toBeCloseTo(spare / 10000, 2);
    expect(d.kpis.avgSpareRate).toBeCloseTo(spare / cap, 4);
    expect(d.kpis).toMatchObject({ tightCount: 0, tightThreshold: 0.12, overdueTasks: 1 });

    const filtered = (await planner.get(`/capacity/versions/${d.version.id}?keyword=越南`)).body.data.rows;
    expect(filtered).toHaveLength(4);

    await t.db.insert(productionProgress).values({ orderId: o1.id, reportDate: "2026-10-20", knittedPairs: 8000 });
    const v2 = (await planner.post("/capacity/versions", {})).body.data;
    expect(v2.version.label).toBe("V2");
    const diff = (await planner.get(`/capacity/compare?from=${d.version.id}&to=${v2.version.id}`)).body.data;
    const changed = diff.rows.filter((r: { change: string }) => r.change === "CHANGED");
    expect(changed.map((r: { baseName: string; needleCode: string }) => `${r.baseName}-${r.needleCode}`).sort()).toEqual(["东城基地-120N", "东城基地-144N"]);
    const dc120diff = changed.find((r: { needleCode: string }) => r.needleCode === "120N");
    expect(dc120diff.fields.find((f: { field: string }) => f.field === "unproducedQty")).toMatchObject({ from: 4200, to: 1200, delta: -3000 });
    expect(diff.rows.filter((r: { change: string }) => r.change === "SAME")).toHaveLength(cells.length - 2);
  });

  it("counts tight needle types after machines are reduced and lead time is edited on the row", async () => {
    await seedOrders();
    const planner = await t.as("planner");
    const machines = (await planner.get("/capacity/machines")).body.data;
    const m = machines.find((x: { baseCode: string; needleCode: string }) => x.baseCode === "DC" && x.needleCode === "144N");
    const stale = await planner.put("/capacity/machines", { baseId: m.baseId, needleTypeId: m.needleTypeId, machineCount: 1, version: m.version + 1 });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const updated = await planner.put("/capacity/machines", { baseId: m.baseId, needleTypeId: m.needleTypeId, machineCount: 1, version: m.version });
    expect(updated.status).toBe(200);
    expect(updated.body.data.machineCount).toBe(1);

    const d = (await planner.post("/capacity/versions", {})).body.data;
    const row = cell(d.rows, "DC", "144N");
    expect(row.cumulativeCapacity).toBeCloseTo(53 * 188.5, 3);
    expect(row.spareRate).toBeCloseTo((53 * 188.5 - 7800) / (53 * 188.5), 4);
    expect(d.kpis.tightCount).toBe(0);

    const edited = await planner.put(`/capacity/rows/${row.id}`, { version: row.version, leadDays: 20 });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ leadDays: 20, availableDays: 40, cumulativeCapacity: 7540, spareCapacity: -260, tight: true });
    expect(edited.body.data.sources.leadDays).toBe("MANUAL");
    expect((await planner.put(`/capacity/rows/${row.id}`, { version: row.version, leadDays: 9 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const after = (await planner.get(`/capacity/versions/${d.version.id}`)).body.data;
    expect(after.kpis.tightCount).toBe(1);

    const next = (await planner.post("/capacity/versions", {})).body.data;
    expect(cell(next.rows, "DC", "144N")).toMatchObject({ leadDays: 20, tight: true });
    expect(cell(next.rows, "DC", "144N").sources).toMatchObject({ leadDays: "MANUAL" });
  });

  it("adds the ERP-synced backlog to unproduced orders and carries it into the next version", async () => {
    await seedOrders();
    const planner = await t.as("planner");
    const v1 = (await planner.post("/capacity/versions", {})).body.data;
    const row = cell(v1.rows, "DC", "144N");
    const cap = row.cumulativeCapacity as number;
    const url = `/capacity/versions/${v1.version.id}/rows/${row.id}`;
    const res = await planner.put(url, { version: row.version, erpBacklog: 2_000_000 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ otdUnproducedQty: 7800, erpBacklog: 2_000_000, unproducedQty: 2_007_800 });
    expect(res.body.data.spareCapacity).toBeCloseTo(cap - 2_007_800, 3);
    expect(res.body.data.spareRate).toBeCloseTo((cap - 2_007_800) / cap, 4);
    expect(res.body.data.sources).toMatchObject({ erpBacklog: "SYNC", unproducedQty: "SYNC" });
    expect((await planner.put(url, { version: row.version, erpBacklog: 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const again = (await planner.put(url, { version: res.body.data.version, erpBacklog: 2_500_000 })).body.data;
    expect(again.unproducedQty).toBe(2_507_800);
    expect(again.tight).toBe(true);
    const other = (await planner.post("/capacity/versions", {})).body.data;
    expect((await planner.put(`/capacity/versions/${other.version.id}/rows/${row.id}`, { version: again.version, erpBacklog: 1 })).status).toBe(404);
    const packing = (await planner.post(`/capacity/versions/${other.version.id}/rows`, { ledger: "PACKING", baseId: row.baseId, extra: {} })).body.data;
    expect((await planner.put(`/capacity/versions/${other.version.id}/rows/${packing.id}`, { version: packing.version, erpBacklog: 1 })).body.errcode).toBe("CAPACITY_ROW_LEDGER_INVALID");
    expect(cell(other.rows, "DC", "144N")).toMatchObject({ otdUnproducedQty: 7800, erpBacklog: 2_500_000, unproducedQty: 2_507_800, tight: true });
    expect(other.kpis.tightCount).toBe(1);
    const manager = await t.as("manager");
    expect((await manager.put(url, { version: again.version, erpBacklog: 1 })).status).toBe(403);
    const pub = (await planner.post(`/capacity/versions/${v1.version.id}/publish`, { version: v1.version.version })).body.data;
    expect((await planner.put(url, { version: again.version, erpBacklog: 1 })).body.errcode).toBe("CAPACITY_VERSION_PUBLISHED");
    expect(pub.version.status).toBe("PUBLISHED");
  });

  it("publishes a version as the group summary and freezes it", async () => {
    const planner = await t.as("planner");
    const cells = await machineCells();
    expect((await planner.get("/capacity/summary")).status).toBe(404);
    const d = (await planner.post("/capacity/versions", {})).body.data;
    const packing = await planner.post(`/capacity/versions/${d.version.id}/rows`, { ledger: "PACKING", baseId: d.rows[0].baseId, extra: { lines: 6, monthOrders: 182.4, scheduled: 160.2, loadRate: 88 } });
    expect(packing.status).toBe(201);
    expect(packing.body.data).toMatchObject({ ledger: "PACKING", baseCode: "DC", extra: { lines: 6, loadRate: 88 } });
    expect((await planner.post(`/capacity/versions/${d.version.id}/rows`, { ledger: "KNIT", baseId: d.rows[0].baseId })).body.errcode).toBe("CAPACITY_ROW_LEDGER_INVALID");
    const special = (await planner.post(`/capacity/versions/${d.version.id}/rows`, { ledger: "SPECIAL", baseId: d.rows[0].baseId, process: "刺绣", extra: { dailyCapacity: 8000 } })).body.data;
    expect((await planner.del(`/capacity/rows/${special.id}?version=${special.version}`)).status).toBe(200);

    const sales = await t.as("sales");
    expect((await sales.get("/capacity/versions")).status).toBe(403);
    const manager = await t.as("manager");
    expect((await manager.get(`/capacity/versions/${d.version.id}`)).status).toBe(200);
    expect((await manager.post(`/capacity/versions/${d.version.id}/publish`, { version: d.version.version })).status).toBe(403);
    expect((await manager.post("/capacity/versions", {})).status).toBe(403);
    expect((await manager.put("/capacity/machines", { baseId: d.rows[0].baseId, needleTypeId: d.rows[0].needleTypeId, machineCount: 1, version: 1 })).status).toBe(403);

    expect((await planner.post(`/capacity/versions/${d.version.id}/publish`, { version: d.version.version + 3 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const published = await planner.post(`/capacity/versions/${d.version.id}/publish`, { version: d.version.version });
    expect(published.status).toBe(200);
    expect(published.body.data.version).toMatchObject({ status: "PUBLISHED", publishedByName: "孙悦", rowCounts: { KNIT: cells.length, PACKING: 1, SPECIAL: 0 } });
    expect((await planner.post(`/capacity/versions/${d.version.id}/publish`, { version: published.body.data.version.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const knitRow = published.body.data.rows[0];
    expect((await planner.put(`/capacity/rows/${knitRow.id}`, { version: knitRow.version, leadDays: 9 })).body.errcode).toBe("CAPACITY_VERSION_PUBLISHED");
    expect((await planner.get("/capacity/summary")).body.data.version.label).toBe("V1");
    const tasks = (await planner.get("/capacity/tasks")).body.data;
    expect(tasks.find((x: { ledger: string }) => x.ledger === "KNIT").currentVersion).toBe("V1");

    const v2 = (await planner.post("/capacity/versions", {})).body.data;
    expect(v2.version.rowCounts).toEqual({ KNIT: cells.length, PACKING: 1, SPECIAL: 0 });
    expect((await planner.get("/capacity/summary")).body.data.version).toMatchObject({ label: "V2", status: "DRAFT" });
    expect((await planner.get("/capacity/summary?published=true")).body.data.version).toMatchObject({ label: "V1", status: "PUBLISHED" });
    expect(v2.rows.find((r: { ledger: string }) => r.ledger === "PACKING").extra.scheduled).toBe(160.2);
  });
});

describe("ledger update tasks", () => {
  beforeEach(async () => {
    t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
  });

  it("marks late tasks overdue, escalates, and completes them with the next due date", async () => {
    const service = t.app.get(LedgerTaskService);
    t.clock.set("2026-10-28T01:00:00Z");
    expect(await service.markOverdue()).toBe(2);
    expect(await service.markOverdue()).toBe(0);
    const planner = await t.as("planner");
    const tasks = (await planner.get("/capacity/tasks")).body.data as { id: string; ledger: string; status: string; note: string; overdueDays: number; version: number; nextDueAt: string }[];
    const knit = tasks.find((x) => x.ledger === "KNIT")!;
    expect(knit).toMatchObject({ status: "OVERDUE", overdueDays: 1, note: "应更新日 2026-10-27，逾期 1 天，已升级告警至集团计划部负责人" });
    expect(tasks.find((x) => x.ledger === "SPECIAL")!.note).toContain("逾期 9 天");
    expect(tasks.find((x) => x.ledger === "FORECAST")!.status).toBe("UPDATING");
    expect(tasks.find((x) => x.ledger === "PACKING")!.status).toBe("DONE");

    const plannerId = t.refs.users["13800000008"]!;
    const gmId = t.refs.users["13800000003"]!;
    const notes = await t.db.select().from(notifications).where(eq(notifications.type, "capacity.task.overdue"));
    expect(notes.filter((n) => n.userId === plannerId)).toHaveLength(2);
    expect(notes.filter((n) => n.userId === gmId)).toHaveLength(2);
    const todo = await t.db.select().from(todos).where(and(eq(todos.docId, knit.id), eq(todos.status, "OPEN")));
    expect(todo).toHaveLength(1);
    expect(todo[0]!.assigneeId).toBe(plannerId);

    expect((await planner.post(`/capacity/tasks/${knit.id}/complete`, { version: knit.version + 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const done = await planner.post(`/capacity/tasks/${knit.id}/complete`, { version: knit.version, currentVersion: "V27" });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: "DONE", nextDueAt: "2026-11-04", currentVersion: "V27", lastUpdatedAt: "2026-10-28T01:00:00.000Z", note: null, overdueDays: 0 });
    expect((await planner.post(`/capacity/tasks/${knit.id}/complete`, { version: done.body.data.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await t.db.select().from(todos).where(eq(todos.docId, knit.id)))[0]!.status).toBe("DONE");

    const production = await t.as("production");
    const special = tasks.find((x) => x.ledger === "SPECIAL")!;
    const util = tasks.find((x) => x.ledger === "UTILIZATION")!;
    expect((await production.post(`/capacity/tasks/${util.id}/start`, { version: util.version })).body.errcode).toBe("CAPACITY_TASK_NOT_OWNER");
    const started = (await production.post(`/capacity/tasks/${special.id}/start`, { version: special.version })).body.data;
    expect(started.status).toBe("UPDATING");
    const finished = (await production.post(`/capacity/tasks/${special.id}/complete`, { version: started.version })).body.data;
    expect(finished).toMatchObject({ status: "DONE", nextDueAt: "2026-11-28" });
    const sales = await t.as("sales");
    expect((await sales.get("/capacity/tasks")).status).toBe(403);

    const forecast = tasks.find((x) => x.ledger === "FORECAST")!;
    expect((await planner.post(`/capacity/tasks/${forecast.id}/start`, { version: forecast.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    t.clock.set("2026-11-05T01:00:00Z");
    expect(await service.markOverdue()).toBe(2);
    const rows = await t.db.select().from(ledgerTasks);
    expect(rows.find((r) => r.id === knit.id)!.status).toBe("OVERDUE");
    expect(rows.find((r) => r.ledger === "FORECAST")).toMatchObject({ status: "OVERDUE", note: "应更新日 2026-10-29，逾期 7 天，已升级告警至集团计划部负责人" });
  });

  it("rolls the next due date by frequency", () => {
    expect(nextDue("2026-10-28", "WEEKLY")).toBe("2026-11-04");
    expect(nextDue("2026-10-28", "MONTHLY")).toBe("2026-11-28");
    expect(nextDue("2026-01-31", "ROLLING_MONTHLY")).toBe("2026-02-28");
  });
});
