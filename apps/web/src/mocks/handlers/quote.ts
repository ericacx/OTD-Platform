import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  QuoteDto,
  QuoteListItemDto,
  QuotePreviewDto,
  QuoteRoundDto,
  QuoteStrategyDto,
  StyleOptionDto,
} from "@otd/contracts/quote";

const ts = "2026-10-21T01:00:00.000Z";
const TIERS = [
  { minAmount: 500_000, discount: 0.01 },
  { minAmount: 1_000_000, discount: 0.02 },
  { minAmount: 3_000_000, discount: 0.04 },
  { minAmount: 5_000_000, discount: 0.05 },
];

export const mockStrategies: QuoteStrategyDto[] = [
  {
    id: "ps-1",
    code: "PS-001",
    name: "标准报价",
    nameEn: "Standard",
    method: "MARKUP",
    lossRate: 0.2,
    overheadRate: 0,
    markupRate: 0.2,
    targetMargin: 0.18,
    guardrail: 0.12,
    lockedFx: 6.72,
    moq: 2000,
    smallOrderUplift: 0.5,
    skuTiers: [],
    enabled: true,
    usedBy: 6,
    updatedAt: ts,
    version: 1,
  },
  {
    id: "ps-2",
    code: "PS-002",
    name: "大单进取 · 让利换量",
    nameEn: "Volume push",
    method: "MARGIN",
    lossRate: 0.2,
    overheadRate: 0,
    markupRate: 0.2,
    targetMargin: 0.18,
    guardrail: 0.12,
    lockedFx: 6.72,
    moq: 10000,
    smallOrderUplift: 0.5,
    skuTiers: TIERS,
    enabled: true,
    usedBy: 2,
    updatedAt: ts,
    version: 1,
  },
];

function snapshot(code: "PS-001" | "PS-002") {
  const s = mockStrategies.find((x) => x.code === code)!;
  return {
    code: s.code,
    name: s.name,
    method: s.method,
    lossRate: s.lossRate,
    overheadRate: s.overheadRate,
    markupRate: s.markupRate,
    targetMargin: s.targetMargin,
    guardrail: s.guardrail,
    lockedFx: s.lockedFx,
    moq: s.moq,
    smallOrderUplift: s.smallOrderUplift,
    skuTiers: s.skuTiers,
    version: s.version,
  };
}

function round(
  partial: Pick<
    QuoteRoundDto,
    | "id"
    | "docNo"
    | "kind"
    | "roundNo"
    | "seq"
    | "isLatest"
    | "priceCny"
    | "priceUsd"
    | "quantity"
    | "margin"
    | "diffToTargetUsd"
    | "status"
    | "note"
  > & {
    code: "PS-001" | "PS-002";
    quotedAt: string;
  },
): QuoteRoundDto {
  const { code, quotedAt, ...rest } = partial;
  return {
    ...rest,
    fx: 6.72,
    strategyId: code === "PS-001" ? "ps-1" : "ps-2",
    strategyCode: code,
    strategy: snapshot(code),
    costTotal: 16.09,
    pricing: null,
    guardrailPassed: true,
    quotedBy: "u-sales",
    quotedByName: "王芳",
    quotedAt,
    overrideApprovedBy: null,
    overrideReason: null,
    feedbackAt: null,
    feedbackNote: null,
    version: 1,
  };
}

const internal = round({
  id: "qr-1",
  docNo: "QT-12593-01",
  kind: "INTERNAL",
  roundNo: 1,
  seq: 1,
  isLatest: true,
  priceCny: 19.31,
  priceUsd: 2.87,
  quantity: 2400,
  margin: 0.1668,
  diffToTargetUsd: 0.05,
  status: "QUOTED",
  note: "成本核定后内部核价，作为对外报价的底线",
  code: "PS-001",
  quotedAt: "2026-10-03T02:00:00.000Z",
});
const customerRounds = [
  round({
    id: "qr-2",
    docNo: "QT-12593-02",
    kind: "CUSTOMER",
    roundNo: 2,
    seq: 1,
    isLatest: false,
    priceCny: 19.31,
    priceUsd: 2.87,
    quantity: 12000,
    margin: 0.1668,
    diffToTargetUsd: 0.05,
    status: "LAPSED",
    note: "首轮对外报出，按标准档",
    code: "PS-001",
    quotedAt: "2026-10-05T02:00:00.000Z",
  }),
  round({
    id: "qr-3",
    docNo: "QT-12593-03",
    kind: "CUSTOMER",
    roundNo: 3,
    seq: 2,
    isLatest: false,
    priceCny: 19.31,
    priceUsd: 2.87,
    quantity: 12000,
    margin: 0.1668,
    diffToTargetUsd: 0.05,
    status: "LAPSED",
    note: "客户加量到 12000 双，触发阶梯让利 3%",
    code: "PS-001",
    quotedAt: "2026-10-12T02:00:00.000Z",
  }),
  round({
    id: "qr-4",
    docNo: "QT-12593-04",
    kind: "CUSTOMER",
    roundNo: 4,
    seq: 3,
    isLatest: true,
    priceCny: 18.79,
    priceUsd: 2.8,
    quantity: 30000,
    margin: 0.1437,
    diffToTargetUsd: -0.02,
    status: "QUOTED",
    note: "客户追加到 30000 双，改用大单进取档",
    code: "PS-002",
    quotedAt: "2026-10-18T02:00:00.000Z",
  }),
];

