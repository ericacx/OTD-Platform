import { and, eq, isNotNull } from "drizzle-orm";
import { plannings, sampleLibrary, sampleMaterials, sampleRounds, sampleStageLogs, samples, styles } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const HOUR = 3_600_000;
const TECH = "13800000006";

type Step = [status: string, hours: number];
type RoundSeed = { type: string; qty: number; steps: Step[]; endAgoHours?: number; note?: string; reviseNote?: string };
type MaterialSeed = { name: string; spec: string; qty: number; unit: string; supplier: string; arrival: number; arrived: boolean };
type LibrarySeed = { kind: "QRS" | "RETAIN" | "SEALED" | "SHIPMENT"; location: string; qty: number; lentTo?: string; lentAgo?: number };
type SampleSeed = {
  styleNo: string;
  factory: string;
  colorway: string;
  size: string;
  due: number;
  customerRef?: string;
  yarn?: string;
  craft?: string;
  notes?: string;
  cost?: string;
  rounds: RoundSeed[];
  materials?: MaterialSeed[];
  library?: LibrarySeed[];
};

const FULL = (qc: number, approvalHours: number, last: "APPROVED" | "REVISE"): Step[] => [
  ["ISSUED", 10],
  ["RECEIVING", 8],
  ["SOURCING", 36],
  ["KNITTING", 22],
  ["QC", qc],
  ["READY", 8],
  ["AWAITING_APPROVAL", approvalHours],
  [last, 0],
];

