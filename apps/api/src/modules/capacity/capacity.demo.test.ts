import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { CapacityService } from "./capacity.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

type Row = {
  ledger: string;
  baseId: string;
  baseCode: string;
  needleTypeId: string | null;
  needleCode: string | null;
  availableDays: number;
  leadDays: number;
  dailyOutput: number;
  machineCount: number;
  cumulativeCapacity: number;
  unproducedQty: number;
  otdUnproducedQty: number;
  erpBacklog: number;
  spareCapacity: number;
  spareRate: number;
  tight: boolean;
};

describe("capacity demo data", () => {
  it("has V25 published and V26 computed from OTD orders plus ERP backlog with a realistic spare-rate spread", async () => {
    const planner = await t.as("planner");
    const versions = (await planner.get("/capacity/versions")).body.data;
    expect(versions.map((v: { label: string; status: string }) => [v.label, v.status])).toEqual([["V26", "DRAFT"], ["V25", "PUBLISHED"]]);
    expect(versions[0].asOfDate).toBe("2026-10-20");
    expect(versions[0].rowCounts).toMatchObject({ PACKING: 3, SPECIAL: 3 });
    const d = (await planner.get(`/capacity/versions/${versions[0].id}`)).body.data;
    const knit = (d.rows as Row[]).filter((r) => r.ledger === "KNIT");
    for (const r of knit) {
      expect(r.availableDays).toBe(60 - r.leadDays);
      expect(r.cumulativeCapacity).toBeCloseTo(r.availableDays * r.dailyOutput * r.machineCount, 2);
      expect(r.unproducedQty).toBeCloseTo(r.otdUnproducedQty + r.erpBacklog, 2);
      expect(r.spareCapacity).toBeCloseTo(r.cumulativeCapacity - r.unproducedQty, 2);
    }
    expect(d.kpis.tightCount).toBeGreaterThanOrEqual(1);
    expect(d.kpis.tightCount).toBeLessThanOrEqual(3);
    expect(d.kpis.avgSpareRate).toBeGreaterThan(0.18);
    expect(d.kpis.avgSpareRate).toBeLessThan(0.27);
    expect(d.kpis.overdueTasks).toBe(1);
    expect(knit.filter((r) => r.tight).map((r) => `${r.baseCode}-${r.needleCode}`)).toEqual(expect.arrayContaining(["DC-200N", "VN-144N"]));

    const service = t.app.get(CapacityService);
    const otdOnly = await service.computeKnitRows(t.db, 60);
    const backlog = new Map(knit.map((r) => [`KNIT:${r.baseId}:${r.needleTypeId}:`, r.erpBacklog]));
    const recomputed = await service.computeKnitRows(t.db, 60, { backlog });
    expect(recomputed).toHaveLength(knit.length);
    for (const r of knit) {
      const a = otdOnly.find((x) => x.baseId === r.baseId && x.needleTypeId === r.needleTypeId)!;
      const b = recomputed.find((x) => x.baseId === r.baseId && x.needleTypeId === r.needleTypeId)!;
      expect(r.otdUnproducedQty).toBeCloseTo(a.unproducedQty ?? 0, 2);
      expect(r.unproducedQty).toBeCloseTo(b.unproducedQty ?? 0, 2);
      expect(r.spareRate).toBeCloseTo(b.spareRate ?? 0, 4);
    }
    const tasks = (await planner.get("/capacity/tasks")).body.data;
    expect(tasks.find((x: { ledger: string }) => x.ledger === "SPECIAL")).toMatchObject({ status: "OVERDUE", nextDueAt: "2026-10-19", overdueDays: 2 });
  });
});
