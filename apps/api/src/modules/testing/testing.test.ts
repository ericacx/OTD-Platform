import { styles, testAgencies } from "@otd/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

async function styleId(code: string, styleNo: string) {
  return (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers[code]!), eq(styles.styleNo, styleNo))))[0]!.id;
}

async function agency(code: string) {
  return (await t.db.select().from(testAgencies).where(eq(testAgencies.code, code)))[0]!.id;
}

const KEY = { structure: "隐形袜 · 防滑", craft: "硅胶点胶", yarn: "40S/1*2 T80C20" };

async function draft(caller: Caller, styleNo = "12593", extra: Record<string, unknown> = {}) {
  const res = await caller.post("/tests", {
    styleId: await styleId("NSR", styleNo),
    stage: "DEV",
    entrust: "CUSTOMER_PLATFORM",
    agencyId: await agency("BV-GZ"),
    serviceLevel: "加急 · 2 个工作日",
    items: ["COLORFAST", "FUNCTIONAL"],
    standard: "GB/T 3920 / AATCC 61",
    sampleQty: 4,
    sampleSite: "袜底部位",
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

async function report(caller: Caller, styleNo: string, body: Record<string, unknown>) {
  const res = await caller.post("/tests/reports", { styleId: await styleId("NSR", styleNo), agencyId: await agency("SGS-NB"), items: ["COLORFAST", "FUNCTIONAL"], result: "PASS", issuedDate: "2026-06-01", reuseKey: KEY, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

describe("test requests", () => {
  it("runs draft → awaiting sample → testing → completed with a report, todos and permissions", async () => {
    const sales = await t.as("sales");
    const quality = await t.as("quality");
    const d = await draft(sales);
    expect(d.docNo).toMatch(/^TST-2610-\d{3}$/);
    expect(d).toMatchObject({ status: "DRAFT", styleNo: "12593", customerName: "北岸运动", agencyName: "BV 广州", ownerName: "王芳", senderName: "王芳", seasonCode: "FA27" });
    expect(d.steps.map((s: { state: string }) => s.state)).toEqual(["ACTIVE", "PENDING", "PENDING", "PENDING"]);

    const submitted = await sales.post(`/tests/${d.id}/submit`, { trackingNo: "SF1234567890", version: d.version });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: "AWAITING_SAMPLE", sentDate: "2026-10-21", trackingNo: "SF1234567890" });
    const s = submitted.body.data;
    expect((await sales.post(`/tests/${d.id}/receive`, { version: s.version })).status).toBe(403);
    expect((await quality.post(`/tests/${d.id}/complete`, { result: "PASS", report: { agencyReportNo: "X", issuedDate: "2026-10-21" }, version: s.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const received = await quality.post(`/tests/${d.id}/receive`, { version: s.version });
    expect(received.body.data).toMatchObject({ status: "TESTING", labReceivedDate: "2026-10-21", dueDate: "2026-10-23" });
    expect((await quality.post(`/tests/${d.id}/receive`, { version: s.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const board = (await quality.get("/todos/board")).body.data;
    expect([...board.overdue, ...board.today, ...board.later].some((x: { docId: string; action: string }) => x.docId === d.id && x.action === "testing.request.report")).toBe(true);

    const r = received.body.data;
    expect((await sales.post(`/tests/${d.id}/complete`, { result: "PASS", report: { agencyReportNo: "BV-T-0001", issuedDate: "2026-10-23" }, version: r.version })).status).toBe(403);
    const bad = await quality.post(`/tests/${d.id}/complete`, { result: "PASS", report: { agencyReportNo: "BV-T-0001", issuedDate: "2026-10-23", validUntil: "2026-10-01" }, version: r.version });
    expect(bad.body.errcode).toBe("TESTING_VALIDITY_INVALID");
    const done = await quality.post(`/tests/${d.id}/complete`, { result: "PASS", report: { agencyReportNo: "BV-T-0001", issuedDate: "2026-10-23", reuseKey: KEY }, version: r.version });
    expect(done.status).toBe(200);
    const c = done.body.data;
    expect(c).toMatchObject({ status: "COMPLETED", result: "PASS", completedDate: "2026-10-21" });
    expect(c.report).toMatchObject({ agencyReportNo: "BV-T-0001", validUntil: "2027-10-23", status: "VALID", agencyName: "BV 广州", testRequestDocNo: d.docNo });
    expect(c.report.docNo).toMatch(/^RPT-2610-\d{3}$/);
    expect(c.steps.map((x: { state: string }) => x.state)).toEqual(["DONE", "DONE", "DONE", "DONE"]);
    expect(c.steps[3].description).toContain("电子档案取号入共享盘");
    expect(c.relatedReports.map((x: { id: string }) => x.id)).toContain(c.report.id);
    const after = (await quality.get("/todos/board")).body.data;
    expect([...after.overdue, ...after.today, ...after.later].some((x: { docId: string }) => x.docId === d.id)).toBe(false);
    const notes = (await sales.get("/notifications")).body.data.items;
    expect(notes.some((n: { title: string }) => n.title.includes(d.docNo))).toBe(true);
    expect((await quality.post(`/tests/${d.id}/complete`, { result: "PASS", report: { agencyReportNo: "BV-T-0002", issuedDate: "2026-10-23" }, version: c.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    const other = await t.as("sales3");
    expect((await other.get(`/tests/${d.id}`)).status).toBe(404);
    expect((await other.get("/tests?pageSize=200")).body.data.items.some((x: { id: string }) => x.id === d.id)).toBe(false);
    expect((await other.get(`/tests/reports/${c.report.id}`)).status).toBe(404);
    expect((await (await t.as("tech")).post("/tests", { styleId: d.styleId, items: ["PH"] })).status).toBe(403);
    expect((await sales.get(`/tests?keyword=${d.docNo}`)).body.data.items.map((x: { id: string }) => x.id)).toEqual([d.id]);
    expect((await sales.get("/tests?keyword=色牢度&pageSize=200")).body.data.items.some((x: { id: string }) => x.id === d.id)).toBe(true);
  });

  it("matches reusable reports item by item and completes a request by reuse", async () => {
    const quality = await t.as("quality");
    const sales = await t.as("sales");
    const r1 = await report(quality, "12593", { agencyReportNo: "T-R1" });
    const r2 = await report(quality, "12810", { agencyReportNo: "T-R2", items: ["COLORFAST"] });
    const r3 = await report(quality, "11506", { agencyReportNo: "T-R3", result: "FAIL", failedItems: "起毛起球 3 级" });
    const r4 = await report(quality, "12593", { agencyReportNo: "T-R4", issuedDate: "2025-09-30", validUntil: "2026-09-30" });
    const r5 = await report(quality, "11506", { agencyReportNo: "T-R5", reuseKey: { structure: "中筒罗纹", craft: "常规", yarn: "32S 精梳棉" } });

    const res = await sales.post("/tests/reuse-check", { styleId: await styleId("NSR", "12810"), items: ["COLORFAST", "FUNCTIONAL"], reuseKey: KEY });
    expect(res.status).toBe(200);
    const check = res.body.data;
    const byId = new Map(check.candidates.map((c: { report: { id: string } }) => [c.report.id, c]));
    expect(byId.get(r1.id)).toMatchObject({ sameCustomer: true, sameStyle: false, sameStructure: true, sameCraft: true, sameYarn: true, inValidity: true, passed: true, missingItems: [], reusable: true });
    expect(byId.get(r2.id)).toMatchObject({ sameStyle: true, reusable: false, missingItems: ["FUNCTIONAL"], reasons: ["未覆盖：功能性检测"] });
    expect(byId.get(r3.id)).toMatchObject({ passed: false, reusable: false, reasons: ["结论不合格"] });
    expect(byId.get(r4.id)).toMatchObject({ inValidity: false, reusable: false });
    expect(byId.has(r5.id)).toBe(false);
    expect(check.bestReportId).toBe(r1.id);
    expect(check.candidates[0].report.id).toBe(r1.id);
    expect(check.coverage).toEqual([
      { item: "COLORFAST", reportId: r1.id, reportDocNo: r1.docNo },
      { item: "FUNCTIONAL", reportId: r1.id, reportDocNo: r1.docNo },
    ]);

    const rejected = await sales.post("/tests", { styleId: await styleId("NSR", "12810"), items: ["COLORFAST", "FUNCTIONAL"], reuseReportId: r3.id, reuseKey: KEY });
    expect(rejected.body.errcode).toBe("TESTING_REPORT_NOT_REUSABLE");

    const reused = await draft(sales, "12810", { reuseReportId: r1.id, reuseKey: KEY });
    expect(reused).toMatchObject({ status: "COMPLETED", result: "PASS", completedDate: "2026-10-21" });
    expect(reused.reusedReport.id).toBe(r1.id);
    expect(reused.steps.every((x: { state: string }) => x.state === "DONE")).toBe(true);
    expect(reused.relatedReports.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([r1.id, r2.id]));
    const linked = (await sales.get(`/tests/reports/${r1.id}`)).body.data;
    expect(linked.linkedStyles.map((x: { styleNo: string }) => x.styleNo)).toEqual(["12593", "12810"]);

    const derived = (await sales.post("/tests/reuse-check", { styleId: await styleId("NSR", "12593"), items: ["COLORFAST"] })).body.data;
    expect(derived.reuseKey).toEqual(KEY);
  });

  it("computes report validity status from the clock and the expiring-days parameter", async () => {
    const quality = await t.as("quality");
    const valid = await report(quality, "12593", { agencyReportNo: "ST-VALID", issuedDate: "2026-03-01", validUntil: "2027-01-28" });
    const expiring = await report(quality, "12593", { agencyReportNo: "ST-EXPIRING", issuedDate: "2025-11-01", validUntil: "2026-10-31" });
    const today = await report(quality, "12593", { agencyReportNo: "ST-TODAY", issuedDate: "2025-10-21", validUntil: "2026-10-21" });
    const expired = await report(quality, "12593", { agencyReportNo: "ST-EXPIRED", issuedDate: "2025-10-20", validUntil: "2026-10-20" });
    expect(valid).toMatchObject({ status: "VALID", daysToExpire: 99 });
    expect(expiring).toMatchObject({ status: "EXPIRING", daysToExpire: 10 });
    expect(today).toMatchObject({ status: "EXPIRING", daysToExpire: 0 });
    expect(expired).toMatchObject({ status: "EXPIRED", daysToExpire: -1 });
    const ids = (status: string) => quality.get(`/tests/reports?keyword=ST-&status=${status}`).then((r) => r.body.data.items.map((x: { agencyReportNo: string }) => x.agencyReportNo).sort());
    expect(await ids("EXPIRING")).toEqual(["ST-EXPIRING", "ST-TODAY"]);
    expect(await ids("EXPIRED")).toEqual(["ST-EXPIRED"]);
    expect(await ids("VALID")).toEqual(["ST-VALID"]);
    expect(await ids("VALID,EXPIRED")).toEqual(["ST-EXPIRED", "ST-VALID"]);

    const updated = await quality.put(`/tests/reports/${expired.id}`, { validUntil: "2027-10-20", version: expired.version });
    expect(updated.body.data).toMatchObject({ status: "VALID" });
    expect((await quality.put(`/tests/reports/${expired.id}`, { validUntil: "2027-10-21", version: expired.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await (await t.as("sales")).put(`/tests/reports/${valid.id}`, { validUntil: "2027-10-21", version: valid.version })).status).toBe(403);
    expect((await quality.post("/tests/reports", { styleId: await styleId("NSR", "12593"), items: ["PH"], result: "PASS", issuedDate: "2026-01-01", agencyReportNo: "ST-VALID" })).body.errcode).toBe("TESTING_DUPLICATE_REPORT");
  });

  it("lets a failed test be retested as a new linked request", async () => {
    const sales = await t.as("sales");
    const quality = await t.as("quality");
    const d = await draft(sales, "12593", { items: ["PILLING"] });
    const s = (await sales.post(`/tests/${d.id}/submit`, { version: d.version })).body.data;
    const r = (await quality.post(`/tests/${d.id}/receive`, { labReceivedDate: "2026-10-21", dueDate: "2026-10-28", version: s.version })).body.data;
    expect(r.dueDate).toBe("2026-10-28");
    const failed = (await quality.post(`/tests/${d.id}/complete`, { result: "FAIL", failedItems: "起毛起球 3 级（要求 ≥3.5 级）", correctiveAction: "改用精梳纱并加捻", report: { agencyReportNo: "SGS-T-7741", issuedDate: "2026-10-21" }, version: r.version })).body.data;
    expect(failed).toMatchObject({ result: "FAIL", failedItems: "起毛起球 3 级（要求 ≥3.5 级）", correctiveAction: "改用精梳纱并加捻" });
    expect(failed.report).toMatchObject({ result: "FAIL", failedItems: "起毛起球 3 级（要求 ≥3.5 级）" });
    expect((await sales.post(`/tests/${d.id}/retest`, { version: failed.version - 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const retest = await sales.post(`/tests/${d.id}/retest`, { version: failed.version });
    expect(retest.status).toBe(201);
    expect(retest.body.data).toMatchObject({ status: "DRAFT", items: ["PILLING"], retestOf: { id: d.id, docNo: d.docNo } });
    expect((await sales.get(`/tests/${d.id}`)).body.data.retests.map((x: { id: string }) => x.id)).toEqual([retest.body.data.id]);

    const ok = await draft(sales, "12593", { items: ["PH"], reuseReportId: null });
    expect((await sales.post(`/tests/${ok.id}/retest`, { version: ok.version })).body.errcode).toBe("TESTING_RETEST_NOT_ALLOWED");
    const edited = await sales.put(`/tests/${ok.id}`, { customerPo: "PO0010459", version: ok.version });
    expect(edited.body.data.customerPo).toBe("PO0010459");
  });

  it("seeds demo test records and reports with valid, expiring, expired and failed reports", async () => {
    const gm = await t.as("gm");
    const reports = (await gm.get("/tests/reports?pageSize=50")).body.data.items;
    const by = (no: string) => reports.find((x: { agencyReportNo: string }) => x.agencyReportNo === no);
    expect(by("BV-26-10523")).toMatchObject({ status: "VALID", result: "PASS", styleNo: "11151" });
    expect(by("ITS-25-3307")).toMatchObject({ status: "EXPIRING", daysToExpire: 20 });
    expect(by("ITS-25-2810")).toMatchObject({ status: "EXPIRED", daysToExpire: -12 });
    expect(by("SGS-26-7741")).toMatchObject({ result: "FAIL" });
    expect(by("SGS-25-9102").linkedStyles.map((x: { styleNo: string }) => x.styleNo)).toEqual(["11506", "12810"]);
    const tests = (await gm.get("/tests?pageSize=50")).body.data;
    expect(tests.total).toBeGreaterThanOrEqual(10);
    const overdue = tests.items.filter((x: { overdue: boolean }) => x.overdue).map((x: { styleNo: string }) => x.styleNo).sort();
    expect(overdue).toEqual(["11720", "12750"]);
    const retest = tests.items.find((x: { retestOf: unknown }) => x.retestOf);
    expect(retest).toMatchObject({ styleNo: "12301", status: "DRAFT" });
    expect(tests.items.find((x: { reusedReport: unknown }) => x.reusedReport)).toMatchObject({ styleNo: "12810", status: "COMPLETED" });
  });
});
