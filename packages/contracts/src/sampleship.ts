import { z } from "zod";
import { csv, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const sampleshipErrors = defineErrors({
  SAMPLESHIP_RECIPIENT_CUSTOMER_MISMATCH: { status: 422, zh: "收件人不属于该客户", en: "Recipient does not belong to the customer" },
});

export const shipmentStatusSchema = z.enum(["DRAFT", "SENT", "SIGNED"]);

export const recipientSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  company: z.string(),
  name: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  courier: z.string().nullable(),
  isDefault: z.boolean(),
  version: z.number().int(),
});
export type RecipientDto = z.infer<typeof recipientSchema>;

export const recipientUpsertSchema = z.object({
  customerId: z.uuid(),
  company: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(60),
  address: z.string().trim().min(1).max(300),
  phone: z.string().max(40).nullable().optional(),
  email: z.email().nullable().optional(),
  courier: z.string().max(60).nullable().optional(),
  isDefault: z.boolean().default(false),
  version: z.number().int().optional(),
});

export const shipmentItemSchema = z.object({
  styleId: z.uuid(),
  styleNo: z.string().optional(),
  roundId: z.uuid().optional(),
  kind: z.string().min(1),
  quantity: z.number().int().min(1),
});

export const sampleShipmentSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  recipient: recipientSchema.nullable(),
  method: z.enum(["COURIER", "FORWARDER"]),
  courier: z.string().nullable(),
  trackingNo: z.string().nullable(),
  sentAt: z.string().nullable(),
  signedAt: z.string().nullable(),
  status: shipmentStatusSchema,
  items: z.array(shipmentItemSchema),
  note: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type SampleShipmentDto = z.infer<typeof sampleShipmentSchema>;

export const sampleShipmentCreateSchema = z.object({
  customerId: z.uuid(),
  recipientId: z.uuid().nullable().optional(),
  method: z.enum(["COURIER", "FORWARDER"]),
  courier: z.string().max(60).nullable().optional(),
  items: z.array(shipmentItemSchema).min(1),
  note: z.string().max(500).nullable().optional(),
});

export const sampleShipmentSendSchema = z.object({ trackingNo: z.string().trim().min(3).max(60), courier: z.string().max(60).optional(), version: z.number().int() });
export const sampleShipmentSignSchema = z.object({ signedAt: z.iso.datetime({ offset: true }).optional(), version: z.number().int() });

export const sampleShipmentListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
});
