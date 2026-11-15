import { HttpResponse, http } from "msw";

import { mockCustomers, mockOrgs, mockUsers } from "../fixtures/iam";

import { envelope, fail, pageOf } from "./util";

import type {
  AgencyDto,
  BaseDetailDto,
  BaseMachineDto,
  DictionaryDto,
  ExchangeRateDto,
  FactoryDto,
  ForwarderDto,
  Lookups,
  MaterialDto,
  NeedleTypeDto,
  SeasonDto,
} from "@otd/contracts/masterdata";

export const mockLookups: Lookups = {
  customers: mockCustomers.map((c) => ({ id: c.id, code: c.code, name: c.name, nameEn: c.nameEn })),
  factories: [{ id: "f-1", code: "DC1", name: "东城一厂", baseId: "b-1" }],
  bases: [{ id: "b-1", code: "DC", name: "东城基地" }],
  needleTypes: [{ id: "n-1", code: "144N" }],
  agencies: [{ id: "a-1", code: "BV-GZ", name: "BV 广州" }],
  forwarders: [{ id: "fw-1", code: "NFI", name: "NFI 物流", type: "FORWARDER" }],
  seasons: [{ code: "FA27", label: { zh: "2027 秋季", en: "Fall 2027" } }],
  dictionaries: { category: [{ code: "WOMEN", label: { zh: "女袜", en: "Women" } }] },
  users: mockUsers.map((u) => ({ id: u.id, name: u.name, orgId: u.orgId ?? mockOrgs[0]!.id })),
  currencies: ["USD", "EUR", "JPY", "CNY"],
};

type Versioned = { id: string; version: number };

const mockBases: BaseDetailDto[] = [
  {
    id: "b-1",
    code: "DC",
    name: "东城基地",
    nameEn: "Dongcheng Base",
    country: "CN",
    factoryCount: 2,
    machineCount: 856,
    version: 1,
  },
  {
    id: "b-2",
    code: "NH",
    name: "南湖基地",
    nameEn: "Nanhu Base",
    country: "CN",
    factoryCount: 1,
    machineCount: 359,
    version: 1,
  },
  {
    id: "b-3",
    code: "VN",
    name: "越南基地",
    nameEn: "Vietnam Base",
    country: "VN",
    factoryCount: 1,
    machineCount: 640,
    version: 1,
  },
];

const mockFactories: FactoryDto[] = [
  {
    id: "f-1",
    code: "DC1",
    name: "东城一厂",
    nameEn: null,
    baseId: "b-1",
    baseName: "东城基地",
    legalEntity: "OTD 针织东城一厂",
    version: 1,
  },
  {
    id: "f-2",
    code: "DC2",
    name: "东城二厂",
    nameEn: null,
    baseId: "b-1",
    baseName: "东城基地",
    legalEntity: "OTD 针织东城二厂",
    version: 2,
  },
  {
    id: "f-3",
    code: "NH5",
    name: "南湖五厂",
    nameEn: null,
    baseId: "b-2",
    baseName: "南湖基地",
    legalEntity: "OTD 针织南湖五厂",
    version: 1,
  },
  {
    id: "f-4",
    code: "HP3",
    name: "海防三厂",
    nameEn: null,
    baseId: "b-3",
    baseName: "越南基地",
    legalEntity: "OTD Knitting Vietnam Co.",
    version: 1,
  },
];

const mockMachines: BaseMachineDto[] = [
  ["bm-1", "b-1", "DC", "东城基地", "n-96", "96N", 184, 174.6],
  ["bm-2", "b-1", "DC", "东城基地", "n-120", "120N", 253, 192.8],
  ["bm-3", "b-1", "DC", "东城基地", "n-1", "144N", 276, 188.5],
  ["bm-4", "b-1", "DC", "东城基地", "n-200", "200N", 143, 154.6],
  ["bm-5", "b-3", "VN", "越南基地", "n-96", "96N", 141, 133.7],
  ["bm-6", "b-3", "VN", "越南基地", "n-120", "120N", 184, 155.6],
  ["bm-7", "b-3", "VN", "越南基地", "n-1", "144N", 209, 141.8],
  ["bm-8", "b-3", "VN", "越南基地", "n-200", "200N", 106, 122.2],
  ["bm-9", "b-2", "NH", "南湖基地", "n-96", "96N", 92, 175.9],
  ["bm-10", "b-2", "NH", "南湖基地", "n-120", "120N", 127, 202.1],
  ["bm-11", "b-2", "NH", "南湖基地", "n-1", "144N", 140, 185.1],
].map(([id, baseId, baseCode, baseName, needleTypeId, needleCode, count, daily]) => ({
  id: id as string,
  baseId: baseId as string,
  baseCode: baseCode as string,
  baseName: baseName as string,
  needleTypeId: needleTypeId as string,
  needleCode: needleCode as string,
  machineCount: count as number,
  dailyOutputPerMachine: daily as number,
  dailyCapacity: Math.round((count as number) * (daily as number)),
  version: 1,
}));