const SAMPLES: SampleSeed[] = [
  {
    styleNo: "12593",
    factory: "DC1",
    colorway: "酒红",
    size: "M",
    due: 34,
    customerRef: "SR0006192 - FA27 - Flow 2 Protos",
    yarn: "主纱：40S/1*2 T80C20 纱线；里纱：70D 锦纶包覆纱；橡筋：1207070",
    craft: "袜底点胶 18 点防滑；隐形袜口内贴硅胶条；无缝袜头；散点花卉 4 色提花",
    notes: "PROTO ｜ 6 双 ｜ 酒红 ｜ 按 TP 核对后上机",
    cost: "COST_REVIEW",
    rounds: [
      {
        type: "PROTO",
        qty: 6,
        endAgoHours: 3,
        steps: [
          ["ISSUED", 20],
          ["RECEIVING", 6],
          ["SOURCING", 30],
          ["KNITTING", 12],
          ["QC", 6],
          ["KNITTING", 8],
          ["QC", 22.8],
          ["READY", 0],
        ],
      },
    ],
    materials: [
      { name: "40S/1*2 T80C20 纱线", spec: "酒红 · 主纱", qty: 2.4, unit: "kg", supplier: "华茂纱业", arrival: -4, arrived: true },
      { name: "70D 锦纶包覆纱", spec: "里纱", qty: 0.8, unit: "kg", supplier: "恒力化纤", arrival: -4, arrived: true },
      { name: "硅胶防滑点", spec: "踵部 · 18 点", qty: 12, unit: "双", supplier: "联达辅料", arrival: -5, arrived: true },
    ],
  },
  {
    styleNo: "12744",
    factory: "DC1",
    colorway: "柠檬黄 / 白",
    size: "S",
    due: 12,
    customerRef: "CKD-FA27-0412",
    yarn: "主纱：32S 精梳棉；橡筋：1207070",
    craft: "翻口 3cm；袜底点胶防滑；小鸟图案 5 色提花",
    notes: "PROTO ｜ 6 双 ｜ 第 2 轮按客户意见改样",
    rounds: [
      { type: "PROTO", qty: 6, endAgoHours: 72, steps: FULL(20, 96, "REVISE") },
      {
        type: "PROTO",
        qty: 6,
        reviseNote: "翻口高度加 0.5cm，小鸟图案颜色加深",
        steps: [
          ["ISSUED", 14],
          ["RECEIVING", 8],
          ["SOURCING", 40],
          ["KNITTING", 0],
        ],
      },
    ],
    materials: [{ name: "32S 精梳棉", spec: "柠檬黄", qty: 1.6, unit: "kg", supplier: "华茂纱业", arrival: -1, arrived: true }],
  },
  {
    styleNo: "12301",
    factory: "DC1",
    colorway: "粉色碎花",
    size: "M",
    due: 20,
    yarn: "主纱：70D 锦纶包覆纱；花边：涤纶蕾丝",
    craft: "花边罗口；手缝袜头",
    notes: "PROTO ｜ 6 双",
    rounds: [
      {
        type: "PROTO",
        qty: 6,
        endAgoHours: 30,
        steps: [
          ["ISSUED", 12],
          ["RECEIVING", 6],
          ["SOURCING", 0],
        ],
      },
    ],
    materials: [
      { name: "70D 锦纶包覆纱", spec: "粉色", qty: 1.2, unit: "kg", supplier: "恒力化纤", arrival: -1, arrived: true },
      { name: "涤纶蕾丝花边", spec: "1.5cm 宽", qty: 20, unit: "米", supplier: "联达辅料", arrival: 2, arrived: false },
    ],
  },
  {
    styleNo: "12603",
    factory: "NH5",
    colorway: "黑色",
    size: "22-24",
    due: -1,
    customerRef: "PLF-PP-12603",
    yarn: "主纱：200N 精梳棉 / 锦纶",
    craft: "后跟硅胶条；船袜口包边",
    notes: "PP ｜ 12 双 ｜ 产前确认",
    rounds: [{ type: "PP", qty: 12, endAgoHours: 6 * 24 + 4, steps: [["ISSUED", 10], ["RECEIVING", 8], ["SOURCING", 36], ["KNITTING", 20], ["QC", 20], ["READY", 30], ["AWAITING_APPROVAL", 0]] }],
  },
  { styleNo: "12610", factory: "DC2", colorway: "宝蓝 / 白", size: "L", due: -6, notes: "颜色样 ｜ 4 双", rounds: [{ type: "COLOR", qty: 4, endAgoHours: 9 * 24 + 2, steps: [["ISSUED", 0]] }] },
  { styleNo: "12740", factory: "DC1", colorway: "樱花粉", size: "S", due: -7, notes: "颜色样 ｜ 4 双", rounds: [{ type: "COLOR", qty: 4, endAgoHours: 10 * 24 + 5, steps: [["ISSUED", 0]] }] },
  {
    styleNo: "12750",
    factory: "HP3",
    colorway: "白 / 红",
    size: "L",
    due: -30,
    craft: "撞色罗口；半毛圈缓冲",
    notes: "PROTO ｜ 6 双",
    rounds: [{ type: "PROTO", qty: 6, endAgoHours: 40 * 24, steps: FULL(16, 72, "APPROVED") }],
    library: [{ kind: "QRS", location: "样品间 C-01-2", qty: 2 }],
  },
  {
    styleNo: "11506",
    factory: "NH5",
    colorway: "雾灰",
    size: "M",
    due: -110,
    yarn: "主纱：32S 精梳棉；橡筋：1207070",
    craft: "1×1 罗纹；常规编织",
    notes: "SMS ｜ 12 双",
    rounds: [
      { type: "SMS", qty: 12, endAgoHours: 118 * 24, steps: FULL(18, 100, "REVISE") },
      { type: "SMS", qty: 12, reviseNote: "罗纹密度不足，袜口回弹偏松", steps: FULL(16, 70, "APPROVED") },
    ],
    library: [
      { kind: "QRS", location: "样品间 A-03-2", qty: 2 },
      { kind: "SHIPMENT", location: "样品间 A-03-3", qty: 3 },
    ],
  },
  { styleNo: "11151", factory: "NH5", colorway: "炭黑 / 金", size: "L", due: -150, notes: "PROTO ｜ 6 双", rounds: [{ type: "PROTO", qty: 6, endAgoHours: 150 * 24, steps: FULL(20, 80, "APPROVED") }], library: [{ kind: "QRS", location: "样品间 B-01-1", qty: 2 }] },
  { styleNo: "11152", factory: "DC1", colorway: "薄荷绿", size: "M", due: -140, notes: "PROTO ｜ 6 双", rounds: [{ type: "PROTO", qty: 6, endAgoHours: 140 * 24, steps: FULL(18, 60, "APPROVED") }], library: [{ kind: "QRS", location: "样品间 B-02-4", qty: 2 }] },
  {
    styleNo: "11720",
    factory: "DC1",
    colorway: "石楠棕（新色）",
    size: "L",
    due: -50,
    notes: "老款新色 ｜ 颜色样 4 双",
    rounds: [{ type: "COLOR", qty: 4, endAgoHours: 55 * 24, steps: FULL(20, 48, "APPROVED") }],
    library: [{ kind: "RETAIN", location: "样品间 A-05-1", qty: 2, lentTo: "王芳", lentAgo: 2 }],
  },
  { styleNo: "11063", factory: "DC2", colorway: "黑色碎花", size: "M", due: -65, notes: "PROTO ｜ 6 双", rounds: [{ type: "PROTO", qty: 6, endAgoHours: 70 * 24, steps: FULL(24, 60, "APPROVED") }] },
  { styleNo: "11737", factory: "DC2", colorway: "石楠灰", size: "S", due: -60, notes: "PROTO ｜ 6 双", rounds: [{ type: "PROTO", qty: 6, endAgoHours: 65 * 24, steps: FULL(22, 50, "APPROVED") }] },
  { styleNo: "12132", factory: "HP3", colorway: "燕麦色", size: "M", due: -75, notes: "PROTO ｜ 6 双", rounds: [{ type: "PROTO", qty: 6, endAgoHours: 80 * 24, steps: FULL(18, 72, "APPROVED") }] },
];

