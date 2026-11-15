import { eq } from "drizzle-orm";
import { type ExtractedField, customers, files, plannings, styles } from "../../schema/index.js";
import type { SeedContext } from "./context.js";
import { DEMO_STYLES } from "./development.js";

export const PLANNING_EXTRA_STYLES = [
  { styleNo: "12744", customer: "CKD", owner: "13800000013", org: "ORG006", nameZh: "小黄鸟花朵翻口防滑童袜", nameEn: "Little Bird Flower Calf Gripper", category: "KIDS", subCategory: "CREW", season: "FA27" },
  { styleNo: "12301", customer: "NSR", owner: "13800000001", org: "ORG003", nameZh: "花边碎花中筒袜", nameEn: "Frilly All Flowers Quarter", category: "WOMEN", subCategory: "QUARTER", season: "SP27" },
  { styleNo: "12603", customer: "PLF", owner: "13800000005", org: "ORG004", nameZh: "素色罗纹船袜", nameEn: "Solid Rib Ballet No Show", category: "WOMEN", subCategory: "NO_SHOW", season: "FA27" },
  { styleNo: "12610", customer: "APX", owner: "13800000005", org: "ORG004", nameZh: "拼色袜头运动踝袜", nameEn: "Color Block Toe Ankle", category: "MEN", subCategory: "ANKLE", season: "SP27" },
  { styleNo: "12740", customer: "CKD", owner: "13800000013", org: "ORG006", nameZh: "花朵刺绣翻口童袜", nameEn: "Embroidered Flower Cuff Kids", category: "KIDS", subCategory: "CREW", season: "FA27" },
] as const;

type Attr = { zh?: string; en?: string };
type PlanningSeed = {
  styleNo: string;
  status: "RECOGNIZING" | "EXTRACTED" | "CONFIRMED" | "ARCHIVED";
  createdAgo: number;
  confirmedAgo?: number;
  archivedAgo?: number;
  pdf?: string;
  style?: { customer: string; owner: string; org: string; nameZh: string; nameEn: string; category: string; subCategory: string; season: string };
  needle?: string;
  weight?: string;
  sizes?: string;
  defaultSize?: string;
  due?: number;
  supplier?: string;
  buyer?: string;
  designer?: string;
  attrs?: Record<string, Attr>;
  brief?: string;
  low?: Record<string, number>;
};

const CATEGORY_ZH: Record<string, string> = { KIDS: "童袜", WOMEN: "女袜", MEN: "男袜" };

