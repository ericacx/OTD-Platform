import { domainEvents, handoverPackages, quoteStrategies, quotes, sampleLibrary, sampleRounds, samples, styles, testReportLinks, testReports, todos } from "@otd/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { systemContext } from "../../core/access/access.types.js";
import { Scheduler } from "../../core/scheduler.js";
import { FlowConfigService } from "../flow/flow-config.service.js";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { HandoverService } from "./handover.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

async function styleRow(styleNo: string, code: string) {
  return (await t.db.select().from(styles).where(and(eq(styles.styleNo, styleNo), eq(styles.customerId, t.refs.customers[code]!))))[0]!;
}

async function clearDevData(styleId: string) {
  const sampleIds = (await t.db.select({ id: samples.id }).from(samples).where(eq(samples.styleId, styleId))).map((s) => s.id);
  if (sampleIds.length) await t.db.delete(sampleRounds).where(inArray(sampleRounds.sampleId, sampleIds));
  await t.db.delete(samples).where(eq(samples.styleId, styleId));
  await t.db.delete(testReportLinks).where(eq(testReportLinks.styleId, styleId));
  await t.db.delete(testReports).where(eq(testReports.styleId, styleId));
  await t.db.delete(sampleLibrary).where(eq(sampleLibrary.styleId, styleId));
  await t.db.delete(handoverPackages).where(eq(handoverPackages.styleId, styleId));
}

function owned(style: { ownerId: string; orgId: string; customerId: string }) {
  return { ownerId: style.ownerId, orgId: style.orgId, customerId: style.customerId };
}

async function approveSample(style: Awaited<ReturnType<typeof styleRow>>) {
  const sample = (await t.db.insert(samples).values({ docNo: `SP-TEST-${style.styleNo}`, styleId: style.id, ...owned(style) }).returning())[0]!;
  await t.db.insert(sampleRounds).values({ sampleId: sample.id, roundNo: 2, roundType: "SMS", status: "APPROVED" });
}

async function addReport(style: Awaited<ReturnType<typeof styleRow>>, validUntil: string) {
  await t.db.insert(testReports).values({ docNo: `RPT-TEST-${style.styleNo}`, agencyReportNo: "BV-26-10523", styleId: style.id, result: "PASS", issuedDate: "2026-10-10", validUntil, ...owned(style) });
}

