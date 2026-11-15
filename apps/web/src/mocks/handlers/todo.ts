import { HttpResponse, http } from "msw";

import { sessionFor } from "../fixtures/iam";
import { envelope } from "./util";

import type { TodoBoard, TodoItem, TodoOverview } from "@otd/contracts/todo";

const DAY = 86_400_000;

function at(offsetDays: number, hour = 10): string {
  const base = new Date();
  base.setHours(hour, 0, 0, 0);
  return new Date(base.getTime() + offsetDays * DAY).toISOString();
}

function todo(id: string, patch: Partial<TodoItem>): TodoItem {
  return {
    id,
    source: "FLOW",
    action: "order.review",
    title: "复核客户 PO",
    description: null,
    docType: "order",
    docId: "o-1",
    docNo: "PO0010459",
    link: "/orders/o-1",
    customerId: "c-nsr",
    customerName: "北岸运动",
    dueAt: at(0),
    overdueDays: 0,
    status: "OPEN",
    createdAt: at(-3),
    ...patch,
  };
}

export function mockTodoBoard(): TodoBoard {
  return {
    overdue: [
      todo("t-1", { description: "#11506 等 2 款 · 37,080 双", dueAt: at(-2), overdueDays: 2 }),
      todo("t-2", {
        title: "确认订舱",
        action: "order.confirmBooking",
        docNo: "PO0009412",
        docId: "o-3",
        link: "/orders/o-3",
        customerName: "蓝湾生活",
        dueAt: at(-1),
        overdueDays: 1,
      }),
    ],
    today: [
      todo("t-3", {
        title: "跟进生产进度",
        docNo: "PO0009631",
        docId: "o-2",
        link: "/orders/o-2",
        customerName: "晨跑者",
        dueAt: at(0, 23),
      }),
    ],
    later: [
      todo("t-4", { title: "登记客户确认", dueAt: at(2) }),
      todo("t-5", {
        title: "安排尾期验货",
        docNo: "PO0009631",
        docId: "o-2",
        link: "/orders/o-2",
        customerName: "晨跑者",
        dueAt: at(5),
      }),
      todo("t-6", {
        title: "整理样品寄送清单",
        source: "MANUAL",
        action: "manual",
        docType: null,
        docId: null,
        docNo: null,
        link: null,
        customerId: null,
        customerName: null,
        dueAt: null,
      }),
    ],
    counts: { total: 6, overdue: 2, today: 1, later: 3, byDocType: { order: 5, other: 1 } },
  };
}

export const mockOverview: TodoOverview = {
  greeting: { userName: "王芳", today: "2026-10-21", weekday: 3, dataScope: "SELF", allCustomers: false },
  kpis: {
    todos: { total: 6, byDocType: { order: 5, other: 1 } },
    activeOrders: 2,
    samplingStyles: 3,
    dueSoonOrders: 1,
  },
  customerDistribution: [
    { customerId: "c-nsr", customerName: "北岸运动", orders: 1, pairs: 37080, pairsWan: 3.71 },
    { customerId: "c-mrn", customerName: "晨跑者", orders: 1, pairs: 12600, pairsWan: 1.26 },
  ],
  statusDistribution: [
    { status: "IN_PRODUCTION", count: 1 },
    { status: "COMPLETED", count: 0 },
    { status: "PENDING_CONFIRM", count: 1 },
    { status: "TO_SCHEDULE", count: 0 },
    { status: "TO_SHIP", count: 0 },
  ],
  focus: {
    pendingConfirmOrders: { count: 1, link: "/orders?status=PENDING_CONFIRM" },
    pendingBookings: { count: 1, link: "/shipments/bookings?status=PENDING_CARRIER" },
    toShipOrders: { count: 0, link: "/orders?status=TO_SHIP" },
    riskOrders: { count: 1, link: "/orders?risk=1" },
  },
  dueReminders: [
    {
      kind: "ETD",
      docType: "booking",
      docId: "bk-1",
      docNo: "BK-2610-018",
      customerName: "晨跑者",
      date: "2026-10-18",
      daysLeft: -3,
      link: "/shipments/bookings/bk-1",
    },
    {
      kind: "CUSTOMER_DUE",
      docType: "order",
      docId: "o-2",
      docNo: "PO0009631",
      customerName: "晨跑者",
      date: "2026-11-03",
      daysLeft: 13,
      link: "/orders/o-2",
    },
  ],
};

export const todoHandlers = [
  http.get("*/todos/overview", ({ request }) => {
    const phone = request.headers.get("authorization")?.replace(/^Bearer mock-access-/, "") ?? "13800000000";
    const name = sessionFor(phone)?.name ?? mockOverview.greeting.userName;
    return HttpResponse.json(envelope({ ...mockOverview, greeting: { ...mockOverview.greeting, userName: name } }));
  }),
  http.get("*/todos/board", () => HttpResponse.json(envelope(mockTodoBoard()))),
  http.post("*/todos/:id/done", () => HttpResponse.json(envelope(null))),
];