const PLANNINGS: PlanningSeed[] = [
  { styleNo: "12810", status: "RECOGNIZING", createdAgo: 0.007, pdf: "NSR_12810_FA27_TechPack.pdf" },
  {
    styleNo: "12593",
    status: "CONFIRMED",
    createdAgo: 8,
    confirmedAgo: 7,
    pdf: "NSR_12593_FA27_Tossed_Floral_TechPack.pdf",
    needle: "144N",
    weight: "Light 薄款",
    sizes: "S / M / L",
    defaultSize: "M",
    due: 34,
    supplier: "东城一厂",
    buyer: "Milena Ortiz",
    designer: "Hannah Lee",
    attrs: {
      cuff: { en: "Hidden cuff", zh: "隐藏式罗口" },
      footCushion: { en: "Half cushion terry sole", zh: "足底缓冲毛圈 · 半毛圈编织" },
      heel: { en: "Silicone grip dots at heel", zh: "踵部防滑硅胶点" },
      toeSeam: { en: "Seamless toe", zh: "无缝袜头" },
    },
    brief: "女款瑜伽防滑隐形袜，散点花卉提花，144 针；袜口隐藏式罗口，足底半毛圈缓冲，踵部防滑硅胶点，无缝袜头；尺码 S / M / L，PROTO 6 双，酒红色，按 Tech Pack 核对后上机。",
  },
  {
    styleNo: "12744",
    status: "CONFIRMED",
    createdAgo: 18,
    confirmedAgo: 17,
    needle: "120N",
    weight: "Medium 中厚",
    sizes: "XS / S / M",
    defaultSize: "S",
    due: 12,
    attrs: { cuff: { en: "Fold-over cuff, 3cm", zh: "翻口罗口 3cm" }, footCushion: { en: "Full cushion", zh: "全毛圈缓冲" }, heel: { en: "Gripper dots on sole", zh: "袜底防滑点" } },
    brief: "童款小黄鸟花朵翻口防滑袜，120 针提花；翻口 3cm，全毛圈缓冲，袜底点胶防滑；尺码 XS / S / M。",
  },
  { styleNo: "12301", status: "CONFIRMED", createdAgo: 4, confirmedAgo: 3, needle: "168N", weight: "Light 薄款", sizes: "S / M / L", defaultSize: "M", due: 20, attrs: { cuff: { en: "Lace frill cuff", zh: "花边罗口" }, toeSeam: { en: "Hand linked toe", zh: "手缝袜头" } } },
  { styleNo: "12603", status: "CONFIRMED", createdAgo: 16, confirmedAgo: 15, pdf: "PLF_12603_FA27_TechPack.pdf", needle: "200N", weight: "Light 薄款", sizes: "22-24 / 24-26", defaultSize: "22-24", due: -1, attrs: { heel: { en: "Silicone heel tape", zh: "后跟硅胶条" }, leftRight: { en: "No", zh: "不区分" } } },
  {
    styleNo: "12701",
    status: "EXTRACTED",
    createdAgo: 13,
    pdf: "PLF_12701_FA27_Bear_Peekaboo.pdf",
    style: { customer: "PLF", owner: "13800000005", org: "ORG004", nameZh: "小熊躲猫猫短袜", nameEn: "Bear Peekaboo Ankle", category: "KIDS", subCategory: "ANKLE", season: "FA27" },
    needle: "120N",
    weight: "Light 薄款",
    sizes: "13-15 / 15-17 / 17-19",
    defaultSize: "15-17",
    due: 24,
    designer: "佐藤 遥",
    attrs: { cuff: { en: "3D bear ears at cuff", zh: "罗口立体小熊耳朵" }, heel: { en: "Y heel", zh: "Y 型袜跟" } },
    brief: "童款小熊躲猫猫短袜，罗口立体小熊耳朵，Y 型袜跟，120 针；尺码 13-15 / 15-17 / 17-19。",
    low: { defaultSize: 0.62, sockWeight: 0.55, requiredSampleDate: 0.7 },
  },
  { styleNo: "12750", status: "CONFIRMED", createdAgo: 52, confirmedAgo: 51, needle: "144N", weight: "Medium 中厚", sizes: "M / L / XL", defaultSize: "L", due: -30, attrs: { cuff: { en: "Contrast rib cuff", zh: "撞色罗口" }, footCushion: { en: "Half cushion", zh: "半毛圈缓冲" } } },
  { styleNo: "12610", status: "CONFIRMED", createdAgo: 10, confirmedAgo: 9, needle: "144N", weight: "Medium 中厚", sizes: "M / L", defaultSize: "L", due: -6, attrs: { toeSeam: { en: "Color block toe", zh: "拼色袜头" } } },
  { styleNo: "12740", status: "CONFIRMED", createdAgo: 11, confirmedAgo: 10, pdf: "CKD_12740_FA27_Embroidered.pdf", needle: "120N", weight: "Light 薄款", sizes: "XS / S / M", defaultSize: "S", due: -7, attrs: { cuff: { en: "Embroidered flower fold cuff", zh: "刺绣花朵翻口" } } },
  { styleNo: "11506", status: "ARCHIVED", createdAgo: 135, confirmedAgo: 134, archivedAgo: 60, needle: "144N", weight: "Medium 中厚", sizes: "S / M / L", defaultSize: "M", due: -110, attrs: { cuff: { en: "1x1 rib cuff", zh: "1×1 罗纹罗口" } } },
  { styleNo: "11151", status: "ARCHIVED", createdAgo: 170, confirmedAgo: 168, archivedAgo: 75, needle: "168N", weight: "Medium 中厚", sizes: "M / L / XL", defaultSize: "L", due: -150, attrs: { footCushion: { en: "Merino terry cushion", zh: "美丽诺毛圈缓冲" }, heel: { en: "Silicone gripper", zh: "防滑硅胶" } } },
  { styleNo: "11152", status: "ARCHIVED", createdAgo: 160, confirmedAgo: 158, archivedAgo: 70, needle: "144N", weight: "Heavy 厚款", sizes: "S / M / L", defaultSize: "M", due: -140 },
];

function field(value: string | null, confidence: number, label: string, page = 1): ExtractedField {
  return value === null ? { value: null, confidence: 0 } : { value, confidence, source: `Tech Pack P${page} · ${label}：${value}`, page };
}

