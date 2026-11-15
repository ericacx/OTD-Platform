import { customerOrders } from "@otd/db";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";
import { FlowConfigService } from "./flow-config.service.js";

const NOW = "2026-10-21T01:00:00Z";
let t: TestApp;
afterEach(async () => {
  await t?.close();
});

type DraftModule = { moduleCode: string; department?: string; items: { itemCode: string }[] };

async function catalogOf(admin: Caller): Promise<Map<string, { hasPage: boolean; items: { code: string; name: string }[] }>> {
  const list = (await admin.get("/flow/modules?pageSize=50")).body.data.items as { id: string; code: string; hasPage: boolean }[];
  const out = new Map<string, { hasPage: boolean; items: { code: string; name: string }[] }>();
  for (const m of list) {
    const detail = (await admin.get(`/flow/modules/${m.id}`)).body.data;
    out.set(m.code, { hasPage: m.hasPage, items: detail.items.map((i: { code: string; name: string }) => ({ code: i.code, name: i.name })) });
  }
  return out;
}

function fullDraft(catalog: Awaited<ReturnType<typeof catalogOf>>, drop: string[] = [], uncheck: Record<string, string[]> = {}): DraftModule[] {
  return [...catalog.entries()]
    .filter(([code, m]) => m.hasPage && !drop.includes(code))
    .map(([code, m]) => ({ moduleCode: code, items: m.items.filter((i) => !(uncheck[code] ?? []).includes(i.name)).map((i) => ({ itemCode: i.code })) }));
}

async function saveDraft(caller: Caller, customerId: string, modules: DraftModule[], params: Record<string, unknown> = {}) {
  const detail = (await caller.get(`/flow/customers/${customerId}`)).body.data;
  return caller.put(`/flow/customers/${customerId}/draft`, { modules, params, version: detail.version });
}

async function publish(caller: Caller, customerId: string, note?: string) {
  const detail = (await caller.get(`/flow/customers/${customerId}`)).body.data;
  return caller.post(`/flow/customers/${customerId}/publish`, { version: detail.version, note });
}

describe("flow config (demo seed)", () => {
  it("seeds 8 published flows, NSR has 12 modules and an unpublished draft", async () => {
    t = await createTestApp({ now: NOW });
    const admin = await t.as("admin");
    const cards = (await admin.get("/flow/customers?pageSize=50")).body.data;
    expect(cards.total).toBe(8);
    const nsr = cards.items.find((c: { code: string }) => c.code === "NSR");
    expect(nsr.moduleCount).toBe(12);
    expect(nsr.itemCount).toBeGreaterThanOrEqual(80);
    expect(nsr.flowStatus).toBe("DRAFT");
    expect(nsr.currentVersionNo).toBe(1);
    expect(cards.items.filter((c: { hasChanges: boolean }) => c.hasChanges).map((c: { code: string }) => c.code)).toEqual(["NSR"]);
    expect(cards.items.filter((c: { flowStatus: string }) => c.flowStatus === "PUBLISHED")).toHaveLength(7);

    const config = t.app.get(FlowConfigService);
    const runtime = await config.enabledNodes(t.refs.customers.NSR!);
    expect(runtime.configured).toBe(true);
    expect(runtime.nodes).toEqual(["N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09", "N10"]);
    expect(runtime.gateConditions.G1).toEqual(["sampleApproved", "quoteAccepted", "testReportValid", "qrsRetained", "techPackUploaded"]);
    expect(runtime.gateConditions.G2).toEqual(["finalPassed", "reportsValid", "packingReady"]);
    expect(runtime.params.sameFactorySameDayLimit).toBe(5);
    const bby = await config.enabledNodes(t.refs.customers.BBY!);
    expect(bby.nodes).not.toContain("N03");
    expect(bby.gateConditions.G1).not.toContain("testReportValid");
    expect((await config.enabledNodes(t.refs.customers.MRN!)).nodes).not.toContain("N04");
    expect(await config.rulePack("RELEASE", t.refs.customers.NSR!)).toMatchObject({ sameFactorySameDayLimit: 5, mergeReport: true, releaseDaysBeforeExFactory: 15 });
    expect(await config.rulePack("RELEASE", t.refs.customers.MPT!)).toMatchObject({ sameFactorySameDayLimit: 5, mergeReport: false });

    const diff = (await admin.get(`/flow/customers/${t.refs.customers.NSR}/diff`)).body.data;
    expect(diff.identical).toBe(false);
    expect(diff.orderChanged).toBe(true);
    expect(diff.itemsAdded.map((i: { name: string }) => i.name)).toEqual(["圆率测试"]);
    expect(diff.itemsRemoved.map((i: { name: string }) => i.name)).toEqual(["TNA 同步"]);
    expect(diff.paramsChanged).toEqual([{ key: "sameFactorySameDayLimit", from: 5, to: 4 }]);
    const mptDiff = (await admin.get(`/flow/customers/${t.refs.customers.MPT}/diff`)).body.data;
    expect(mptDiff.identical).toBe(true);

    const modules = (await admin.get("/flow/modules?pageSize=50")).body.data.items;
    const sm01 = modules.find((m: { code: string }) => m.code === "SM01");
    expect(sm01.customerCount).toBe(8);
    expect(sm01.enabledItemTotal).toBe(64);
    const sm13 = modules.find((m: { code: string }) => m.code === "SM13");
    expect(sm13.hasPage).toBe(false);
    expect(sm13.customerCount).toBeNull();
    const packs = (await admin.get("/flow/rule-packs")).body.data;
    expect(packs.total).toBe(5);
  });
});

