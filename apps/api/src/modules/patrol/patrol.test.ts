import { auditLogs, changeSnapshots, customerOrders, notifications, patrolHits, patrolRules, patrolRuns, purchaseOrders, todos } from "@otd/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scheduler } from "../../core/scheduler.js";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { PatrolRunner, patrolTodoKey } from "./patrol-runner.service.js";
import { DEFAULT_PATROL_SCHEDULE, dueAutoRun } from "./patrol.schedule.js";

const NOW = "2026-10-21T01:00:00Z";
let t: TestApp;

beforeEach(async () => {
  t = await createTestApp({ now: NOW });
});
afterEach(async () => {
  await t.close();
});

async function ruleByCode(code: string) {
  return (await t.db.select().from(patrolRules).where(eq(patrolRules.code, code)))[0]!;
}

async function hitOf(code: string, targetNo: string) {
  const rule = await ruleByCode(code);
  const rows = await t.db.select().from(patrolHits).where(and(eq(patrolHits.ruleId, rule.id), eq(patrolHits.targetNo, targetNo)));
  return rows.sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())[0];
}

async function runAs(persona: "gm" | "manager" | "admin" = "gm") {
  const res = await (await t.as(persona)).post("/patrol/run");
  expect(res.status).toBe(200);
  return res.body.data;
}