export async function seedPlanningDemo(ctx: SeedContext): Promise<void> {
  for (const s of PLANNING_EXTRA_STYLES) {
    const row = (
      await ctx.db
        .insert(styles)
        .values({
          styleNo: s.styleNo,
          nameZh: s.nameZh,
          nameEn: s.nameEn,
          category: s.category,
          subCategory: s.subCategory,
          seasonCode: s.season,
          productCode: `${s.customer}${s.styleNo}-${s.season}`,
          ownerId: ctx.user(s.owner),
          orgId: ctx.org(s.org),
          customerId: ctx.customer(s.customer),
          createdBy: ctx.user(s.owner),
          createdAt: ctx.at(-60),
          updatedAt: ctx.at(-60),
        })
        .returning({ id: styles.id })
    )[0]!;
    ctx.styles[s.styleNo] = row.id;
  }

  const custNames = new Map((await ctx.db.select({ id: customers.id, nameEn: customers.nameEn }).from(customers)).map((c) => [c.id, c.nameEn]));
  for (const p of PLANNINGS) {
    const known = [...DEMO_STYLES, ...PLANNING_EXTRA_STYLES].find((s) => s.styleNo === p.styleNo);
    const meta = known ? { customer: known.customer, owner: known.owner, org: known.org, nameZh: known.nameZh, nameEn: known.nameEn, category: known.category, subCategory: known.subCategory, season: known.season } : p.style!;
    const styleId = p.status === "CONFIRMED" || p.status === "ARCHIVED" ? (ctx.styles[p.styleNo] ?? null) : null;
    const createdAt = new Date(ctx.now.getTime() - p.createdAgo * 86_400_000);
    const owner = ctx.user(meta.owner);
    const customerId = ctx.customer(meta.customer);
    let sourceFileId: string | null = null;
    if (p.pdf) {
      sourceFileId = (
        await ctx.db
          .insert(files)
          .values({ storageKey: `demo/planning/${p.styleNo}.pdf`, filename: p.pdf, contentType: "application/pdf", size: 1_843_200, sha256: `demo-planning-${p.styleNo}`, ownerType: "planning", uploadedBy: owner, createdAt })
          .returning({ id: files.id })
      )[0]!.id;
    }
    const recognizing = p.status === "RECOGNIZING";
    const values = recognizing
      ? { styleNo: p.styleNo, seasonCode: meta.season, nameZh: null, nameEn: null, category: null, subCategory: null, defaultSize: null, sizeRange: null, supplier: null, buyerName: null, designer: null, needleCount: null, sockWeight: null, requiredSampleDate: null }
      : {
          styleNo: p.styleNo,
          seasonCode: meta.season,
          nameZh: meta.nameZh,
          nameEn: meta.nameEn,
          category: meta.category,
          subCategory: meta.subCategory,
          defaultSize: p.defaultSize ?? null,
          sizeRange: p.sizes ?? null,
          supplier: p.supplier ?? null,
          buyerName: p.buyer ?? null,
          designer: p.designer ?? null,
          needleCount: p.needle ?? null,
          sockWeight: p.weight ?? null,
          requiredSampleDate: p.due !== undefined ? ctx.day(p.due) : null,
        };
    const low = p.low ?? {};
    const conf = (key: string, i: number) => low[key] ?? Math.round((0.9 + ((i * 7) % 9) / 100) * 100) / 100;
    const labels: [keyof typeof values, string][] = [
      ["nameEn", "Style Name"],
      ["styleNo", "Style #"],
      ["seasonCode", "Season"],
      ["category", "Gender"],
      ["subCategory", "Silhouette"],
      ["sizeRange", "Size Range"],
      ["defaultSize", "Sample Size"],
      ["needleCount", "Needle Count"],
      ["sockWeight", "Weight"],
      ["requiredSampleDate", "Proto Due"],
      ["supplier", "Vendor"],
      ["buyerName", "Buyer"],
      ["designer", "Designer"],
    ];
    const extraction: Record<string, ExtractedField> | null = recognizing
      ? null
      : {
          nameZh: { value: meta.nameZh, confidence: 0.86, source: `译自 Style Name：${meta.nameEn}`, page: 1 },
          customerName: { value: custNames.get(customerId) ?? meta.customer, confidence: 0.97, source: "Tech Pack 页眉", page: 1 },
          ...Object.fromEntries(labels.map(([key, label], i) => [key, field(values[key] as string | null, conf(key, i), label, key === "needleCount" || key === "sockWeight" ? 2 : 1)])),
          ...Object.fromEntries(Object.entries(p.attrs ?? {}).map(([key, a]) => [`attr.${key}`, field(a.en ?? null, 0.9, key, 2)])),
        };
    const brief = recognizing ? null : (p.brief ?? `${meta.nameZh}（${meta.nameEn}），${CATEGORY_ZH[meta.category] ?? ""}，${p.needle ?? ""}，尺码 ${p.sizes ?? "—"}。`);
    const confirmedAt = p.confirmedAgo !== undefined ? new Date(ctx.now.getTime() - p.confirmedAgo * 86_400_000) : null;
    const archivedAt = p.archivedAgo !== undefined ? new Date(ctx.now.getTime() - p.archivedAgo * 86_400_000) : null;
    const created = (
      await ctx.db
        .insert(plannings)
        .values({
          ...values,
          docNo: await ctx.docNo("planning", createdAt),
          styleId,
          status: p.status,
          productAttrs: recognizing ? {} : (p.attrs ?? {}),
          extraction,
          briefTranslation: brief,
          sourceFileId,
          sourceFilename: p.pdf ?? null,
          recognizedAt: recognizing ? null : new Date(createdAt.getTime() + 90_000),
          confirmedAt,
          confirmedBy: confirmedAt ? owner : null,
          archivedAt,
          ownerId: owner,
          orgId: ctx.org(meta.org),
          customerId,
          createdBy: owner,
          createdAt,
          updatedAt: archivedAt ?? confirmedAt ?? createdAt,
          version: p.status === "RECOGNIZING" ? 1 : p.status === "EXTRACTED" ? 2 : p.status === "CONFIRMED" ? 3 : 4,
        })
        .returning({ id: plannings.id })
    )[0]!;
    if (sourceFileId) await ctx.db.update(files).set({ ownerId: created.id }).where(eq(files.id, sourceFileId));
  }
}
