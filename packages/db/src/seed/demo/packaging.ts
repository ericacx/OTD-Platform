import { eq } from "drizzle-orm";
import { cartons, customerOrders, orderLines, packagingPlanVersions, packagingPlans, styles } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const FIELDS = ["title", "method", "pairsPerCarton", "cartonSize", "cartonType", "strength", "shippingMark", "markPosition", "sizeSticker", "sealSticker", "innerBag", "tape", "destination", "requirements"] as const;
type Field = (typeof FIELDS)[number];
type PlanFields = { [K in Field]?: K extends "pairsPerCarton" ? number : K extends "requirements" ? { title: string; content: string }[] : string };

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

type History = { changeNote: string | null; changedBy: string; daysAgo: number; patch: PlanFields; confirmedBy?: string; confirmMethod?: "EMAIL" | "CUSTOMER_SYSTEM" | "OFFLINE"; confirmedDaysAgo?: number };

type PlanSeed = {
  poNo: string;
  style: string;
  base: PlanFields;
  history: History[];
  status: "DRAFT" | "PENDING_CUSTOMER" | "CONFIRMED";
  submittedDaysAgo?: number;
  cartons?: { pack: ("TO_PACK" | "PACKING" | "PACKED")[]; dueOffset: number };
};

const NSR_REQUIREMENTS = [
  { title: "装箱方式", content: "单 SKU 装箱；每箱两袋；卡纸隔层" },
  { title: "1 号箱", content: "1 号箱内放装箱单，箱贴上方贴 PACKING LIST" },
  { title: "尾箱", content: "不足 120 双的尾箱，箱贴上方贴 ODD" },
  { title: "腰封核对", content: "核对订单号、成分、尺码、产地、洗标、RN# 和条码" },
  { title: "尺码贴颜色", content: "与腰封文字一致：419C 黑色或白色；实际颜色待客户确认" },
];

const SALES = "13800000001";