const ps2 = mockStrategies[1]!;

export const mockQuote: QuoteDto = {
  id: "q-12593",
  styleId: "s-12593",
  styleNo: "12593",
  styleName: "散点花卉瑜伽防滑隐形袜",
  styleNameEn: "Tossed Floral Studio Gripper Ballet No Show",
  productCode: "NSR12593-FA27",
  seasonCode: "FA27",
  customerId: "c-nsr",
  customerName: "北岸运动",
  factoryId: "f-1",
  factoryName: "东城一厂",
  moq: 2400,
  status: "QUOTED",
  strategy: {
    id: ps2.id,
    code: ps2.code,
    name: ps2.name,
    nameEn: ps2.nameEn,
    method: ps2.method,
    lossRate: ps2.lossRate,
    overheadRate: ps2.overheadRate,
    markupRate: ps2.markupRate,
    targetMargin: ps2.targetMargin,
    guardrail: ps2.guardrail,
    lockedFx: ps2.lockedFx,
    moq: ps2.moq,
    smallOrderUplift: ps2.smallOrderUplift,
    skuTiers: ps2.skuTiers,
    version: ps2.version,
  },
  targetPriceUsd: 2.82,
  targetFx: 6.5,
  targetPriceCny: 18.33,
  targetSource: "客户采购",
  targetDate: "2026-10-03",
  costTotal: 16.09,
  costBreakdown: {
    yarn: 1.33,
    yarnRaw: 1.1082,
    yarnLossRate: 0.2,
    labor: 4.23,
    laborRaw: 4.23,
    overheadRate: 0,
    trims: 0.52,
    other: 10.01,
  },
  costItems: [
    {
      id: "ci-1",
      category: "YARN",
      name: "精梳棉 32S/1",
      spec: "主纱",
      quantity: 0.0178,
      unitPrice: 36,
      amount: 0.6408,
    },
    { id: "ci-2", category: "LABOR", name: "织造", spec: null, quantity: null, unitPrice: null, amount: 4.23 },
    { id: "ci-3", category: "TRIMS", name: "卡头", spec: "90×60mm", quantity: 1, unitPrice: 0.52, amount: 0.52 },
    {
      id: "ci-4",
      category: "OTHER",
      name: "包材、物流与管理费",
      spec: null,
      quantity: null,
      unitPrice: null,
      amount: 10.01,
    },
  ],
  internalPrice: { docNo: "QT-12593-01", priceCny: 19.31, priceUsd: 2.87 },
  internalRounds: [internal],
  customerRounds,
  latestCustomerRound: customerRounds[2]!,
  roundCounts: { internal: 1, customer: 3 },
  files: [
    {
      id: "file-1",
      filename: "W27 BONDS RFQ 报价单.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 18432,
      createdAt: ts,
    },
  ],
  handoverStatus: "COLLECTING",
  note: "客户追加到 30000 双，改用大单进取档",
  ownerId: "u-sales",
  ownerName: "王芳",
  archivedAt: null,
  createdAt: ts,
  updatedAt: ts,
  version: 5,
};

const listItem: QuoteListItemDto = {
  id: mockQuote.id,
  styleId: mockQuote.styleId,
  styleNo: mockQuote.styleNo,
  styleName: mockQuote.styleName,
  seasonCode: mockQuote.seasonCode,
  customerId: mockQuote.customerId,
  customerName: mockQuote.customerName,
  factoryName: mockQuote.factoryName,
  status: "QUOTED",
  strategyCode: "PS-002",
  latestDocNo: "QT-12593-04",
  latestSeq: 3,
  latestPriceCny: 18.79,
  latestPriceUsd: 2.8,
  latestQuantity: 30000,
  latestMargin: 0.1437,
  latestQuotedAt: "2026-10-18T02:00:00.000Z",
  roundCount: 4,
  ownerId: "u-sales",
  ownerName: "王芳",
  archivedAt: null,
  updatedAt: ts,
  version: 5,
};

export const mockStyleOptions: StyleOptionDto[] = [
  {
    id: "s-12593",
    styleNo: "12593",
    nameZh: "散点花卉瑜伽防滑隐形袜",
    nameEn: null,
    seasonCode: "FA27",
    productCode: "NSR12593-FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
    quoteId: "q-12593",
    handoverId: "h-12593",
  },
  {
    id: "s-12810",
    styleNo: "12810",
    nameZh: "罗纹中筒休闲袜",
    nameEn: null,
    seasonCode: "FA27",
    productCode: "NSR12810-FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
    quoteId: null,
    handoverId: null,
  },
];

