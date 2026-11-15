import { HttpResponse, http, type HttpHandler } from "msw";

import { envelope, fail, pageOf } from "./util";

import type { CartonDto, PackagingPlanDetailDto, PackagingVersionDto } from "@otd/contracts/packaging";

const NSR_REQUIREMENTS = [
  { title: "装箱方式", content: "单 SKU 装箱；每箱两袋；卡纸隔层" },
  { title: "尾箱", content: "不足 120 双的尾箱，箱贴上方贴 ODD" },
];

const nsrFields = {
  title: "Crew · 罗纹中筒袜翻折卡装",
  method: "Crew · 罗纹中筒袜翻折卡装",
  pairsPerCarton: 120,
  cartonSize: "56 × 42 × 38 cm",
  cartonType: "C 型单层瓦楞纸箱",
  strength: "44 ECT",
  shippingMark: "560 × 210 mm",
  markPosition: "纸箱长侧面及短侧面，距底部 2–3cm",
  sizeSticker: "透明底圆形 · 直径 18mm",
  sealSticker: "不封口贴 · 客户指定胶带",
  innerBag: "OPP 自立袋 · 厚度 0.06mm",
  tape: "BOPP 封箱胶带 · 宽 60mm",
  destination: "NSR Hamburg DC",
  requirements: NSR_REQUIREMENTS,
};

function version(
  no: number,
  snapshot: Record<string, unknown>,
  extra: Partial<PackagingVersionDto> = {},
): PackagingVersionDto {
  return {
    versionNo: no,
    changeNote: null,
    customerConfirmed: false,
    current: false,
    effective: false,
    changedBy: "u-1",
    changedByName: "王芳",
    changedAt: "2026-09-12T03:00:00.000Z",
    confirmedAt: null,
    confirmedBy: null,
    confirmMethod: null,
    snapshot,
    ...extra,
  };
}

const base = {
  styleId: "s-11506",
  submittedAt: null,
  confirmNote: null,
  ownerId: "u-1",
  ownerName: "王芳",
  createdAt: "2026-09-12T03:00:00.000Z",
  updatedAt: "2026-09-27T08:00:00.000Z",
  applicable: { cartonLines: 0, pairs: 0, cartons: 0 },
};

export const mockPlans: PackagingPlanDetailDto[] = [
  {
    ...base,
    ...nsrFields,
    id: "pk-1",
    docNo: "PK-2610-009",
    orderId: "o-10459",
    poNo: "PO0010459",
    styleNo: "11506",
    customerId: "c-nsr",
    customerCode: "NSR",
    customerName: "北岸运动",
    status: "CONFIRMED",
    currentVersion: 3,
    effectiveVersion: 3,
    confirmedAt: "2026-09-27T07:00:00.000Z",
    confirmedBy: "Milena Ortiz",
    confirmMethod: "EMAIL",
    version: 6,
    versions: [
      version(
        1,
        { ...nsrFields, pairsPerCarton: 100, innerBag: "OPP 平口袋 · 厚度 0.05mm" },
        { changeNote: "按客户包装手册生成", customerConfirmed: true },
      ),
      version(
        2,
        { ...nsrFields, innerBag: "OPP 平口袋 · 厚度 0.05mm" },
        { changeNote: "每箱双数 100 → 120（客户要求）", customerConfirmed: true },
      ),
      version(3, nsrFields, {
        changeNote: "内袋改 OPP 自立袋 0.06mm",
        customerConfirmed: true,
        current: true,
        effective: true,
        confirmedBy: "Milena Ortiz",
        confirmMethod: "EMAIL",
        confirmedAt: "2026-09-27T07:00:00.000Z",
      }),
    ],
  },
  {
    ...base,
    id: "pk-2",
    docNo: "PK-2610-015",
    title: "童袜三双装吊卡",
    method: "童袜三双装吊卡",
    pairsPerCarton: 180,
    cartonSize: "50 × 35 × 30 cm",
    cartonType: null,
    strength: null,
    shippingMark: null,
    markPosition: null,
    sizeSticker: null,
    sealSticker: null,
    innerBag: null,
    tape: null,
    destination: "杭州仓",
    requirements: [],
    orderId: "o-9702",
    poNo: "PO0009702",
    styleNo: "11737",
    customerId: "c-ckd",
    customerCode: "CKD",
    customerName: "云栖童装",
    status: "PENDING_CUSTOMER",
    currentVersion: 1,
    effectiveVersion: null,
    submittedAt: "2026-10-14T02:00:00.000Z",
    confirmedAt: null,
    confirmedBy: null,
    confirmMethod: null,
    ownerName: "林悦",
    version: 2,
    versions: [version(1, { method: "童袜三双装吊卡", pairsPerCarton: 180 }, { current: true, changedByName: "林悦" })],
  },
];

