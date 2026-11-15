import { customerOrders, orderLines, styles } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

export const DEMO_ORDERS = [
  { poNo: "PO0010459", customer: "NSR", season: "AW26", style: "11506", extraStyles: ["12810"], pairs: 37080, dueOffset: 31, factory: "NH5", status: "PENDING_CONFIRM", currency: "USD", unitPrice: 0.925, transport: "RAIL", destination: "Sète, FR", tradeTerm: "FOB Shanghai · Incoterms 2020", styleType: "老款新色" },
  { poNo: "PO0009631", customer: "MRN", season: "HO26", style: "11151", extraStyles: [], pairs: 12600, dueOffset: 13, factory: "NH5", status: "IN_PRODUCTION", currency: "EUR", unitPrice: 1.86, transport: "OCEAN", destination: "Hamburg, DE", tradeTerm: "FOB Ningbo", styleType: "新款" },
  { poNo: "PO0009412", customer: "BBY", season: "HO26", style: "11152", extraStyles: [], pairs: 8040, dueOffset: 4, factory: "DC1", status: "TO_SHIP", currency: "CNY", unitPrice: 9.8, transport: "EXPRESS", destination: "上海仓", tradeTerm: "DDP", styleType: "老款翻单" },
  { poNo: "PO0009690", customer: "APX", season: "HO26", style: "11063", extraStyles: [], pairs: 9600, dueOffset: 40, factory: "DC2", status: "TO_SCHEDULE", currency: "USD", unitPrice: 1.12, transport: "OCEAN", destination: "Los Angeles, US", tradeTerm: "FOB Shanghai", styleType: "新款" },
  { poNo: "PO0009745", customer: "PLF", season: "HO26", style: "12132", extraStyles: [], pairs: 4200, dueOffset: -20, factory: "HP3", status: "COMPLETED", currency: "JPY", unitPrice: 168, transport: "OCEAN", destination: "Osaka, JP", tradeTerm: "FOB Haiphong", styleType: "新款" },
  { poNo: "PO0009560", customer: "MPT", season: "HO26", style: "11720", extraStyles: [], pairs: 5400, dueOffset: 7, factory: "DC1", status: "IN_PRODUCTION", currency: "USD", unitPrice: 1.45, transport: "OCEAN", destination: "Vancouver, CA", tradeTerm: "FOB Shanghai", styleType: "老款新色" },
  { poNo: "PO0009702", customer: "CKD", season: "HO26", style: "11737", extraStyles: [], pairs: 7200, dueOffset: 25, factory: "DC2", status: "TO_SCHEDULE", currency: "CNY", unitPrice: 6.5, transport: "EXPRESS", destination: "杭州仓", tradeTerm: "DDP", styleType: "新款" },
  { poNo: "PO0010035", customer: "SSH", season: "SP27", style: "12750", extraStyles: [], pairs: 6060, dueOffset: 55, factory: "HP3", status: "PENDING_CONFIRM", currency: "USD", unitPrice: 1.05, transport: "OCEAN", destination: "New York, US", tradeTerm: "FOB Haiphong", styleType: "新款" },
] as const;

const SIZES = ["S", "M", "L"] as const;

export async function seedOrderDemo(ctx: SeedContext): Promise<void> {
  for (const o of DEMO_ORDERS) {
    const styleIds = [o.style, ...o.extraStyles].map((s) => ctx.styles[s]).filter((x): x is string => !!x);
    if (!styleIds.length) continue;
    const mainStyle = (await ctx.db.select().from(styles)).find((s) => s.id === styleIds[0])!;
    const orderDate = ctx.day(Math.min(o.dueOffset - 60, -3));
    const row = (
      await ctx.db
        .insert(customerOrders)
        .values({
          poNo: o.poNo,
          revision: 1,
          channel: "Retail",
          poType: "PDTN-SOCKS",
          productLine: "Performance",
          seasonCode: o.season,
          styleType: o.styleType,
          tradeTerm: o.tradeTerm,
          paymentTerms: "月结 60 天",
          currency: o.currency,
          fobAmount: Math.round(o.pairs * o.unitPrice * 100) / 100,
          buyerEntity: o.customer,
          origin: o.factory === "HP3" ? "Vietnam" : "China",
          orderDate,
          customerDueDate: ctx.day(o.dueOffset),
          factoryReplyDate: o.status === "PENDING_CONFIRM" ? null : ctx.day(o.dueOffset),
          delayDays: o.status === "PENDING_CONFIRM" ? null : 0,
          factoryId: ctx.factories[o.factory] ?? null,
          transportMode: o.transport,
          destination: o.destination,
          totalUnits: Math.round(o.pairs / 6),
          totalPairs: o.pairs,
          merchandiserId: ctx.user("13800000012"),
          status: o.status,
          poTerms: "PO 号须出现在所有发票、出货文件与回执上。",
          confirmedAt: o.status === "PENDING_CONFIRM" ? null : ctx.at(Math.min(o.dueOffset - 55, -2)),
          ownerId: mainStyle.ownerId,
          orgId: mainStyle.orgId,
          customerId: mainStyle.customerId,
          createdBy: mainStyle.ownerId,
        })
        .returning({ id: customerOrders.id })
    )[0]!;
    ctx.orders[o.poNo] = row.id;
    const perStyle = Math.floor(o.pairs / styleIds.length);
    for (const styleId of styleIds) {
      const perSize = Math.floor(perStyle / SIZES.length);
      for (const size of SIZES) {
        await ctx.db.insert(orderLines).values({ orderId: row.id, styleId, color: "Black", size, sku: `${o.customer}-${o.style}-BLK-${size}`, quantity: perSize, unitPrice: o.unitPrice });
      }
    }
  }
}
