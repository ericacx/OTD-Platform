import { describe, expect, it } from "vitest";

import { groupByLocalDay } from "./todo-groups";

import type { TodoBoard, TodoItem } from "../todo.types";

function item(id: string, dueAt: Date | null): TodoItem {
  return {
    id,
    source: "FLOW",
    action: "x",
    title: id,
    description: null,
    docType: "order",
    docId: null,
    docNo: null,
    link: null,
    customerId: null,
    customerName: null,
    dueAt: dueAt ? dueAt.toISOString() : null,
    overdueDays: 0,
    status: "OPEN",
    createdAt: new Date(2026, 9, 1).toISOString(),
  };
}

describe("groupByLocalDay", () => {
  it("regroups server buckets by the browser's local day", () => {
    const now = new Date(2026, 9, 21, 7, 30);
    const board: TodoBoard = {
      overdue: [],
      today: [item("yesterday-late", new Date(2026, 9, 20, 23, 0))],
      later: [
        item("today-evening", new Date(2026, 9, 21, 18, 0)),
        item("no-due", null),
        item("tomorrow", new Date(2026, 9, 22, 9, 0)),
      ],
      counts: { total: 4, overdue: 0, today: 1, later: 3, byDocType: {} },
    };
    const groups = groupByLocalDay(board, now);
    expect(groups.overdue.map((i) => i.id)).toEqual(["yesterday-late"]);
    expect(groups.today.map((i) => i.id)).toEqual(["today-evening"]);
    expect(groups.later.map((i) => i.id)).toEqual(["tomorrow", "no-due"]);
  });
});