describe("patrol · run, dedupe and auto-close", () => {
  it("records a run with rule stats, hits, todos, notifications and audit", async () => {
    expect((await t.db.select().from(patrolRuns)).length).toBe(0);
    const run = await runAs();
    expect(run.docNo).toBe("PT-0001");
    expect(run).toMatchObject({ trigger: "MANUAL", status: "DONE", ruleCount: 18, alreadyRunning: false });
    expect(run.durationMs).toBeGreaterThanOrEqual(1);
    expect(run.hitCount).toBe(run.redCount + run.yellowCount);
    expect(run.hitCount).toBeGreaterThan(0);
    expect([...run.scannedModules].sort()).toEqual(["M02", "M03", "M04", "M06", "M07", "M08", "M09", "M10", "M11", "M13", "M15"]);
    const statTotal = Object.values(run.ruleStats as Record<string, { hits: number }>).reduce((s, x) => s + x.hits, 0);
    expect(statTotal).toBe(run.hitCount);
    for (const m of run.greenModules) expect(run.scannedModules).toContain(m);

    const purchase = await hitOf("IR-004", "PUR-2610-002");
    expect(purchase).toMatchObject({ light: "RED", severity: "HIGH", overdueDays: 3, status: "OPEN", module: "M13", targetType: "purchase", lastRunId: run.id, firstRunId: run.id, todoOwned: true });
    expect(purchase!.message.zh).toBe("承诺交期 2026-10-18 已过 3 天");
    expect(purchase!.assigneeId).toBe((await t.as("buyer")).userId);
    const todo = (await t.db.select().from(todos).where(eq(todos.fingerprint, patrolTodoKey(purchase!.fingerprint))))[0]!;
    expect(todo).toMatchObject({ source: "PATROL", status: "OPEN", docType: "purchase", docId: purchase!.targetId, assigneeId: purchase!.assigneeId, link: `/purchases/${purchase!.targetId}` });
    expect(purchase!.todoId).toBe(todo.id);

    const round = await hitOf("IR-001", "SP-2610-005");
    expect(round).toMatchObject({ light: "RED", targetName: "#12610 颜色样 第 1 轮", docType: "sample" });
    expect(round!.message.zh).toMatch(/^轮次停留在『已下达』已 \d+ 天（阈值 7 天）$/);

    const ledger = await hitOf("IR-017", "V26");
    expect(ledger).toMatchObject({ light: "RED", overdueDays: 2, customerId: null, assigneeId: (await t.as("planner")).userId });

    const buyerNotes = await t.db.select().from(notifications).where(and(eq(notifications.userId, (await t.as("buyer")).userId), eq(notifications.type, "patrol.summary")));
    expect(buyerNotes.map((n) => n.title)).toEqual(["巡检命中 1 条"]);
    const salesNotes = await t.db.select().from(notifications).where(and(eq(notifications.userId, (await t.as("sales")).userId), eq(notifications.type, "patrol.summary")));
    expect(salesNotes).toHaveLength(1);
    expect(salesNotes[0]!.link).toBe("/patrol");
    expect(buyerNotes[0]!.link).toBe("/todo");

    const audit = await t.db.select().from(auditLogs).where(eq(auditLogs.action, "patrol.run.manual"));
    expect(audit.map((a) => a.docNo)).toEqual(["PT-0001"]);

    const gm = await t.as("gm");
    const dash = (await gm.get("/patrol/dashboard?pageSize=200")).body.data;
    expect(dash.legend).toMatchObject({ red: run.redCount, yellow: run.yellowCount, greenModules: run.greenModules.length, scannedModules: 11 });
    expect(dash.kpis).toMatchObject({ activeRules: 18, totalRules: 18, coveredModules: 11, hitCount: run.hitCount, lastRunAt: "2026-10-21T01:00:00.000Z" });
    expect(dash.lastRun.docNo).toBe("PT-0001");
    expect(dash.hits.total).toBe(run.hitCount);
    const lights = dash.hits.items.map((h: { light: string }) => h.light);
    expect(lights.indexOf("YELLOW")).toBeGreaterThan(lights.lastIndexOf("RED"));
    const filtered = (await gm.get("/patrol/dashboard?module=M13&light=RED")).body.data.hits;
    expect(filtered.items.map((h: { targetNo: string }) => h.targetNo)).toEqual(["PUR-2610-002"]);
    expect(filtered.items[0]).toMatchObject({ ruleCode: "IR-004", moduleLabel: { zh: "采购管理" }, assigneeName: "周涛", assigneeRoleLabel: { zh: "采购员" }, customerName: "极线" });
  });

  it("dedupes repeated hits and auto-closes resolved ones together with the patrol todo", async () => {
    const first = await runAs();
    const before = await hitOf("IR-004", "PUR-2610-002");
    const second = await runAs();
    expect(second.docNo).toBe("PT-0002");
    expect(second.hitCount).toBe(first.hitCount);
    const again = await hitOf("IR-004", "PUR-2610-002");
    expect(again!.id).toBe(before!.id);
    expect(again!.lastRunId).toBe(second.id);
    expect(again!.firstRunId).toBe(first.id);
    expect((await t.db.select().from(patrolHits).where(eq(patrolHits.fingerprint, before!.fingerprint))).length).toBe(1);

    await t.db.update(purchaseOrders).set({ status: "RECEIVED", receivedAt: "2026-10-20" }).where(eq(purchaseOrders.id, before!.targetId));
    const third = await runAs();
    expect(third.ruleStats["IR-004"].hits).toBe(0);
    expect(third.ruleStats["IR-012"].hits).toBe(first.ruleStats["IR-012"].hits - 1);
    expect(third.hitCount).toBe(first.hitCount - 2);
    expect(await hitOf("IR-012", "INSP-2610-006")).toMatchObject({ status: "CLOSED", closeReason: "RESOLVED" });
    const closed = await hitOf("IR-004", "PUR-2610-002");
    expect(closed).toMatchObject({ status: "CLOSED", closeReason: "RESOLVED" });
    expect((await t.db.select().from(todos).where(eq(todos.fingerprint, patrolTodoKey(before!.fingerprint))))[0]!.status).toBe("DONE");
    expect(third.greenModules).toContain("M13");
  });

  it("links to an open module todo on the same document instead of creating one", async () => {
    await runAs();
    const order = (await t.db.select().from(customerOrders).where(eq(customerOrders.poNo, "PO0010459")))[0]!;
    const hit = await hitOf("IR-009", "PO0010459");
    expect(hit).toMatchObject({ docType: "order", docId: order.id, orderId: order.id, todoOwned: false });
    const moduleTodo = (await t.db.select().from(todos).where(eq(todos.fingerprint, `order:review:${order.id}`)))[0]!;
    expect(hit!.todoId).toBe(moduleTodo.id);
    expect(await t.db.select().from(todos).where(eq(todos.fingerprint, patrolTodoKey(hit!.fingerprint)))).toEqual([]);
    expect((await t.db.select().from(todos).where(and(eq(todos.docId, order.id), eq(todos.source, "PATROL")))).length).toBe(0);
  });

  it("allows only one run at a time and returns the running task number", async () => {
    const runner = t.app.get(PatrolRunner);
    const [x, y] = await Promise.all([runner.run("MANUAL", null), runner.run("MANUAL", null)]);
    expect([x.alreadyRunning, y.alreadyRunning].sort()).toEqual([false, true]);
    expect(x.run.docNo).toBe(y.run.docNo);

    const target = runner as unknown as { scan: (...args: unknown[]) => Promise<unknown> };
    const original = target.scan.bind(runner);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(target, "scan").mockImplementation(async (...args: unknown[]) => {
      await gate;
      return original(...args);
    });
    const gm = await t.as("gm");
    const manager = await t.as("manager");
    const first = gm.post("/patrol/run");
    await vi.waitFor(() => expect(runner.isRunning()).toBe(true));
    const second = await manager.post("/patrol/run");
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ alreadyRunning: true, status: "RUNNING", docNo: "PT-0002" });
    expect((await gm.get("/patrol/dashboard")).body.data.running.docNo).toBe("PT-0002");
    release();
    const done = await first;
    expect(done.body.data).toMatchObject({ alreadyRunning: false, status: "DONE", docNo: "PT-0002" });
    spy.mockRestore();
    expect((await t.db.select().from(patrolRuns)).length).toBe(2);
    expect(runner.isRunning()).toBe(false);
  });
});

