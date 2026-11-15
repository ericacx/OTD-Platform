import { z } from "zod";

export const todoItemSchema = z.object({
  id: z.string(),
  source: z.enum(["FLOW", "PATROL", "MANUAL", "AI"]),
  action: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  docType: z.string().nullable(),
  docId: z.string().nullable(),
  docNo: z.string().nullable(),
  link: z.string().nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  dueAt: z.string().nullable(),
  overdueDays: z.number().int(),
  status: z.enum(["OPEN", "DONE", "CANCELLED"]),
  createdAt: z.string(),
});
export type TodoItem = z.infer<typeof todoItemSchema>;

export const todoBoardSchema = z.object({
  overdue: z.array(todoItemSchema),
  today: z.array(todoItemSchema),
  later: z.array(todoItemSchema),
  counts: z.object({ total: z.number().int(), overdue: z.number().int(), today: z.number().int(), later: z.number().int(), byDocType: z.record(z.string(), z.number().int()) }),
});
export type TodoBoard = z.infer<typeof todoBoardSchema>;

export const todoCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  assigneeId: z.uuid().optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  link: z.string().max(300).nullable().optional(),
});

export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;
