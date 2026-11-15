import { HttpResponse, http, type HttpHandler } from "msw";

import { envelope, fail } from "./util";

import type {
  BaseMachineDto,
  CapacityRowDto,
  CapacityVersionDetailDto,
  CapacityVersionDto,
  LedgerTaskDto,
} from "@otd/contracts/capacity";

const BASES = { DC: ["b-dc", "东城基地"], NH: ["b-nh", "南湖基地"], VN: ["b-vn", "越南基地"] } as const;

type KnitSeed = [keyof typeof BASES, string, number, number, number, number, number];

const KNIT: KnitSeed[] = [
  ["DC", "96N", 7, 184, 174.6, 0, 1277000],
  ["DC", "200N", 7, 143, 154.6, 0, 1066300],
  ["NH", "144N", 8, 140, 185.1, 0, 822000],
  ["VN", "144N", 10, 209, 141.8, 0, 1378100],
];

function knitRow(
  versionId: string,
  [base, needle, lead, machines, daily, otd, erp]: KnitSeed,
  i: number,
): CapacityRowDto {
  const days = 60 - lead;
  const cumulative = Math.round(days * daily * machines * 1000) / 1000;
  const unproduced = otd + erp;
  const spare = Math.round((cumulative - unproduced) * 1000) / 1000;
  const rate = Math.round((spare / cumulative) * 10000) / 10000;
  return {
    id: `${versionId}-k${i}`,
    versionId,
    ledger: "KNIT",
    baseId: BASES[base][0],
    baseCode: base,
    baseName: BASES[base][1],
    needleTypeId: `n-${needle}`,
    needleCode: needle,
    process: null,
    leadDays: lead,
    availableDays: days,
    machineCount: machines,
    dailyOutput: daily,
    cumulativeCapacity: cumulative,
    unproducedQty: unproduced,
    otdUnproducedQty: otd,
    erpBacklog: erp,
    spareCapacity: spare,
    spareRate: rate,
    tight: rate < 0.12,
    sources: {
      leadDays: "DEFAULT",
      machineCount: "MANUAL",
      dailyOutput: "SYNC",
      unproducedQty: "SYNC",
      erpBacklog: "SYNC",
    },
    extra: { otdUnproduced: otd, erpBacklog: erp },
    version: 1,
  };
}

function manualRows(versionId: string): CapacityRowDto[] {
  const blank = {
    versionId,
    needleTypeId: null,
    needleCode: null,
    leadDays: null,
    availableDays: null,
    machineCount: null,
    dailyOutput: null,
    cumulativeCapacity: null,
    unproducedQty: null,
    otdUnproducedQty: null,
    erpBacklog: null,
    spareCapacity: null,
    spareRate: null,
    tight: false,
    sources: { extra: "MANUAL" as const },
    version: 1,
  };
  return [
    {
      ...blank,
      id: `${versionId}-p1`,
      ledger: "PACKING",
      baseId: "b-dc",
      baseCode: "DC",
      baseName: "东城基地",
      process: null,
      extra: { lines: 6, monthOrders: 182.4, scheduled: 160.2, loadRate: 88 },
    },
    {
      ...blank,
      id: `${versionId}-p2`,
      ledger: "PACKING",
      baseId: "b-nh",
      baseCode: "NH",
      baseName: "南湖基地",
      process: null,
      extra: { lines: 4, monthOrders: 126.8, scheduled: 121, loadRate: 95 },
    },
    {
      ...blank,
      id: `${versionId}-s1`,
      ledger: "SPECIAL",
      baseId: "b-dc",
      baseCode: "DC",
      baseName: "东城基地",
      process: "刺绣",
      extra: { dailyCapacity: 8000, bookedUntil: "2026-11-12", status: "PENDING" },
    },
  ];
}

