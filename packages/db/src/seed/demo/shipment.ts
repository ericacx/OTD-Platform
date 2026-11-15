import { and, eq } from "drizzle-orm";
import { bookings, customerOrders, forwarders, inspections, shipmentEvents, shipments } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const FLOW = ["BOOKED", "PACKED", "SAILED", "ARRIVED", "SIGNED"] as const;
type Status = (typeof FLOW)[number];

type DemoBooking = {
  po: string;
  style: string;
  forwarder: string;
  carrier: string;
  vessel?: string;
  voyage?: string;
  blNo?: string;
  container?: string;
  createdOffset: number;
  pending?: boolean;
  etd: number;
  eta: number;
  shipments: { status: Status; pairs: number; cartons: number; weight: number; etd: number; eta: number; actual: Partial<Record<Status, number>>; note?: string }[];
};

const DEMO: DemoBooking[] = [
  {
    po: "PO0009412",
    style: "11152",
    forwarder: "KWE",
    carrier: "顺丰速运",
    blNo: "SF1408826631",
    createdOffset: -25,
    etd: -12,
    eta: -10,
    shipments: [
      { status: "SIGNED", pairs: 3000, cartons: 25, weight: 312.5, etd: -12, eta: -10, actual: { BOOKED: -25, PACKED: -13, SAILED: -12, ARRIVED: -10, SIGNED: -9 } },
      { status: "ARRIVED", pairs: 2500, cartons: 21, weight: 260.4, etd: -11, eta: -9, actual: { BOOKED: -24, PACKED: -12, SAILED: -11, ARRIVED: -9 } },
    ],
  },
  {
    po: "PO0009412",
    style: "11152",
    forwarder: "KWE",
    carrier: "顺丰速运",
    blNo: "SF1408826977",
    createdOffset: -8,
    etd: -1,
    eta: 2,
    shipments: [{ status: "SAILED", pairs: 2540, cartons: 22, weight: 264.6, etd: -1, eta: 2, actual: { BOOKED: -8, PACKED: -2, SAILED: -1 } }],
  },
  {
    po: "PO0009631",
    style: "11151",
    forwarder: "NFI",
    carrier: "长荣海运",
    vessel: "EVER ACE",
    voyage: "0126W",
    container: "40HQ",
    createdOffset: -6,
    etd: 18,
    eta: 50,
    shipments: [{ status: "BOOKED", pairs: 12600, cartons: 105, weight: 1312.5, etd: 18, eta: 50, actual: { BOOKED: -6 }, note: "已锁舱位，待 FRI 放行后装箱" }],
  },
  {
    po: "PO0009690",
    style: "11063",
    forwarder: "KWE",
    carrier: "中远海运",
    pending: true,
    container: "40GP",
    createdOffset: -2,
    etd: 36,
    eta: 52,
    shipments: [{ status: "BOOKED", pairs: 9600, cartons: 80, weight: 1000, etd: 36, eta: 52, actual: { BOOKED: -2 } }],
  },
  {
    po: "PO0009745",
    style: "12132",
    forwarder: "NFI",
    carrier: "中远海运",
    vessel: "COSCO HAIPHONG",
    voyage: "211N",
    blNo: "COSU6283310450",
    container: "20GP",
    createdOffset: -45,
    etd: -32,
    eta: -26,
    shipments: [{ status: "SIGNED", pairs: 4200, cartons: 35, weight: 420.8, etd: -32, eta: -26, actual: { BOOKED: -45, PACKED: -34, SAILED: -32, ARRIVED: -26, SIGNED: -24 } }],
  },
];

export async function seedShipmentDemo(ctx: SeedContext): Promise<void> {
  const fwd = new Map((await ctx.db.select().from(forwarders)).map((f) => [f.code, f]));
  for (const b of DEMO) {
    const orderId = ctx.orders[b.po];
    const styleId = ctx.styles[b.style];
    if (!orderId || !styleId) continue;
    const order = (await ctx.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0];
    if (!order) continue;
    const own = { ownerId: order.ownerId, orgId: order.orgId, customerId: order.customerId };
    const forwarder = fwd.get(b.forwarder);
    const bookedAt = ctx.at(b.createdOffset, 10);
    const booking = (
      await ctx.db
        .insert(bookings)
        .values({
          docNo: await ctx.docNo("booking", bookedAt),
          orderId,
          forwarderId: forwarder?.id ?? null,
          carrier: b.carrier,
          vessel: b.vessel ?? null,
          voyage: b.voyage ?? null,
          blNo: b.blNo ?? null,
          transportMode: order.transportMode,
          cutoffDate: ctx.day(b.etd - 2),
          containerType: b.container ?? null,
          etd: ctx.day(b.etd),
          eta: ctx.day(b.eta),
          status: b.pending ? "PENDING_CARRIER" : "CONFIRMED",
          confirmedAt: b.pending ? null : ctx.at(b.createdOffset + 1, 10),
          ...own,
          createdBy: order.ownerId,
          createdAt: bookedAt,
        })
        .returning()
    )[0]!;
    const released = (await ctx.db.select({ id: inspections.id }).from(inspections).where(and(eq(inspections.orderId, orderId), eq(inspections.status, "RELEASED"))))[0];
    for (const s of b.shipments) {
      const reached = FLOW.indexOf(s.status);
      const row = (
        await ctx.db
          .insert(shipments)
          .values({
            docNo: await ctx.docNo("shipment", ctx.at(s.actual.BOOKED ?? b.createdOffset, 11)),
            orderId,
            bookingId: booking.id,
            styleId,
            transportMode: order.transportMode,
            destination: order.destination,
            carrierText: [forwarder?.name, b.carrier].filter(Boolean).join(" / "),
            blNo: b.blNo ?? null,
            etd: ctx.day(s.etd),
            eta: ctx.day(s.eta),
            cartonCount: s.cartons,
            pairs: s.pairs,
            grossWeight: s.weight,
            volume: Math.round(s.cartons * 0.09 * 100) / 100,
            factoryId: order.factoryId,
            seasonCode: order.seasonCode,
            inspectionId: reached >= 1 ? (released?.id ?? null) : null,
            status: s.status,
            signedAt: s.actual.SIGNED !== undefined ? ctx.at(s.actual.SIGNED, 15) : null,
            note: s.note ?? null,
            version: reached + 1,
            ...own,
            createdBy: order.ownerId,
            createdAt: ctx.at(s.actual.BOOKED ?? b.createdOffset, 11),
          })
          .returning({ id: shipments.id })
      )[0]!;
      await ctx.db.insert(shipmentEvents).values(
        FLOW.map((status) => ({
          shipmentId: row.id,
          status,
          plannedAt: status === "SAILED" ? ctx.day(s.etd) : status === "ARRIVED" ? ctx.day(s.eta) : status === "PACKED" ? ctx.day(s.etd - 1) : status === "SIGNED" ? ctx.day(s.eta + 1) : null,
          actualAt: s.actual[status] !== undefined ? ctx.at(s.actual[status]!, status === "SIGNED" ? 15 : 10) : null,
          note: status === "BOOKED" ? booking.docNo : status === "SIGNED" && s.actual.SIGNED !== undefined ? order.destination : null,
          operatorId: s.actual[status] !== undefined ? ctx.user("13800000010") : null,
        })),
      );
    }
  }
}