describe("patrol · rules", () => {
  it("applies rule edits on the next run and keeps a snapshot and audit trail", async () => {
    const gm = await t.as("gm");
    await runAs();
    const list = (await gm.get("/patrol/rules")).body.data;
    expect(list).toHaveLength(18);
    const rule = list.find((r: { code: string }) => r.code === "IR-004");
    expect(rule).toMatchObject({ ruleType: "PURCHASE_OVERDUE", kind: "DEADLINE", params: { thresholdDays: 0 }, assigneeRoleLabel: { zh: "采购员" }, openHits: 1, version: 1 });

    const bad = await gm.put(`/patrol/rules/${rule.id}`, { params: { windowDays: 3 }, version: 1 });
    expect(bad.status).toBe(422);
    expect(bad.body.errcode).toBe("PATROL_PARAM_INVALID");

    const updated = await gm.put(`/patrol/rules/${rule.id}`, { params: { thresholdDays: 5 }, reason: "供应商统一放宽 5 天", version: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ params: { thresholdDays: 5 }, version: 2 });
    expect(updated.body.data.condition.zh).toContain("5 天");
    const stale = await gm.put(`/patrol/rules/${rule.id}`, { severity: "LOW", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const snaps = await t.db.select().from(changeSnapshots).where(and(eq(changeSnapshots.objectType, "patrolRule"), eq(changeSnapshots.objectId, rule.id)));
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ objectVersion: 1, reason: "供应商统一放宽 5 天", snapshot: { params: { thresholdDays: 0 }, severity: "HIGH", enabled: true } });
    const audit = (await t.db.select().from(auditLogs).where(eq(auditLogs.action, "patrol.rule.update")))[0]!;
    expect(audit.diff).toMatchObject({ params: { from: { thresholdDays: 0 }, to: { thresholdDays: 5 } } });

    await runAs();
    const hit = await hitOf("IR-004", "PUR-2610-002");
    expect(hit).toMatchObject({ light: "YELLOW", overdueDays: -2, status: "OPEN" });
    expect(hit!.message.zh).toBe("承诺交期 2026-10-18，剩余 2 天仍未到齐");
  });

  it("respects the enabled switch and the customer scope of a rule", async () => {
    const gm = await t.as("gm");
    await runAs();
    const ledgerRule = await ruleByCode("IR-017");
    expect((await gm.put(`/patrol/rules/${ledgerRule.id}`, { enabled: false, version: ledgerRule.version })).status).toBe(200);
    const roundRule = await ruleByCode("IR-001");
    expect((await gm.put(`/patrol/rules/${roundRule.id}`, { customerIds: [t.refs.customers.CKD], version: roundRule.version })).status).toBe(200);
    const run = await runAs();
    expect(run.ruleCount).toBe(17);
    expect(run.scannedModules).not.toContain("M08");
    expect(await hitOf("IR-017", "V26")).toMatchObject({ status: "CLOSED", closeReason: "RESOLVED" });
    expect(await hitOf("IR-001", "SP-2610-005")).toMatchObject({ status: "CLOSED" });
    expect(await hitOf("IR-001", "SP-2610-006")).toMatchObject({ status: "OPEN", customerId: t.refs.customers.CKD });
  });
});