export const mockCartons: CartonDto[] = [1, 2, 3].map((i) => ({
  id: `ct-${i}`,
  docNo: `CT-2610-03${i}`,
  orderId: "o-9631",
  poNo: "PO0009631",
  customerId: "c-mrn",
  customerName: "晨跑者",
  styleId: "s-11151",
  styleNo: "11151",
  customerSku: `MRN-11151-BLK-${["S", "M", "L"][i - 1]}`,
  color: "Black",
  size: ["S", "M", "L"][i - 1]!,
  pairs: 4200,
  pairsPerCarton: 100,
  cartonCount: 42,
  tailPairs: 0,
  cartonRange: `${(i - 1) * 42 + 1}–${i * 42}`,
  rangeStart: (i - 1) * 42 + 1,
  rangeEnd: i * 42,
  packDueDate: "2026-10-27",
  status: i === 1 ? "PACKING" : "TO_PACK",
  planId: "pk-3",
  planDocNo: "PK-2609-021",
  planVersion: 2,
  startedAt: null,
  packedAt: null,
  createdAt: "2026-10-11T01:00:00.000Z",
  version: 1,
}));

const summary = (plan: PackagingPlanDetailDto) => {
  const rest: Partial<PackagingPlanDetailDto> = { ...plan };
  delete rest.versions;
  return rest;
};

export const packagingHandlers: HttpHandler[] = [
  http.get("*/packaging/plans", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const customerId = url.searchParams.get("customerId");
    const rows = mockPlans.filter(
      (p) => (!status || status.split(",").includes(p.status)) && (!customerId || p.customerId === customerId),
    );
    return HttpResponse.json(envelope(pageOf(rows.map(summary), url)));
  }),
  http.get("*/packaging/plans/:id/compare", ({ params, request }) => {
    const plan = mockPlans.find((p) => p.id === params.id);
    if (!plan) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const url = new URL(request.url);
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const a = plan.versions.find((v) => v.versionNo === from)?.snapshot ?? {};
    const b = plan.versions.find((v) => v.versionNo === to)?.snapshot ?? {};
    const diffs = Object.keys({ ...a, ...b })
      .filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
      .map((field) => ({ field, from: a[field] ?? null, to: b[field] ?? null }));
    return HttpResponse.json(envelope({ planId: plan.id, docNo: plan.docNo, from, to, diffs }));
  }),
  http.get("*/packaging/plans/:id", ({ params }) => {
    const plan = mockPlans.find((p) => p.id === params.id);
    return plan ? HttpResponse.json(envelope(plan)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/packaging/plans", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      envelope({ ...mockPlans[1]!, ...body, id: "pk-new", docNo: "PK-2611-001", status: "DRAFT", version: 1 }),
      { status: 201 },
    );
  }),
  http.put("*/packaging/plans/:id", async ({ params, request }) => {
    const plan = mockPlans.find((p) => p.id === params.id);
    const body = (await request.json()) as { version: number };
    if (!plan) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== plan.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(envelope({ ...plan, ...body, version: plan.version + 1 }));
  }),
  http.post("*/packaging/plans/:id/:action", async ({ params, request }) => {
    const plan = mockPlans.find((p) => p.id === params.id);
    const body = (await request.json()) as { version: number; confirmedBy?: string };
    if (!plan) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== plan.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    const status =
      params.action === "submit" ? "PENDING_CUSTOMER" : params.action === "confirm" ? "CONFIRMED" : "DRAFT";
    return HttpResponse.json(
      envelope({ ...plan, status, confirmedBy: body.confirmedBy ?? plan.confirmedBy, version: plan.version + 1 }),
    );
  }),
  http.get("*/packaging/cartons/coverage", ({ request }) => {
    const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
    const rows = mockCartons.filter((c) => c.orderId === orderId);
    return HttpResponse.json(
      envelope({ orderId, covered: rows.length > 0, lineCount: 3, coveredLineCount: rows.length, missing: [] }),
    );
  }),
  http.get("*/packaging/cartons", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const orderId = url.searchParams.get("orderId");
    const rows = mockCartons.filter(
      (c) => (!status || status.split(",").includes(c.status)) && (!orderId || c.orderId === orderId),
    );
    return HttpResponse.json(envelope(pageOf(rows, url)));
  }),
  http.post("*/packaging/cartons/generate", () => HttpResponse.json(envelope(mockCartons), { status: 201 })),
  http.put("*/packaging/cartons/:id", async ({ params, request }) => {
    const carton = mockCartons.find((c) => c.id === params.id);
    const body = (await request.json()) as { version: number; pairsPerCarton?: number };
    if (!carton) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const per = body.pairsPerCarton ?? carton.pairsPerCarton;
    return HttpResponse.json(
      envelope({
        ...carton,
        pairsPerCarton: per,
        cartonCount: Math.ceil(carton.pairs / per),
        version: carton.version + 1,
      }),
    );
  }),
  http.post("*/packaging/cartons/:id/:action", async ({ params, request }) => {
    const carton = mockCartons.find((c) => c.id === params.id);
    const body = (await request.json()) as { version: number };
    if (!carton) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== carton.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(
      envelope({ ...carton, status: params.action === "start" ? "PACKING" : "PACKED", version: carton.version + 1 }),
    );
  }),
];
