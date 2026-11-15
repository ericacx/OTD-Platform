import { sampleStageLogs, styles } from "@otd/db";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

async function styleOf(code: string, styleNo: string) {
  return (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers[code]!), eq(styles.styleNo, styleNo))))[0]!;
}

async function factoryId(code: string): Promise<string> {
  const { factories } = await import("@otd/db");
  return (await t.db.select().from(factories).where(eq(factories.code, code)))[0]!.id;
}

async function newSample(tech: Caller, styleNo = "12593", customer = "NSR") {
  const style = await styleOf(customer, styleNo);
  const res = await tech.post("/samples", { styleId: style.id, factoryId: await factoryId("DC1"), dueDate: "2026-11-24", colorway: "酒红", roundType: "PROTO", quantity: 6 });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function advance(caller: Caller, sample: { id: string }, to: string, extra: Record<string, unknown> = {}) {
  const current = (await caller.get(`/samples/${sample.id}`)).body.data;
  const round = current.rounds[current.rounds.length - 1];
  return caller.post(`/samples/rounds/${round.id}/advance`, { to, version: round.version, ...extra });
}

async function advanceAll(caller: Caller, sample: { id: string }, steps: string[]) {
  let last;
  for (const to of steps) {
    last = await advance(caller, sample, to);
    expect(last.status, `${to}: ${JSON.stringify(last.body)}`).toBe(200);
  }
  return last!.body.data;
}

describe("sample orders", () => {
  it("lets the technician advance stages with logs, rejects sales (403), stale versions and illegal moves", async () => {
    const tech = await t.as("tech");
    const sales = await t.as("sales");
    const s = await newSample(tech);
    expect(s.docNo).toMatch(/^SP-2610-\d{3}$/);
    expect(s.currentRound).toMatchObject({ roundNo: 1, roundType: "PROTO", status: "ISSUED" });
    expect(s.technicianName).toBe("陈静");
    expect((await sales.get(`/samples/${s.id}`)).status).toBe(200);

    const board = (await tech.get("/todos/board")).body.data;
    const all = [...board.overdue, ...board.today, ...board.later];
    expect(all.some((x: { docId: string; action: string }) => x.docId === s.id && x.action === "sample.round.receive")).toBe(true);

    const round = s.rounds[0];
    expect((await sales.post(`/samples/rounds/${round.id}/advance`, { to: "RECEIVING", version: round.version })).status).toBe(403);
    expect((await tech.post(`/samples/rounds/${round.id}/advance`, { to: "SOURCING", version: round.version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const ok = await tech.post(`/samples/rounds/${round.id}/advance`, { to: "RECEIVING", version: round.version, location: "东城一厂 · 打样中心" });
    expect(ok.status).toBe(200);
    expect((await tech.post(`/samples/rounds/${round.id}/advance`, { to: "SOURCING", version: round.version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const after = (await tech.get("/todos/board")).body.data;
    expect([...after.overdue, ...after.today, ...after.later].some((x: { docId: string; action: string }) => x.docId === s.id && x.action === "sample.round.receive")).toBe(false);

    const done = await advanceAll(tech, s, ["SOURCING", "KNITTING", "QC", "KNITTING", "QC", "READY"]);
    const r = done.rounds[0];
    expect(r.status).toBe("READY");
    expect(r.reworkCount).toBe(1);
    expect(r.stages.map((x: { stage: string; state: string }) => `${x.stage}:${x.state}`)).toEqual(["RECEIVING:DONE", "SOURCING:DONE", "KNITTING:DONE", "QC:DONE", "READY:ACTIVE"]);
    expect(r.stages.find((x: { stage: string }) => x.stage === "QC").passes).toBe(2);
    expect(r.logs.map((x: { stage: string }) => x.stage)).toEqual(["ISSUED", "RECEIVING", "SOURCING", "KNITTING", "QC", "KNITTING", "QC", "READY"]);
    expect(r.logs[1].location).toBe("东城一厂 · 打样中心");
    expect(r.logs[1].operatorName).toBe("陈静");
    expect(r.logs[0].leftAt).toBe("2026-10-21T01:00:00.000Z");

    const admin = await t.as("admin");
    const logs = (await admin.get(`/system/audit-logs?keyword=${s.docNo}`)).body.data.items.map((l: { action: string }) => l.action);
    expect(logs).toContain("sample.round.rework");
    expect(logs).toContain("sample.sample.create");
  });

  it("applies data scope: other sales reps cannot see the sample, functional departments can", async () => {
    const tech = await t.as("tech");
    const s = await newSample(tech);
    const other = await t.as("sales3");
    expect((await other.get(`/samples/${s.id}`)).status).toBe(404);
    const list = (await other.get("/samples?pageSize=200")).body.data;
    expect(list.items.some((x: { id: string }) => x.id === s.id)).toBe(false);
    expect((await (await t.as("quality")).get(`/samples/${s.id}`)).status).toBe(200);
    expect((await (await t.as("planner")).get(`/samples/${s.id}`)).status).toBe(403);
    const manager = await t.as("manager");
    expect((await manager.get(`/samples/${s.id}`)).status).toBe(200);
    const mine = (await (await t.as("sales")).get(`/samples?keyword=${s.docNo}`)).body.data;
    expect(mine.items.map((x: { id: string }) => x.id)).toEqual([s.id]);
  });

  it("flags a stage slower than the average", async () => {
    const tech = await t.as("tech");
    const s = await newSample(tech);
    await advanceAll(tech, s, ["RECEIVING", "SOURCING", "KNITTING", "QC"]);
    const round = (await tech.get(`/samples/${s.id}`)).body.data.rounds[0];
    const open = (await t.db.select().from(sampleStageLogs).where(and(eq(sampleStageLogs.roundId, round.id), isNull(sampleStageLogs.leftAt))))[0]!;
    await t.db.update(sampleStageLogs).set({ enteredAt: new Date("2026-10-15T01:00:00Z") }).where(eq(sampleStageLogs.id, open.id));
    const detail = (await tech.get(`/samples/${s.id}`)).body.data;
    const qc = detail.rounds[0].stages.find((x: { stage: string }) => x.stage === "QC");
    expect(qc.state).toBe("ACTIVE");
    expect(qc.durationHours).toBe(144);
    expect(qc.slow).toBe(true);
    expect(qc.durationHours).toBeGreaterThan(qc.avgHours);
    expect(detail.rounds[0].progress).toBe("SLOW");
    const list = (await tech.get(`/samples?keyword=${s.docNo}`)).body.data;
    expect(list.items[0].currentRound.progress).toBe("SLOW");
  });

  it("opens the next round when the customer asks for a revision, then approves", async () => {
    const tech = await t.as("tech");
    const sales = await t.as("sales");
    const s = await newSample(tech);
    await advanceAll(tech, s, ["RECEIVING", "SOURCING", "KNITTING", "QC", "READY"]);
    const awaiting = await advance(sales, s, "AWAITING_APPROVAL");
    expect(awaiting.status).toBe(200);
    const board = (await sales.get("/todos/board")).body.data;
    expect([...board.overdue, ...board.today, ...board.later].some((x: { docId: string; action: string }) => x.docId === s.id && x.action === "sample.round.approve")).toBe(true);

    const r1 = awaiting.body.data.rounds[0];
    expect((await (await t.as("quality")).post(`/samples/rounds/${r1.id}/approve`, { result: "REVISE", version: r1.version })).status).toBe(403);
    const revised = await sales.post(`/samples/rounds/${r1.id}/approve`, { result: "REVISE", note: "罗口加高 1cm，颜色偏暗", version: r1.version });
    expect(revised.status).toBe(200);
    const d = revised.body.data;
    expect(d.rounds.map((x: { roundNo: number; status: string }) => `${x.roundNo}:${x.status}`)).toEqual(["1:REVISE", "2:ISSUED"]);
    expect(d.rounds[1].reviseNote).toBe("罗口加高 1cm，颜色偏暗");
    expect(d.rounds[1].roundType).toBe("PROTO");
    expect(d.currentRound.roundNo).toBe(2);
    const after = (await sales.get("/todos/board")).body.data;
    expect([...after.overdue, ...after.today, ...after.later].some((x: { docId: string; action: string }) => x.docId === s.id && x.action === "sample.round.approve")).toBe(false);

    expect((await sales.post(`/samples/rounds/${d.rounds[1].id}/approve`, { result: "APPROVED", version: d.rounds[1].version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    await advanceAll(tech, s, ["RECEIVING", "SOURCING", "KNITTING", "QC", "READY", "AWAITING_APPROVAL"]);
    const r2 = (await sales.get(`/samples/${s.id}`)).body.data.rounds[1];
    const approved = await sales.post(`/samples/rounds/${r2.id}/approve`, { result: "APPROVED", approvalDate: "2026-10-21", version: r2.version });
    expect(approved.body.data.rounds[1]).toMatchObject({ status: "APPROVED", approvalResult: "APPROVED", approvalDate: "2026-10-21" });

    const next = await tech.post(`/samples/${s.id}/rounds`, { roundType: "SMS", quantity: 12, version: approved.body.data.version });
    expect(next.status).toBe(201);
    expect(next.body.data.rounds[2]).toMatchObject({ roundNo: 3, roundType: "SMS", status: "ISSUED" });
    expect((await tech.post(`/samples/${s.id}/rounds`, { roundType: "PP", version: next.body.data.version })).body.errcode).toBe("SAMPLE_ROUND_OPEN");
  });

  it("moves READY rounds to awaiting approval when the sample shipment is sent", async () => {
    const tech = await t.as("tech");
    const sales = await t.as("sales");
    const s = await newSample(tech);
    const ready = await advanceAll(tech, s, ["RECEIVING", "SOURCING", "KNITTING", "QC", "READY"]);
    const round = ready.rounds[0];
    const shipment = await sales.post("/sample-shipments", { customerId: t.refs.customers.NSR, method: "COURIER", courier: "DHL", items: [{ styleId: s.styleId, roundId: round.id, kind: "PROTO", quantity: 6 }] });
    expect(shipment.status).toBe(201);
    const sent = await sales.post(`/sample-shipments/${shipment.body.data.id}/send`, { trackingNo: "SF7710003425", version: shipment.body.data.version });
    expect(sent.status).toBe(200);
    const detail = (await sales.get(`/samples/${s.id}`)).body.data;
    expect(detail.rounds[0]).toMatchObject({ status: "AWAITING_APPROVAL", shipmentDocNo: shipment.body.data.docNo, shipmentId: shipment.body.data.id });
    expect(detail.rounds[0].logs.map((x: { stage: string }) => x.stage).slice(-2)).toEqual(["SHIPPED", "AWAITING_APPROVAL"]);
  });

  it("requires materials to arrive before knitting", async () => {
    const tech = await t.as("tech");
    const s = await newSample(tech);
    const m = await tech.post("/samples/materials", { sampleId: s.id, materialName: "40S/1*2 T80C20 纱线", spec: "酒红", quantity: 2.5, unit: "kg", arrivalDate: "2026-10-23" });
    expect(m.status).toBe(201);
    await advanceAll(tech, s, ["RECEIVING", "SOURCING"]);
    const blocked = await advance(tech, s, "KNITTING");
    expect(blocked.body.errcode).toBe("SAMPLE_MATERIALS_PENDING");
    const sales = await t.as("sales");
    expect((await sales.post(`/samples/materials/${m.body.data.id}/arrive`, { version: m.body.data.version })).status).toBe(403);
    const arrived = await tech.post(`/samples/materials/${m.body.data.id}/arrive`, { version: m.body.data.version });
    expect(arrived.body.data.status).toBe("ARRIVED");
    expect((await advance(tech, s, "KNITTING")).status).toBe(200);
    const list = (await sales.get(`/samples/materials?sampleId=${s.id}`)).body.data;
    expect(list.items.map((x: { materialName: string }) => x.materialName)).toEqual(["40S/1*2 T80C20 纱线"]);
  });

  it("maintains the sample library with lend and return", async () => {
    const tech = await t.as("tech");
    const sales = await t.as("sales");
    const s = await newSample(tech);
    expect((await sales.post("/samples/library", { styleId: s.styleId, kind: "QRS", location: "A-01" })).status).toBe(403);
    const created = await tech.post("/samples/library", { styleId: s.styleId, sampleId: s.id, roundId: s.rounds[0].id, kind: "QRS", location: "技术部样品柜 A-01", quantity: 2 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ kind: "QRS", status: "IN_STOCK", styleNo: "12593", roundLabel: "PROTO 第 1 轮", sampleDocNo: s.docNo });
    const mine = (await sales.get(`/samples/library?styleId=${s.styleId}&kind=QRS`)).body.data;
    expect(mine.items.some((x: { id: string }) => x.id === created.body.data.id)).toBe(true);
    const other = (await (await t.as("sales3")).get("/samples/library?pageSize=200")).body.data;
    expect(other.items.some((x: { id: string }) => x.id === created.body.data.id)).toBe(false);
    const lent = await tech.post(`/samples/library/${created.body.data.id}/lend`, { borrower: "王芳", version: created.body.data.version });
    expect(lent.body.data).toMatchObject({ status: "LENT", borrower: "王芳" });
    expect((await tech.post(`/samples/library/${created.body.data.id}/lend`, { borrower: "王芳", version: lent.body.data.version })).body.errcode).toBe("SAMPLE_LIBRARY_STATUS");
    const back = await tech.post(`/samples/library/${created.body.data.id}/return`, { version: lent.body.data.version });
    expect(back.body.data.status).toBe("IN_STOCK");
    expect((await tech.get(`/samples/${s.id}`)).body.data.library).toHaveLength(1);
  });

  it("seeds demo sampling data: #12593 waits at READY with QC slower than average", async () => {
    const sales = await t.as("sales");
    const list = (await sales.get("/samples?keyword=12593")).body.data;
    const seeded = list.items.find((x: { planningDocNo: string | null }) => x.planningDocNo);
    expect(seeded).toMatchObject({ styleNo: "12593", factoryName: "东城一厂", costStatus: "COST_REVIEW", dueDate: "2026-11-24", remainingDays: 34 });
    expect(seeded.currentRound).toMatchObject({ roundNo: 1, roundType: "PROTO", status: "READY", reworkCount: 1 });
    const detail = (await sales.get(`/samples/${seeded.id}`)).body.data;
    const qc = detail.rounds[0].stages.find((x: { stage: string }) => x.stage === "QC");
    expect(qc).toMatchObject({ state: "DONE", durationHours: 28.8, passes: 2, slow: true });
    expect(qc.avgHours).toBeLessThan(28.8);
    expect(detail.rounds[0].stages.find((x: { stage: string }) => x.stage === "READY")).toMatchObject({ state: "ACTIVE", slow: false });
    expect(detail.materials).toHaveLength(3);

    const gm = await t.as("gm");
    const all = (await gm.get("/samples?pageSize=200")).body.data.items;
    const by = (no: string) => all.find((x: { styleNo: string }) => x.styleNo === no);
    expect(by("12610").currentRound.status).toBe("ISSUED");
    expect(by("12603").currentRound.status).toBe("AWAITING_APPROVAL");
    const revised = (await gm.get(`/samples/${by("12744").id}`)).body.data;
    expect(revised.rounds.map((r: { status: string }) => r.status)).toEqual(["REVISE", "KNITTING"]);
    const approved = (await gm.get(`/samples/${by("11506").id}`)).body.data;
    expect(approved.rounds.map((r: { status: string }) => r.status)).toEqual(["REVISE", "APPROVED"]);
    const qrs = (await gm.get("/samples/library?kind=QRS&pageSize=50")).body.data.items.map((x: { styleNo: string }) => x.styleNo).sort();
    expect(qrs).toEqual(["11151", "11152", "11506", "12750"]);
    expect((await gm.get("/samples?status=AWAITING_APPROVAL")).body.data.items.map((x: { styleNo: string }) => x.styleNo)).toEqual(["12603"]);
  });
});