const mockNeedles: NeedleTypeDto[] = [
  ["n-96", "96N", 96],
  ["n-120", "120N", 120],
  ["n-1", "144N", 144],
  ["n-168", "168N", 168],
  ["n-200", "200N", 200],
].map(([id, code, needles]) => ({
  id: id as string,
  code: code as string,
  needles: needles as number,
  description: null,
  machines: mockMachines
    .filter((m) => m.needleTypeId === id)
    .map((m) => ({
      baseId: m.baseId,
      baseName: m.baseName,
      machineCount: m.machineCount,
      dailyOutputPerMachine: m.dailyOutputPerMachine,
    })),
  version: 1,
}));

const mockMaterials: MaterialDto[] = [
  {
    id: "m-1",
    code: "Y-40S-T80C20",
    name: "40S/1*2 T80C20 纱线",
    category: "YARN",
    spec: "40S/1*2",
    unit: "kg",
    unitPrice: 42.5,
    currency: "CNY",
    supplier: "华茂纱业",
    version: 1,
  },
  {
    id: "m-2",
    code: "Y-NYLON-70D",
    name: "70D 锦纶包覆纱",
    category: "YARN",
    spec: "70D",
    unit: "kg",
    unitPrice: 56,
    currency: "CNY",
    supplier: "恒力化纤",
    version: 1,
  },
  {
    id: "m-3",
    code: "T-SILICONE",
    name: "硅胶防滑点",
    category: "TRIM",
    spec: "踵部",
    unit: "双",
    unitPrice: 0.12,
    currency: "CNY",
    supplier: "联达辅料",
    version: 1,
  },
  {
    id: "m-4",
    code: "P-CARTON-C",
    name: "C 型单层瓦楞纸箱",
    category: "PACKAGING",
    spec: "56×42×38",
    unit: "个",
    unitPrice: 6.5,
    currency: "CNY",
    supplier: "宏达包装",
    version: 1,
  },
];

const mockAgencies: AgencyDto[] = [
  { id: "a-1", code: "BV-GZ", name: "BV 广州", city: "广州", contact: null, version: 1 },
  { id: "a-2", code: "SGS-HZ", name: "SGS 杭州", city: "杭州", contact: null, version: 1 },
  { id: "a-3", code: "ITS-SH", name: "ITS 上海", city: "上海", contact: null, version: 1 },
];

const mockForwarders: ForwarderDto[] = [
  { id: "fw-1", code: "NFI", name: "NFI 物流", type: "FORWARDER", contact: null, version: 1 },
  { id: "fw-2", code: "KWE", name: "近铁国际", type: "FORWARDER", contact: null, version: 1 },
  { id: "fw-3", code: "EMC", name: "长荣海运", type: "CARRIER", contact: null, version: 1 },
  { id: "fw-4", code: "COSCO", name: "中远海运", type: "CARRIER", contact: null, version: 1 },
];

const mockDictionaries: DictionaryDto[] = [
  {
    id: "d-1",
    type: "category",
    code: "WOMEN",
    label: { zh: "女袜", en: "Women" },
    sort: 1,
    enabled: true,
    version: 1,
  },
  { id: "d-2", type: "category", code: "MEN", label: { zh: "男袜", en: "Men" }, sort: 2, enabled: true, version: 1 },
  { id: "d-3", type: "category", code: "KIDS", label: { zh: "童袜", en: "Kids" }, sort: 3, enabled: false, version: 2 },
  {
    id: "d-4",
    type: "transportMode",
    code: "SEA",
    label: { zh: "海运", en: "Sea" },
    sort: 1,
    enabled: true,
    version: 1,
  },
  {
    id: "d-5",
    type: "transportMode",
    code: "AIR",
    label: { zh: "空运", en: "Air" },
    sort: 2,
    enabled: true,
    version: 1,
  },
];

const mockRates: ExchangeRateDto[] = [
  { id: "x-1", currency: "USD", rateToCny: 7.18, effectiveDate: "2026-10-15", version: 1 },
  { id: "x-2", currency: "USD", rateToCny: 7.1, effectiveDate: "2026-10-01", version: 1 },
  { id: "x-3", currency: "EUR", rateToCny: 7.75, effectiveDate: "2026-10-01", version: 1 },
  { id: "x-4", currency: "JPY", rateToCny: 0.048, effectiveDate: "2026-10-01", version: 1 },
];

