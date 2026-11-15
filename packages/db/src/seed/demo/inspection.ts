import { eq } from "drizzle-orm";
import { customerOrders, inspectionLogs, inspections, users } from "../../schema/index.js";
import type { InspectionRoundRecord, RuleCheckItem } from "../../schema/orders.js";
import type { SeedContext } from "./context.js";

type Step = [offset: number, action: string, from: string | null, to: string, note: string];

type DemoInspection = {
  po: string;
  style: string;
  stage: "IPI" | "DPI" | "FRI";
  status: string;
  planned: number | null;
  actual?: number;
  exFactoryOffset?: number;
  inspector?: string;
  channel: string;
  method: string;
  sample?: [planned: number, actual: number, defects: number];
  rounds?: [result: "PASS" | "FAIL", actual: number, defects: number, note: string | null, action: string | null][];
  preconditions?: string[];
  warningDays?: number;
  aql?: string;
  notApplicable?: string[];
  steps: Step[];
};

const NOT_APPLICABLE = "不适用（客户流程未启用）";

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const RELEASE_CHECK: RuleCheckItem[] = [
  { key: "finalPassed", label: { zh: "终验结论合格", en: "Final inspection passed" }, passed: true, detail: "尾验第 1 轮合格" },
  { key: "reportsValid", label: { zh: "测试报告在有效期内且合格", en: "Test reports valid" }, passed: true, detail: "BV-26-10523 · 有效" },
  { key: "packingReady", label: { zh: "包装方案已确认且装箱齐套", en: "Packing confirmed & complete" }, passed: true, detail: "包装方案已确认 · 装箱单齐套" },
];

