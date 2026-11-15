import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { PackagingService } from "./packaging.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

describe("packaging demo data", () => {
  it("ships PO0010459 with a confirmed v3 plan and two earlier versions", async () => {
    const sales = await t.as("sales");
    const list = (await sales.get("/packaging/plans?keyword=PO0010459")).body.data;
    expect(list.total).toBe(1);
    const plan = (await sales.get(`/packaging/plans/${list.items[0].id}`)).body.data;
    expect(plan).toMatchObject({ status: "CONFIRMED", currentVersion: 3, effectiveVersion: 3, pairsPerCarton: 120, confirmedBy: "Milena Ortiz", customerCode: "NSR", styleNo: "11506" });
    expect(plan.versions.map((v: { versionNo: number; customerConfirmed: boolean }) => [v.versionNo, v.customerConfirmed])).toEqual([[1, true], [2, true], [3, true]]);
    const diff = (await sales.get(`/packaging/plans/${plan.id}/compare?from=1&to=3`)).body.data;
    expect(diff.diffs.map((d: { field: string }) => d.field)).toEqual(["pairsPerCarton", "innerBag"]);
    expect(diff.diffs[0]).toMatchObject({ from: 100, to: 120 });
  });

  it("has plans and carton lists in every status, with complete coverage for confirmed orders", async () => {
    const gm = await t.as("gm");
    const plans = (await gm.get("/packaging/plans?pageSize=50")).body.data.items as { status: string; poNo: string; orderId: string }[];
    expect(new Set(plans.map((p) => p.status))).toEqual(new Set(["CONFIRMED", "PENDING_CUSTOMER", "DRAFT"]));
    const cartons = (await gm.get("/packaging/cartons?pageSize=50")).body.data.items as { status: string; orderId: string; cartonRange: string; cartonCount: number; pairs: number; pairsPerCarton: number }[];
    expect(new Set(cartons.map((c) => c.status))).toEqual(new Set(["TO_PACK", "PACKING", "PACKED"]));
    for (const c of cartons) expect(c.cartonCount).toBe(Math.ceil(c.pairs / c.pairsPerCarton));
    const mrn = plans.find((p) => p.poNo === "PO0009631")!;
    expect((await gm.get(`/packaging/cartons/coverage?orderId=${mrn.orderId}`)).body.data.covered).toBe(true);
    expect(await t.app.get(PackagingService).remindPendingCustomer()).toBe(1);
  });
});
