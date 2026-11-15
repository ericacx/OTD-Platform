import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  CollectionSummaryDto,
  InvoiceDto,
  ReceivableDetailDto,
  ReceivableDto,
  ReceivableKpiDto,
} from "@otd/contracts/receivable";

const arBase: Omit<
  ReceivableDto,
  | "id"
  | "docNo"
  | "type"
  | "amount"
  | "currency"
  | "dueDate"
  | "receivedAmount"
  | "outstanding"
  | "progress"
  | "status"
  | "overdue"
  | "overdueDays"
> = {
  customerId: "c-mrn",
  customerName: "晨跑者",
  settlementEntity: "Morning Runner GmbH",
  sourceType: "SHIPMENT",
  sourceNo: "SH-2611-001",
  orderId: "o-9631",
  poNo: "PO0009631",
  shipmentId: "sh-arrived",
  shipmentNo: "SH-2611-001",
  invoiceId: null,
  invoiceNo: null,
  disputed: false,
  missingData: false,
  note: null,
  collectionCount: 0,
  lastCollection: null,
  nextFollowUp: null,
  ownerId: "u-sales",
  ownerName: "王芳",
  createdAt: "2026-09-01T01:00:00.000Z",
  version: 2,
};

export const mockReceivables: ReceivableDto[] = [
  {
    ...arBase,
    id: "ar-overdue",
    docNo: "AR-202609-021",
    type: "GOODS",
    amount: 66900,
    currency: "EUR",
    dueDate: "2026-10-04",
    receivedAmount: 0,
    outstanding: 66900,
    progress: 0,
    status: "DUE",
    overdue: true,
    overdueDays: 42,
    disputed: true,
    collectionCount: 1,
    lastCollection: { channel: "EMAIL", result: "DISPUTED", at: "2026-10-26T08:00:00.000Z" },
    nextFollowUp: "2026-11-18",
  },
  {
    ...arBase,
    id: "ar-partial",
    docNo: "AR-202610-003",
    type: "GOODS",
    amount: 88900,
    currency: "EUR",
    dueDate: "2027-01-02",
    receivedAmount: 60000,
    outstanding: 28900,
    progress: 0.6749,
    status: "PARTIAL",
    overdue: false,
    overdueDays: 0,
  },
  {
    ...arBase,
    id: "ar-offset",
    docNo: "AR-202610-008",
    type: "DEDUCTION",
    amount: -8600,
    currency: "EUR",
    dueDate: "2026-12-13",
    receivedAmount: 0,
    outstanding: -8600,
    progress: 0,
    status: "OFFSET_PENDING",
    overdue: false,
    overdueDays: 0,
    sourceType: "MANUAL",
    sourceNo: "QCL-2610-006",
    shipmentId: null,
    shipmentNo: null,
  },
];

const kpis: ReceivableKpiDto = {
  balanceUsd: 662201,
  overdueUsd: 302983,
  overdueCount: 8,
  avgOverdueDays: 13,
  dueThisMonth: 10,
  missingData: 2,
};

const summary: CollectionSummaryDto = {
  overdueUsd: 302983,
  overdueCount: 8,
  avgOverdueDays: 13,
  todayFollowUps: 1,
  collectedThisMonthUsd: 340969,
  untouched: 3,
  tabs: { all: 1, mine: 1, today: 0, team: 1 },
  team: [{ ownerId: "u-sales", ownerName: "王芳", overdueCount: 1, overdueUsd: 73023, untouched: 0 }],
};

export const mockInvoices: InvoiceDto[] = [
  {
    id: "inv-1",
    invoiceNo: "INV-26-0001",
    customerId: "c-mrn",
    customerName: "晨跑者",
    orderId: "o-9631",
    poNo: "PO0009631",
    shipmentId: "sh-arrived",
    shipmentNo: "SH-2611-001",
    receivableId: "ar-partial",
    receivableNo: "AR-202610-003",
    amount: 88900,
    currency: "EUR",
    issuedDate: "2026-11-03",
    note: null,
    ownerId: "u-sales",
    ownerName: "王芳",
    createdAt: "2026-11-03T01:00:00.000Z",
    version: 1,
  },
];

function detailOf(row: ReceivableDto): ReceivableDetailDto {
  return {
    ...row,
    receipts: row.receivedAmount
      ? [
          {
            id: `${row.id}-r1`,
            amount: row.receivedAmount,
            currency: row.currency,
            receivedAt: "2026-11-01",
            method: "TT",
            bankRef: "HSBC-001",
            note: null,
            createdByName: "郑丽",
            createdAt: "2026-11-01T01:00:00.000Z",
          },
        ]
      : [],
    collections: row.lastCollection
      ? [
          {
            id: `${row.id}-c1`,
            channel: row.lastCollection.channel,
            result: row.lastCollection.result,
            note: "客户称短装",
            nextFollowUp: row.nextFollowUp,
            createdByName: "王芳",
            createdAt: row.lastCollection.at,
          },
        ]
      : [],
  };
}

export const receivableHandlers = [
  http.get("*/receivables/kpis", () => HttpResponse.json(envelope(kpis))),
  http.get("*/receivables/collection/summary", () => HttpResponse.json(envelope(summary))),
  http.get("*/receivables/collection", ({ request }) =>
    HttpResponse.json(
      envelope(
        pageOf(
          mockReceivables.filter((r) => r.overdue),
          new URL(request.url),
        ),
      ),
    ),
  ),
  http.get("*/receivables/invoices", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockInvoices, new URL(request.url)))),
  ),
  http.post("*/receivables/invoices", async ({ request }) => {
    const body = (await request.json()) as Partial<InvoiceDto>;
    return HttpResponse.json(envelope({ ...mockInvoices[0]!, ...body, id: "inv-new" }), { status: 201 });
  }),
  http.get("*/receivables", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockReceivables, new URL(request.url)))),
  ),
  http.get("*/receivables/:id", ({ params }) => {
    const row = mockReceivables.find((r) => r.id === params.id);
    return row ? HttpResponse.json(envelope(detailOf(row))) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/receivables", async ({ request }) => {
    const body = (await request.json()) as Partial<ReceivableDto>;
    return HttpResponse.json(
      envelope({ ...mockReceivables[1]!, ...body, id: "ar-new", docNo: "AR-202611-009", version: 1 }),
      { status: 201 },
    );
  }),
  http.post("*/receivables/:id/:action", async ({ params, request }) => {
    const row = mockReceivables.find((r) => r.id === params.id);
    const body = (await request.json()) as { version?: number; amount?: number };
    if (!row) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (params.action !== "collections" && body.version !== row.version) {
      return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    }
    if (params.action === "receipts") {
      const received = row.receivedAmount + (body.amount ?? 0);
      return HttpResponse.json(
        envelope({
          ...row,
          receivedAmount: received,
          outstanding: row.amount - received,
          status: received >= row.amount ? "PAID" : "PARTIAL",
          version: row.version + 1,
        }),
      );
    }
    return HttpResponse.json(envelope({ ...row, collectionCount: row.collectionCount + 1, version: row.version + 1 }));
  }),
];
