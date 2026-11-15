import { styles } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

export const DEMO_STYLES = [
  { styleNo: "12593", customer: "NSR", owner: "13800000001", org: "ORG003", nameZh: "散点花卉瑜伽防滑隐形袜", nameEn: "Tossed Floral Studio Gripper Ballet No Show", category: "WOMEN", subCategory: "NO_SHOW", season: "FA27" },
  { styleNo: "11506", customer: "NSR", owner: "13800000001", org: "ORG003", nameZh: "晨雾罗纹中筒袜", nameEn: "Misty Rib Crew", category: "WOMEN", subCategory: "CREW", season: "AW26" },
  { styleNo: "11151", customer: "MRN", owner: "13800000001", org: "ORG003", nameZh: "美丽诺像素提花中筒袜", nameEn: "Merino Pixel Pattern Quarter Gripper", category: "MEN", subCategory: "QUARTER", season: "HO26" },
  { styleNo: "11152", customer: "BBY", owner: "13800000004", org: "ORG003", nameZh: "肌理卫衣半筒袜", nameEn: "Textured Sweatshirt Half Calf", category: "WOMEN", subCategory: "HALF_CALF", season: "HO26" },
  { styleNo: "11063", customer: "APX", owner: "13800000005", org: "ORG004", nameZh: "蜜蜂碎花罗纹高尔夫短袜", nameEn: "Solid Floral Bee Ribbed Golf Ankle", category: "WOMEN", subCategory: "ANKLE", season: "HO26" },
  { styleNo: "12810", customer: "NSR", owner: "13800000001", org: "ORG003", nameZh: "罗纹中筒休闲袜", nameEn: "Ribbed Everyday Crew", category: "WOMEN", subCategory: "CREW", season: "FA27" },
  { styleNo: "11720", customer: "MPT", owner: "13800000004", org: "ORG003", nameZh: "石楠美丽诺户外袜", nameEn: "Heather Merino Blend All Over", category: "MEN", subCategory: "CREW", season: "HO26" },
  { styleNo: "11737", customer: "CKD", owner: "13800000013", org: "ORG006", nameZh: "石楠碎花高尔夫童袜", nameEn: "Heather Floral Bee Ribbed Golf Ankle", category: "KIDS", subCategory: "ANKLE", season: "HO26" },
  { styleNo: "12132", customer: "PLF", owner: "13800000005", org: "ORG004", nameZh: "卫衣半筒袜三双装", nameEn: "Sweatshirt Sock Half Calf 3-pack", category: "WOMEN", subCategory: "HALF_CALF", season: "HO26" },
  { styleNo: "12750", customer: "SSH", owner: "13800000013", org: "ORG006", nameZh: "撞色罗口运动中筒袜", nameEn: "Contrast Cuff Sport Crew", category: "MEN", subCategory: "CREW", season: "SP27" },
] as const;

export async function seedDevelopmentDemo(ctx: SeedContext): Promise<void> {
  for (const s of DEMO_STYLES) {
    const rows = await ctx.db
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
      })
      .returning({ id: styles.id });
    ctx.styles[s.styleNo] = rows[0]!.id;
  }
}