describe("patrol · data scope and handling", () => {
  it("filters hits by data scope and hides others with 404", async () => {
    await runAs();
    const sales = await t.as("sales");
    const visible = (await sales.get("/patrol/dashboard?pageSize=200")).body.data;
    const allowed = ["NSR", "MPT", "BBY", "MRN", "CKD", "APX"].map((c) => t.refs.customers[c]!);
    const expected = await t.db
      .select({ id: patrolHits.id })
      .from(patrolHits)
      .where(and(inArray(patrolHits.status, ["OPEN", "HANDLING"]), or(eq(patrolHits.assigneeId, sales.userId), eq(patrolHits.ownerId, sales.userId)), or(isNull(patrolHits.customerId), inArray(patrolHits.customerId, allowed))));
    expect(visible.hits.items.map((h: { id: string }) => h.id).sort()).toEqual(expected.map((e) => e.id).sort());
    expect(visible.hits.total).toBeGreaterThan(0);
    expect(visible.legend.red + visible.legend.yellow).toBe(expected.length);

    const foreign = await hitOf("IR-001", "SP-2610-006");
    expect((await sales.get(`/patrol/hits/${foreign!.id}`)).status).toBe(404);
    expect((await sales.post(`/patrol/hits/${foreign!.id}/handle`, { action: "START", version: foreign!.version })).status).toBe(404);
    const manager = await t.as("manager");
    expect((await manager.get(`/patrol/hits/${foreign!.id}`)).status).toBe(404);
    const own = await hitOf("IR-009", "PO0010459");
    expect((await sales.get(`/patrol/hits/${own!.id}`)).body.data).toMatchObject({ id: own!.id, light: "YELLOW", assigneeName: "王芳" });
    expect((await manager.get(`/patrol/hits/${own!.id}`)).status).toBe(200);

    const docHits = (await sales.get(`/patrol/doc-hits?docType=order&docId=${own!.docId}`)).body.data;
    expect(docHits.map((h: { id: string }) => h.id)).toEqual([own!.id]);
  });

  it("starts and closes a hit with a note, rejects illegal moves and stale versions, then silences it", async () => {
    await runAs();
    const sales = await t.as("sales");
    const hit = await hitOf("IR-009", "PO0010459");
    const started = await sales.post(`/patrol/hits/${hit!.id}/handle`, { action: "START", version: hit!.version });
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ status: "HANDLING", handledByName: "王芳" });
    const stale = await sales.post(`/patrol/hits/${hit!.id}/handle`, { action: "CLOSE", note: "已联系客户", version: hit!.version });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const noNote = await sales.post(`/patrol/hits/${hit!.id}/handle`, { action: "CLOSE", version: started.body.data.version });
    expect(noNote.status).toBe(422);
    expect(noNote.body.errcode).toBe("PATROL_NOTE_REQUIRED");
    const closed = await sales.post(`/patrol/hits/${hit!.id}/handle`, { action: "CLOSE", note: "客户已邮件确认，今日复核", version: started.body.data.version });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: "CLOSED", closeReason: "MANUAL", handleNote: "客户已邮件确认，今日复核" });
    const again = await sales.post(`/patrol/hits/${hit!.id}/handle`, { action: "START", version: closed.body.data.version });
    expect(again.status).toBe(409);
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.objectId, hit!.id))).map((a) => a.action).sort()).toEqual(["patrol.hit.close", "patrol.hit.start"]);

    const silenced = await runAs();
    expect((await hitOf("IR-009", "PO0010459"))!.status).toBe("CLOSED");
    expect((await t.db.select().from(patrolHits).where(eq(patrolHits.fingerprint, hit!.fingerprint))).length).toBe(1);
    expect(silenced.ruleStats["IR-009"].hits).toBe(1);

    t.clock.advanceDays(4);
    await runAs("admin");
    const reopened = await hitOf("IR-009", "PO0010459");
    expect(reopened).toMatchObject({ id: hit!.id, status: "OPEN", closeReason: null, light: "RED" });
  });

  it("escalates red hits left untouched for 3 days to the department leader once", async () => {
    await runAs();
    const manager = await t.as("manager");
    const escalations = () => t.db.select().from(notifications).where(and(eq(notifications.userId, manager.userId), eq(notifications.type, "patrol.escalation")));
    expect(await escalations()).toHaveLength(0);
    t.clock.advanceDays(4);
    await runAs("admin");
    const first = await escalations();
    expect(first.length).toBeGreaterThan(0);
    expect(first.some((n) => n.title.includes("DH-2610-002"))).toBe(true);
    expect((await hitOf("IR-018", "DH-2610-002"))!.escalatedAt).not.toBeNull();
    await runAs("admin");
    expect((await escalations()).length).toBe(first.length);
    const gmNotes = await t.db.select().from(notifications).where(and(eq(notifications.userId, (await t.as("gm")).userId), eq(notifications.type, "patrol.escalation")));
    expect(gmNotes.some((n) => n.title.includes("PUR-2610-002"))).toBe(true);
  });

  it("enforces permissions", async () => {
    const sales = await t.as("sales");
    expect((await sales.get("/patrol/dashboard")).status).toBe(200);
    expect((await sales.post("/patrol/run")).status).toBe(403);
    expect((await sales.get("/patrol/rules")).status).toBe(403);
    expect((await sales.get("/patrol/runs")).status).toBe(403);
    const rule = await ruleByCode("IR-001");
    expect((await sales.put(`/patrol/rules/${rule.id}`, { enabled: false, version: 1 })).status).toBe(403);
    expect((await (await t.as("quality")).get("/patrol/dashboard")).status).toBe(403);
    const manager = await t.as("manager");
    expect((await manager.get("/patrol/rules")).status).toBe(200);
    expect((await manager.get("/patrol/runs")).status).toBe(200);
  });
});

