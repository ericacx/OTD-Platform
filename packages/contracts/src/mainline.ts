import { z } from "zod";
import { labelSchema } from "./common.js";

export const nodeStateSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED", "NOT_APPLICABLE"]);
export type NodeStateDto = z.infer<typeof nodeStateSchema>;

export const mainlineNodeSchema = z.object({
  code: z.string(),
  key: z.string(),
  name: labelSchema,
  gate: z.enum(["G1", "G2"]).nullable(),
  state: nodeStateSchema,
  summary: labelSchema,
  blockedReasons: z.array(labelSchema),
  link: z.string().nullable(),
  parallel: z.boolean(),
  styles: z.array(z.object({ styleNo: z.string(), state: nodeStateSchema })),
  enteredAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type MainlineNode = z.infer<typeof mainlineNodeSchema>;

export const mainlineSchema = z.object({
  orderId: z.string(),
  poNo: z.string(),
  nodes: z.array(mainlineNodeSchema),
  completedCount: z.number().int(),
  total: z.number().int(),
  currentNode: z.string().nullable(),
  closed: z.boolean(),
  headline: labelSchema,
  computedAt: z.string(),
});
export type MainlineDto = z.infer<typeof mainlineSchema>;

export const monitorQuerySchema = z.object({ poNo: z.string().trim().min(1).max(40) });

export const monitorOrderSchema = z.object({
  id: z.string(),
  poNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  seasonCode: z.string().nullable(),
  styleNos: z.array(z.string()),
  styleSummary: z.string(),
  totalPairs: z.number().int(),
  customerDueDate: z.string(),
  factoryName: z.string().nullable(),
  status: z.string(),
});

export const monitorSchema = z.object({ order: monitorOrderSchema, mainline: mainlineSchema });
export type MonitorDto = z.infer<typeof monitorSchema>;

export const searchTypeSchema = z.enum(["order", "customer", "style", "planning", "sample", "sampleShipment", "testRequest", "testReport", "quote", "handover", "packaging", "carton", "purchase", "inspection", "booking", "shipment", "receivable"]);
export type SearchType = z.infer<typeof searchTypeSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const searchResultSchema = z.object({
  type: searchTypeSchema,
  id: z.string(),
  docNo: z.string(),
  title: z.string(),
  link: z.string(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
