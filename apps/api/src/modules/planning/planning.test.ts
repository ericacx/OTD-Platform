import { deflateSync } from "node:zlib";
import { PRODUCT_ATTR_KEYS } from "@otd/contracts/planning";
import { aiUsage, files, plannings, styles } from "@otd/db";
import { and, eq } from "drizzle-orm";
import { AiUsageRecorder } from "../../core/ai/ai-usage.recorder.js";
import { offlinePlanningExtract } from "../../core/ai/offline-planning.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

const PDF = { filename: "NSR_12812_FA27_Argyle.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4\n1 0 obj << >>\nendobj\n%%EOF") };

const f = (value: string | null, confidence = 0.95) => ({ value, confidence: value === null ? 0 : confidence, source: value ? `Tech Pack: ${value}` : null, page: value ? 1 : null });

function extraction(over: Record<string, ReturnType<typeof f>> = {}) {
  return {
    fields: {
      nameZh: f("提花菱格中筒袜"),
      nameEn: f("Argyle Jacquard Crew"),
      customerName: f("NorthShore"),
      styleNo: f("#12812"),
      seasonCode: f("FA27"),
      category: f("WOMEN"),
      subCategory: f("CREW"),
      sizeRange: f("S / M / L"),
      defaultSize: f("M", 0.55),
      needleCount: f("144N"),
      sockWeight: f("Light 薄款", 0.7),
      requiredSampleDate: f("2026-11-30"),
      supplier: f(null),
      buyerName: f(null),
      designer: f("Mia"),
      ...over,
    },
    productAttrs: PRODUCT_ATTR_KEYS.map((key) => (key === "cuff" ? { key, original: "Hidden cuff", translated: "隐藏式罗口", confidence: 0.9, page: 2 } : { key, original: null, translated: null, confidence: 0, page: null })),
    briefTranslation: "女款中筒提花袜，144 针，菱格提花，隐藏式罗口。",
  };
}

async function importBrief(caller: Caller, fields: Record<string, string> = {}) {
  return caller.upload("/plannings/import", PDF, { customerId: t.refs.customers.NSR!, ...fields });
}