function preview(body: { quantity: number; priceCny?: number; strategyId?: string }): QuotePreviewDto {
  const s = mockStrategies.find((x) => x.id === body.strategyId) ?? ps2;
  const cost = 16.09;
  const base = s.method === "MARGIN" ? cost / (1 - s.targetMargin) : cost * (1 + s.markupRate);
  const uplift = body.quantity < s.moq ? s.smallOrderUplift : 0;
  const suggestedPrice = Math.round(base * (1 + uplift) * 100) / 100;
  const result: QuotePreviewDto = {
    strategy: snapshot(s.code as "PS-001" | "PS-002"),
    fx: s.lockedFx,
    quantity: body.quantity,
    costTotal: cost,
    suggested: {
      basePrice: Math.round(base * 100) / 100,
      upliftRate: uplift,
      skuAmount: body.quantity * suggestedPrice,
      discountRate: 0,
      suggestedPrice,
      priceUsd: Math.round((suggestedPrice / s.lockedFx) * 100) / 100,
    },
    check: null,
  };
  if (body.priceCny !== undefined) {
    const priceUsd = Math.round((body.priceCny / s.lockedFx) * 100) / 100;
    const margin = Math.round(((body.priceCny - cost) / body.priceCny) * 10000) / 10000;
    result.check = {
      priceCny: body.priceCny,
      priceUsd,
      margin,
      guardrail: s.guardrail,
      guardrailPassed: margin >= s.guardrail,
      targetMargin: s.targetMargin,
      targetMarginMet: margin >= s.targetMargin,
      moq: s.moq,
      belowMoq: body.quantity < s.moq,
      targetPriceUsd: 2.82,
      diffToTargetUsd: Math.round((priceUsd - 2.82) * 100) / 100,
      overTargetTolerance: priceUsd > 2.82 * 1.05,
      canOverride: false,
      canSubmit: margin >= s.guardrail,
    };
  }
  return result;
}

export const quoteHandlers = [
  http.get("*/quote-strategies", () => HttpResponse.json(envelope(mockStrategies))),
  http.put("*/quote-strategies/:id", async ({ params, request }) => {
    const current = mockStrategies.find((s) => s.id === params.id);
    if (!current) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as Partial<QuoteStrategyDto>;
    return HttpResponse.json(envelope({ ...current, ...body, version: current.version + 1 }));
  }),
  http.post("*/quote-strategies", async ({ request }) => {
    const body = (await request.json()) as Partial<QuoteStrategyDto>;
    return HttpResponse.json(
      envelope({ ...mockStrategies[0]!, ...body, id: "ps-new", code: "PS-004", usedBy: 0, version: 1 }),
    );
  }),
  http.get("*/quotes/style-options", () => HttpResponse.json(envelope(mockStyleOptions))),
  http.post("*/quotes/preview", async ({ request }) => {
    const body = (await request.json()) as { quantity: number; priceCny?: number; strategyId?: string };
    return HttpResponse.json(envelope(preview(body)));
  }),
  http.get("*/quotes", ({ request }) => HttpResponse.json(envelope(pageOf([listItem], new URL(request.url))))),
  http.post("*/quotes", () => HttpResponse.json(envelope(mockQuote))),
  http.get(
    "*/quotes/:id/export/:form",
    () =>
      new HttpResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
        headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      }),
  ),
  http.get("*/quotes/:id", ({ params }) =>
    params.id === mockQuote.id
      ? HttpResponse.json(envelope(mockQuote))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404),
  ),
  http.put("*/quotes/:id", () => HttpResponse.json(envelope({ ...mockQuote, version: mockQuote.version + 1 }))),
  http.post("*/quotes/:id/rounds", async ({ request }) => {
    const body = (await request.json()) as { priceCny?: number; quantity: number; version: number };
    if (body.version !== mockQuote.version)
      return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(envelope({ ...mockQuote, version: mockQuote.version + 1 }));
  }),
  http.post("*/quotes/:id/rounds/:roundId/feedback", async ({ request, params }) => {
    const body = (await request.json()) as { result: "ACCEPTED" | "REJECTED" };
    const rounds = mockQuote.customerRounds.map((r) =>
      r.id === params.roundId ? { ...r, status: body.result, version: r.version + 1 } : r,
    );
    return HttpResponse.json(
      envelope({
        ...mockQuote,
        status: body.result,
        customerRounds: rounds,
        latestCustomerRound: rounds[rounds.length - 1]!,
        version: mockQuote.version + 1,
      }),
    );
  }),
  http.post("*/quotes/:id/archive", () =>
    HttpResponse.json(envelope({ ...mockQuote, archivedAt: ts, version: mockQuote.version + 1 })),
  ),
  http.post("*/quotes/:id/files", () => HttpResponse.json(envelope(mockQuote))),
];