const version = (id: string, no: number, asOfDate: string, status: "DRAFT" | "PUBLISHED"): CapacityVersionDto => ({
  id,
  versionNo: no,
  label: `V${no}`,
  asOfDate,
  windowDays: 60,
  status,
  publishedAt: status === "PUBLISHED" ? "2026-10-13T02:00:00.000Z" : null,
  publishedByName: status === "PUBLISHED" ? "孙悦" : null,
  note: null,
  rowCounts: { KNIT: KNIT.length, PACKING: 2, SPECIAL: 1 },
  createdAt: `${asOfDate}T00:00:00.000Z`,
  version: 1,
});

export const mockCapacityVersions: CapacityVersionDto[] = [
  version("cv-26", 26, "2026-10-20", "DRAFT"),
  version("cv-25", 25, "2026-10-13", "PUBLISHED"),
];

function detailOf(v: CapacityVersionDto, keyword: string): CapacityVersionDetailDto {
  const scale = v.versionNo === 25 ? 1.05 : 1;
  const all = [
    ...KNIT.map((s, i) => knitRow(v.id, [s[0], s[1], s[2], s[3], s[4], s[5], Math.round(s[6] * scale)], i)),
    ...manualRows(v.id),
  ];
  const knit = all.filter((r) => r.ledger === "KNIT");
  const cap = knit.reduce((a, r) => a + (r.cumulativeCapacity ?? 0), 0);
  const spare = knit.reduce((a, r) => a + (r.spareCapacity ?? 0), 0);
  const rows = keyword ? all.filter((r) => `${r.baseName}${r.needleCode ?? ""}`.includes(keyword)) : all;
  return {
    version: v,
    rows,
    kpis: {
      groupSpare: spare,
      groupSpareWan: Math.round(spare / 100) / 100,
      groupCapacity: cap,
      avgSpareRate: Math.round((spare / cap) * 10000) / 10000,
      tightCount: knit.filter((r) => r.tight).length,
      tightThreshold: 0.12,
      overdueTasks: 1,
    },
  };
}

export const mockLedgerTasks: LedgerTaskDto[] = [
  {
    id: "lt-1",
    ledger: "KNIT",
    name: "编织产能空余量表",
    frequency: "WEEKLY",
    ownerId: "u-8",
    ownerName: "孙悦",
    currentVersion: "V26",
    lastUpdatedAt: "2026-10-20T00:40:00.000Z",
    nextDueAt: "2026-10-27",
    status: "PENDING",
    overdueDays: 0,
    note: null,
    escalatedAt: null,
    version: 1,
  },
  {
    id: "lt-2",
    ledger: "SPECIAL",
    name: "刺绣等特殊工序产能表",
    frequency: "MONTHLY",
    ownerId: "u-12",
    ownerName: "王建国",
    currentVersion: "V26",
    lastUpdatedAt: "2026-09-19T00:35:00.000Z",
    nextDueAt: "2026-10-19",
    status: "OVERDUE",
    overdueDays: 2,
    note: "应更新日 2026-10-19，逾期 2 天，已升级告警至集团计划部负责人",
    escalatedAt: "2026-10-20T00:20:00.000Z",
    version: 3,
  },
];

const machines: BaseMachineDto[] = [
  {
    id: "bm-1",
    baseId: "b-dc",
    baseCode: "DC",
    baseName: "东城基地",
    needleTypeId: "n-96N",
    needleCode: "96N",
    machineCount: 184,
    dailyOutputPerMachine: 174.6,
    version: 1,
  },
];