describe("handover G1", () => {
  it("lists missing items, blocks completion, then hands over and freezes once all five are in", async () => {
    const style = await styleRow("12810", "NSR");
    await clearDevData(style.id);
    const sales = await t.as("sales");
    const manager = await t.as("manager");

    const created = await sales.post("/handovers", { styleId: style.id });
    expect(created.status).toBe(201);
    const h = created.body.data;
    expect(h.docNo).toMatch(/^DH-2610-\d{3}$/);
    expect(h.status).toBe("COLLECTING");
    expect(h.checklist.map((c: { ok: boolean }) => c.ok)).toEqual([false, false, false, false, false]);
    expect((await sales.post("/handovers", { styleId: style.id })).body.errcode).toBe("DOCUMENT_HANDOVER_EXISTS");

    const blocked = await manager.post(`/handovers/${h.id}/complete`, { version: h.version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errcode).toBe("FLOW_GATE_BLOCKED");
    expect(blocked.body.errParams?.gate).toBe("G1");
    expect(blocked.body.errParams?.missingKeys).toEqual(["样品已批准", "报价已被客户接受", "测试报告有效", "QRS 品质参考样已留存", "技术资料包已上传"]);

    await approveSample(style);
    await addReport(style, "2027-10-10");
    const ps1 = (await t.db.select().from(quoteStrategies).where(eq(quoteStrategies.code, "PS-001")))[0]!;
    const quote = (await sales.post("/quotes", { styleId: style.id, strategyId: ps1.id, targetPriceUsd: 2.9, targetFx: 6.72, costItems: [{ category: "OTHER", name: "合计", amount: 16.09 }] })).body.data;
    const quoted = (await sales.post(`/quotes/${quote.id}/rounds`, { kind: "CUSTOMER", quantity: 12000, priceCny: 19.31, version: quote.version })).body.data;
    const round = quoted.latestCustomerRound;
    expect((await sales.post(`/quotes/${quote.id}/rounds/${round.id}/feedback`, { result: "ACCEPTED", version: round.version })).status).toBe(200);
    const upload = await sales.upload("/files", { filename: "12810 技术资料包.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4 tech pack") });
    expect(upload.status).toBe(201);
    const withPack = await sales.post(`/handovers/${h.id}/tech-pack`, { fileId: upload.body.data.id, version: h.version });
    expect(withPack.status).toBe(200);
    expect(withPack.body.data.techPackFile.filename).toBe("12810 技术资料包.pdf");

    const partial = (await sales.get(`/handovers/${h.id}`)).body.data;
    expect(partial.missing).toEqual(["QRS 品质参考样已留存"]);
    expect(partial.checklist.find((c: { key: string }) => c.key === "quoteAccepted").ref).toBe("QT-12810-01");
    expect((await manager.post(`/handovers/${h.id}/complete`, { version: partial.version })).body.errParams?.missingKeys).toEqual(["QRS 品质参考样已留存"]);

    await t.db.insert(sampleLibrary).values({ styleId: style.id, kind: "QRS", location: "样品间 B-02", quantity: 2, ...owned(style) });
    const ready = (await sales.get(`/handovers/${h.id}`)).body.data;
    expect(ready.ready).toBe(true);
    expect([ready.okCount, ready.applicableCount]).toEqual([5, 5]);

    expect((await sales.post(`/handovers/${h.id}/complete`, { version: ready.version })).status).toBe(403);
    expect((await manager.post(`/handovers/${h.id}/complete`, { version: ready.version - 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const done = await manager.post(`/handovers/${h.id}/complete`, { version: ready.version });
    expect(done.status).toBe(200);
    const d = done.body.data;
    expect(d.status).toBe("HANDED_OVER");
    expect(d.frozenAt).toBe("2026-10-21T01:00:00.000Z");
    expect(d.completedByName).toBe("李强");
    expect(d.snapshot).toMatchObject({ styleNo: "12810", quoteDocNo: "QT-12810-01", techPackFileId: upload.body.data.id, conditions: ["sampleApproved", "quoteAccepted", "testReportValid", "qrsRetained", "techPackUploaded"] });
    expect(d.snapshot.reportIds).toHaveLength(1);
    expect(d.snapshot.qrsLibraryId).toBeTruthy();
    const events = await t.db.select().from(domainEvents).where(and(eq(domainEvents.type, "document.handover.completed"), eq(domainEvents.aggregateId, h.id)));
    expect(events).toHaveLength(1);

    expect((await manager.post(`/handovers/${h.id}/complete`, { version: d.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await sales.post(`/handovers/${h.id}/tech-pack`, { fileId: upload.body.data.id, version: d.version })).body.errcode).toBe("DOCUMENT_HANDOVER_FROZEN");
    const q = (await sales.get(`/quotes/${quote.id}`)).body.data;
    expect((await sales.put(`/quotes/${quote.id}`, { note: "改价", version: q.version })).body.errcode).toBe("QUOTE_FROZEN");

    expect((await sales.post(`/handovers/${h.id}/change`, { reason: "客户改罗口颜色", version: d.version })).status).toBe(403);
    const changed = await manager.post(`/handovers/${h.id}/change`, { reason: "客户改罗口颜色", version: d.version });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ status: "COLLECTING", frozenAt: null });
    expect(changed.body.data.changeLog).toEqual([{ at: "2026-10-21T01:00:00.000Z", by: manager.userId, byName: "李强", reason: "客户改罗口颜色" }]);
    expect(changed.body.data.snapshot.quoteDocNo).toBe("QT-12810-01");
    expect((await manager.post(`/handovers/${h.id}/change`, { reason: "再次变更", version: changed.body.data.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("re-evaluates the test report item against the clock", async () => {
    const style = await styleRow("12132", "PLF");
    await clearDevData(style.id);
    const admin = await t.as("admin");
    const h = (await admin.post("/handovers", { styleId: style.id })).body.data;
    await addReport(style, "2026-10-25");
    const service = t.app.get(HandoverService);
    const before = await service.get(systemContext(), h.id);
    expect(before.checklist.find((c) => c.key === "testReportValid")).toMatchObject({ ok: true, note: "有效期至 2026-10-25" });
    t.clock.set("2026-10-26T01:00:00Z");
    const after = await service.get(systemContext(), h.id);
    expect(after.checklist.find((c) => c.key === "testReportValid")).toMatchObject({ ok: false, note: "没有在有效期内且合格的测试报告" });
  });

  it("marks conditions trimmed by the customer flow as not applicable and does not block on them", async () => {
    const style = await styleRow("11152", "BBY");
    await clearDevData(style.id);
    const conditions = await t.app.get(FlowConfigService).gateConditions(style.customerId, "G1", null);
    expect(conditions).not.toContain("testReportValid");
    const admin = await t.as("admin");
    const h = (await admin.post("/handovers", { styleId: style.id })).body.data;
    const test = h.checklist.find((c: { key: string }) => c.key === "testReportValid");
    expect(test).toMatchObject({ applicable: false, ok: false, note: "不适用（客户流程未启用）" });
    expect(h.missing).not.toContain("测试报告有效");
    expect(h.applicableCount).toBe(conditions.length);

    await approveSample(style);
    await t.db.insert(sampleLibrary).values({ styleId: style.id, kind: "QRS", location: "样品间 C-01", ...owned(style) });
    const upload = await admin.upload("/files", { filename: "11152 工艺单.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4 x") });
    const withPack = (await admin.post(`/handovers/${h.id}/tech-pack`, { fileId: upload.body.data.id, version: h.version })).body.data;
    expect(withPack.ready).toBe(true);
    const done = await admin.post(`/handovers/${h.id}/complete`, { version: withPack.version });
    expect(done.status).toBe(200);
    expect(done.body.data.snapshot.conditions).toEqual(conditions);
    expect(done.body.data.checklist.find((c: { key: string }) => c.key === "testReportValid").applicable).toBe(false);
  });

  it("creates a handover package automatically when a customer accepts a quote", async () => {
    const style = await styleRow("11737", "CKD");
    await clearDevData(style.id);
    const sales4 = await t.as("sales4");
    const ps1 = (await t.db.select().from(quoteStrategies).where(eq(quoteStrategies.code, "PS-001")))[0]!;
    const quote = (await sales4.post("/quotes", { styleId: style.id, strategyId: ps1.id, costItems: [{ category: "OTHER", name: "合计", amount: 5 }] })).body.data;
    const quoted = (await sales4.post(`/quotes/${quote.id}/rounds`, { kind: "CUSTOMER", quantity: 10000, priceCny: 6.5, version: quote.version })).body.data;
    await sales4.post(`/quotes/${quote.id}/rounds/${quoted.latestCustomerRound.id}/feedback`, { result: "ACCEPTED", version: quoted.latestCustomerRound.version });
    const rows = await t.db.select().from(handoverPackages).where(eq(handoverPackages.styleId, style.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "COLLECTING", ownerId: sales4.userId });
    expect((await t.db.select().from(quotes).where(eq(quotes.styleId, style.id)))[0]!.status).toBe("ACCEPTED");
  });
});

describe("handover demo data, scope and reminders", () => {
  it("shows #11506 handed over and #12593 collecting without QRS", async () => {
    await t.db.delete(sampleLibrary).where(and(eq(sampleLibrary.styleId, (await styleRow("12593", "NSR")).id), eq(sampleLibrary.kind, "QRS")));
    const sales = await t.as("sales");
    const list = (await sales.get("/handovers?pageSize=50")).body.data;
    const byStyle = Object.fromEntries(list.items.map((i: { styleNo: string }) => [i.styleNo, i]));
    expect(byStyle["11506"].status).toBe("HANDED_OVER");
    expect(byStyle["11506"].checklist.every((c: { ok: boolean }) => c.ok)).toBe(true);
    const h12593 = byStyle["12593"];
    expect(h12593.status).toBe("COLLECTING");
    expect(h12593.missing).toContain("QRS 品质参考样已留存");
    expect(h12593.checklist.find((c: { key: string }) => c.key === "techPackUploaded").ok).toBe(true);
    expect((await sales.get("/handovers?status=HANDED_OVER")).body.data.items.map((i: { styleNo: string }) => i.styleNo)).toEqual(["11506"]);
  });

  it("returns 403 without permission and 404 outside the data scope", async () => {
    const planner = await t.as("planner");
    expect((await planner.get("/handovers")).status).toBe(403);
    const sales = await t.as("sales");
    const h = (await sales.get("/handovers?keyword=12593")).body.data.items[0];
    const other = await t.as("sales3");
    expect((await other.get(`/handovers/${h.id}`)).status).toBe(404);
    expect((await other.get("/handovers?keyword=12593")).body.data.total).toBe(0);
    expect((await other.post(`/handovers/${h.id}/tech-pack`, { fileId: h.techPackFile.id, version: h.version })).status).toBe(404);
  });

  it("reminds the owner when a package has been collecting for more than 7 days", async () => {
    expect(t.app.get(Scheduler).list()).toContain("document.handover-stale");
    const result = await t.app.get(HandoverService).remindStale();
    const sales = await t.as("sales");
    const list = (await sales.get("/handovers?pageSize=50")).body.data.items;
    const h11151 = list.find((i: { styleNo: string }) => i.styleNo === "11151");
    const h12593 = list.find((i: { styleNo: string }) => i.styleNo === "12593");
    expect(result.reminded).toContain(h11151.docNo);
    expect(result.reminded).not.toContain(h12593.docNo);
    const todo = (await t.db.select().from(todos).where(eq(todos.fingerprint, `document.handover:${h11151.id}:collecting`)))[0]!;
    expect(todo).toMatchObject({ assigneeId: sales.userId, status: "OPEN", docNo: h11151.docNo });
    expect(todo.title).toBe(`完成开发移交 ${h11151.docNo}`);
  });
});

describe("customer manuals and knowledge base", () => {
  it("lists, searches and edits documents with kind permissions and customer scope", async () => {
    const sales = await t.as("sales");
    const kb = (await sales.get("/kb-documents?kind=KB")).body.data;
    expect(kb.total).toBe(3);
    const manuals = (await sales.get("/kb-documents?kind=MANUAL")).body.data;
    expect(manuals.total).toBe(3);
    expect((await sales.get(`/kb-documents?keyword=${encodeURIComponent("护栏")}`)).body.data.items.map((d: { title: string }) => d.title)).toEqual(["报价护栏与例外审批制度"]);
    expect((await sales.get(`/kb-documents?keyword=${encodeURIComponent("GS1-128")}`)).body.data.items[0].title).toBe("北岸运动 包装手册 FA27");
    expect((await sales.get(`/kb-documents?tag=${encodeURIComponent("FAQ")}`)).body.data.total).toBe(1);

    expect((await sales.post("/kb-documents", { kind: "KB", title: "x" })).status).toBe(403);
    const tech = await t.as("tech");
    const created = await tech.post("/kb-documents", { kind: "MANUAL", title: "素野 包装手册", customerId: t.refs.customers.PLF, tags: ["包装"], content: "每双独立纸卡" });
    expect(created.status).toBe(201);
    expect(created.body.data.customerName).toBe("素野");
    const doc = created.body.data;
    expect((await sales.get(`/kb-documents/${doc.id}`)).status).toBe(404);
    expect((await sales.get("/kb-documents?kind=MANUAL")).body.data.total).toBe(3);

    const updated = await tech.put(`/kb-documents/${doc.id}`, { kind: "MANUAL", title: "素野 包装手册 v2", customerId: t.refs.customers.PLF, tags: ["包装"], content: "每双独立纸卡，外箱 100 双", version: doc.version });
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(doc.version + 1);
    const stale = await tech.put(`/kb-documents/${doc.id}`, { kind: "MANUAL", title: "冲突", version: doc.version });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await (await t.as("quality")).get("/kb-documents")).status).toBe(403);
  });
});