describe("patrol · schedule", () => {
  it("registers the auto jobs and runs AUTO patrols only when due", async () => {
    const scheduler = t.app.get(Scheduler);
    expect(scheduler.list()).toEqual(expect.arrayContaining(["patrol.daily", "patrol.interval"]));
    const runner = t.app.get(PatrolRunner);
    const auto = await runner.autoTick("FULL");
    expect(auto).toMatchObject({ trigger: "AUTO", status: "DONE" });
    expect(await runner.autoTick("FULL")).toBeNull();
    expect(await runner.autoTick("INTERVAL")).toBeNull();
    const gm = await t.as("gm");
    const runs = (await gm.get("/patrol/runs")).body.data;
    expect(runs.items.map((r: { trigger: string }) => r.trigger)).toEqual(["AUTO"]);
    expect((await gm.get(`/patrol/runs/${auto!.id}`)).body.data.docNo).toBe(auto!.docNo);
  });

  it.each([
    ["00:55 首次", [0, 55], null, "FULL"],
    ["00:55 已跑过当日全量", [0, 55], [0, 51], null],
    ["00:40 全量时点前", [0, 40], [-5, 0], null],
    ["10:00 距上次不足 2 小时", [10, 0], [8, 30], null],
    ["10:31 满 2 小时", [10, 31], [8, 30], "INTERVAL"],
    ["21:00 下班后", [21, 0], [18, 0], null],
    ["09:00 当日尚未全量（补跑）", [9, 0], [-5, 0], "FULL"],
  ] as const)("dueAutoRun · %s", (_label, at, last, expected) => {
    const local = (h: number, m: number) => (h < 0 ? new Date(2026, 9, 20, 19, 0) : new Date(2026, 9, 21, h, m));
    expect(dueAutoRun(DEFAULT_PATROL_SCHEDULE, local(at[0], at[1]), last ? local(last[0], last[1]) : null)).toBe(expected);
  });
});
