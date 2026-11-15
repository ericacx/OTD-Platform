import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

describe("purchase demo data", () => {
  it("has one overdue and one partially received purchase among the buyer's orders", async () => {
    const buyer = await t.as("buyer");
    const all = (await buyer.get("/purchases?pageSize=50")).body.data;
    expect(all.total).toBe(8);
    const overdue = (await buyer.get("/purchases?overdue=true")).body.data.items;
    expect(overdue.map((p: { poNo: string; status: string }) => [p.poNo, p.status])).toEqual([["PO0009690", "ORDERED"]]);
    const partial = all.items.filter((p: { status: string }) => p.status === "PARTIAL");
    expect(partial).toHaveLength(1);
    expect(partial[0].receivedRate).toBeCloseTo(3000 / 5400, 4);
    const receipts = (await buyer.get("/purchases/receipts?pageSize=50")).body.data;
    expect(receipts.total).toBeGreaterThanOrEqual(6);
    const req = (await buyer.get(`/purchases/requirements?orderId=${partial[0].orderId}`)).body.data;
    expect(req.totalPairs).toBe(5400);
  });
});
