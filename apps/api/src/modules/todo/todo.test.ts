import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotificationService } from "../notification/notification.service.js";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { TodoService } from "./todo.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T02:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

describe("todos and notifications", () => {
  it("groups by overdue / today / later and is idempotent by fingerprint", async () => {
    const todos = t.app.get(TodoService);
    const sales = await t.as("sales");
    const base = { source: "FLOW" as const, action: "inspection.record", docType: "inspection", assigneeId: sales.userId, customerId: t.refs.customers.NSR };
    await todos.upsert({ ...base, fingerprint: "a", title: "登记验货结果", docNo: "INSP-2610-020", dueAt: new Date("2026-10-17T10:00:00Z") });
    await todos.upsert({ ...base, fingerprint: "a", title: "登记验货结果（更新）", docNo: "INSP-2610-020", dueAt: new Date("2026-10-17T10:00:00Z") });
    await todos.upsert({ ...base, fingerprint: "b", title: "复核企划要素", dueAt: new Date("2026-10-21T10:00:00Z") });
    await todos.upsert({ ...base, fingerprint: "c", title: "确认订舱", dueAt: new Date("2026-10-25T10:00:00Z") });
    const board = (await sales.get("/todos/board")).body.data;
    expect(board.overdue.map((i: { title: string }) => i.title)).toEqual(["登记验货结果（更新）"]);
    expect(board.overdue[0].overdueDays).toBe(3);
    expect(board.overdue[0].customerName).toBe("北岸运动");
    expect(board.today).toHaveLength(1);
    expect(board.later).toHaveLength(1);
    await todos.close("a");
    expect((await sales.get("/todos/board")).body.data.counts.total).toBe(2);
    const other = await t.as("sales2");
    expect((await other.get("/todos/board")).body.data.counts.total).toBe(0);
  });

  it("delivers notifications and marks them read", async () => {
    const sales = await t.as("sales");
    await t.app.get(NotificationService).notify([sales.userId], { type: "patrol.hit", title: "巡检命中 3 条", link: "/patrol" });
    const list = (await sales.get("/notifications")).body.data;
    expect(list.unread).toBe(1);
    await sales.post("/notifications/read-all");
    expect((await sales.get("/notifications")).body.data.unread).toBe(0);
  });
});
