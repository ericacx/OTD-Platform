import { customerOrders } from "@otd/db";
import { afterEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { FactoryAuditService } from "./factoryaudit.service.js";

const NOW = "2026-10-21T01:00:00Z";
let t: TestApp;
afterEach(async () => {
  await t?.close();
});

async function factoryId(code: string): Promise<string> {
  const admin = await t.as("admin");
  return (await admin.get(`/masterdata/factories?keyword=${code}`)).body.data.items.find((f: { code: string }) => f.code === code).id;
}

describe("factory audit (demo seed)", () => {
  it("seeds audits across statuses with an overdue finding and its todo", async () => {
    t = await createTestApp({ now: NOW });
    const quality = await t.as("quality");
    const plans = (await quality.get("/factory-audits/plans")).body.data;
    expect(plans.items.map((a: { status: string }) => a.status).sort()).toEqual(["IN_PROGRESS", "PLANNED", "PLANNED"]);
    const records = (await quality.get("/factory-audits/records")).body.data;
    expect(records.items.map((a: { status: string }) => a.status).sort()).toEqual(["CLOSED", "CLOSED", "RECTIFYING"]);
    const rectifying = records.items.find((a: { status: string }) => a.status === "RECTIFYING");
    expect(rectifying.openFindingCount).toBe(2);
    expect(rectifying.overdueFindingCount).toBe(1);
    const overdue = (await quality.get("/factory-audits/findings?overdue=true")).body.data;
    expect(overdue.total).toBe(1);
    expect(overdue.items[0].overdueDays).toBe(3);
    const board = (await quality.get("/todos/board")).body.data;
    expect(board.overdue.some((i: { action: string; docNo: string }) => i.action === "factoryaudit.finding.overdue" && i.docNo === rectifying.docNo)).toBe(true);
  });
});

describe("factory audit", () => {
  it("runs the audit lifecycle and refuses to close with open findings", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const quality = await t.as("quality");
    const dc1 = await factoryId("DC1");
    const created = await quality.post("/factory-audits", { factoryId: dc1, auditType: "CUSTOMER", plannedDate: "2026-10-25", auditor: "晨跑者 QA", customerId: t.refs.customers.MRN });
    expect(created.status).toBe(201);
    const a = created.body.data;
    expect(a.docNo).toMatch(/^AUD-2610-\d{3}$/);
    expect(a.status).toBe("PLANNED");
    expect(a.customerName).toBe("晨跑者");
    expect(a.factoryName).toBe("东城一厂");

    expect((await quality.post(`/factory-audits/${a.id}/close`, { version: a.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await quality.post(`/factory-audits/${a.id}/findings`, { item: "x", severity: "LOW" })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const started = await quality.post(`/factory-audits/${a.id}/start`, { version: a.version });
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe("IN_PROGRESS");
    expect(started.body.data.actualDate).toBe("2026-10-21");
    expect((await quality.post(`/factory-audits/${a.id}/start`, { version: a.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const f1 = (await quality.post(`/factory-audits/${a.id}/findings`, { item: "化学品仓 MSDS 不全", severity: "HIGH", correctiveAction: "补齐 MSDS", responsible: "安全主管", dueDate: "2026-11-05" })).body.data;
    const f2 = (await quality.post(`/factory-audits/${a.id}/findings`, { item: "消防通道堆物", severity: "LOW", dueDate: "2026-10-28" })).body.data;
    expect(f1.status).toBe("OPEN");
    const recorded = await quality.post(`/factory-audits/${a.id}/record`, { actualDate: "2026-10-21", result: "CONDITIONAL", score: 81.5, version: started.body.data.version });
    expect(recorded.body.data.status).toBe("RECTIFYING");
    expect(recorded.body.data.score).toBe(81.5);
    expect(recorded.body.data.openFindingCount).toBe(2);

    const blocked = await quality.post(`/factory-audits/${a.id}/close`, { version: recorded.body.data.version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errcode).toBe("FACTORYAUDIT_OPEN_FINDINGS");
    expect(blocked.body.errParams).toEqual({ count: 2 });

    const upd = await quality.put(`/factory-audits/findings/${f2.id}`, { item: "消防通道堆放纸箱", severity: "MEDIUM", dueDate: "2026-10-30", version: f2.version });
    expect(upd.body.data.severity).toBe("MEDIUM");
    expect((await quality.post(`/factory-audits/findings/${f2.id}/close`, { version: f2.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await quality.post(`/factory-audits/findings/${f2.id}/close`, { closeNote: "已清理", version: upd.body.data.version })).body.data.status).toBe("CLOSED");
    const c1 = await quality.post(`/factory-audits/findings/${f1.id}/close`, { version: f1.version });
    expect(c1.body.data.closedAt).toBe("2026-10-21T01:00:00.000Z");
    expect((await quality.post(`/factory-audits/findings/${f1.id}/close`, { version: c1.body.data.version })).body.errcode).toBe("FACTORYAUDIT_FINDING_CLOSED");

    const closed = await quality.post(`/factory-audits/${a.id}/close`, { version: recorded.body.data.version });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe("CLOSED");
    expect((await quality.post(`/factory-audits/${a.id}/findings`, { item: "x", severity: "LOW" })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await quality.get("/factory-audits/records")).body.data.items.map((x: { id: string }) => x.id)).toContain(a.id);
    expect((await quality.get("/factory-audits/plans")).body.data.total).toBe(0);

    const second = (await quality.post("/factory-audits", { factoryId: dc1, auditType: "QUALITY", plannedDate: "2026-10-22", customerId: t.refs.customers.NSR })).body.data;
    const s2 = (await quality.post(`/factory-audits/${second.id}/start`, { version: second.version })).body.data;
    expect((await quality.post(`/factory-audits/${second.id}/record`, { actualDate: "2026-10-21", result: "PASS", score: 95, version: s2.version })).body.data.status).toBe("CLOSED");

    const admin = await t.as("admin");
    const logs = (await admin.get(`/system/audit-logs?keyword=${a.docNo}`)).body.data.items.map((l: { action: string }) => l.action);
    expect(logs).toEqual(expect.arrayContaining(["factoryaudit.audit.create", "factoryaudit.audit.start", "factoryaudit.audit.record", "factoryaudit.audit.close", "factoryaudit.finding.create", "factoryaudit.finding.close"]));
  });

  it("uses the factory's main customer, falls back to the chosen one, else asks for one", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const quality = await t.as("quality");
    const bases = (await admin.get("/masterdata/bases")).body.data.items;
    const fac = (await admin.post("/masterdata/factories", { code: "AUDT1", name: "审计测试厂", baseId: bases[0].id })).body.data;
    const bare = (await admin.post("/masterdata/factories", { code: "AUDT2", name: "无订单厂", baseId: bases[0].id })).body.data;
    const owner = { ownerId: t.refs.users["13800000001"]!, orgId: t.refs.orgs.ORG003! };
    await t.db.insert(customerOrders).values([
      { poNo: "AUDTEST-1", customerDueDate: "2026-12-01", status: "IN_PRODUCTION", factoryId: fac.id, customerId: t.refs.customers.NSR!, ...owner },
      { poNo: "AUDTEST-2", customerDueDate: "2026-12-02", status: "TO_SCHEDULE", factoryId: fac.id, customerId: t.refs.customers.NSR!, ...owner },
      { poNo: "AUDTEST-3", customerDueDate: "2026-12-03", status: "TO_SCHEDULE", factoryId: fac.id, customerId: t.refs.customers.BBY!, ...owner },
    ]);
    const main = await quality.post("/factory-audits", { factoryId: fac.id, auditType: "SOCIAL", plannedDate: "2026-11-01", customerId: t.refs.customers.MPT });
    expect(main.body.data.customerId).toBe(t.refs.customers.NSR);
    const chosen = await quality.post("/factory-audits", { factoryId: bare.id, auditType: "SOCIAL", plannedDate: "2026-11-01", customerId: t.refs.customers.MPT });
    expect(chosen.body.data.customerId).toBe(t.refs.customers.MPT);
    const missing = await quality.post("/factory-audits", { factoryId: bare.id, auditType: "SOCIAL", plannedDate: "2026-11-01" });
    expect(missing.status).toBe(422);
    expect(missing.body.errcode).toBe("FACTORYAUDIT_CUSTOMER_REQUIRED");
  });

  it("applies permissions and data scope", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const quality = await t.as("quality");
    const sales = await t.as("sales");
    const manager = await t.as("manager");
    const nh5 = await factoryId("NH5");
    expect((await sales.get("/factory-audits/plans")).status).toBe(403);
    expect((await sales.post("/factory-audits", { factoryId: nh5, auditType: "SOCIAL", plannedDate: "2026-11-01", customerId: t.refs.customers.NSR })).status).toBe(403);
    expect((await manager.get("/factory-audits/plans")).status).toBe(403);

    const roles = (await admin.get("/system/roles")).body.data;
    for (const [code, extra] of [
      ["R001", ["factoryaudit.plan.view", "factoryaudit.plan.edit"]],
      ["R002", ["factoryaudit.plan.view"]],
    ] as const) {
      const role = roles.find((r: { code: string }) => r.code === code);
      const detail = (await admin.get(`/system/roles/${role.id}`)).body.data;
      await admin.put(`/system/roles/${role.id}/grants`, { permissions: [...detail.permissions, ...extra], allCustomers: detail.allCustomers, customerIds: detail.customers.map((c: { id: string }) => c.id), reason: "test", version: detail.version });
    }

    const byQuality = (await quality.post("/factory-audits", { factoryId: nh5, auditType: "SOCIAL", plannedDate: "2026-11-01", customerId: t.refs.customers.NSR })).body.data;
    const bySales = (await sales.post("/factory-audits", { factoryId: nh5, auditType: "CUSTOMER", plannedDate: "2026-11-03", customerId: t.refs.customers.NSR })).body.data;
    const forSsh = (await admin.post("/factory-audits", { factoryId: nh5, auditType: "SECURITY", plannedDate: "2026-11-02", customerId: t.refs.customers.SSH })).body.data;

    expect((await sales.get("/factory-audits/plans")).body.data.items.map((x: { id: string }) => x.id)).toEqual([bySales.id]);
    expect((await sales.get(`/factory-audits/${byQuality.id}`)).status).toBe(404);
    expect((await sales.get(`/factory-audits/${forSsh.id}`)).status).toBe(404);
    expect((await sales.put(`/factory-audits/${forSsh.id}`, { factoryId: nh5, auditType: "SECURITY", plannedDate: "2026-11-05", customerId: t.refs.customers.SSH, version: forSsh.version })).status).toBe(404);

    const managerPlans = (await manager.get("/factory-audits/plans")).body.data.items.map((x: { id: string }) => x.id);
    expect(managerPlans).toEqual([bySales.id]);
    expect((await manager.get(`/factory-audits/${byQuality.id}`)).status).toBe(404);

    expect((await quality.get("/factory-audits/plans")).body.data.total).toBe(3);
    expect((await quality.post(`/factory-audits/${forSsh.id}/start`, { version: forSsh.version })).status).toBe(200);
  });

  it("raises todos for overdue findings and clears them when closed", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const quality = await t.as("quality");
    const admin = await t.as("admin");
    const hp3 = await factoryId("HP3");
    const a = (await quality.post("/factory-audits", { factoryId: hp3, auditType: "SOCIAL", plannedDate: "2026-10-10", customerId: t.refs.customers.APX })).body.data;
    const s = (await quality.post(`/factory-audits/${a.id}/start`, { actualDate: "2026-10-10", version: a.version })).body.data;
    const overdue = (await quality.post(`/factory-audits/${a.id}/findings`, { item: "宿舍消防栓压力不足", severity: "HIGH", dueDate: "2026-10-18" })).body.data;
    await quality.post(`/factory-audits/${a.id}/findings`, { item: "工牌未佩戴", severity: "LOW", dueDate: "2026-10-30" });
    await quality.post(`/factory-audits/${a.id}/record`, { actualDate: "2026-10-10", result: "CONDITIONAL", version: s.version });

    const adminAudit = (await admin.post("/factory-audits", { factoryId: hp3, auditType: "QUALITY", plannedDate: "2026-10-05", customerId: t.refs.customers.APX })).body.data;
    const as = (await admin.post(`/factory-audits/${adminAudit.id}/start`, { version: adminAudit.version })).body.data;
    await admin.post(`/factory-audits/${as.id}/findings`, { item: "来料检验记录缺失", severity: "MEDIUM", dueDate: "2026-10-15" });

    const service = t.app.get(FactoryAuditService);
    expect(await service.scanOverdueFindings()).toEqual({ todos: 2 });
    expect(await service.scanOverdueFindings()).toEqual({ todos: 2 });
    const board = (await quality.get("/todos/board")).body.data;
    const items = board.overdue.filter((i: { action: string }) => i.action === "factoryaudit.finding.overdue");
    expect(items).toHaveLength(2);
    const fire = items.find((i: { title: string }) => i.title.includes("宿舍消防栓压力不足"));
    expect(fire.overdueDays).toBe(2);
    expect(fire.docNo).toBe(a.docNo);
    const adminBoard = (await admin.get("/todos/board")).body.data;
    expect(adminBoard.overdue.filter((i: { action: string }) => i.action === "factoryaudit.finding.overdue")).toHaveLength(0);

    await quality.post(`/factory-audits/findings/${overdue.id}/close`, { closeNote: "已更换", version: overdue.version });
    const after = (await quality.get("/todos/board")).body.data;
    expect(after.overdue.filter((i: { action: string }) => i.action === "factoryaudit.finding.overdue").map((i: { title: string }) => i.title)).toEqual(["整改项到期未关闭：来料检验记录缺失"]);
  });
});