const FACTORY_NAMES: Record<string, string> = { DC1: "东城一厂", DC2: "东城二厂", NH5: "南湖五厂", HP3: "海防三厂" };
const TERMINAL = new Set(["APPROVED", "REVISE"]);

function timeline(steps: Step[], lastAt: Date): Date[] {
  const times = new Array<Date>(steps.length);
  times[steps.length - 1] = lastAt;
  for (let i = steps.length - 2; i >= 0; i--) times[i] = new Date(times[i + 1]!.getTime() - steps[i]![1] * HOUR);
  return times;
}

function forward(steps: Step[], start: Date): Date[] {
  const times: Date[] = [start];
  for (let i = 1; i < steps.length; i++) times.push(new Date(times[i - 1]!.getTime() + steps[i - 1]![1] * HOUR));
  return times;
}

export async function seedSampleDemo(ctx: SeedContext): Promise<void> {
  const tech = ctx.user(TECH);
  for (const s of SAMPLES) {
    const styleId = ctx.styles[s.styleNo];
    if (!styleId) continue;
    const style = (await ctx.db.select().from(styles).where(eq(styles.id, styleId)))[0]!;
    const planning = (await ctx.db.select().from(plannings).where(and(eq(plannings.styleId, styleId), isNotNull(plannings.confirmedAt))))[0];
    const factoryId = ctx.factories[s.factory] ?? null;
    const location = `${FACTORY_NAMES[s.factory] ?? s.factory} · 打样中心`;

    const plans: { round: RoundSeed; times: Date[] }[] = [];
    let previousEnd: Date | null = null;
    for (const round of s.rounds) {
      const times: Date[] = round.endAgoHours !== undefined ? timeline(round.steps, new Date(ctx.now.getTime() - round.endAgoHours * HOUR)) : forward(round.steps, previousEnd ?? ctx.now);
      plans.push({ round, times });
      previousEnd = times[times.length - 1]!;
    }
    const issuedAt = plans[0]!.times[0]!;
    if (planning) {
      const createdAt = new Date(Math.min(planning.createdAt.getTime(), issuedAt.getTime() - 20 * HOUR));
      await ctx.db.update(plannings).set({ confirmedAt: issuedAt, createdAt, updatedAt: planning.archivedAt ?? issuedAt }).where(eq(plannings.id, planning.id));
    }
    const docNo = await ctx.docNo("sample", issuedAt);
    const sample = (
      await ctx.db
        .insert(samples)
        .values({
          docNo,
          styleId,
          planningId: planning?.id ?? null,
          productCode: style.productCode,
          factoryId,
          teamOrgId: style.orgId,
          location,
          colorway: s.colorway,
          size: s.size,
          dueDate: ctx.day(s.due),
          customerRef: s.customerRef ?? null,
          briefTranslation: planning?.briefTranslation ?? null,
          yarnConfig: s.yarn ?? null,
          craftNotes: s.craft ?? null,
          sampleNotes: s.notes ?? null,
          costStatus: s.cost ?? null,
          technicianId: tech,
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: style.ownerId,
          createdAt: issuedAt,
          updatedAt: previousEnd ?? issuedAt,
        })
        .returning({ id: samples.id })
    )[0]!;

    const roundIds: string[] = [];
    for (const [idx, { round, times }] of plans.entries()) {
      const last = round.steps[round.steps.length - 1]![0];
      const lastAt = times[times.length - 1]!;
      let rework = 0;
      for (let i = 1; i < round.steps.length; i++) if (round.steps[i]![0] === "KNITTING" && round.steps[i - 1]![0] === "QC") rework++;
      const r = (
        await ctx.db
          .insert(sampleRounds)
          .values({
            sampleId: sample.id,
            roundNo: idx + 1,
            roundType: round.type,
            quantity: round.qty,
            status: last,
            stageEnteredAt: lastAt,
            reworkCount: rework,
            dueDate: ctx.day(s.due),
            issuedAt: times[0]!,
            approvalResult: TERMINAL.has(last) ? last : null,
            approvalDate: TERMINAL.has(last) ? lastAt.toISOString().slice(0, 10) : null,
            approvalNote: last === "APPROVED" ? "客户确认通过" : last === "REVISE" ? (s.rounds[idx + 1]?.reviseNote ?? "需改样") : null,
            approvedAt: last === "APPROVED" ? lastAt : null,
            reviseNote: round.reviseNote ?? null,
            createdBy: style.ownerId,
            createdAt: times[0]!,
            updatedAt: lastAt,
            version: round.steps.length,
          })
          .returning({ id: sampleRounds.id })
      )[0]!;
      roundIds.push(r.id);
      for (const [i, [stage]] of round.steps.entries()) {
        const enteredAt = times[i]!;
        const leftAt = i < round.steps.length - 1 ? times[i + 1]! : null;
        const sales = stage === "AWAITING_APPROVAL" || TERMINAL.has(stage) || stage === "ISSUED";
        await ctx.db.insert(sampleStageLogs).values({
          roundId: r.id,
          stage,
          enteredAt,
          leftAt,
          durationHours: leftAt ? Math.round(((leftAt.getTime() - enteredAt.getTime()) / HOUR) * 100) / 100 : null,
          location: sales ? null : location,
          factoryId,
          operatorId: sales ? style.ownerId : tech,
          note: stage === "KNITTING" && i > 0 && round.steps[i - 1]![0] === "QC" ? "质检不过：袜底防滑点位置偏移，重打" : null,
        });
      }
    }

    for (const m of s.materials ?? []) {
      await ctx.db.insert(sampleMaterials).values({
        sampleId: sample.id,
        materialName: m.name,
        spec: m.spec,
        quantity: m.qty,
        unit: m.unit,
        supplier: m.supplier,
        arrivalDate: ctx.day(m.arrival),
        arrivedAt: m.arrived ? ctx.at(m.arrival, 6) : null,
        status: m.arrived ? "ARRIVED" : "PENDING",
        createdBy: tech,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      });
    }

    const approvedRound = roundIds[roundIds.length - 1] ?? null;
    for (const l of s.library ?? []) {
      await ctx.db.insert(sampleLibrary).values({
        styleId,
        sampleId: sample.id,
        roundId: approvedRound,
        kind: l.kind,
        location: l.location,
        quantity: l.qty,
        status: l.lentTo ? "LENT" : "IN_STOCK",
        borrower: l.lentTo ?? null,
        lentAt: l.lentAgo !== undefined ? ctx.at(-l.lentAgo, 2) : null,
        note: l.kind === "QRS" ? "品质参考样，开发移交留存" : null,
        ownerId: style.ownerId,
        orgId: style.orgId,
        customerId: style.customerId,
        createdBy: tech,
        createdAt: previousEnd ?? issuedAt,
        updatedAt: previousEnd ?? issuedAt,
      });
    }
  }
}
