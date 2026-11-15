import { z } from "zod";
import { csv, dateSchema, dateTimeSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const shipmentErrors = defineErrors({
  SHIPMENT_BOOKING_ORDER_MISMATCH: { status: 422, zh: "订舱单不属于该订单", en: "Booking does not belong to the order" },
  SHIPMENT_STYLE_NOT_IN_ORDER: { status: 422, zh: "该款不在订单内", en: "Style is not part of the order" },
  SHIPMENT_BOOKING_CANCELLED: { status: 409, zh: "订舱单 {docNo} 已取消", en: "Booking {docNo} is cancelled" },
  SHIPMENT_BOOKING_IN_USE: { status: 409, zh: "订舱单已有出货批次推进到装箱及之后，不能取消", en: "Booking has shipments beyond booking, cannot cancel" },
});

export const BOOKING_STATUSES = ["PENDING_CARRIER", "CONFIRMED", "CANCELLED"] as const;
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export const BOOKING_STATUS_LABELS: Record<BookingStatus, { zh: string; en: string }> = {
  PENDING_CARRIER: { zh: "待船司确认", en: "Awaiting carrier" },
  CONFIRMED: { zh: "订舱确认", en: "Confirmed" },
  CANCELLED: { zh: "已取消", en: "Cancelled" },
};
export const BOOKING_TRANSITIONS: Partial<Record<BookingStatus, readonly BookingStatus[]>> = {
  PENDING_CARRIER: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
};

export const TRANSPORT_MODES = ["OCEAN", "AIR", "RAIL", "EXPRESS"] as const;
export const transportModeSchema = z.enum(TRANSPORT_MODES);
export type TransportMode = z.infer<typeof transportModeSchema>;

export const SHIPMENT_STATUSES = ["BOOKED", "PACKED", "SAILED", "ARRIVED", "SIGNED"] as const;
export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES);
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

export const bookingSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  orderId: z.string(),
  poNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  forwarderId: z.string().nullable(),
  forwarderName: z.string().nullable(),
  carrier: z.string().nullable(),
  vessel: z.string().nullable(),
  voyage: z.string().nullable(),
  blNo: z.string().nullable(),
  transportMode: z.string().nullable(),
  cutoffDate: z.string().nullable(),
  containerType: z.string().nullable(),
  etd: z.string().nullable(),
  eta: z.string().nullable(),
  status: bookingStatusSchema,
  confirmedAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  note: z.string().nullable(),
  shipmentCount: z.number().int(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type BookingDto = z.infer<typeof bookingSchema>;

export const shipmentEventSchema = z.object({
  status: shipmentStatusSchema,
  plannedAt: z.string().nullable(),
  actualAt: z.string().nullable(),
  note: z.string().nullable(),
});
export type ShipmentEventDto = z.infer<typeof shipmentEventSchema>;

export const shipmentSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  orderId: z.string(),
  poNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  bookingId: z.string().nullable(),
  bookingNo: z.string().nullable(),
  styleId: z.string().nullable(),
  styleNo: z.string().nullable(),
  styleName: z.string().nullable(),
  styleNameEn: z.string().nullable(),
  transportMode: z.string().nullable(),
  destination: z.string().nullable(),
  carrierText: z.string().nullable(),
  blNo: z.string().nullable(),
  etd: z.string().nullable(),
  eta: z.string().nullable(),
  cartonCount: z.number().nullable(),
  pairs: z.number().nullable(),
  grossWeight: z.number().nullable(),
  volume: z.number().nullable(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  seasonCode: z.string().nullable(),
  inspectionId: z.string().nullable(),
  inspectionNo: z.string().nullable(),
  status: shipmentStatusSchema,
  signedAt: z.string().nullable(),
  note: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type ShipmentDto = z.infer<typeof shipmentSchema>;

export const shipmentDetailSchema = shipmentSchema.extend({
  events: z.array(shipmentEventSchema),
  batches: z.array(shipmentSchema),
  booking: bookingSchema.nullable(),
  released: z.boolean(),
  cartonLines: z.number().int(),
  receivable: z.object({ id: z.string(), docNo: z.string(), status: z.string() }).nullable(),
});
export type ShipmentDetailDto = z.infer<typeof shipmentDetailSchema>;

export const bookingDetailSchema = bookingSchema.extend({ shipments: z.array(shipmentSchema) });
export type BookingDetailDto = z.infer<typeof bookingDetailSchema>;

export const shipmentKpiSchema = z.object({
  booked: z.number().int(),
  packed: z.number().int(),
  inTransit: z.number().int(),
  arrived: z.number().int(),
  signed: z.number().int(),
  cartonsThisMonth: z.number().int(),
  unconfirmedBookings: z.number().int(),
});
export type ShipmentKpiDto = z.infer<typeof shipmentKpiSchema>;

const text = (max: number) => z.string().trim().max(max);

const bookingFields = {
  forwarderId: z.uuid().nullable().optional(),
  carrier: text(80).nullable().optional(),
  vessel: text(80).nullable().optional(),
  voyage: text(40).nullable().optional(),
  blNo: text(60).nullable().optional(),
  transportMode: transportModeSchema.nullable().optional(),
  cutoffDate: dateSchema.nullable().optional(),
  containerType: text(40).nullable().optional(),
  etd: dateSchema.nullable().optional(),
  eta: dateSchema.nullable().optional(),
  note: text(500).nullable().optional(),
};

export const bookingCreateSchema = z.object({ orderId: z.uuid(), ...bookingFields });
export const bookingUpdateSchema = z.object({ version: z.number().int(), ...bookingFields });
export const bookingConfirmSchema = z.object({
  version: z.number().int(),
  vessel: text(80).nullable().optional(),
  voyage: text(40).nullable().optional(),
  blNo: text(60).nullable().optional(),
  etd: dateSchema.nullable().optional(),
  eta: dateSchema.nullable().optional(),
  note: text(500).nullable().optional(),
});
export const bookingCancelSchema = z.object({ version: z.number().int(), reason: z.string().trim().min(1).max(500) });

export const shipmentCreateSchema = z.object({
  orderId: z.uuid(),
  bookingId: z.uuid().nullable().optional(),
  styleId: z.uuid().nullable().optional(),
  inspectionId: z.uuid().nullable().optional(),
  transportMode: transportModeSchema.nullable().optional(),
  destination: text(120).nullable().optional(),
  carrierText: text(120).nullable().optional(),
  blNo: text(60).nullable().optional(),
  etd: dateSchema.nullable().optional(),
  eta: dateSchema.nullable().optional(),
  cartonCount: z.number().int().min(0).nullable().optional(),
  pairs: z.number().int().min(1),
  grossWeight: z.number().min(0).nullable().optional(),
  volume: z.number().min(0).nullable().optional(),
  note: text(500).nullable().optional(),
});

export const shipmentAdvanceSchema = z.object({
  version: z.number().int(),
  to: z.enum(["PACKED", "SAILED", "ARRIVED"]),
  actualAt: dateTimeSchema.optional(),
  blNo: text(60).nullable().optional(),
  eta: dateSchema.nullable().optional(),
  note: text(500).nullable().optional(),
});

export const shipmentSignSchema = z.object({
  version: z.number().int(),
  signedAt: dateTimeSchema.optional(),
  note: text(500).nullable().optional(),
});

const flag = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === "true" || v === "1"));

export const shipmentListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  transportMode: csv,
  arrivedNotSigned: flag,
});

export const bookingListQuerySchema = pageQuerySchema.extend({
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  status: csv,
});