const mockSeasons: SeasonDto[] = [
  { code: "AW26", label: { zh: "2026 秋冬", en: "Autumn/Winter 2026" }, startDate: null, endDate: null, version: 1 },
  {
    code: "FA27",
    label: { zh: "2027 秋季", en: "Fall 2027" },
    startDate: "2027-08-01",
    endDate: "2027-10-31",
    version: 1,
  },
];

function filterBy<T>(rows: T[], url: URL, fields: (keyof T & string)[]): T[] {
  return rows.filter((row) =>
    fields.every((field) => {
      const value = url.searchParams.get(field);
      return !value || String(row[field]) === value;
    }),
  );
}

function crudHandlers<T extends Versioned>(path: string, rows: T[], filters: (keyof T & string)[] = []) {
  return [
    http.get(`*${path}`, ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json(envelope(pageOf(filterBy(rows, url, filters), url)));
    }),
    http.post(`*${path}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(envelope({ ...rows[0]!, ...body, id: `${path}-new`, version: 1 }), { status: 201 });
    }),
    http.put(`*${path}/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown> & { version?: number };
      const current = rows.find((r) => r.id === params.id);
      if (!current) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
      if (body.version !== undefined && body.version !== current.version)
        return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
      return HttpResponse.json(envelope({ ...current, ...body, version: current.version + 1 }));
    }),
    http.delete(`*${path}/:id`, ({ params, request }) => {
      const current = rows.find((r) => r.id === params.id);
      if (!current) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
      const version = new URL(request.url).searchParams.get("version");
      if (version && Number(version) !== current.version)
        return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
      return HttpResponse.json(envelope(null));
    }),
  ];
}

const referenceDataHandlers = [
  http.delete("*/masterdata/bases/:id", ({ params }) => {
    const base = mockBases.find((b) => b.id === params.id);
    if (base && base.factoryCount + base.machineCount > 0)
      return fail(
        "MASTERDATA_IN_USE",
        `「${base.name}」仍有 ${base.factoryCount + base.machineCount} 条关联数据，不能删除`,
        409,
        {
          what: base.name,
          count: base.factoryCount + base.machineCount,
        },
      );
    return HttpResponse.json(envelope(null));
  }),
  ...crudHandlers("/masterdata/bases", mockBases),
  ...crudHandlers("/masterdata/factories", mockFactories, ["baseId"]),
  ...crudHandlers("/masterdata/needle-types", mockNeedles),
  ...crudHandlers("/masterdata/base-machines", mockMachines, ["baseId"]),
  ...crudHandlers("/masterdata/materials", mockMaterials, ["category"]),
  ...crudHandlers("/masterdata/test-agencies", mockAgencies),
  ...crudHandlers("/masterdata/forwarders", mockForwarders, ["type"]),
  http.get("*/masterdata/dictionaries/types", () => {
    const types = [...new Set(mockDictionaries.map((d) => d.type))].sort();
    return HttpResponse.json(
      envelope(
        types.map((type) => {
          const rows = mockDictionaries.filter((d) => d.type === type);
          return { type, count: rows.length, enabledCount: rows.filter((d) => d.enabled).length };
        }),
      ),
    );
  }),
  ...crudHandlers("/masterdata/dictionaries", mockDictionaries, ["type"]),
  ...crudHandlers("/masterdata/exchange-rates", mockRates, ["currency"]),
  http.get("*/masterdata/seasons", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockSeasons, new URL(request.url)))),
  ),
  http.post("*/masterdata/seasons", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(envelope({ ...mockSeasons[0]!, ...body, version: 1 }), { status: 201 });
  }),
  http.put("*/masterdata/seasons/:code", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown> & { version?: number };
    const current = mockSeasons.find((s) => s.code === params.code);
    if (!current) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== undefined && body.version !== current.version)
      return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(envelope({ ...current, ...body, version: current.version + 1 }));
  }),
];

export const masterdataHandlers = [
  http.get("*/lookups", () => HttpResponse.json(envelope(mockLookups))),
  http.get("*/masterdata/customers", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockCustomers, new URL(request.url)))),
  ),
  http.post("*/masterdata/customers", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(envelope({ ...mockCustomers[0]!, ...body, id: "c-new", version: 1 }), { status: 201 });
  }),
  http.put("*/masterdata/customers/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const current = mockCustomers.find((c) => c.id === params.id) ?? mockCustomers[0]!;
    return HttpResponse.json(envelope({ ...current, ...body, version: current.version + 1 }));
  }),
  ...referenceDataHandlers,
];
