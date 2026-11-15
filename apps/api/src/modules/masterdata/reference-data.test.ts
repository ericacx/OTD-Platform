import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

describe("master data (other than customers)", () => {
  it("creates, edits, soft-deletes factories and bases; lookups drop deleted rows", async () => {
    const admin = await t.as("admin");
    const bases = (await admin.get("/masterdata/bases")).body.data;
    expect(bases.total).toBe(3);
    const dc = bases.items.find((b: { code: string }) => b.code === "DC");
    expect(dc.factoryCount).toBe(2);
    expect(dc.machineCount).toBe(856);

    const base = await admin.post("/masterdata/bases", { code: "KH", name: "柬埔寨基地", nameEn: "Cambodia Base", country: "KH" });
    expect(base.status).toBe(201);
    expect((await admin.post("/masterdata/bases", { code: "KH", name: "重复", country: "KH" })).body.errcode).toBe("COMMON_DUPLICATE");
    const factory = await admin.post("/masterdata/factories", { code: "PP1", name: "金边一厂", baseId: base.body.data.id, legalEntity: "OTD Knitting Cambodia" });
    expect(factory.status).toBe(201);
    expect(factory.body.data.baseName).toBe("柬埔寨基地");
    const updated = await admin.put(`/masterdata/factories/${factory.body.data.id}`, { code: "PP1", name: "金边一厂（新园区）", baseId: base.body.data.id, version: factory.body.data.version });
    expect(updated.body.data.version).toBe(2);
    const stale = await admin.put(`/masterdata/factories/${factory.body.data.id}`, { code: "PP1", name: "x", baseId: base.body.data.id, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await admin.get("/masterdata/factories?keyword=金边")).body.data.total).toBe(1);

    let lookups = (await admin.get("/lookups")).body.data;
    expect(lookups.factories.map((f: { code: string }) => f.code)).toContain("PP1");
    const blocked = await admin.del(`/masterdata/bases/${base.body.data.id}`);
    expect(blocked.body.errcode).toBe("MASTERDATA_IN_USE");
    expect((await admin.del(`/masterdata/factories/${factory.body.data.id}?version=1`)).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await admin.del(`/masterdata/factories/${factory.body.data.id}?version=2`)).status).toBe(200);
    expect((await admin.del(`/masterdata/bases/${base.body.data.id}`)).status).toBe(200);
    lookups = (await admin.get("/lookups")).body.data;
    expect(lookups.factories.map((f: { code: string }) => f.code)).not.toContain("PP1");
    expect(lookups.bases.map((b: { code: string }) => b.code)).not.toContain("KH");
    expect((await admin.get("/masterdata/factories?keyword=金边")).body.data.total).toBe(0);
    expect((await admin.get(`/masterdata/factories/${factory.body.data.id}`)).status).toBe(404);
    expect((await admin.post("/masterdata/factories", { code: "PP1", name: "重建", baseId: dc.id })).body.errcode).toBe("COMMON_DUPLICATE");

    const logs = (await admin.get("/system/audit-logs?keyword=PP1")).body.data;
    expect(logs.items.map((l: { action: string }) => l.action).sort()).toEqual(["masterdata.factory.create", "masterdata.factory.delete", "masterdata.factory.update"]);
  });

  it("maintains needle types and base machines", async () => {
    const planner = await t.as("planner");
    const needles = (await planner.get("/masterdata/needle-types")).body.data;
    expect(needles.items.map((n: { code: string }) => n.code)).toEqual(["96N", "120N", "144N", "168N", "200N"]);
    expect(needles.items.find((n: { code: string }) => n.code === "96N").machines).toHaveLength(3);
    const created = await planner.post("/masterdata/needle-types", { code: "108N", needles: 108, description: "细针薄款" });
    expect(created.status).toBe(201);
    const bases = (await planner.get("/masterdata/bases")).body.data.items;
    const nh = bases.find((b: { code: string }) => b.code === "NH");
    const seededMachines = (await planner.get(`/masterdata/base-machines?baseId=${nh.id}`)).body.data.total;
    const machine = await planner.post("/masterdata/base-machines", { baseId: nh.id, needleTypeId: created.body.data.id, machineCount: 40, dailyOutputPerMachine: 180 });
    expect(machine.status).toBe(201);
    expect(machine.body.data.dailyCapacity).toBe(7200);
    expect((await planner.post("/masterdata/base-machines", { baseId: nh.id, needleTypeId: created.body.data.id, machineCount: 1, dailyOutputPerMachine: 1 })).body.errcode).toBe("COMMON_DUPLICATE");
    const upd = await planner.put(`/masterdata/base-machines/${machine.body.data.id}`, { baseId: nh.id, needleTypeId: created.body.data.id, machineCount: 48, dailyOutputPerMachine: 180, version: 1 });
    expect(upd.body.data.machineCount).toBe(48);
    expect((await planner.put(`/masterdata/base-machines/${machine.body.data.id}`, { baseId: nh.id, needleTypeId: created.body.data.id, machineCount: 1, dailyOutputPerMachine: 1, version: 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await planner.get(`/masterdata/base-machines?baseId=${nh.id}`)).body.data.total).toBe(seededMachines + 1);
    expect((await planner.post("/masterdata/factories", { code: "X1", name: "x", baseId: nh.id })).status).toBe(403);
  });

  it("maintains materials, agencies, forwarders, dictionaries, exchange rates and seasons", async () => {
    const admin = await t.as("admin");
    const mat = await admin.post("/masterdata/materials", { code: "Y-BAMBOO-40S", name: "40S 竹纤维纱", category: "YARN", spec: "40S", unit: "kg", unitPrice: 46, currency: "CNY", supplier: "华茂纱业" });
    expect(mat.status).toBe(201);
    expect((await admin.get("/masterdata/materials?category=YARN")).body.data.total).toBe(5);
    expect((await admin.del(`/masterdata/materials/${mat.body.data.id}`)).status).toBe(200);
    expect((await admin.get("/masterdata/materials?category=YARN")).body.data.total).toBe(4);

    const agency = await admin.post("/masterdata/test-agencies", { code: "TUV-SH", name: "TÜV 上海", city: "上海", contact: null });
    expect(agency.status).toBe(201);
    expect((await admin.get("/lookups")).body.data.agencies.map((a: { code: string }) => a.code)).toContain("TUV-SH");
    expect((await admin.del(`/masterdata/test-agencies/${agency.body.data.id}`)).status).toBe(200);
    expect((await admin.get("/lookups")).body.data.agencies.map((a: { code: string }) => a.code)).not.toContain("TUV-SH");

    const fwd = (await admin.get("/masterdata/forwarders?type=CARRIER")).body.data;
    expect(fwd.total).toBe(3);
    const emc = fwd.items.find((f: { code: string }) => f.code === "EMC");
    const fu = await admin.put(`/masterdata/forwarders/${emc.id}`, { code: "EMC", name: "长荣海运", type: "CARRIER", contact: "宁波订舱部", version: emc.version });
    expect(fu.body.data.contact).toBe("宁波订舱部");
    expect((await admin.del(`/masterdata/forwarders/${emc.id}`)).status).toBe(200);
    expect((await admin.get("/lookups")).body.data.forwarders.map((f: { code: string }) => f.code)).not.toContain("EMC");

    const types = (await admin.get("/masterdata/dictionaries/types")).body.data;
    expect(types.length).toBeGreaterThan(0);
    const type = types[0].type;
    const dict = await admin.post("/masterdata/dictionaries", { type, code: "ZZ_TEST", label: { zh: "测试项", en: "Test" }, sort: 99 });
    expect(dict.status).toBe(201);
    expect((await admin.post("/masterdata/dictionaries", { type, code: "ZZ_TEST", label: { zh: "重复", en: "Dup" } })).body.errcode).toBe("COMMON_DUPLICATE");
    expect((await admin.get(`/masterdata/dictionaries?type=${type}&keyword=测试项`)).body.data.total).toBe(1);
    expect((await admin.get("/lookups")).body.data.dictionaries[type].map((d: { code: string }) => d.code)).toContain("ZZ_TEST");
    expect((await admin.del(`/masterdata/dictionaries/${dict.body.data.id}`)).status).toBe(200);
    expect((await admin.get("/lookups")).body.data.dictionaries[type].map((d: { code: string }) => d.code)).not.toContain("ZZ_TEST");

    const rate = await admin.post("/masterdata/exchange-rates", { currency: "USD", rateToCny: 7.18, effectiveDate: "2026-10-15" });
    expect(rate.status).toBe(201);
    expect((await admin.post("/masterdata/exchange-rates", { currency: "USD", rateToCny: 7.2, effectiveDate: "2026-10-15" })).body.errcode).toBe("COMMON_DUPLICATE");
    const asOf = (await admin.get("/masterdata/exchange-rates?asOf=2026-10-20&currency=USD")).body.data.items;
    expect(asOf).toEqual([expect.objectContaining({ currency: "USD", rateToCny: 7.18, effectiveDate: "2026-10-15" })]);
    expect((await admin.get("/masterdata/exchange-rates?asOf=2026-10-10&currency=USD")).body.data.items[0].rateToCny).toBe(7.1);
    expect((await admin.put(`/masterdata/exchange-rates/${rate.body.data.id}`, { currency: "USD", rateToCny: 7.2, effectiveDate: "2026-10-15", version: 3 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const season = await admin.post("/masterdata/seasons", { code: "SS28", label: { zh: "2028 春夏", en: "Spring/Summer 2028" }, startDate: "2028-01-01", endDate: "2028-06-30" });
    expect(season.status).toBe(201);
    expect((await admin.put("/masterdata/seasons/SS28", { code: "SS28", label: { zh: "2028 春夏季", en: "SS 2028" }, version: 1 })).body.data.version).toBe(2);
    expect((await admin.put("/masterdata/seasons/SS28", { code: "SS28", label: { zh: "x", en: "x" }, version: 1 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await admin.get("/lookups")).body.data.seasons.map((s: { code: string }) => s.code)).toContain("SS28");
  });

  it("enforces permissions per master data area", async () => {
    const sales = await t.as("sales");
    const buyer = await t.as("buyer");
    const customs = await t.as("customs");
    const quality = await t.as("quality");
    expect((await sales.get("/masterdata/factories")).status).toBe(403);
    expect((await sales.post("/masterdata/bases", { code: "ZZ", name: "x", country: "CN" })).status).toBe(403);
    expect((await sales.get("/masterdata/dictionaries")).status).toBe(403);
    expect((await buyer.get("/masterdata/materials")).status).toBe(200);
    expect((await buyer.post("/masterdata/materials", { code: "P-BOX-S", name: "小号彩盒", category: "PACKAGING", spec: null, unit: "个", unitPrice: 0.6, currency: "CNY", supplier: null })).status).toBe(201);
    expect((await buyer.get("/masterdata/forwarders")).status).toBe(403);
    expect((await customs.post("/masterdata/forwarders", { code: "MSK", name: "马士基", type: "CARRIER", contact: null })).status).toBe(201);
    expect((await quality.get("/masterdata/test-agencies")).status).toBe(200);
    expect((await quality.post("/masterdata/test-agencies", { code: "X", name: "x", city: null, contact: null })).status).toBe(403);
  });
});
