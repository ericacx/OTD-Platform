import { eq } from "drizzle-orm";
import { styles, testReportLinks, testReports, testRequests } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const QUALITY = "13800000007";
const RESULT_NOTE = "电子档案取号入共享盘并回传客户系统 · 纸质交授检";
const CREW_KEY = { structure: "中筒罗纹", craft: "常规编织", yarn: "32S 精梳棉" };

type ReportSeed = { no: string; issued: number; validUntil?: number; result: "PASS" | "FAIL"; failed?: string; reuseKey?: Record<string, string> };
type TestSeed = {
  key: string;
  styleNo: string;
  po?: string;
  agency: string;
  items: string[];
  stage: "DEV" | "BULK";
  status: "DRAFT" | "AWAITING_SAMPLE" | "TESTING" | "COMPLETED";
  entrust?: "CUSTOMER_PLATFORM" | "FACTORY";
  service?: string;
  standard?: string;
  qty?: number;
  site?: string;
  colorSize?: string;
  factory?: string;
  sent?: number;
  received?: number;
  due?: number;
  completed?: number;
  tracking?: string;
  report?: ReportSeed;
  reuse?: string;
  retestOf?: string;
  corrective?: string;
};

const TESTS: TestSeed[] = [
  {
    key: "11506-dev",
    styleNo: "11506",
    agency: "SGS-NB",
    items: ["COLORFAST", "PILLING"],
    stage: "DEV",
    status: "COMPLETED",
    entrust: "FACTORY",
    service: "常规 · 5 个工作日",
    standard: "GB/T 3920 / GB/T 4802.1",
    qty: 4,
    site: "袜筒部位",
    colorSize: "雾灰 / M",
    factory: "NH5",
    sent: -118,
    received: -117,
    due: -110,
    completed: -110,
    tracking: "SF1029384756",
    report: { no: "SGS-25-9102", issued: -110, result: "PASS", reuseKey: CREW_KEY },
  },
  {
    key: "11151-bulk",
    styleNo: "11151",
    po: "PO0009631",
    agency: "BV-GZ",
    items: ["COLORFAST", "FUNCTIONAL"],
    stage: "BULK",
    status: "COMPLETED",
    entrust: "CUSTOMER_PLATFORM",
    service: "加急 · 2 个工作日",
    standard: "GB/T 3920 / AATCC 61",
    qty: 4,
    site: "袜底部位",
    colorSize: "炭黑 / L",
    factory: "NH5",
    sent: -5,
    received: -4,
    due: -2,
    completed: -1,
    tracking: "SF7710003425",
    report: { no: "BV-26-10523", issued: -1, result: "PASS", reuseKey: { structure: "四分之一袜", craft: "像素提花", yarn: "美丽诺混纺" } },
  },
  {
    key: "11152-bulk",
    styleNo: "11152",
    po: "PO0009412",
    agency: "BV-GZ",
    items: ["COLORFAST"],
    stage: "BULK",
    status: "COMPLETED",
    entrust: "CUSTOMER_PLATFORM",
    service: "常规 · 3 个工作日",
    standard: "GB/T 3920",
    qty: 3,
    site: "袜筒部位",
    colorSize: "薄荷绿 / M",
    factory: "DC1",
    sent: -50,
    received: -49,
    due: -46,
    completed: -46,
    report: { no: "BV-26-09871", issued: -46, result: "PASS" },
  },
  {
    key: "11737-dev",
    styleNo: "11737",
    agency: "ITS-SH",
    items: ["FUNCTIONAL", "FIBER"],
    stage: "DEV",
    status: "COMPLETED",
    entrust: "FACTORY",
    service: "常规 · 5 个工作日",
    standard: "FZ/T 73023 / GB/T 29862",
    qty: 4,
    site: "袜底部位",
    factory: "DC2",
    sent: -352,
    received: -351,
    due: -345,
    completed: -345,
    report: { no: "ITS-25-3307", issued: -345, validUntil: 20, result: "PASS" },
  },
  {
    key: "11063-dev",
    styleNo: "11063",
    agency: "ITS-SH",
    items: ["FIBER", "COLORFAST"],
    stage: "DEV",
    status: "COMPLETED",
    entrust: "FACTORY",
    service: "常规 · 5 个工作日",
    standard: "GB/T 29862 / GB/T 3920",
    qty: 4,
    site: "袜筒部位",
    factory: "DC2",
    sent: -384,
    received: -383,
    due: -377,
    completed: -377,
    report: { no: "ITS-25-2810", issued: -377, validUntil: -12, result: "PASS" },
  },
  {
    key: "12301-dev",
    styleNo: "12301",
    agency: "SGS-HZ",
    items: ["PILLING"],
    stage: "DEV",
    status: "COMPLETED",
    entrust: "FACTORY",
    service: "常规 · 3 个工作日",
    standard: "GB/T 4802.1",
    qty: 4,
    site: "袜筒部位",
    colorSize: "粉色碎花 / M",
    factory: "DC1",
    sent: -10,
    received: -9,
    due: -6,
    completed: -6,
    report: { no: "SGS-26-7741", issued: -6, result: "FAIL", failed: "起毛起球 3 级（要求 ≥3.5 级）" },
    corrective: "主纱改用精梳纱并提高捻度，重新上机后复测",
  },
  { key: "12301-retest", styleNo: "12301", agency: "SGS-HZ", items: ["PILLING"], stage: "DEV", status: "DRAFT", entrust: "FACTORY", service: "常规 · 3 个工作日", standard: "GB/T 4802.1", qty: 4, site: "袜筒部位", factory: "DC1", retestOf: "12301-dev" },
  {
    key: "12750-dev",
    styleNo: "12750",
    agency: "SGS-NB",
    items: ["FIBER", "PH"],
    stage: "DEV",
    status: "TESTING",
    entrust: "FACTORY",
    service: "加急 · 3 个工作日",
    standard: "GB/T 29862 / GB/T 7573",
    qty: 3,
    site: "袜筒部位",
    colorSize: "白红 / L",
    factory: "HP3",
    sent: -23,
    received: -22,
    due: -20,
    tracking: "SF5566778899",
  },
  { key: "11720-bulk", styleNo: "11720", po: "PO0009560", agency: "BV-SX", items: ["FUNCTIONAL"], stage: "BULK", status: "AWAITING_SAMPLE", entrust: "CUSTOMER_PLATFORM", service: "常规 · 5 个工作日", standard: "FZ/T 73023", qty: 4, site: "袜底部位", factory: "DC1", sent: -16, due: -15 },
  { key: "11737-bulk", styleNo: "11737", po: "PO0009702", agency: "ITS-SH", items: ["FUNCTIONAL"], stage: "BULK", status: "AWAITING_SAMPLE", entrust: "CUSTOMER_PLATFORM", service: "常规 · 5 个工作日", standard: "FZ/T 73023", qty: 4, site: "袜底部位", factory: "DC2", sent: -2, due: 0 },
  { key: "12810-reuse", styleNo: "12810", agency: "SGS-NB", items: ["COLORFAST", "PILLING"], stage: "DEV", status: "COMPLETED", completed: -3, reuse: "SGS-25-9102" },
  { key: "12593-dev", styleNo: "12593", agency: "BV-GZ", items: ["COLORFAST", "FUNCTIONAL"], stage: "DEV", status: "DRAFT", entrust: "CUSTOMER_PLATFORM", service: "加急 · 2 个工作日", standard: "GB/T 3920 / AATCC 61", qty: 4, site: "袜底部位", colorSize: "酒红 / M", factory: "DC1" },
];

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