describe("flow config", () => {
  it("publishes immutable versions, diffs, rolls back and keeps old versions intact", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const nsr = t.refs.customers.NSR!;
    const before = (await admin.get(`/flow/customers/${nsr}`)).body.data;
    expect(before.customer.flowStatus).toBe("NONE");
    expect(before.version).toBe(0);
    expect(before.draftRuntime.nodes).toEqual([]);

    const catalog = await catalogOf(admin);
    expect((await saveDraft(admin, nsr, fullDraft(catalog), { sameFactorySameDayLimit: 5 })).status).toBe(200);
    const v1Res = await publish(admin, nsr, "首版");
    expect(v1Res.status).toBe(200);
    expect(v1Res.body.data.currentVersion.versionNo).toBe(1);
    expect(v1Res.body.data.customer.flowStatus).toBe("PUBLISHED");
    expect(v1Res.body.data.customer.moduleCount).toBe(12);
    expect(v1Res.body.data.customer.itemCount).toBe(88);
    const v1Id = v1Res.body.data.currentVersion.id;

    const again = await publish(admin, nsr);
    expect(again.body.errcode).toBe("FLOW_NO_CHANGES");

    const saved = await saveDraft(admin, nsr, fullDraft(catalog, ["SM05"]));
    expect(saved.body.data.hasChanges).toBe(true);
    expect(saved.body.data.customer.flowStatus).toBe("DRAFT");
    expect(saved.body.data.draftRuntime.nodes).not.toContain("N03");
    const diff = (await admin.get(`/flow/customers/${nsr}/diff`)).body.data;
    expect(diff.modulesRemoved.map((m: { moduleCode: string }) => m.moduleCode)).toEqual(["SM05"]);
    expect(diff.nodesRemoved).toEqual(["N03"]);
    expect(diff.gateConditionsRemoved).toEqual([
      { gate: "G1", key: "testReportValid" },
      { gate: "G2", key: "reportsValid" },
    ]);

    const stale = await admin.post(`/flow/customers/${nsr}/publish`, { version: saved.body.data.version - 1 });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const v2Res = await publish(admin, nsr, "移除测试服务");
    expect(v2Res.body.data.currentVersion.versionNo).toBe(2);
    expect(v2Res.body.data.currentVersion.summary.modulesRemoved).toEqual(["SM05"]);

    const v1 = (await admin.get(`/flow/customers/${nsr}/versions/${v1Id}`)).body.data;
    expect(v1.isCurrent).toBe(false);
    expect(v1.modules.map((m: { moduleCode: string }) => m.moduleCode)).toContain("SM05");
    expect(v1.runtime.nodes).toContain("N03");
    const config = t.app.get(FlowConfigService);
    const current = await config.enabledNodes(nsr);
    expect(current.versionNo).toBe(2);
    expect(current.nodes).not.toContain("N03");
    expect(current.gateConditions.G1).not.toContain("testReportValid");
    expect(current.gateConditions.G2).toEqual(["finalPassed", "packingReady"]);
    expect((await config.enabledNodes(nsr, v1Id)).nodes).toContain("N03");
    expect(await config.currentVersionId(nsr)).toBe(v2Res.body.data.currentVersion.id);

    const versions = (await admin.get(`/flow/customers/${nsr}/versions`)).body.data;
    expect(versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    const snaps = (await admin.get(`/system/snapshots?objectType=customerFlow&objectId=${nsr}`)).body.data;
    expect(snaps).toHaveLength(2);
    const logs = (await admin.get("/system/audit-logs?action=flow.customer.publish")).body.data;
    expect(logs.total).toBe(2);

    const detail = (await admin.get(`/flow/customers/${nsr}`)).body.data;
    const rb = await admin.post(`/flow/customers/${nsr}/rollback`, { versionId: v1Id, reason: "客户恢复测试要求", version: detail.version });
    expect(rb.status).toBe(200);
    expect(rb.body.data.currentVersion.versionNo).toBe(3);
    expect((await config.enabledNodes(nsr)).nodes).toContain("N03");
    expect((await admin.get(`/flow/customers/${nsr}/versions/${v1Id}`)).body.data.versionNo).toBe(1);
  });

  it("returns everything enabled when a customer has no published flow, and trims only what the config removes", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const config = t.app.get(FlowConfigService);
    const ssh = t.refs.customers.SSH!;
    const none = await config.enabledNodes(ssh, null);
    expect(none.configured).toBe(false);
    expect(none.versionId).toBeNull();
    expect(none.nodes).toHaveLength(10);
    expect(none.gateConditions.G1).toHaveLength(5);
    expect(none.gateConditions.G2).toHaveLength(3);
    expect(none.params.paymentTermsDays).toBe(45);

    const catalog = await catalogOf(admin);
    await saveDraft(admin, ssh, fullDraft(catalog, [], { SM05: ["成分检测", "起毛起球", "功能性检测", "pH 值", "布片色牢度", "圆率测试", "报告复用管理"] }));
    expect((await publish(admin, ssh)).status).toBe(200);
    const partial = await config.enabledNodes(ssh);
    expect(partial.items.filter((i) => i.startsWith("SM05"))).toHaveLength(1);
    expect(partial.nodes).toContain("N03");
    expect(partial.gateConditions.G1).toContain("testReportValid");
    expect(partial.gateConditions.G2).toContain("reportsValid");

    const copyTarget = t.refs.customers.PLF!;
    const copied = await admin.post(`/flow/customers/${copyTarget}/copy`, { sourceCustomerId: ssh, version: 0 });
    expect(copied.status).toBe(200);
    const trimmed = copied.body.data.draft.modules.filter((m: { moduleCode: string }) => m.moduleCode !== "SM05").map((m: { moduleCode: string; items: { code: string; enabled: boolean }[] }) => ({ moduleCode: m.moduleCode, items: m.items.filter((i) => i.enabled).map((i) => ({ itemCode: i.code })) }));
    await saveDraft(admin, copyTarget, trimmed);
    const published = await publish(admin, copyTarget);
    expect(published.body.data.customer.paymentTermsDays).toBe(60);
    const plf = await config.enabledNodes(copyTarget);
    expect(plf.nodes).toEqual(["N01", "N02", "N04", "N05", "N06", "N07", "N08", "N09", "N10"]);
    expect(plf.gateConditions.G1).toEqual(["sampleApproved", "quoteAccepted", "qrsRetained", "techPackUploaded"]);
    expect(plf.params.paymentTermsDays).toBe(60);
  });

  it("refuses to publish a flow that empties G1 or G2", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const catalog = await catalogOf(admin);
    const mrn = t.refs.customers.MRN!;
    await saveDraft(admin, mrn, fullDraft(catalog, ["SM01", "SM02", "SM03", "SM04", "SM05"]));
    const g1 = await publish(admin, mrn);
    expect(g1.status).toBe(422);
    expect(g1.body.errcode).toBe("FLOW_GATE_EMPTY");
    expect(g1.body.errParams).toEqual({ gate: "G1" });

    await saveDraft(admin, mrn, fullDraft(catalog, ["SM05", "SM06"], { SM07: ["包装方案确认"] }));
    const g2 = await publish(admin, mrn);
    expect(g2.body.errcode).toBe("FLOW_GATE_EMPTY");
    expect(g2.body.errParams).toEqual({ gate: "G2" });
    expect((await admin.get(`/flow/customers/${mrn}/versions`)).body.data).toHaveLength(0);

    const pending = await saveDraft(admin, mrn, [{ moduleCode: "SM13", items: [] }]);
    expect(pending.body.errcode).toBe("FLOW_MODULE_PENDING");
    const mismatch = await saveDraft(admin, mrn, [{ moduleCode: "SM01", items: [{ itemCode: "SM02-01" }] }]);
    expect(mismatch.body.errcode).toBe("FLOW_ITEM_MODULE_MISMATCH");
    const dup = await saveDraft(admin, mrn, [{ moduleCode: "SM01", items: [] }, { moduleCode: "SM01", items: [] }]);
    expect(dup.body.errcode).toBe("FLOW_MODULE_DUPLICATE");
  });

  it("keeps published versions stable when the catalog changes", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const catalog = await catalogOf(admin);
    const apx = t.refs.customers.APX!;
    await saveDraft(admin, apx, fullDraft(catalog));
    const v1 = (await publish(admin, apx)).body.data.currentVersion.id;
    const sm03 = (await admin.get("/flow/modules?keyword=打样开发")).body.data.items[0];
    const qrs = (await admin.get(`/flow/modules/${sm03.id}`)).body.data.items.find((i: { name: string }) => i.name === "QRS 品质参考样");
    const edited = await admin.put(`/flow/items/${qrs.id}`, { name: qrs.name, nameEn: qrs.nameEn, effects: { nodes: ["N02"] }, version: qrs.version });
    expect(edited.status).toBe(200);
    const stale = await admin.put(`/flow/items/${qrs.id}`, { name: qrs.name, effects: {}, version: qrs.version });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const config = t.app.get(FlowConfigService);
    expect((await config.enabledNodes(apx, v1)).gateConditions.G1).toContain("qrsRetained");
    const draft = (await admin.get(`/flow/customers/${apx}`)).body.data;
    expect(draft.draftRuntime.gateConditions.G1).not.toContain("qrsRetained");

    const inUse = await admin.del(`/flow/items/${qrs.id}`);
    expect(inUse.body.errcode).toBe("FLOW_CATALOG_IN_USE");

    const created = await admin.post(`/flow/modules/${sm03.id}/items`, { name: "袜头缝合样", nameEn: "Toe seam sample", effects: { nodes: ["N02"] } });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe("SM03-13");
    await saveDraft(admin, apx, [...fullDraft(catalog).filter((m) => m.moduleCode !== "SM03"), { moduleCode: "SM03", items: [...fullDraft(catalog).find((m) => m.moduleCode === "SM03")!.items, { itemCode: "SM03-13" }] }]);
    const v2 = (await publish(admin, apx)).body.data.currentVersion.id;
    await saveDraft(admin, apx, fullDraft(catalog));
    await publish(admin, apx);
    expect((await admin.del(`/flow/items/${created.body.data.id}`)).status).toBe(200);
    const v2Runtime = await config.enabledNodes(apx, v2);
    expect(v2Runtime.items).toContain("SM03-13");
    expect(v2Runtime.nodes).toContain("N02");
    const v2Detail = (await admin.get(`/flow/customers/${apx}/versions/${v2}`)).body.data;
    const sm03View = v2Detail.modules.find((m: { moduleCode: string }) => m.moduleCode === "SM03");
    expect(sm03View.items.find((i: { code: string }) => i.code === "SM03-13")).toMatchObject({ enabled: true, deleted: true, name: "袜头缝合样" });

    const mod = await admin.post("/flow/modules", { name: "可持续发展", nameEn: "Sustainability", department: "品质部", hasPage: true });
    expect(mod.body.data.code).toBe("SM16");
    const assign = await admin.post(`/flow/modules/${mod.body.data.id}/assign`, { customerIds: [apx, t.refs.customers.CKD] });
    expect(assign.status).toBe(200);
    expect(assign.body.data.assigned.sort()).toEqual(["APX", "CKD"]);
    expect((await admin.post(`/flow/modules/${mod.body.data.id}/assign`, { customerIds: [apx] })).body.data.skipped).toEqual(["APX"]);
    expect((await admin.del(`/flow/modules/${mod.body.data.id}`)).body.errcode).toBe("FLOW_CATALOG_IN_USE");
  });

  it("migrates in-flight orders to the current version", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const catalog = await catalogOf(admin);
    const nsr = t.refs.customers.NSR!;
    await saveDraft(admin, nsr, fullDraft(catalog));
    const v1 = (await publish(admin, nsr)).body.data.currentVersion.id;
    const owner = { ownerId: t.refs.users["13800000001"]!, orgId: t.refs.orgs.ORG003!, customerId: nsr };
    const rows = await t.db
      .insert(customerOrders)
      .values([
        { poNo: "FLOWTEST-1", customerDueDate: "2026-12-01", status: "IN_PRODUCTION", flowVersionId: v1, ...owner },
        { poNo: "FLOWTEST-2", customerDueDate: "2026-11-20", status: "COMPLETED", flowVersionId: v1, ...owner },
        { poNo: "FLOWTEST-3", customerDueDate: "2026-12-10", status: "PENDING_CONFIRM", flowVersionId: null, ...owner },
        { poNo: "FLOWTEST-4", customerDueDate: "2026-11-25", status: "TO_SCHEDULE", flowVersionId: v1, ...owner },
        { poNo: "FLOWTEST-5", customerDueDate: "2026-11-28", status: "CANCELLED", flowVersionId: v1, ...owner },
      ])
      .returning({ id: customerOrders.id, poNo: customerOrders.poNo });
    const noTarget = await admin.get(`/flow/customers/${t.refs.customers.MPT}/migration`);
    expect(noTarget.body.errcode).toBe("FLOW_NOT_PUBLISHED");

    await saveDraft(admin, nsr, fullDraft(catalog, ["SM05"]));
    const v2 = (await publish(admin, nsr)).body.data.currentVersion;
    const preview = (await admin.get(`/flow/customers/${nsr}/migration`)).body.data;
    expect(preview.target.versionNo).toBe(2);
    expect(preview.total).toBe(2);
    expect(preview.orders.map((o: { poNo: string }) => o.poNo)).toEqual(["FLOWTEST-4", "FLOWTEST-1"]);
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0].fromVersionNo).toBe(1);
    expect(preview.groups[0].diff.nodesRemoved).toEqual(["N03"]);

    const sales = await t.as("sales");
    expect((await sales.post(`/flow/customers/${nsr}/migrate`, { targetVersionId: v2.id })).status).toBe(403);
    const wrong = await admin.post(`/flow/customers/${nsr}/migrate`, { targetVersionId: v1 });
    expect(wrong.body.errcode).toBe("FLOW_VERSION_NOT_CURRENT");
    const done = await admin.post(`/flow/customers/${nsr}/migrate`, { targetVersionId: v2.id });
    expect(done.status).toBe(200);
    expect(done.body.data.migrated).toBe(2);
    const after = await t.db.select().from(customerOrders).where(inArray(customerOrders.id, rows.map((r) => r.id)));
    const byPo = new Map(after.map((o) => [o.poNo, o]));
    expect(byPo.get("FLOWTEST-1")!.flowVersionId).toBe(v2.id);
    expect(byPo.get("FLOWTEST-1")!.version).toBe(2);
    expect(byPo.get("FLOWTEST-4")!.flowVersionId).toBe(v2.id);
    expect(byPo.get("FLOWTEST-2")!.flowVersionId).toBe(v1);
    expect(byPo.get("FLOWTEST-5")!.flowVersionId).toBe(v1);
    expect(byPo.get("FLOWTEST-3")!.flowVersionId).toBeNull();
    expect((await admin.get(`/flow/customers/${nsr}/migration`)).body.data.total).toBe(0);
    const logs = (await admin.get("/system/audit-logs?action=flow.order.migrate")).body.data;
    expect(logs.items.map((l: { docNo: string }) => l.docNo).sort()).toEqual(["FLOWTEST-1", "FLOWTEST-4"]);
    const order1 = (await t.db.select().from(customerOrders).where(eq(customerOrders.poNo, "FLOWTEST-1")))[0]!;
    expect((await t.app.get(FlowConfigService).enabledNodes(nsr, order1.flowVersionId)).nodes).not.toContain("N03");
  });

  it("enforces permissions and customer scope", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const sales = await t.as("sales");
    const manager = await t.as("manager");
    expect((await sales.get("/flow/customers")).status).toBe(403);
    expect((await sales.get("/flow/modules")).status).toBe(403);
    expect((await manager.get("/flow/customers?pageSize=50")).body.data.total).toBe(8);
    expect((await manager.put(`/flow/customers/${t.refs.customers.NSR}/draft`, { modules: [], params: {}, version: 0 })).status).toBe(403);
    expect((await manager.post("/flow/modules", { name: "X", department: "业务部" })).status).toBe(403);
    expect((await manager.get("/flow/rule-packs")).status).toBe(403);

    const roles = (await admin.get("/system/roles")).body.data;
    const r001 = roles.find((r: { code: string }) => r.code === "R001");
    const detail = (await admin.get(`/system/roles/${r001.id}`)).body.data;
    await admin.put(`/system/roles/${r001.id}/grants`, { permissions: [...detail.permissions, "flow.customer.view"], allCustomers: false, customerIds: detail.customers.map((c: { id: string }) => c.id), reason: "test", version: detail.version });
    const cards = (await sales.get("/flow/customers?pageSize=50")).body.data;
    expect(cards.items.map((c: { code: string }) => c.code).sort()).toEqual(["APX", "BBY", "CKD", "MPT", "MRN", "NSR"]);
    expect((await sales.get(`/flow/customers/${t.refs.customers.SSH}`)).status).toBe(404);
    expect((await sales.get(`/flow/customers/${t.refs.customers.SSH}/runtime`)).status).toBe(404);
    expect((await sales.get(`/flow/customers/${t.refs.customers.NSR}`)).status).toBe(200);
  });

  it("manages rule packs with one global default per kind and customer overrides", async () => {
    t = await createTestApp({ demo: false, now: NOW });
    const admin = await t.as("admin");
    const base = await admin.post("/flow/rule-packs", { kind: "PO_REVIEW", name: "PO 复核默认", params: { unitPriceTolerance: 0, quantityTolerancePct: 2 } });
    expect(base.status).toBe(201);
    expect(base.body.data.code).toBe("RP-PO_REVIEW");
    const dup = await admin.post("/flow/rule-packs", { kind: "PO_REVIEW", name: "又一个默认", params: {} });
    expect(dup.body.errcode).toBe("FLOW_RULEPACK_DUPLICATE");
    const override = await admin.post("/flow/rule-packs", { kind: "PO_REVIEW", name: "北岸 PO 复核", customerId: t.refs.customers.NSR, params: { quantityTolerancePct: 0 } });
    expect(override.body.data.code).toBe("RP-PO_REVIEW-NSR");
    expect(override.body.data.customerName).toBe("北岸运动");
    const eff = (await admin.get(`/flow/rule-packs/effective?customerId=${t.refs.customers.NSR}`)).body.data;
    expect(eff.find((e: { kind: string }) => e.kind === "PO_REVIEW").params).toEqual({ unitPriceTolerance: 0, quantityTolerancePct: 0 });
    expect(await t.app.get(FlowConfigService).rulePack("PO_REVIEW", t.refs.customers.MPT!)).toEqual({ unitPriceTolerance: 0, quantityTolerancePct: 2 });

    const updated = await admin.put(`/flow/rule-packs/${override.body.data.id}`, { kind: "PO_REVIEW", name: "北岸 PO 复核", params: { quantityTolerancePct: 1 }, version: override.body.data.version, reason: "客户放宽" });
    expect(updated.body.data.version).toBe(2);
    const stale = await admin.put(`/flow/rule-packs/${override.body.data.id}`, { kind: "PO_REVIEW", name: "x", params: {}, version: 1 });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await admin.get(`/system/snapshots?objectType=rulePack&objectId=${override.body.data.id}`)).body.data).toHaveLength(1);
    expect((await admin.del(`/flow/rule-packs/${base.body.data.id}`)).body.errcode).toBe("FLOW_RULEPACK_DEFAULT_LOCKED");
    expect((await admin.del(`/flow/rule-packs/${override.body.data.id}`)).status).toBe(200);
    expect((await admin.get("/flow/rule-packs?kind=PO_REVIEW")).body.data.total).toBe(1);
    const gm = await t.as("gm");
    expect((await gm.post("/flow/rule-packs", { kind: "QUOTE", name: "报价", params: {} })).status).toBe(201);
    const sales = await t.as("sales");
    expect((await sales.get("/flow/rule-packs")).status).toBe(403);
  });
});
