import { customerFlowVersions, customerFlows, customers, type FlowSnapshot, rulePacks, serviceItems, serviceModules } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const ALL = ["SM01", "SM02", "SM03", "SM04", "SM05", "SM06", "SM07", "SM08", "SM09", "SM10", "SM11", "SM12"];

export const DEMO_FLOW_MODULES: Record<string, string[]> = {
  NSR: ALL,
  MPT: ["SM01", "SM02", "SM03", "SM05", "SM06", "SM07", "SM08", "SM10", "SM11", "SM12"],
  BBY: ["SM01", "SM02", "SM03", "SM04", "SM06", "SM07", "SM08", "SM10", "SM11"],
  MRN: ["SM01", "SM03", "SM04", "SM05", "SM06", "SM07", "SM08", "SM10", "SM11"],
  CKD: ["SM01", "SM02", "SM03", "SM05", "SM06", "SM07", "SM08", "SM10", "SM11"],
  APX: ["SM01", "SM02", "SM03", "SM04", "SM05", "SM06", "SM07", "SM08", "SM10", "SM11"],
  PLF: ["SM01", "SM02", "SM03", "SM04", "SM05", "SM06", "SM07", "SM08", "SM09", "SM10", "SM11"],
  SSH: ["SM01", "SM02", "SM03", "SM04", "SM05", "SM06", "SM07", "SM08", "SM09", "SM10", "SM11"],
};

const OFF_ITEMS: Record<string, Record<string, string[]>> = {
  NSR: { SM05: ["圆率测试"], SM07: ["船样确认"], SM10: ["MU 与 BC 品报告"] },
  MPT: { SM03: ["TSR 概念样", "COLORATION 颜色样"] },
  BBY: { SM03: ["Concept 概念样", "TSR 概念样"], SM10: ["清关资料", "MU 与 BC 品报告"] },
  MRN: { SM05: ["圆率测试"] },
  CKD: { SM05: ["功能性检测"] },
  APX: { SM10: ["MU 与 BC 品报告"] },
  PLF: { SM03: ["照片样"] },
};

const REUSE_STRICT = { sameStructure: true, sameProcess: true, coverItems: true, withinValidity: true, allowCrossStyle: false };

const PARAM_OVERRIDES: Record<string, Record<string, unknown>> = {
  NSR: { releaseDaysBeforeExFactory: 15, sameFactorySameDayLimit: 5, mergeReport: true },
  MPT: { releaseDaysBeforeExFactory: 10, sameFactorySameDayLimit: 6 },
  BBY: { inspectionStages: ["FRI"], aqlLevel: "AQL 2.5 Level II", paymentStartFrom: "INVOICE_DATE", reconciliationDay: 25 },
  MRN: { reportReuse: { ...REUSE_STRICT, allowCrossStyle: true }, releaseDaysBeforeExFactory: 12 },
  CKD: { reportValidityMonths: 6, inspectionStages: ["DPI", "FRI"], aqlLevel: "AQL 1.0 Level II" },
  APX: { paymentStartFrom: "ARRIVAL_DATE", approvalWaitDays: 7 },
  PLF: { aqlLevel: "AQL 1.0 Level I", sameFactorySameDayLimit: 4 },
  SSH: { mergeReport: false },
};

function baseParams(terms: number): Record<string, unknown> {
  return {
    paymentTermsDays: terms,
    paymentStartFrom: "SHIP_DATE",
    reportReuse: REUSE_STRICT,
    reportValidityMonths: 12,
    inspectionStages: ["IPI", "DPI", "FRI"],
    aqlLevel: "AQL 1.5 Level I",
    releaseDaysBeforeExFactory: 15,
    sameFactorySameDayLimit: 5,
    mergeReport: true,
    sampleRoundStuckDays: 7,
    approvalWaitDays: 5,
    reconciliationDay: 5,
  };
}