const DEMO: DemoInspection[] = [
  {
    po: "PO0009631",
    style: "11151",
    stage: "IPI",
    status: "INSPECTED",
    planned: -50,
    actual: -50,
    inspector: "张磊",
    channel: "本厂 CFA",
    method: "本厂认证 CFA",
    sample: [80, 80, 0],
    rounds: [["PASS", -50, 0, null, null]],
    steps: [[-55, "create", null, "TO_SCHEDULE", "IPI 验货申请"], [-53, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"], [-50, "result", "SCHEDULED", "INSPECTED", "第 1 轮合格 · 不合格率 0.0%"]],
  },
  {
    po: "PO0009631",
    style: "11151",
    stage: "DPI",
    status: "INSPECTED",
    planned: -5,
    actual: -4,
    inspector: "张磊",
    channel: "Inspectorio",
    method: "认证 QC 代检",
    sample: [315, 315, 7],
    rounds: [
      ["FAIL", -12, 11, "对色不符", "换片后复验"],
      ["FAIL", -4, 7, "对色不符", "换片重缝并全检"],
    ],
    preconditions: ["尺寸表", "纱线测试结果", "封样扣样"],
    steps: [
      [-20, "create", null, "TO_SCHEDULE", "DPI 验货申请"],
      [-18, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"],
      [-12, "result", "SCHEDULED", "INSPECTED", "第 1 轮不合格（对色不符） · 不合格率 3.5%"],
      [-11, "rework", "INSPECTED", "REWORK", "发起第 2 轮复验；整改措施：换片后复验"],
      [-4, "result", "REWORK", "INSPECTED", "第 2 轮复验不合格（对色不符） · 不合格率 2.2%"],
    ],
  },
  {
    po: "PO0009631",
    style: "11151",
    stage: "FRI",
    status: "TO_SCHEDULE",
    planned: null,
    channel: "Inspectorio",
    method: "认证 QC 代检",
    preconditions: ["尺寸表", "纱线测试结果", "封样扣样"],
    steps: [[-3, "create", null, "TO_SCHEDULE", "FRI 验货申请"]],
  },
  {
    po: "PO0009412",
    aql: "AQL 2.5 Level II",
    style: "11152",
    stage: "FRI",
    status: "RELEASED",
    planned: -16,
    actual: -16,
    inspector: "刘洋",
    channel: "本厂 CFA",
    method: "本厂认证 CFA",
    sample: [200, 200, 1],
    rounds: [["PASS", -16, 1, null, null]],
    notApplicable: ["reportsValid"],
    steps: [
      [-20, "create", null, "TO_SCHEDULE", "FRI 验货申请"],
      [-19, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"],
      [-16, "result", "SCHEDULED", "INSPECTED", "第 1 轮合格 · 不合格率 0.5%"],
      [-15, "release", "INSPECTED", "RELEASED", "G2 三条件满足"],
    ],
  },
  {
    po: "PO0009702",
    aql: "AQL 1.0 Level II",
    style: "11737",
    stage: "DPI",
    status: "SCHEDULED",
    planned: 2,
    inspector: "刘洋",
    channel: "QIMA",
    method: "第三方验货",
    sample: [200, 0, 0],
    steps: [[-4, "create", null, "TO_SCHEDULE", "DPI 验货申请"], [-2, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"]],
  },
  {
    po: "PO0009560",
    style: "11720",
    stage: "FRI",
    status: "SCHEDULED",
    planned: 1,
    inspector: "张磊",
    channel: "Inspectorio",
    method: "认证 QC 代检",
    sample: [315, 0, 0],
    warningDays: 10,
    steps: [[-6, "create", null, "TO_SCHEDULE", "FRI 验货申请"], [-5, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"]],
  },
  {
    po: "PO0009690",
    style: "11063",
    stage: "IPI",
    status: "SCHEDULED",
    planned: -1,
    inspector: "张磊",
    channel: "本厂 CFA",
    method: "本厂认证 CFA",
    sample: [80, 0, 0],
    steps: [[-5, "create", null, "TO_SCHEDULE", "IPI 验货申请"], [-4, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"]],
  },
  {
    po: "PO0009745",
    aql: "AQL 1.0 Level I",
    style: "12132",
    stage: "FRI",
    status: "RELEASED",
    planned: -42,
    actual: -42,
    inspector: "阮文雄",
    channel: "本厂 CFA",
    method: "本厂认证 CFA",
    sample: [200, 200, 0],
    rounds: [["PASS", -42, 0, null, null]],
    steps: [[-46, "create", null, "TO_SCHEDULE", "FRI 验货申请"], [-45, "schedule", "TO_SCHEDULE", "SCHEDULED", "计划验货日"], [-42, "result", "SCHEDULED", "INSPECTED", "第 1 轮合格 · 不合格率 0.0%"], [-41, "release", "INSPECTED", "RELEASED", "G2 三条件满足"]],
  },
];

export async function seedInspectionDemo(ctx: SeedContext): Promise<void> {
  for (const d of DEMO) {
    const orderId = ctx.orders[d.po];
    const styleId = ctx.styles[d.style];
    if (!orderId || !styleId) continue;
    const order = (await ctx.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0];
    if (!order) continue;
    const ownerName = (await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, order.ownerId)))[0]?.name ?? null;
    const exFactory = order.factoryReplyDate ?? order.customerDueDate;
    const rounds: InspectionRoundRecord[] = (d.rounds ?? []).map(([result, actual, defects, note, action], i) => ({
      roundNo: i + 1,
      result,
      actualDate: ctx.day(actual),
      actualSampleQty: d.sample?.[1] ?? null,
      defectQty: defects,
      defectRate: d.sample?.[1] ? Math.round((defects / d.sample[1]) * 10000) / 10000 : null,
      defectNote: note,
      correctiveAction: action,
      recordedAt: ctx.at(actual, 10).toISOString(),
      recordedBy: d.inspector ?? null,
    }));
    const last = rounds[rounds.length - 1];
    const createdAt = ctx.at(d.steps[0]![0], 9);
    const docNo = await ctx.docNo("inspection", createdAt);
    const released = d.status === "RELEASED";
    const row = (
      await ctx.db
        .insert(inspections)
        .values({
          docNo,
          orderId,
          styleId,
          color: "Black",
          stage: d.stage,
          roundNo: Math.max(1, rounds.length),
          factoryId: order.factoryId,
          plannedDate: d.planned === null ? null : ctx.day(d.planned),
          actualDate: last?.actualDate ?? null,
          plannedExFactory: exFactory,
          method: d.method,
          inspector: d.inspector ?? null,
          channel: d.channel,
          aql: d.aql ?? "AQL 1.5 Level I",
          granularity: "PO + 款号 + SKU + 尺码",
          orderQty: order.totalPairs,
          cartonCount: d.status === "RELEASED" ? Math.ceil(order.totalPairs / 120) : null,
          productionRate: d.stage === "FRI" || d.status === "RELEASED" ? 1 : d.stage === "DPI" ? 0.6 : 0.15,
          packingRate: d.status === "RELEASED" ? 1 : null,
          plannedSampleQty: d.sample?.[0] ?? null,
          actualSampleQty: last ? (d.sample?.[1] ?? null) : null,
          defectQty: last?.defectQty ?? null,
          defectRate: last?.defectRate ?? null,
          preconditions: d.preconditions ?? [],
          requirements: d.stage === "FRI" ? "同 PO 同款合并一份报告、齐色齐码；工厂交期前 15 天完成" : "本阶段只记录验货结果，放行以 FINAL / FRI / FQC 阶段为准",
          result: last?.result ?? null,
          defectNote: last?.defectNote ?? null,
          correctiveAction: last?.correctiveAction ?? null,
          status: d.status,
          releasedAt: released ? ctx.at(d.steps[d.steps.length - 1]![0], 15) : null,
          releasedBy: released ? ctx.user("13800000007") : null,
          releaseCheck: released ? RELEASE_CHECK.map((c) => (d.notApplicable?.includes(c.key) ? { ...c, detail: NOT_APPLICABLE } : c)) : null,
          scheduleWarning: d.warningDays && d.planned !== null ? `终验计划 ${ctx.day(d.planned)} 晚于工厂交期前 ${d.warningDays} 天（${shiftDay(exFactory, -d.warningDays)}）` : null,
          rounds,
          version: d.steps.length,
          ownerId: order.ownerId,
          orgId: order.orgId,
          customerId: order.customerId,
          createdBy: order.ownerId,
          createdAt,
        })
        .returning({ id: inspections.id })
    )[0]!;
    await ctx.db.insert(inspectionLogs).values(
      d.steps.map(([offset, action, from, to, note]) => ({
        inspectionId: row.id,
        at: ctx.at(offset, action === "create" ? 9 : 14),
        action,
        fromStatus: from,
        toStatus: to,
        note: action === "schedule" && d.planned !== null ? `${note} ${ctx.day(d.planned)}` : note,
        operatorId: action === "create" ? order.ownerId : action === "schedule" ? ctx.user("13800000008") : ctx.user("13800000007"),
        operatorName: action === "create" ? ownerName : action === "schedule" ? "孙悦" : "赵敏",
      })),
    );
  }
}