const PLANS: PlanSeed[] = [
  {
    poNo: "PO0010459",
    style: "11506",
    base: {
      title: "Crew · 罗纹中筒袜翻折卡装",
      method: "Crew · 罗纹中筒袜翻折卡装",
      pairsPerCarton: 100,
      cartonSize: "56 × 42 × 38 cm",
      cartonType: "C 型单层瓦楞纸箱",
      strength: "44 ECT",
      shippingMark: "560 × 210 mm",
      markPosition: "纸箱长侧面及短侧面，距底部 2–3cm",
      sizeSticker: "透明底圆形 · 直径 18mm",
      sealSticker: "不封口贴 · 客户指定胶带",
      innerBag: "OPP 平口袋 · 厚度 0.05mm",
      tape: "BOPP 封箱胶带 · 宽 60mm",
      destination: "NSR Hamburg DC",
      requirements: NSR_REQUIREMENTS,
    },
    history: [
      { changeNote: "按客户包装手册生成", changedBy: SALES, daysAgo: 40, patch: {}, confirmedBy: "Milena Ortiz", confirmMethod: "EMAIL", confirmedDaysAgo: 37 },
      { changeNote: "每箱双数 100 → 120（客户要求）", changedBy: SALES, daysAgo: 32, patch: { pairsPerCarton: 120 }, confirmedBy: "Milena Ortiz", confirmMethod: "EMAIL", confirmedDaysAgo: 30 },
      { changeNote: "内袋改 OPP 自立袋 0.06mm", changedBy: SALES, daysAgo: 26, patch: { innerBag: "OPP 自立袋 · 厚度 0.06mm" }, confirmedBy: "Milena Ortiz", confirmMethod: "EMAIL", confirmedDaysAgo: 24 },
    ],
    status: "CONFIRMED",
  },
  {
    poNo: "PO0009631",
    style: "11151",
    base: {
      title: "单双腰封 + 挂钩",
      method: "单双腰封 + 挂钩",
      pairsPerCarton: 120,
      cartonSize: "60 × 40 × 35 cm",
      cartonType: "C 型单层瓦楞纸箱",
      strength: "44 ECT",
      shippingMark: "500 × 200 mm",
      markPosition: "两长侧面居中",
      sizeSticker: "白底方形 · 20 × 20mm",
      sealSticker: "MRN 品牌封口贴",
      innerBag: "无内袋 · 挂钩直挂",
      tape: "透明 BOPP 胶带 · 宽 48mm",
      destination: "MRN Hamburg",
      requirements: [
        { title: "装箱方式", content: "单色单码装箱，挂钩朝同一方向" },
        { title: "尾箱", content: "尾箱用同规格纸箱，空位用卡纸填实" },
      ],
    },
    history: [
      { changeNote: "按客户包装手册生成", changedBy: SALES, daysAgo: 60, patch: {}, confirmedBy: "Jonas Weber", confirmMethod: "CUSTOMER_SYSTEM", confirmedDaysAgo: 55 },
      { changeNote: "每箱双数 120 → 100，挂钩改加厚款", changedBy: SALES, daysAgo: 45, patch: { pairsPerCarton: 100, method: "单双腰封 + 加厚挂钩" }, confirmedBy: "Jonas Weber", confirmMethod: "CUSTOMER_SYSTEM", confirmedDaysAgo: 42 },
    ],
    status: "CONFIRMED",
    cartons: { pack: ["PACKING", "TO_PACK", "TO_PACK"], dueOffset: 6 },
  },
  {
    poNo: "PO0009412",
    style: "11152",
    base: {
      title: "平铺装箱 · 两双装",
      method: "平铺装箱 · 两双装",
      pairsPerCarton: 120,
      cartonSize: "52 × 38 × 30 cm",
      cartonType: "B 型单层瓦楞纸箱",
      strength: "32 ECT",
      shippingMark: "400 × 150 mm",
      markPosition: "一长侧面",
      sizeSticker: "无",
      sealSticker: "蓝湾生活封口贴",
      innerBag: "PE 袋 · 两双一袋",
      tape: "BOPP 封箱胶带 · 宽 48mm",
      destination: "上海仓",
      requirements: [{ title: "装箱方式", content: "两双装平铺，每层 20 袋" }],
    },
    history: [{ changeNote: "按客户包装手册生成", changedBy: "13800000004", daysAgo: 50, patch: {}, confirmedBy: "陈晓", confirmMethod: "OFFLINE", confirmedDaysAgo: 47 }],
    status: "CONFIRMED",
    cartons: { pack: ["PACKED", "PACKED", "PACKED"], dueOffset: 1 },
  },
  {
    poNo: "PO0009702",
    style: "11737",
    base: {
      title: "童袜三双装吊卡",
      method: "童袜三双装吊卡",
      pairsPerCarton: 180,
      cartonSize: "50 × 35 × 30 cm",
      cartonType: "C 型单层瓦楞纸箱",
      strength: "32 ECT",
      shippingMark: "400 × 160 mm",
      markPosition: "两短侧面",
      sizeSticker: "彩色圆形 · 按尺码分色",
      sealSticker: "云栖童装封口贴",
      innerBag: "OPP 自立袋 · 厚度 0.05mm",
      tape: "BOPP 封箱胶带 · 宽 48mm",
      destination: "杭州仓",
      requirements: [{ title: "吊卡", content: "三双一卡，吊卡朝外" }],
    },
    history: [{ changeNote: "按客户包装手册生成", changedBy: "13800000013", daysAgo: 9, patch: {} }],
    status: "PENDING_CUSTOMER",
    submittedDaysAgo: 7,
  },
  {
    poNo: "PO0009745",
    style: "12132",
    base: {
      title: "五双装彩盒",
      method: "五双装彩盒",
      pairsPerCarton: 100,
      cartonSize: "55 × 40 × 32 cm",
      cartonType: "C 型单层瓦楞纸箱",
      innerBag: "彩盒 + 收缩膜",
      destination: "Osaka DC",
      requirements: [],
    },
    history: [{ changeNote: null, changedBy: "13800000005", daysAgo: 1, patch: {} }],
    status: "DRAFT",
  },
];

function snapshot(fields: PlanFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) out[f] = fields[f] ?? (f === "requirements" ? [] : null);
  return out;
}