export async function seedFlowDemo(ctx: SeedContext): Promise<void> {
  const modules = await ctx.db.select().from(serviceModules);
  const items = await ctx.db.select().from(serviceItems);
  const custs = await ctx.db.select({ id: customers.id, code: customers.code, terms: customers.paymentTermsDays }).from(customers);
  const admin = ctx.user("13800000000");
  const moduleByCode = new Map(modules.map((m) => [m.code, m]));

  const build = (off: Record<string, string[]>, order: string[]): FlowSnapshot["modules"] =>
    order.map((moduleCode, i) => {
      const mod = moduleByCode.get(moduleCode)!;
      const own = items.filter((it) => it.moduleId === mod.id).sort((a, b) => a.sort - b.sort);
      const skip = off[moduleCode] ?? [];
      return { moduleCode, sort: i + 1, department: mod.department, items: own.filter((it) => !skip.includes(it.name)).map((it) => ({ itemCode: it.code, effects: it.effects })) };
    });

  for (const c of custs) {
    const order = DEMO_FLOW_MODULES[c.code];
    if (!order) continue;
    const params = { ...baseParams(c.terms), ...(PARAM_OVERRIDES[c.code] ?? {}) };
    const snapshot: FlowSnapshot = { modules: build(OFF_ITEMS[c.code] ?? {}, order), params };
    const version = (
      await ctx.db
        .insert(customerFlowVersions)
        .values({
          customerId: c.id,
          versionNo: 1,
          snapshot,
          summary: { modulesAdded: order, itemsAdded: [], modulesRemoved: [], orderChanged: false, paramsChanged: [], nodesAdded: [], nodesRemoved: [] },
          note: "初始流程配置",
          publishedAt: ctx.at(-45, 10),
          publishedBy: admin,
        })
        .returning({ id: customerFlowVersions.id })
    )[0]!;
    let draft: FlowSnapshot = { modules: snapshot.modules.map((m) => ({ ...m, items: m.items.map((it) => ({ itemCode: it.itemCode })) })), params };
    let status = "PUBLISHED";
    if (c.code === "NSR") {
      const reordered = [...order];
      const a = reordered.indexOf("SM06");
      const b = reordered.indexOf("SM07");
      [reordered[a], reordered[b]] = [reordered[b]!, reordered[a]!];
      const changed = build({ SM07: ["船样确认"], SM10: ["MU 与 BC 品报告"], SM12: ["TNA 同步"] }, reordered);
      draft = { modules: changed.map((m) => ({ ...m, items: m.items.map((it) => ({ itemCode: it.itemCode })) })), params: { ...params, sameFactorySameDayLimit: 4 } };
      status = "DRAFT";
    }
    await ctx.db.insert(customerFlows).values({ customerId: c.id, currentVersionId: version.id, draft, status, createdBy: admin, updatedBy: admin, version: c.code === "NSR" ? 3 : 2 });
  }

  await ctx.db.insert(rulePacks).values([
    {
      code: "RP-PO_REVIEW",
      kind: "PO_REVIEW",
      name: "PO 复核默认规则",
      nameEn: "PO review defaults",
      params: { minLeadDays: 30, priceTolerancePct: 3, quantityTolerancePct: 0, requireStyleLinked: true, requireDueDateFeasible: true, checkPoVsBd: false, requireTradeTermMatch: true },
      description: "N06 PO 复核：单价、数量、款号关联、交期可行性、贸易术语",
      createdBy: admin,
    },
    {
      code: "RP-RELEASE",
      kind: "RELEASE",
      name: "验货放行默认规则",
      nameEn: "Release defaults",
      params: { releaseDaysBeforeExFactory: 15, sameFactorySameDayLimit: 5, mergeReport: false, requireFullColorSize: true, allowBatchRelease: true },
      description: "G2 放行与验货排期",
      createdBy: admin,
    },
    {
      code: "RP-TEST_REUSE",
      kind: "TEST_REUSE",
      name: "测试报告复用默认口径",
      nameEn: "Test report reuse defaults",
      params: { ...REUSE_STRICT, validityMonths: 12, expiringDays: 30 },
      description: "送测前复用校验：同结构 + 同工艺 + 测试项覆盖 + 有效期内",
      createdBy: admin,
    },
    {
      code: "RP-QUOTE",
      kind: "QUOTE",
      name: "报价默认规则",
      nameEn: "Quote defaults",
      params: { defaultStrategy: "PS-001", guardrail: 0.12, lockFx: true, quoteValidDays: 30, maxRounds: 6 },
      description: "报价护栏、锁汇与有效期",
      createdBy: admin,
    },
    {
      code: "RP-RELEASE-NSR",
      kind: "RELEASE",
      name: "北岸运动放行规则",
      nameEn: "NorthShore release rules",
      customerId: ctx.customer("NSR"),
      params: { sameFactorySameDayLimit: 5, mergeReport: true },
      description: "终验在工厂交期前 15 天完成；同 PO 同款合并报告、齐色齐码；同厂同日上限 5 款",
      createdBy: admin,
    },
  ]);
}
