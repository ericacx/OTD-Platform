import { eq, inArray } from "drizzle-orm";
import { customerOrders, materials, purchaseLines, purchaseOrders, purchaseReceipts } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

type LineSeed = { material?: string; name?: string; unit?: string; spec?: string; quantity: number; unitPrice?: number; received?: number };
type PurchaseSeed = {
  poNo: string;
  supplier: string;
  category: "YARN" | "TRIM" | "PACKAGING";
  orderedOffset: number;
  promisedOffset: number;
  status: "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED";
  receivedOffset?: number;
  deliveryPlace: string;
  note?: string;
  cancelReason?: string;
  lines: LineSeed[];
};

const BUYER = "13800000009";

const PURCHASES: PurchaseSeed[] = [
  { poNo: "PO0009631", supplier: "华茂纱业", category: "YARN", orderedOffset: -28, promisedOffset: -14, status: "RECEIVED", receivedOffset: -15, deliveryPlace: "南湖五厂原料仓", lines: [{ material: "Y-40S-T80C20", quantity: 330, received: 330 }] },
  { poNo: "PO0009631", supplier: "宏达包装", category: "PACKAGING", orderedOffset: -20, promisedOffset: -8, status: "RECEIVED", receivedOffset: -9, deliveryPlace: "南湖五厂包装车间", lines: [{ material: "P-CARTON-C", quantity: 130, received: 130 }, { name: "加厚挂钩", unit: "个", spec: "PP 透明", quantity: 12600, unitPrice: 0.05, received: 12600 }] },
  { poNo: "PO0009690", supplier: "恒力化纤", category: "YARN", orderedOffset: -12, promisedOffset: -3, status: "ORDERED", deliveryPlace: "东城二厂原料仓", note: "供应商反馈染色排缸延误", lines: [{ material: "Y-NYLON-70D", quantity: 120 }, { material: "Y-SPANDEX-1207070", quantity: 35 }] },
  { poNo: "PO0009560", supplier: "联达辅料", category: "TRIM", orderedOffset: -9, promisedOffset: 4, status: "PARTIAL", deliveryPlace: "东城一厂辅料仓", lines: [{ material: "T-SILICONE", quantity: 5400, received: 3000 }] },
  { poNo: "PO0009702", supplier: "宏达包装", category: "PACKAGING", orderedOffset: -4, promisedOffset: 6, status: "ORDERED", deliveryPlace: "东城二厂包装车间", lines: [{ material: "P-OPP-BAG", quantity: 2400 }, { material: "P-HANGTAG", quantity: 2400 }] },
  { poNo: "PO0010459", supplier: "华茂纱业", category: "YARN", orderedOffset: -2, promisedOffset: 12, status: "ORDERED", deliveryPlace: "南湖五厂原料仓", note: "PO 复核通过后备纱", lines: [{ material: "Y-40S-T80C20", quantity: 600 }] },
  { poNo: "PO0009412", supplier: "宏达包装", category: "PACKAGING", orderedOffset: -30, promisedOffset: -18, status: "RECEIVED", receivedOffset: -19, deliveryPlace: "东城一厂包装车间", lines: [{ name: "PE 袋 · 两双一袋", unit: "个", quantity: 4020, unitPrice: 0.06, received: 4020 }, { material: "P-CARTON-C", quantity: 70, received: 70 }] },
  { poNo: "PO0010035", supplier: "华茂纱业", category: "YARN", orderedOffset: -6, promisedOffset: 20, status: "CANCELLED", deliveryPlace: "海防三厂原料仓", cancelReason: "PO 未确认，暂缓备纱", lines: [{ material: "Y-COMBED-32S", quantity: 160 }] },
];

export async function seedPurchaseDemo(ctx: SeedContext): Promise<void> {
  const codes = [...new Set(PURCHASES.flatMap((p) => p.lines.map((l) => l.material).filter((x): x is string => !!x)))];
  const mats = new Map((await ctx.db.select().from(materials).where(inArray(materials.code, codes))).map((m) => [m.code, m]));
  const buyer = ctx.users[BUYER];
  const buyerOrg = ctx.orgs.ORG010;
  if (!buyer || !buyerOrg) return;
  for (const p of PURCHASES) {
    const orderId = ctx.orders[p.poNo];
    if (!orderId) continue;
    const order = (await ctx.db.select({ customerId: customerOrders.customerId }).from(customerOrders).where(eq(customerOrders.id, orderId)))[0];
    if (!order) continue;
    const orderedAt = ctx.at(p.orderedOffset);
    const row = (
      await ctx.db
        .insert(purchaseOrders)
        .values({
          docNo: await ctx.docNo("purchase", orderedAt),
          orderId,
          supplier: p.supplier,
          category: p.category,
          status: p.status,
          orderedAt: ctx.day(p.orderedOffset),
          promisedDate: ctx.day(p.promisedOffset),
          receivedAt: p.receivedOffset !== undefined ? ctx.day(p.receivedOffset) : null,
          deliveryPlace: p.deliveryPlace,
          note: p.note ?? null,
          cancelledAt: p.status === "CANCELLED" ? ctx.at(p.orderedOffset + 2, 14) : null,
          cancelReason: p.cancelReason ?? null,
          ownerId: buyer,
          orgId: buyerOrg,
          customerId: order.customerId,
          createdBy: buyer,
          createdAt: orderedAt,
        })
        .returning({ id: purchaseOrders.id })
    )[0]!;
    for (const [i, l] of p.lines.entries()) {
      const mat = l.material ? mats.get(l.material) : undefined;
      if (l.material && !mat) continue;
      const line = (
        await ctx.db
          .insert(purchaseLines)
          .values({
            purchaseId: row.id,
            materialId: mat?.id ?? null,
            name: l.name ?? mat!.name,
            spec: l.spec ?? mat?.spec ?? null,
            quantity: l.quantity,
            unit: l.unit ?? mat!.unit,
            unitPrice: l.unitPrice ?? mat?.unitPrice ?? null,
            receivedQty: l.received ?? 0,
            sort: i + 1,
          })
          .returning({ id: purchaseLines.id })
      )[0]!;
      if (!l.received) continue;
      const receivedOffset = p.receivedOffset ?? -1;
      await ctx.db.insert(purchaseReceipts).values({ purchaseId: row.id, lineId: line.id, quantity: l.received, receivedAt: ctx.day(receivedOffset), qcResult: "PASS", note: p.status === "PARTIAL" ? "首批到货" : null, createdBy: buyer, createdAt: ctx.at(receivedOffset, 15) });
    }
  }
}
