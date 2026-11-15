import { customerOrders, notifications, rolePermissions, roles, styles, syncEndpoints, syncRecords, syncRuns, syncTasks } from "@otd/db";
import { and, eq, ne } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "../../core/access/access.service.js";
import { EventBus } from "../../core/events.js";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";
import { SyncRunner } from "./runner.service.js";

const NOW = "2026-10-21T01:00:00Z";
let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: NOW });
});
afterEach(async () => {
  await t.close();
});

const MIN = 60_000;

async function activeOrders() {
  return t.db.select().from(customerOrders).where(ne(customerOrders.status, "CANCELLED"));
}

async function mockEndpoint(caller: Caller, code: string, mock: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const res = await caller.post("/sync/endpoints", { code, name: `${code} 模拟`, kind: "ERP", protocol: "MOCK", options: { mock }, ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function pushTask(caller: Caller, endpointId: string, extra: Record<string, unknown> = {}) {
  const res = await caller.post("/sync/tasks", { name: "订单交期推送测试", endpointId, object: "ORDER_DUE", direction: "PUSH", mode: "FULL", trigger: "MANUAL", ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function seededTask(name: string) {
  return (await t.db.select().from(syncTasks).where(eq(syncTasks.name, name)))[0]!;
}

describe("sync endpoints", () => {
  it("encrypts credentials, returns masks and gates credential changes", async () => {
    const admin = await t.as("admin");
    const ep = await mockEndpoint(admin, "ERP-T1", {}, { credential: { username: "otd-sync", password: "S3cret!" } });
    expect(ep.credential).toMatchObject({ configured: true, masked: { username: "ot****nc", password: "******" } });
    expect(ep.credential.updatedAt).toBe("2026-10-21T01:00:00.000Z");
    const raw = (await t.db.select().from(syncEndpoints).where(eq(syncEndpoints.id, ep.id)))[0]!;
    expect(JSON.stringify(raw.credential)).not.toContain("S3cret!");
    expect(JSON.stringify(await admin.get(`/sync/endpoints/${ep.id}`))).not.toContain("S3cret!");

    const gm = await t.as("gm");
    const denied = await gm.put(`/sync/endpoints/${ep.id}/credential`, { credential: { token: "x" }, version: ep.version });
    expect(denied.status).toBe(403);
    expect(denied.body.errcode).toBe("IAM_FORBIDDEN");
    const sneaky = await gm.post("/sync/endpoints", { code: "ERP-T2", name: "x", kind: "ERP", protocol: "MOCK", credential: { token: "x" } });
    expect(sneaky.status).toBe(403);

    const edited = await gm.put(`/sync/endpoints/${ep.id}`, { name: "ERP 改名", kind: "ERP", protocol: "MOCK", version: ep.version });
    expect(edited.status).toBe(200);
    expect(edited.body.data.credential.configured).toBe(true);
    expect((await gm.put(`/sync/endpoints/${ep.id}`, { name: "x", kind: "ERP", protocol: "MOCK", version: ep.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const rotated = await admin.put(`/sync/endpoints/${ep.id}/credential`, { credential: { token: "new-token-123" }, version: edited.body.data.version });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.credential.masked).toEqual({ token: "******" });
    const logs = await admin.get(`/system/audit-logs?objectType=syncEndpoint`);
    expect(JSON.stringify(logs.body.data)).not.toContain("new-token-123");
  });

  it("validates endpoint shape and tests connectivity", async () => {
    const admin = await t.as("admin");
    expect((await admin.post("/sync/endpoints", { code: "C-1", name: "x", kind: "CUSTOMER", protocol: "MOCK" })).body.errcode).toBe("SYNC_CUSTOMER_REQUIRED");
    expect((await admin.post("/sync/endpoints", { code: "R-1", name: "x", kind: "ERP", protocol: "REST" })).body.errcode).toBe("SYNC_BASE_URL_REQUIRED");
    const mock = await mockEndpoint(admin, "ERP-T3");
    const ok = await admin.post(`/sync/endpoints/${mock.id}/test`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.ok).toBe(true);
    const rest = (await admin.post("/sync/endpoints", { code: "R-2", name: "不可达", kind: "ERP", protocol: "REST", baseUrl: "http://127.0.0.1:9/api", timeoutMs: 2000 })).body.data;
    const bad = await admin.post(`/sync/endpoints/${rest.id}/test`);
    expect(bad.body.data.ok).toBe(false);
    expect((await admin.get(`/sync/endpoints/${rest.id}`)).body.data.lastTest.ok).toBe(false);
    const sftp = (await admin.post("/sync/endpoints", { code: "S-1", name: "SFTP", kind: "ERP", protocol: "SFTP", baseUrl: "sftp://edi.example" })).body.data;
    expect((await admin.post(`/sync/endpoints/${sftp.id}/test`)).body.data.message).toContain("暂不支持");
  });

  it("forbids users without sync permissions", async () => {
    const sales = await t.as("sales");
    for (const path of ["/sync/endpoints", "/sync/mappings", "/sync/tasks", "/sync/retry-queue"]) {
      const res = await sales.get(path);
      expect(res.status).toBe(403);
    }
    const task = await seededTask("NSR 订单交期同步（OTD 平台 → 客户系统）");
    expect((await sales.post(`/sync/tasks/${task.id}/run`, { version: task.version })).status).toBe(403);
  });

  it("limits tasks to the user's customer scope", async () => {
    const salesRole = (await t.db.select().from(roles).where(eq(roles.code, "R001")))[0]!;
    await t.db.insert(rolePermissions).values([{ roleId: salesRole.id, permission: "sync.task.view" }]);
    t.app.get(AccessService).invalidate();
    const admin = await t.as("admin");
    const ssh = (await admin.post("/sync/endpoints", { code: "SSH-1", name: "海盐系统", kind: "CUSTOMER", customerId: t.refs.customers.SSH, protocol: "MOCK" })).body.data;
    const hidden = await pushTask(admin, ssh.id);
    expect(hidden.customerId).toBe(t.refs.customers.SSH);
    const sales = await t.as("sales");
    const list = await sales.get("/sync/tasks?pageSize=50");
    expect(list.status).toBe(200);
    const ids = list.body.data.items.map((x: { id: string }) => x.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).toContain((await seededTask("NSR 订单交期同步（OTD 平台 → 客户系统）")).id);
    expect((await sales.get(`/sync/tasks/${hidden.id}`)).status).toBe(404);
  });
});

describe("sync mappings", () => {
  it("previews a mapping with classified errors", async () => {
    const admin = await t.as("admin");
    const res = await admin.post("/sync/mappings/preview", {
      fields: [
        { source: "poNo", target: "PONumber", required: true },
        { source: "size", target: "SizeCode", transform: "codeMap", args: { map: "size" } },
        { source: "due", target: "ShipDate", transform: "dateFormat", args: { from: "DD/MM/YYYY" } },
      ],
      codeMaps: { size: { S: "01" } },
      sample: { poNo: "PO1", size: "XL2", due: "2026-11-21" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.output).toEqual({ PONumber: "PO1" });
    expect(res.body.data.errors.map((e: { type: string }) => e.type)).toEqual(["MAPPING_MISS", "FORMAT_MISMATCH"]);

    const nsrMap = (await admin.get("/sync/mappings?object=ORDER_DUE")).body.data.items.find((m: { name: string }) => m.name === "NSR 订单交期映射");
    const preview = await admin.post("/sync/mappings/preview", { mappingId: nsrMap.id });
    expect(preview.body.data.ok).toBe(true);
    expect(preview.body.data.output.PONumber).toBe("PO0010459");
    expect(preview.body.data.output.SupplierCode).toBe("OTD-0001");
  });

  it("rejects tasks whose mapping does not match", async () => {
    const admin = await t.as("admin");
    const ep = await mockEndpoint(admin, "ERP-M1");
    const mapping = (await admin.post("/sync/mappings", { name: "款式", endpointId: ep.id, object: "STYLE", direction: "PUSH", fields: [] })).body.data;
    const res = await admin.post("/sync/tasks", { name: "x", endpointId: ep.id, mappingId: mapping.id, object: "ORDER_DUE", direction: "PUSH", mode: "FULL", trigger: "MANUAL" });
    expect(res.body.errcode).toBe("SYNC_MAPPING_MISMATCH");
    expect((await admin.post("/sync/tasks", { name: "x", endpointId: ep.id, object: "ORDER_DUE", direction: "PUSH", mode: "FULL", trigger: "SCHEDULED" })).body.errcode).toBe("SYNC_INTERVAL_REQUIRED");
  });
});

describe("sync runs", () => {
  it("runs in batches, records failures and reports PARTIAL", async () => {
    const admin = await t.as("admin");
    const orders = await activeOrders();
    expect(orders.length).toBeGreaterThanOrEqual(4);
    const [timeoutPo, formatPo] = [orders[0]!.poNo, orders[1]!.poNo];
    const ep = await mockEndpoint(admin, "ERP-R1", { failures: [{ keys: [timeoutPo], type: "TIMEOUT" }, { keys: [formatPo], type: "FORMAT_MISMATCH", field: "ShipDate" }] });
    const task = await pushTask(admin, ep.id, { batchSize: 3 });
    expect(task.docNo).toMatch(/^SYN-2026-\d{3}$/);

    const ran = await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version });
    expect(ran.status).toBe(200);
    const detail = ran.body.data;
    const run = detail.latestRun;
    expect(detail.lastStatus).toBe("PARTIAL");
    expect(run).toMatchObject({ trigger: "MANUAL", status: "PARTIAL", total: orders.length, success: orders.length - 2, failed: 2, skipped: 0, operatorName: "管理员" });
    expect(run.batches.map((b: { batchNo: string }) => b.batchNo)).toEqual(Array.from({ length: Math.ceil(orders.length / 3) }, (_, i) => `B0${i + 1}`));
    for (const k of ["total", "success", "failed", "skipped"] as const) expect(run.batches.reduce((s: number, b: Record<string, number>) => s + b[k]!, 0)).toBe(run[k]);
    expect(run.steps.map((s: { key: string; ok: boolean }) => [s.key, s.ok])).toEqual([
      ["START", true],
      ["RESULT", true],
      ["LOG", true],
    ]);
    const failures = Object.fromEntries(detail.failures.map((f: { recordKey: string }) => [f.recordKey, f]));
    expect(failures[timeoutPo]).toMatchObject({ errorType: "TIMEOUT", status: "RETRYING", queueState: "PENDING", attempts: 1, nextRetryAt: "2026-10-21T01:01:00.000Z", suggestion: "链路重试；连续超时需联系对方系统运维" });
    expect(failures[formatPo]).toMatchObject({ errorType: "FORMAT_MISMATCH", status: "FAILED", queueState: "MANUAL", field: "ShipDate", nextRetryAt: null });
    expect(detail.version).toBe(task.version);

    const logs = (await admin.get(`/sync/tasks/${task.id}/logs`)).body.data.items;
    expect(logs.map((l: { action: string }) => l.action)).toEqual(["sync.run.finish", "sync.task.run", "sync.task.create"]);
    expect(logs[0].summary).toBe(`执行完成：成功 ${orders.length - 2} 条，失败 2 条，跳过 0 条`);

    const again = (await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version })).body.data;
    expect(again.latestRun).toMatchObject({ total: orders.length, skipped: orders.length - 2, failed: 2, status: "PARTIAL" });
    expect(again.failures).toHaveLength(2);
    expect(again.failures.every((f: { runId: string }) => f.runId === again.latestRun.id)).toBe(true);
    const previous = (await admin.get(`/sync/runs/${run.id}`)).body.data;
    expect(previous).toMatchObject({ failed: 0, skipped: 2, success: orders.length - 2, status: "SUCCESS" });
  });

  it("maps records and keeps mapping misses out of auto retry", async () => {
    const admin = await t.as("admin");
    const ep = await mockEndpoint(admin, "ERP-R2");
    const mapping = (
      await admin.post("/sync/mappings", {
        name: "工厂码表",
        endpointId: ep.id,
        object: "ORDER_DUE",
        direction: "PUSH",
        fields: [
          { source: "poNo", target: "PO", required: true },
          { source: "factoryCode", target: "Site", transform: "codeMap", args: { map: "plant" } },
        ],
        codeMaps: { plant: { NH5: "S5" } },
      })
    ).body.data;
    const task = await pushTask(admin, ep.id, { mappingId: mapping.id });
    const detail = (await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version })).body.data;
    expect(detail.failures.length).toBeGreaterThan(0);
    for (const f of detail.failures) expect(f).toMatchObject({ errorType: "MAPPING_MISS", status: "FAILED", queueState: "MANUAL", field: "Site", nextRetryAt: null });
    expect(detail.latestRun.success).toBeGreaterThan(0);
  });

  it("pushes only records changed after the watermark in incremental mode", async () => {
    const admin = await t.as("admin");
    const ep = await mockEndpoint(admin, "ERP-W1");
    const task = await pushTask(admin, ep.id, { mode: "INCREMENTAL" });
    const first = (await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version })).body.data;
    const orders = await activeOrders();
    expect(first.latestRun.total).toBe(orders.length);
    expect(first.watermark).toBe(orders.map((o) => o.updatedAt.toISOString()).sort().at(-1));

    const idle = (await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version })).body.data;
    expect(idle.latestRun.total).toBe(0);
    expect(idle.latestRun.status).toBe("SUCCESS");

    await t.db.update(customerOrders).set({ totalPairs: 99999, updatedAt: new Date(Date.parse(first.watermark) + 5000) }).where(eq(customerOrders.id, orders[0]!.id));
    const changed = (await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version })).body.data;
    expect(changed.latestRun).toMatchObject({ total: 1, success: 1 });
    expect((await admin.get(`/sync/tasks/${task.id}/runs`)).body.data.total).toBe(3);
  });

  it("pulls from the ERP mock and stages mapped records", async () => {
    const admin = await t.as("admin");
    const task = await seededTask("环思 ERP 款式主数据同步（环思 ERP → OTD 平台）");
    const res = await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version });
    expect(res.status).toBe(200);
    expect(res.body.data.latestRun.status).toBe("SUCCESS");
    const updated = await admin.put(`/sync/tasks/${task.id}`, { name: task.name, endpointId: task.endpointId, mappingId: task.mappingId, object: "STYLE", direction: "PULL", mode: "FULL", trigger: "SCHEDULED", intervalMinutes: 60, version: task.version });
    expect(updated.status).toBe(200);
    const full = (await admin.post(`/sync/tasks/${task.id}/run`, { version: updated.body.data.version })).body.data;
    expect(full.latestRun).toMatchObject({ total: 3, success: 3, failed: 0 });
  });

  it("retries with exponential backoff and abandons after five retries", async () => {
    const admin = await t.as("admin");
    const po = (await activeOrders())[0]!.poNo;
    const ep = await mockEndpoint(admin, "ERP-B1", { failures: [{ keys: [po], type: "TIMEOUT" }] });
    const task = await pushTask(admin, ep.id);
    await admin.post(`/sync/tasks/${task.id}/run`, { version: task.version });
    const runner = t.app.get(SyncRunner);
    const record = async () => (await t.db.select().from(syncRecords).where(and(eq(syncRecords.taskId, task.id), eq(syncRecords.recordKey, po))))[0]!;

    let current = await record();
    expect(current.attempts).toBe(1);
    expect(current.nextRetryAt!.getTime() - Date.parse(NOW)).toBe(1 * MIN);
    for (const [attempts, delay] of [
      [2, 2],
      [3, 4],
      [4, 8],
      [5, 16],
    ] as const) {
      const at = current.nextRetryAt!;
      t.clock.set(new Date(at.getTime() - 1000));
      await runner.processDueRetries();
      expect((await record()).attempts).toBe(attempts - 1);
      t.clock.set(at);
      await runner.processDueRetries();
      current = await record();
      expect(current.status).toBe("RETRYING");
      expect(current.attempts).toBe(attempts);
      expect(current.nextRetryAt!.getTime() - at.getTime()).toBe(delay * MIN);
    }
    t.clock.set(current.nextRetryAt!);
    await runner.processDueRetries();
    current = await record();
    expect(current).toMatchObject({ status: "FAILED", attempts: 6, nextRetryAt: null });

    t.clock.set(NOW);
    const queue = (await admin.get(`/sync/retry-queue?taskId=${task.id}&state=ABANDONED`)).body.data;
    expect(queue.items.map((r: { recordKey: string; queueState: string }) => [r.recordKey, r.queueState])).toEqual([[po, "ABANDONED"]]);
    const owner = (await t.db.select().from(notifications).where(eq(notifications.userId, admin.userId))).find((n) => n.type === "SYNC_RETRY_ABANDONED");
    expect(owner?.title).toContain(task.docNo);
    const logs = (await admin.get(`/sync/tasks/${task.id}/logs`)).body.data.items.map((l: { action: string }) => l.action);
    expect(logs).toContain("sync.record.abandon");
  });

  it("manual retry clears failures and recomputes the run", async () => {
    const admin = await t.as("admin");
    const task = await seededTask("NSR 订单交期同步（OTD 平台 → 客户系统）");
    const before = (await admin.get(`/sync/tasks/${task.id}`)).body.data;
    expect(before).toMatchObject({ lastStatus: "PARTIAL", frequency: "每半天一次", mode: "INCREMENTAL", trigger: "SCHEDULED", direction: "PUSH", sourceSystem: "OTD 平台", openFailures: 2 });
    expect(before.latestRun.batches.map((b: { batchNo: string; total: number; failed: number }) => [b.batchNo, b.total, b.failed])).toEqual([
      ["B01", 373, 0],
      ["B02", 373, 0],
      ["B03", 373, 0],
      ["B04", 373, 2],
    ]);
    expect(before.latestRun).toMatchObject({ status: "PARTIAL", total: 1492, success: 1490, failed: 2 });
    expect(before.failures.map((f: { recordKey: string; errorType: string }) => [f.recordKey, f.errorType])).toEqual([
      ["订单交期-1101", "TIMEOUT"],
      ["订单交期-1102", "FORMAT_MISMATCH"],
    ]);

    const stale = await admin.post(`/sync/tasks/${task.id}/retry-failed`, { version: task.version - 1 });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const res = await admin.post(`/sync/tasks/${task.id}/retry-failed`, { version: task.version });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toEqual({ total: 2, success: 2, failed: 0, pending: 0, abandoned: 0 });
    const after = res.body.data.task;
    expect(after).toMatchObject({ lastStatus: "SUCCESS", openFailures: 0, failures: [] });
    expect(after.latestRun).toMatchObject({ status: "SUCCESS", success: 1492, failed: 0 });
    expect(after.latestRun.batches[3]).toMatchObject({ batchNo: "B04", success: 373, failed: 0, status: "SUCCESS" });
    expect((await admin.get(`/sync/retry-queue?taskId=${task.id}`)).body.data.total).toBe(0);
    const logs = (await admin.get(`/sync/tasks/${task.id}/logs`)).body.data.items;
    expect(logs[0]).toMatchObject({ action: "sync.task.retry", userName: "管理员" });
    expect(logs[0].summary).toBe("手动重试失败记录 2 条：成功 2 条，仍失败 0 条");
  });

  it("lists the retry queue across tasks and retries selected records", async () => {
    const gm = await t.as("gm");
    const all = (await gm.get("/sync/retry-queue?pageSize=50")).body.data;
    const states = all.items.map((r: { recordKey: string; queueState: string }) => [r.recordKey, r.queueState]);
    expect(states).toEqual(
      expect.arrayContaining([
        ["订单交期-1101", "PENDING"],
        ["订单交期-1102", "MANUAL"],
        ["测试报告-2201", "ABANDONED"],
      ]),
    );
    expect((await gm.get("/sync/retry-queue?state=ABANDONED")).body.data.items.every((r: { queueState: string }) => r.queueState === "ABANDONED")).toBe(true);
    const target = all.items.find((r: { recordKey: string }) => r.recordKey === "订单交期-1102");
    const res = await gm.post("/sync/retry-queue/retry", { recordIds: [target.id] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, success: 1 });
  });

  it("refuses to run disabled tasks and rejects illegal toggles", async () => {
    const admin = await t.as("admin");
    const ep = await mockEndpoint(admin, "ERP-D1");
    const task = await pushTask(admin, ep.id, { trigger: "SCHEDULED", intervalMinutes: 30 });
    expect(task.nextRunAt).toBe("2026-10-21T01:30:00.000Z");
    expect((await admin.post(`/sync/tasks/${task.id}/enable`, { version: task.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const disabled = (await admin.post(`/sync/tasks/${task.id}/disable`, { version: task.version })).body.data;
    expect(disabled).toMatchObject({ enabled: false, nextRunAt: null });
    const blocked = await admin.post(`/sync/tasks/${task.id}/run`, { version: disabled.version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errcode).toBe("SYNC_TASK_DISABLED");
    expect((await admin.post(`/sync/tasks/${task.id}/disable`, { version: task.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const epDisabled = (await admin.post(`/sync/endpoints/${ep.id}/disable`, { version: ep.version })).body.data;
    expect(epDisabled.status).toBe("DISABLED");
    const enabled = (await admin.post(`/sync/tasks/${task.id}/enable`, { version: disabled.version })).body.data;
    expect((await admin.post(`/sync/tasks/${task.id}/run`, { version: enabled.version })).body.errcode).toBe("SYNC_ENDPOINT_DISABLED");
  });

  it("runs scheduled tasks when due", async () => {
    const admin = await t.as("admin");
    const ep = await mockEndpoint(admin, "ERP-S1");
    const task = await pushTask(admin, ep.id, { trigger: "SCHEDULED", intervalMinutes: 30 });
    const runner = t.app.get(SyncRunner);
    const runsOf = async () => t.db.select().from(syncRuns).where(eq(syncRuns.taskId, task.id));
    await runner.tick();
    expect(await runsOf()).toHaveLength(0);
    t.clock.set("2026-10-21T01:30:00Z");
    await runner.tick();
    const runs = await runsOf();
    expect(runs.map((r) => r.trigger)).toEqual(["SCHEDULED"]);
    const after = (await t.db.select().from(syncTasks).where(eq(syncTasks.id, task.id)))[0]!;
    expect(after.nextRunAt!.toISOString()).toBe("2026-10-21T02:00:00.000Z");
    expect(after.version).toBe(task.version);
    t.clock.set(NOW);
    expect((await admin.get(`/sync/tasks/${task.id}/logs`)).body.data.items[0].userName).toBe("system");
  });

  it("runs EVENT tasks when matching order events are published", async () => {
    const admin = await t.as("admin");
    const nsr = t.refs.customers.NSR!;
    const ep = await mockEndpoint(admin, "NSR-E1", {}, { kind: "CUSTOMER", customerId: nsr });
    const task = await pushTask(admin, ep.id, { trigger: "EVENT", mode: "INCREMENTAL" });
    const orders = await activeOrders();
    const nsrOrder = orders.find((o) => o.customerId === nsr)!;
    const otherOrder = orders.find((o) => o.customerId !== nsr)!;
    const bus = t.app.get(EventBus);
    await bus.publish([{ type: "order.order.updated", aggregateType: "order", aggregateId: otherOrder.id, payload: {} }]);
    expect(await t.db.select().from(syncRuns).where(eq(syncRuns.taskId, task.id))).toHaveLength(0);
    await bus.publish([{ type: "order.order.updated", aggregateType: "order", aggregateId: nsrOrder.id, payload: {} }]);
    const runs = await t.db.select().from(syncRuns).where(eq(syncRuns.taskId, task.id));
    expect(runs.map((r) => [r.trigger, r.status, r.total])).toEqual([["EVENT", "SUCCESS", orders.filter((o) => o.customerId === nsr).length]]);
    await bus.publish([{ type: "inspection.inspection.released", aggregateType: "inspection", aggregateId: nsrOrder.id, payload: { orderId: nsrOrder.id } }]);
    expect(await t.db.select().from(syncRuns).where(eq(syncRuns.taskId, task.id))).toHaveLength(1);
  });

  it("resolves the customer of testing events from styleId", async () => {
    const admin = await t.as("admin");
    const nsr = t.refs.customers.NSR!;
    const ep = await mockEndpoint(admin, "NSR-E2", {}, { kind: "CUSTOMER", customerId: nsr });
    const task = (await admin.post("/sync/tasks", { name: "测试报告回传", endpointId: ep.id, object: "TEST_REPORT", direction: "PUSH", mode: "INCREMENTAL", trigger: "EVENT" })).body.data;
    const all = await t.db.select().from(styles);
    const nsrStyle = all.find((s) => s.customerId === nsr)!;
    const otherStyle = all.find((s) => s.customerId !== nsr)!;
    const bus = t.app.get(EventBus);
    await bus.publish([{ type: "testing.request.completed", aggregateType: "testRequest", aggregateId: otherStyle.id, payload: { styleId: otherStyle.id } }]);
    expect(await t.db.select().from(syncRuns).where(eq(syncRuns.taskId, task.id))).toHaveLength(0);
    await bus.publish([{ type: "testing.request.completed", aggregateType: "testRequest", aggregateId: nsrStyle.id, payload: { styleId: nsrStyle.id } }]);
    const runs = await t.db.select().from(syncRuns).where(eq(syncRuns.taskId, task.id));
    expect(runs.map((r) => [r.trigger, r.status])).toEqual([["EVENT", "SUCCESS"]]);
  });
});