export const capacityHandlers: HttpHandler[] = [
  http.get("*/capacity/versions", () => HttpResponse.json(envelope(mockCapacityVersions))),
  http.get("*/capacity/versions/:id", ({ params, request }) => {
    const v = mockCapacityVersions.find((x) => x.id === params.id);
    const keyword = new URL(request.url).searchParams.get("keyword") ?? "";
    return v
      ? HttpResponse.json(envelope(detailOf(v, keyword)))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.get("*/capacity/summary", () => HttpResponse.json(envelope(detailOf(mockCapacityVersions[0]!, "")))),
  http.get("*/capacity/compare", ({ request }) => {
    const url = new URL(request.url);
    const from = mockCapacityVersions.find((v) => v.id === url.searchParams.get("from"));
    const to = mockCapacityVersions.find((v) => v.id === url.searchParams.get("to"));
    if (!from || !to) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const a = detailOf(from, "").rows;
    const b = detailOf(to, "").rows.filter((r) => r.ledger === "KNIT");
    return HttpResponse.json(
      envelope({
        from,
        to,
        rows: b.map((r) => {
          const prev = a.find((x) => x.baseId === r.baseId && x.needleTypeId === r.needleTypeId)!;
          const delta = Math.round(((r.spareCapacity ?? 0) - (prev.spareCapacity ?? 0)) * 1000) / 1000;
          return {
            key: `KNIT:${r.baseId}:${r.needleTypeId}:`,
            ledger: "KNIT",
            baseName: r.baseName,
            needleCode: r.needleCode,
            process: null,
            change: delta ? "CHANGED" : "SAME",
            fields: delta ? [{ field: "spareCapacity", from: prev.spareCapacity, to: r.spareCapacity, delta }] : [],
          };
        }),
      }),
    );
  }),
  http.post("*/capacity/versions", () => {
    const created = version("cv-27", 27, "2026-10-21", "DRAFT");
    return HttpResponse.json(envelope(detailOf(created, "")), { status: 201 });
  }),
  http.post("*/capacity/versions/:id/publish", async ({ params, request }) => {
    const v = mockCapacityVersions.find((x) => x.id === params.id);
    const body = (await request.json()) as { version: number };
    if (!v) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== v.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(envelope(detailOf({ ...v, status: "PUBLISHED", version: v.version + 1 }, "")));
  }),
  http.post("*/capacity/versions/:id/rows", async ({ params, request }) => {
    const body = (await request.json()) as { ledger: "PACKING" | "SPECIAL"; extra: Record<string, unknown> };
    return HttpResponse.json(
      envelope({ ...manualRows(String(params.id))[0]!, ledger: body.ledger, extra: body.extra, id: "row-new" }),
      { status: 201 },
    );
  }),
  http.put("*/capacity/versions/:id/rows/:rowId", async ({ params, request }) => {
    const body = (await request.json()) as { version: number; erpBacklog: number };
    const row = detailOf(mockCapacityVersions[0]!, "").rows.find((r) => r.id === params.rowId);
    if (!row) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    return HttpResponse.json(envelope({ ...row, erpBacklog: body.erpBacklog, version: row.version + 1 }));
  }),
  http.put("*/capacity/rows/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown> & { version: number };
    const row = detailOf(mockCapacityVersions[0]!, "").rows.find((r) => r.id === params.id);
    if (!row) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    return HttpResponse.json(envelope({ ...row, ...body, version: row.version + 1 }));
  }),
  http.delete("*/capacity/rows/:id", () => HttpResponse.json(envelope(null))),
  http.get("*/capacity/machines", () => HttpResponse.json(envelope(machines))),
  http.put("*/capacity/machines", async ({ request }) => {
    const body = (await request.json()) as { machineCount: number; version: number };
    return HttpResponse.json(envelope({ ...machines[0]!, machineCount: body.machineCount, version: body.version + 1 }));
  }),
  http.get("*/capacity/tasks", () => HttpResponse.json(envelope(mockLedgerTasks))),
  http.post("*/capacity/tasks/:id/:action", async ({ params, request }) => {
    const task = mockLedgerTasks.find((x) => x.id === params.id);
    const body = (await request.json()) as { version: number };
    if (!task) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== task.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(
      envelope({ ...task, status: params.action === "start" ? "UPDATING" : "DONE", version: task.version + 1 }),
    );
  }),
];