export async function seedTestingDemo(ctx: SeedContext): Promise<void> {
  const quality = ctx.user(QUALITY);
  const requestIds: Record<string, string> = {};
  const reportIds: Record<string, string> = {};
  for (const t of TESTS) {
    const styleId = ctx.styles[t.styleNo];
    if (!styleId) continue;
    const style = (await ctx.db.select().from(styles).where(eq(styles.id, styleId)))[0]!;
    const createdOffset = t.sent ?? t.completed ?? -1;
    const createdAt = ctx.at(createdOffset - 1, 2);
    const docNo = await ctx.docNo("testRequest", createdAt);
    const reused = t.reuse ? reportIds[t.reuse] : undefined;
    const row = (
      await ctx.db
        .insert(testRequests)
        .values({
          docNo,
          styleId,
          customerPo: t.po ?? null,
          colorSize: t.colorSize ?? null,
          stage: t.stage,
          entrust: t.entrust ?? null,
          agencyId: ctx.agencies[t.agency] ?? null,
          serviceLevel: t.service ?? null,
          items: t.items,
          standard: t.standard ?? null,
          sampleQty: t.qty ?? null,
          sampleSite: t.site ?? null,
          sentDate: t.sent !== undefined ? ctx.day(t.sent) : null,
          labReceivedDate: t.received !== undefined ? ctx.day(t.received) : null,
          dueDate: t.due !== undefined ? ctx.day(t.due) : null,
          completedDate: t.completed !== undefined ? ctx.day(t.completed) : null,
          trackingNo: t.tracking ?? null,
          senderId: t.stage === "BULK" ? quality : style.ownerId,
          factoryId: t.factory ? (ctx.factories[t.factory] ?? null) : null,
          seasonCode: style.seasonCode,
          status: t.status,
          result: t.report?.result ?? (reused ? "PASS" : null),
          failedItems: t.report?.failed ?? null,
          correctiveAction: t.corrective ?? null,
          resultNote: t.status === "COMPLETED" ? (reused ? `复用报告 ${t.reuse}，无需送测` : RESULT_NOTE) : null,
          submittedAt: t.sent !== undefined && t.status !== "DRAFT" ? ctx.at(t.sent, 3) : null,
          reusedReportId: reused ?? null,
          retestOfId: t.retestOf ? (requestIds[t.retestOf] ?? null) : null,
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: style.ownerId,
          createdAt,
          updatedAt: t.completed !== undefined ? ctx.at(t.completed, 8) : createdAt,
          version: { DRAFT: 1, AWAITING_SAMPLE: 2, TESTING: 3, COMPLETED: 4 }[t.status],
        })
        .returning({ id: testRequests.id })
    )[0]!;
    requestIds[t.key] = row.id;
    if (reused) await ctx.db.insert(testReportLinks).values({ reportId: reused, styleId, createdAt: ctx.at(t.completed ?? 0, 8) }).onConflictDoNothing();
    if (!t.report) continue;
    const issued = ctx.day(t.report.issued);
    const issuedAt = ctx.at(t.report.issued, 8);
    const report = (
      await ctx.db
        .insert(testReports)
        .values({
          docNo: await ctx.docNo("testReport", issuedAt),
          agencyReportNo: t.report.no,
          agencyId: ctx.agencies[t.agency] ?? null,
          styleId,
          items: t.items,
          result: t.report.result,
          failedItems: t.report.failed ?? null,
          issuedDate: issued,
          validUntil: t.report.validUntil !== undefined ? ctx.day(t.report.validUntil) : addMonths(issued, 12),
          reuseKey: t.report.reuseKey ?? {},
          testRequestId: row.id,
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: quality,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        })
        .returning({ id: testReports.id })
    )[0]!;
    reportIds[t.report.no] = report.id;
    await ctx.db.update(testRequests).set({ reportId: report.id }).where(eq(testRequests.id, row.id));
    await ctx.db.insert(testReportLinks).values({ reportId: report.id, styleId, createdAt: issuedAt }).onConflictDoNothing();
  }
}