export async function seedPackagingDemo(ctx: SeedContext): Promise<void> {
  for (const p of PLANS) {
    const orderId = ctx.orders[p.poNo];
    if (!orderId) continue;
    const order = (await ctx.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0];
    if (!order) continue;
    const firstAt = ctx.at(-p.history[0]!.daysAgo);
    const versions: { fields: PlanFields; h: History }[] = [];
    let current: PlanFields = { ...p.base };
    for (const h of p.history) {
      current = { ...current, ...h.patch };
      versions.push({ fields: { ...current }, h });
    }
    const last = versions[versions.length - 1]!;
    const confirmed = p.status === "CONFIRMED";
    const confirmedAt = last.h.confirmedDaysAgo !== undefined ? ctx.at(-last.h.confirmedDaysAgo, 15) : null;
    const effective = [...versions].reverse().findIndex((v) => v.h.confirmedBy);
    const effectiveVersion = effective >= 0 ? versions.length - effective : null;
    const plan = (
      await ctx.db
        .insert(packagingPlans)
        .values({
          docNo: await ctx.docNo("packaging", firstAt),
          orderId,
          styleId: ctx.styles[p.style] ?? null,
          title: last.fields.title ?? p.base.title!,
          method: last.fields.method ?? null,
          pairsPerCarton: last.fields.pairsPerCarton ?? null,
          cartonSize: last.fields.cartonSize ?? null,
          cartonType: last.fields.cartonType ?? null,
          strength: last.fields.strength ?? null,
          shippingMark: last.fields.shippingMark ?? null,
          markPosition: last.fields.markPosition ?? null,
          sizeSticker: last.fields.sizeSticker ?? null,
          sealSticker: last.fields.sealSticker ?? null,
          innerBag: last.fields.innerBag ?? null,
          tape: last.fields.tape ?? null,
          destination: last.fields.destination ?? null,
          requirements: last.fields.requirements ?? [],
          currentVersion: versions.length,
          effectiveVersion,
          status: p.status,
          submittedAt: p.submittedDaysAgo !== undefined ? ctx.at(-p.submittedDaysAgo, 10) : confirmed ? ctx.at(-(last.h.confirmedDaysAgo ?? 0) - 2, 10) : null,
          confirmedAt: confirmed ? confirmedAt : null,
          confirmedBy: confirmed ? (last.h.confirmedBy ?? null) : null,
          confirmMethod: confirmed ? (last.h.confirmMethod ?? null) : null,
          ownerId: order.ownerId,
          orgId: order.orgId,
          customerId: order.customerId,
          createdBy: ctx.user(p.history[0]!.changedBy),
          createdAt: firstAt,
          updatedAt: ctx.at(-(last.h.confirmedDaysAgo ?? last.h.daysAgo), 16),
        })
        .returning()
    )[0]!;
    for (const [i, v] of versions.entries()) {
      await ctx.db.insert(packagingPlanVersions).values({
        planId: plan.id,
        versionNo: i + 1,
        snapshot: snapshot(v.fields),
        changeNote: v.h.changeNote,
        customerConfirmed: !!v.h.confirmedBy,
        changedBy: ctx.user(v.h.changedBy),
        changedAt: ctx.at(-v.h.daysAgo, 11),
        confirmedAt: v.h.confirmedDaysAgo !== undefined ? ctx.at(-v.h.confirmedDaysAgo, 15) : null,
        confirmedBy: v.h.confirmedBy ?? null,
        confirmMethod: v.h.confirmMethod ?? null,
      });
    }
    if (!p.cartons || !effectiveVersion) continue;
    const perCarton = versions[effectiveVersion - 1]!.fields.pairsPerCarton!;
    const lines = (await ctx.db.select().from(orderLines).where(eq(orderLines.orderId, orderId))).filter((l) => l.quantity > 0);
    const styleNos = new Map((await ctx.db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles)).map((s) => [s.id, s.styleNo]));
    lines.sort((a, b) => (styleNos.get(a.styleId) ?? "").localeCompare(styleNos.get(b.styleId) ?? "") || SIZE_ORDER.indexOf(a.size ?? "") - SIZE_ORDER.indexOf(b.size ?? ""));
    let next = 1;
    for (const [i, line] of lines.entries()) {
      const count = Math.ceil(line.quantity / perCarton);
      const status = p.cartons.pack[i] ?? "TO_PACK";
      await ctx.db.insert(cartons).values({
        docNo: await ctx.docNo("carton", ctx.at(-10)),
        orderId,
        orderLineId: line.id,
        styleId: line.styleId,
        customerSku: line.sku,
        color: line.color,
        size: line.size,
        pairs: line.quantity,
        pairsPerCarton: perCarton,
        cartonCount: count,
        rangeStart: next,
        rangeEnd: next + count - 1,
        cartonRange: `${next}–${next + count - 1}`,
        packDueDate: ctx.day(p.cartons.dueOffset),
        status,
        planId: plan.id,
        planVersion: effectiveVersion,
        startedAt: status === "TO_PACK" ? null : ctx.at(-3, 9),
        packedAt: status === "PACKED" ? ctx.at(-1, 17) : null,
        ownerId: order.ownerId,
        orgId: order.orgId,
        customerId: order.customerId,
        createdBy: order.ownerId,
        createdAt: ctx.at(-10),
      });
      next += count;
    }
  }
}
