import { HttpResponse, http, type HttpHandler } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  PurchaseDetailDto,
  PurchaseMaterialDto,
  PurchaseReceiptDto,
  PurchaseRequirementDto,
} from "@otd/contracts/purchase";

const common = {
  sampleId: null,
  sampleNo: null,
  receivedAt: null,
  note: null,
  cancelledAt: null,
  cancelReason: null,
  ownerId: "u-9",
  ownerName: "周涛",
  createdAt: "2026-10-09T01:00:00.000Z",
  receipts: [] as PurchaseReceiptDto[],
};

export const mockPurchases: PurchaseDetailDto[] = [
  {
    ...common,
    id: "pur-1",
    docNo: "PUR-2610-003",
    orderId: "o-9690",
    poNo: "PO0009690",
    customerId: "c-apx",
    customerName: "极线",
    supplier: "恒力化纤",
    category: "YARN",
    status: "ORDERED",
    orderedAt: "2026-10-09",
    promisedDate: "2026-10-18",
    deliveryPlace: "东城二厂原料仓",
    overdue: true,
    overdueDays: 3,
    lineCount: 1,
    amount: 6720,
    receivedRate: 0,
    version: 1,
    lines: [
      {
        id: "pl-1",
        materialId: "m-1",
        materialCode: "Y-NYLON-70D",
        name: "70D 锦纶包覆纱",
        spec: "70D",
        quantity: 120,
        unit: "kg",
        unitPrice: 56,
        receivedQty: 0,
        remainingQty: 120,
      },
    ],
  },
  {
    ...common,
    id: "pur-2",
    docNo: "PUR-2610-004",
    orderId: "o-9560",
    poNo: "PO0009560",
    customerId: "c-mpt",
    customerName: "枫林户外",
    supplier: "联达辅料",
    category: "TRIM",
    status: "PARTIAL",
    orderedAt: "2026-10-12",
    promisedDate: "2026-10-25",
    deliveryPlace: "东城一厂辅料仓",
    overdue: false,
    overdueDays: 0,
    lineCount: 1,
    amount: 648,
    receivedRate: 0.5556,
    version: 2,
    lines: [
      {
        id: "pl-2",
        materialId: "m-2",
        materialCode: "T-SILICONE",
        name: "硅胶防滑点",
        spec: "踵部",
        quantity: 5400,
        unit: "双",
        unitPrice: 0.12,
        receivedQty: 3000,
        remainingQty: 2400,
      },
    ],
    receipts: [
      {
        id: "pr-1",
        purchaseId: "pur-2",
        purchaseDocNo: "PUR-2610-004",
        supplier: "联达辅料",
        lineId: "pl-2",
        lineName: "硅胶防滑点",
        quantity: 3000,
        unit: "双",
        receivedAt: "2026-10-20",
        qcResult: "PASS",
        note: "首批到货",
        createdByName: "周涛",
        createdAt: "2026-10-20T07:00:00.000Z",
      },
    ],
  },
];

const materials: PurchaseMaterialDto[] = [
  {
    id: "m-1",
    code: "Y-NYLON-70D",
    name: "70D 锦纶包覆纱",
    category: "YARN",
    spec: "70D",
    unit: "kg",
    unitPrice: 56,
    supplier: "恒力化纤",
  },
  {
    id: "m-3",
    code: "P-OPP-BAG",
    name: "OPP 自立袋",
    category: "PACKAGING",
    spec: "0.06mm",
    unit: "个",
    unitPrice: 0.08,
    supplier: "宏达包装",
  },
];

const requirement = (orderId: string): PurchaseRequirementDto => ({
  orderId,
  poNo: mockPurchases.find((p) => p.orderId === orderId)?.poNo ?? "PO",
  totalPairs: 5400,
  pairsPerCarton: 120,
  pairsPerCartonSource: "PLAN",
  items: [
    {
      key: "YARN",
      category: "YARN",
      materialId: "m-0",
      materialCode: "Y-40S-T80C20",
      name: "40S/1*2 T80C20 纱线",
      unit: "kg",
      basis: "26.1 g/双",
      required: 140.94,
      ordered: 100,
      received: 100,
      shortage: 40.94,
      suggestion: "建议补采 40.94 kg",
    },
    {
      key: "OPP_BAG",
      category: "PACKAGING",
      materialId: "m-3",
      materialCode: "P-OPP-BAG",
      name: "OPP 自立袋",
      unit: "个",
      basis: "1 个/双",
      required: 5400,
      ordered: 5400,
      received: 0,
      shortage: 0,
      suggestion: null,
    },
    {
      key: "CARTON",
      category: "PACKAGING",
      materialId: null,
      materialCode: null,
      name: "纸箱",
      unit: "个",
      basis: "1 个/120 双",
      required: 45,
      ordered: 0,
      received: 0,
      shortage: 45,
      suggestion: "建议补采 45 个",
    },
  ],
});

const summary = (purchase: PurchaseDetailDto) => {
  const rest: Partial<PurchaseDetailDto> = { ...purchase };
  delete rest.lines;
  delete rest.receipts;
  return rest;
};

export const purchaseHandlers: HttpHandler[] = [
  http.get("*/purchases/receipts", ({ request }) =>
    HttpResponse.json(
      envelope(
        pageOf(
          mockPurchases.flatMap((p) => p.receipts),
          new URL(request.url),
        ),
      ),
    ),
  ),
  http.get("*/purchases/materials", () => HttpResponse.json(envelope(materials))),
  http.get("*/purchases/requirements", ({ request }) =>
    HttpResponse.json(envelope(requirement(new URL(request.url).searchParams.get("orderId") ?? ""))),
  ),
  http.get("*/purchases/:id", ({ params }) => {
    const p = mockPurchases.find((x) => x.id === params.id);
    return p ? HttpResponse.json(envelope(p)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.get("*/purchases", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const overdue = url.searchParams.get("overdue") === "true";
    const rows = mockPurchases.filter(
      (p) => (!status || status.split(",").includes(p.status)) && (!overdue || p.overdue),
    );
    return HttpResponse.json(envelope(pageOf(rows.map(summary), url)));
  }),
  http.post("*/purchases", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      envelope({ ...mockPurchases[0]!, ...body, id: "pur-new", docNo: "PUR-2611-001", status: "ORDERED", version: 1 }),
      { status: 201 },
    );
  }),
  http.post("*/purchases/:id/receive", async ({ params, request }) => {
    const p = mockPurchases.find((x) => x.id === params.id);
    const body = (await request.json()) as { version: number; lines: { lineId: string; quantity: number }[] };
    if (!p) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== p.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    const lines = p.lines.map((l) => {
      const got = body.lines.find((x) => x.lineId === l.id)?.quantity ?? 0;
      return { ...l, receivedQty: l.receivedQty + got, remainingQty: Math.max(0, l.remainingQty - got) };
    });
    const complete = lines.every((l) => l.remainingQty === 0);
    return HttpResponse.json(
      envelope({ ...p, lines, status: complete ? "RECEIVED" : "PARTIAL", version: p.version + 1 }),
    );
  }),
  http.post("*/purchases/:id/cancel", async ({ params, request }) => {
    const p = mockPurchases.find((x) => x.id === params.id);
    const body = (await request.json()) as { version: number };
    if (!p) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (p.status !== "ORDERED")
      return fail("FLOW_ILLEGAL_TRANSITION", `当前状态「${p.status}」不允许执行「cancel」`, 409);
    return HttpResponse.json(envelope({ ...p, status: "CANCELLED", version: body.version + 1 }));
  }),
];
