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

export const overviewLinkCountSchema = z.object({ count: z.number().int(), link: z.string() });

export const dueReminderSchema = z.object({
  kind: z.enum(["CUSTOMER_DUE", "FACTORY_DUE", "ETD", "FINAL_INSPECTION"]),
  docType: z.string(),
  docId: z.string(),
  docNo: z.string(),
  customerName: z.string().nullable(),
  date: z.string(),
  daysLeft: z.number().int(),
  link: z.string(),
});
export type DueReminder = z.infer<typeof dueReminderSchema>;

export const todoOverviewSchema = z.object({
  greeting: z.object({
    userName: z.string(),
    today: z.string(),
    weekday: z.number().int(),
    dataScope: z.enum(["SELF", "ORG", "ORG_AND_CHILDREN", "ALL"]),
    allCustomers: z.boolean(),
  }),
  kpis: z.object({
    todos: z.object({ total: z.number().int(), byDocType: z.record(z.string(), z.number().int()) }),
    activeOrders: z.number().int(),
    samplingStyles: z.number().int(),
    dueSoonOrders: z.number().int(),
  }),
  customerDistribution: z.array(z.object({ customerId: z.string(), customerName: z.string(), orders: z.number().int(), pairs: z.number().int(), pairsWan: z.number() })),
  statusDistribution: z.array(z.object({ status: z.string(), count: z.number().int() })),
  focus: z.object({
    pendingConfirmOrders: overviewLinkCountSchema,
    pendingBookings: overviewLinkCountSchema,
    toShipOrders: overviewLinkCountSchema,
    riskOrders: overviewLinkCountSchema,
  }),
  dueReminders: z.array(dueReminderSchema),
});
export type TodoOverview = z.infer<typeof todoOverviewSchema>;