describe("planning (briefs)", () => {
  it("imports a PDF, extracts fields with confidence and keeps prefilled values", async () => {
    t.ai.onExtract("planning.extract", (req) => {
      expect(req.document?.contentType).toBe("application/pdf");
      expect(req.userId).toBeTruthy();
      return extraction();
    });
    const sales = await t.as("sales");
    const res = await importBrief(sales, { nameZh: "菱格提花中筒袜" });
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(p.docNo).toMatch(/^BR-2610-\d{3}$/);
    expect(p.status).toBe("EXTRACTED");
    expect(p.customerName).toBe("北岸运动");
    expect(p.nameZh).toBe("菱格提花中筒袜");
    expect(p.extraction.nameZh).toMatchObject({ value: "菱格提花中筒袜", confidence: 1 });
    expect(p.styleNo).toBe("12812");
    expect(p.seasonCode).toBe("FA27");
    expect(p.needleCount).toBe("144N");
    expect(p.extraction.styleNo).toMatchObject({ confidence: 0.95, page: 1 });
    expect(p.lowConfidenceFields.sort()).toEqual(["defaultSize", "sockWeight"]);
    expect(p.productAttrs).toHaveLength(8);
    expect(p.productAttrs.find((a: { key: string }) => a.key === "cuff")).toMatchObject({ labelZh: "罗口", labelEn: "Cuff", original: "Hidden cuff", translated: "隐藏式罗口" });
    expect(p.productAttrs.find((a: { key: string }) => a.key === "heel")).toMatchObject({ original: null, translated: null });
    expect(p.briefTranslation).toContain("菱格提花");
    expect(p.sourceFile.filename).toBe(PDF.filename);
  });

  it("marks recognition failures and lets the user retry", async () => {
    const sales = await t.as("sales");
    const res = await importBrief(sales);
    expect(res.status).toBe(201);
    const failed = res.body.data;
    expect(failed.status).toBe("RECOGNITION_FAILED");
    expect(failed.recognitionError).toContain("planning.extract");
    expect((await sales.post(`/plannings/${failed.id}/confirm`, { version: failed.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    t.ai.onExtract("planning.extract", () => extraction());
    expect((await sales.post(`/plannings/${failed.id}/recognize`, { version: failed.version - 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const retried = await sales.post(`/plannings/${failed.id}/recognize`, { version: failed.version });
    expect(retried.status).toBe(200);
    expect(retried.body.data).toMatchObject({ status: "EXTRACTED", styleNo: "12812", recognitionError: null });
    expect((await sales.post(`/plannings/${failed.id}/recognize`, { version: retried.body.data.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    const admin = await t.as("admin");
    const actions = (await admin.get(`/system/audit-logs?keyword=${failed.docNo}`)).body.data.items.map((l: { action: string }) => l.action).sort();
    expect(actions).toEqual(["planning.planning.extracted", "planning.planning.import", "planning.planning.recognitionFailed", "planning.planning.retry"]);
  });

  it("confirms a brief: creates the style and issues the first PROTO sampling round", async () => {
    t.ai.onExtract("planning.extract", () => extraction({ nameZh: f(null), seasonCode: f(null) }));
    const sales = await t.as("sales");
    const p = (await importBrief(sales)).body.data;
    const incomplete = await sales.post(`/plannings/${p.id}/confirm`, { version: p.version });
    expect(incomplete.body.errcode).toBe("PLANNING_CONFIRM_INCOMPLETE");
    expect(incomplete.body.errParams?.missing).toEqual(["中文名称", "季节"]);

    const edited = await sales.put(`/plannings/${p.id}`, { nameZh: "提花菱格中筒袜", seasonCode: "FA27", defaultSize: "M", productAttrs: { heel: { original: "Y-heel", translated: "Y 型袜跟" } }, version: p.version });
    expect(edited.status).toBe(200);
    expect(edited.body.data.extraction.defaultSize).toMatchObject({ value: "M", confidence: 1, source: "人工确认" });
    expect(edited.body.data.extraction.nameZh).toMatchObject({ value: "提花菱格中筒袜", confidence: 1, source: "人工修改" });
    expect(edited.body.data.lowConfidenceFields).toEqual(["sockWeight"]);
    expect(edited.body.data.productAttrs.find((a: { key: string }) => a.key === "heel")).toMatchObject({ original: "Y-heel", translated: "Y 型袜跟" });

    const confirmed = await sales.post(`/plannings/${p.id}/confirm`, { version: edited.body.data.version });
    expect(confirmed.status).toBe(200);
    const c = confirmed.body.data;
    expect(c.status).toBe("CONFIRMED");
    expect(c.confirmedAt).toBe("2026-10-21T01:00:00.000Z");
    expect(c.confirmedByName).toBe("王芳");
    expect(c.sample.docNo).toMatch(/^SP-2610-\d{3}$/);
    const style = (await t.db.select().from(styles).where(eq(styles.id, c.styleId)))[0]!;
    expect(style).toMatchObject({ styleNo: "12812", nameZh: "提花菱格中筒袜", productCode: "NSR12812-FA27", seasonCode: "FA27" });

    const sample = (await sales.get(`/samples/${c.sample.id}`)).body.data;
    expect(sample).toMatchObject({ planningDocNo: c.docNo, styleNo: "12812", dueDate: "2026-11-30", technicianName: "陈静" });
    expect(sample.rounds).toHaveLength(1);
    expect(sample.rounds[0]).toMatchObject({ roundNo: 1, roundType: "PROTO", status: "ISSUED", quantity: 6 });
    const techBoard = (await (await t.as("tech")).get("/todos/board")).body.data;
    expect([...techBoard.overdue, ...techBoard.today, ...techBoard.later].some((x: { docId: string }) => x.docId === sample.id)).toBe(true);

    expect((await sales.post(`/plannings/${p.id}/confirm`, { version: c.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const after = await sales.put(`/plannings/${p.id}`, { nameEn: "Argyle Jacquard Crew Sock", version: c.version });
    expect(after.status).toBe(200);
    expect((await sales.put(`/plannings/${p.id}`, { styleNo: "99999", version: after.body.data.version })).body.errcode).toBe("PLANNING_NOT_EDITABLE");
    const admin = await t.as("admin");
    const logs = (await admin.get(`/system/audit-logs?keyword=${c.docNo}`)).body.data.items;
    const changed = logs.find((l: { action: string }) => l.action === "planning.planning.updateConfirmed");
    expect(changed.diff.nameEn).toEqual({ from: "Argyle Jacquard Crew", to: "Argyle Jacquard Crew Sock" });
    expect((await t.db.select().from(styles).where(eq(styles.id, c.styleId)))[0]!.nameEn).toBe("Argyle Jacquard Crew Sock");
  });

  it("links to an existing style of the same customer and style number", async () => {
    t.ai.onExtract("planning.extract", () => extraction({ styleNo: f("12593") }));
    const sales = await t.as("sales");
    const p = (await importBrief(sales)).body.data;
    const c = (await sales.post(`/plannings/${p.id}/confirm`, { version: p.version, roundType: "COLOR", quantity: 4 })).body.data;
    const existing = (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers.NSR!), eq(styles.styleNo, "12593"))))[0]!;
    expect(c.styleId).toBe(existing.id);
    const sample = (await sales.get(`/samples/${c.sample.id}`)).body.data;
    expect(sample.rounds[0]).toMatchObject({ roundType: "COLOR", quantity: 4 });
  });

  it("creates briefs manually, enforces permissions and data scope, archives", async () => {
    const sales = await t.as("sales");
    const tech = await t.as("tech");
    expect((await tech.upload("/plannings/import", PDF, { customerId: t.refs.customers.NSR! })).status).toBe(403);
    expect((await tech.post("/plannings", { customerId: t.refs.customers.NSR!, nameZh: "x" })).status).toBe(403);

    const manual = await sales.post("/plannings", { customerId: t.refs.customers.NSR!, styleNo: "#12900", nameZh: "手工新建款", seasonCode: "sp27" });
    expect(manual.status).toBe(201);
    expect(manual.body.data).toMatchObject({ status: "EXTRACTED", styleNo: "12900", seasonCode: "SP27", extraction: null, lowConfidenceFields: [] });
    const id = manual.body.data.id;

    const other = await t.as("sales3");
    expect((await other.get(`/plannings/${id}`)).status).toBe(404);
    expect((await other.get("/plannings?pageSize=200")).body.data.items.some((x: { id: string }) => x.id === id)).toBe(false);
    expect((await other.put(`/plannings/${id}`, { nameZh: "x", version: 1 })).status).toBe(404);
    expect((await (await t.as("manager")).get(`/plannings/${id}`)).status).toBe(200);
    expect((await tech.get(`/plannings/${id}`)).status).toBe(200);

    const list = (await sales.get("/plannings?keyword=12900")).body.data;
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([id]);
    expect((await sales.get("/plannings?keyword=北岸&pageSize=200")).body.data.items.some((x: { id: string }) => x.id === id)).toBe(true);

    const archived = await sales.post(`/plannings/${id}/archive`, { version: manual.body.data.version });
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe("ARCHIVED");
    expect((await sales.post(`/plannings/${id}/archive`, { version: archived.body.data.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await sales.put(`/plannings/${id}`, { nameZh: "y", version: archived.body.data.version })).body.errcode).toBe("PLANNING_NOT_EDITABLE");
    expect((await sales.get("/plannings?keyword=12900")).body.data.total).toBe(0);
    expect((await sales.get("/plannings/archived?keyword=12900")).body.data.items.map((x: { id: string }) => x.id)).toEqual([id]);
    expect((await tech.get("/plannings/archived")).status).toBe(403);
  });

  it("rejects unsupported files", async () => {
    const sales = await t.as("sales");
    const res = await sales.upload("/plannings/import", { filename: "a.csv", contentType: "text/csv", data: Buffer.from("a,b") }, { customerId: t.refs.customers.NSR! });
    expect(res.body.errcode).toBe("PLANNING_FILE_UNSUPPORTED");
    const missing = await sales.upload("/plannings/import", PDF, {});
    expect(missing.body.errcode).toBe("COMMON_VALIDATION_FAILED");
  });

  it("seeds demo briefs matching the prototype list", async () => {
    const gm = await t.as("gm");
    const list = (await gm.get("/plannings?pageSize=50")).body.data;
    expect(list.total).toBe(9);
    const by = (no: string) => list.items.find((x: { styleNo: string }) => x.styleNo === no);
    expect(by("12810")).toMatchObject({ status: "RECOGNIZING", nameZh: null });
    expect(list.items[0].styleNo).toBe("12810");
    const extracted = by("12701");
    expect(extracted.status).toBe("EXTRACTED");
    expect(extracted.lowConfidenceFields.sort()).toEqual(["defaultSize", "requiredSampleDate", "sockWeight"]);
    const confirmed = (await gm.get(`/plannings/${by("12593").id}`)).body.data;
    expect(confirmed).toMatchObject({ status: "CONFIRMED", needleCount: "144N", customerName: "北岸运动" });
    expect(confirmed.sample.docNo).toMatch(/^SP-/);
    expect(confirmed.productAttrs.find((a: { key: string }) => a.key === "heel").translated).toBe("踵部防滑硅胶点");
    const archived = (await gm.get("/plannings/archived")).body.data.items.map((x: { styleNo: string }) => x.styleNo).sort();
    expect(archived).toEqual(["11151", "11152", "11506"]);
    const sales = await t.as("sales");
    const mine = (await sales.get("/plannings?pageSize=50")).body.data.items.map((x: { styleNo: string }) => x.styleNo).sort();
    expect(mine).toEqual(["12301", "12593", "12810"]);
  });

  it("fails recognition instead of stranding the brief when the source file cannot be read", async () => {
    const sales = await t.as("sales");
    const failed = (await importBrief(sales)).body.data;
    await t.db.delete(files).where(eq(files.id, failed.sourceFile.id));
    t.ai.onExtract("planning.extract", () => extraction());
    const retried = await sales.post(`/plannings/${failed.id}/recognize`, { version: failed.version });
    expect(retried.status).toBe(200);
    expect(retried.body.data.status).toBe("RECOGNITION_FAILED");
    expect(retried.body.data.recognitionError).toContain("原件读取失败");

    const manual = await sales.post(`/plannings/${failed.id}/manual`, { version: retried.body.data.version });
    expect(manual.body.data.status).toBe("EXTRACTED");

    const stuck = (await t.db.select().from(plannings).where(and(eq(plannings.styleNo, "12810"), eq(plannings.status, "RECOGNIZING"))))[0]!;
    const rerun = await sales.post(`/plannings/${stuck.id}/recognize`, { version: stuck.version });
    expect(rerun.status).toBe(200);
    expect(rerun.body.data).toMatchObject({ status: "EXTRACTED", styleNo: "12810" });
  });

  it("demos offline: the rule-based extractor reads the PDF text layer through the import API", async () => {
    t.ai.onExtract("planning.extract", offlinePlanningExtract);
    const lines = ["Customer: NorthShore", "Style No: 12812", "Style Name: Argyle Jacquard Crew", "Season: Fall 2027", "Women's Crew", "Needle Count: 144N", "Sizes: S / M / L", "Proto Due: 2026-11-30", "Cuff: Hidden cuff"];
    const ops = lines.map((l, i) => `BT /F1 12 Tf 72 ${720 - i * 16} Td (${l}) Tj ET`).join("\n");
    const stream = deflateSync(Buffer.from(ops, "latin1"));
    const data = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), stream, Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
    const sales = await t.as("sales");
    const res = await sales.upload("/plannings/import", { filename: "argyle.pdf", contentType: "application/pdf", data }, { customerId: t.refs.customers.NSR! });
    expect(res.body.data).toMatchObject({ status: "EXTRACTED", styleNo: "12812", seasonCode: "FA27", category: "WOMEN", subCategory: "CREW", needleCount: "144N", nameEn: "Argyle Jacquard Crew", requiredSampleDate: "2026-11-30", nameZh: null });
    expect(res.body.data.lowConfidenceFields).toContain("styleNo");
    expect(res.body.data.productAttrs.find((a: { key: string }) => a.key === "cuff").original).toBe("Hidden cuff");
  });

  it("records AI token usage in ai_usage", async () => {
    const recorder = t.app.get(AiUsageRecorder, { strict: false });
    const sales = await t.as("sales");
    await recorder.record({ purpose: "planning.extract", model: "claude-opus-5-5", userId: sales.userId, inputTokens: 1200, outputTokens: 340 });
    const rows = await t.db.select().from(aiUsage).where(eq(aiUsage.userId, sales.userId));
    expect(rows.map((r) => [r.purpose, r.model, r.inputTokens, r.outputTokens])).toEqual([["planning.extract", "claude-opus-5-5", 1200, 340]]);
  });

  it("lists visible styles for pickers", async () => {
    const sales = await t.as("sales");
    const mine = (await sales.get("/styles?keyword=125")).body.data;
    expect(mine.map((s: { styleNo: string }) => s.styleNo)).toEqual(["12593"]);
    expect(mine[0]).toMatchObject({ customerName: "北岸运动", productCode: "NSR12593-FA27" });
    expect((await (await t.as("sales3")).get("/styles?keyword=12593")).body.data).toEqual([]);
    expect((await (await t.as("quality")).get("/styles?limit=200")).body.data.length).toBeGreaterThanOrEqual(15);
    expect((await (await t.as("planner")).get("/styles")).status).toBe(403);
  });
});
