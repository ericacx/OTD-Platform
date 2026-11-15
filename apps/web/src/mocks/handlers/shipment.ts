import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  BookingDetailDto,
  BookingDto,
  ShipmentDetailDto,
  ShipmentDto,
  ShipmentKpiDto,
} from "@otd/contracts/shipment";

const shipmentBase: Omit<ShipmentDto, "id" | "docNo" | "status" | "etd" | "eta" | "signedAt" | "version"> = {
  orderId: "o-9412",
  poNo: "PO0009412",
  customerId: "c-bby",
  customerName: "蓝湾生活",
  bookingId: "bk-1",
  bookingNo: "BK-2611-001",
  styleId: "s-11152",
  styleNo: "11152",
  styleName: "肌理卫衣半筒袜",
  styleNameEn: "Textured Sweatshirt Half Calf",
  transportMode: "OCEAN",
  destination: "BBY Seattle DC",
  carrierText: "NFI 物流 / 长荣海运",
  blNo: "EGLV026087011",
  cartonCount: 67,
  pairs: 2500,
  grossWeight: 812,
  volume: 6.03,
  factoryId: "f-1",
  factoryName: "东城一厂",
  seasonCode: "HO26",
  inspectionId: "insp-fri",
  inspectionNo: "INSP-2611-003",
  note: null,
  ownerId: "u-sales2",
  ownerName: "张伟",
  createdAt: "2026-10-25T01:00:00.000Z",
};

export const mockShipments: ShipmentDto[] = [
  {
    ...shipmentBase,
    id: "sh-arrived",
    docNo: "SH-2611-001",
    status: "ARRIVED",
    etd: "2026-11-01",
    eta: "2026-11-10",
    signedAt: null,
    version: 4,
  },
  {
    ...shipmentBase,
    id: "sh-signed",
    docNo: "SH-2611-002",
    status: "SIGNED",
    etd: "2026-10-20",
    eta: "2026-10-30",
    signedAt: "2026-11-01T07:00:00.000Z",
    version: 5,
  },
];

export const mockBookings: BookingDto[] = [
  {
    id: "bk-1",
    docNo: "BK-2611-001",
    orderId: "o-9412",
    poNo: "PO0009412",
    customerId: "c-bby",
    customerName: "蓝湾生活",
    forwarderId: "fw-1",
    forwarderName: "NFI 物流",
    carrier: "长荣海运",
    vessel: "EVER ACE",
    voyage: "0126W",
    blNo: "EGLV026087011",
    transportMode: "OCEAN",
    cutoffDate: "2026-10-30",
    containerType: "40HQ",
    etd: "2026-11-01",
    eta: "2026-11-10",
    status: "PENDING_CARRIER",
    confirmedAt: null,
    cancelReason: null,
    note: null,
    shipmentCount: 2,
    ownerId: "u-sales2",
    ownerName: "张伟",
    createdAt: "2026-10-20T01:00:00.000Z",
    version: 2,
  },
];

const kpis: ShipmentKpiDto = {
  booked: 0,
  packed: 0,
  inTransit: 0,
  arrived: 1,
  signed: 1,
  cartonsThisMonth: 67,
  unconfirmedBookings: 1,
};

function detailOf(row: ShipmentDto): ShipmentDetailDto {
  const statuses = ["BOOKED", "PACKED", "SAILED", "ARRIVED", "SIGNED"] as const;
  const reached = statuses.indexOf(row.status);
  return {
    ...row,
    events: statuses.map((status, i) => ({
      status,
      plannedAt: status === "SAILED" ? row.etd : status === "ARRIVED" ? row.eta : null,
      actualAt: i <= reached ? `2026-11-0${i + 1}T02:00:00.000Z` : null,
      note: null,
    })),
    batches: mockShipments,
    booking: mockBookings[0]!,
    released: true,
    cartonLines: 12,
    receivable: row.status === "SIGNED" ? { id: "ar-1", docNo: "AR-202611-001", status: "NOT_DUE" } : null,
  };
}

export const shipmentHandlers = [
  http.get("*/shipments/kpis", () => HttpResponse.json(envelope(kpis))),
  http.get("*/shipments", ({ request }) => HttpResponse.json(envelope(pageOf(mockShipments, new URL(request.url))))),
  http.get("*/shipments/:id", ({ params }) => {
    const row = mockShipments.find((s) => s.id === params.id);
    return row ? HttpResponse.json(envelope(detailOf(row))) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/shipments", async ({ request }) => {
    const body = (await request.json()) as Partial<ShipmentDto>;
    return HttpResponse.json(
      envelope({ ...mockShipments[0]!, ...body, id: "sh-new", docNo: "SH-2611-009", status: "BOOKED", version: 1 }),
      { status: 201 },
    );
  }),
  http.post("*/shipments/:id/:action", async ({ params, request }) => {
    const row = mockShipments.find((s) => s.id === params.id);
    const body = (await request.json()) as { version?: number; to?: ShipmentDto["status"] };
    if (!row) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== row.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    const status = params.action === "sign" ? "SIGNED" : (body.to ?? row.status);
    return HttpResponse.json(envelope({ ...row, status, version: row.version + 1 }));
  }),
  http.get("*/bookings", ({ request }) => HttpResponse.json(envelope(pageOf(mockBookings, new URL(request.url))))),
  http.get("*/bookings/:id", ({ params }) => {
    const row = mockBookings.find((b) => b.id === params.id);
    const detail: BookingDetailDto | undefined = row ? { ...row, shipments: mockShipments } : undefined;
    return detail ? HttpResponse.json(envelope(detail)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/bookings", async ({ request }) => {
    const body = (await request.json()) as Partial<BookingDto>;
    return HttpResponse.json(
      envelope({
        ...mockBookings[0]!,
        ...body,
        id: "bk-new",
        docNo: "BK-2611-009",
        status: "PENDING_CARRIER",
        version: 1,
      }),
      { status: 201 },
    );
  }),
  http.put("*/bookings/:id", async ({ params, request }) => {
    const row = mockBookings.find((b) => b.id === params.id) ?? mockBookings[0]!;
    const body = (await request.json()) as Partial<BookingDto>;
    return HttpResponse.json(envelope({ ...row, ...body, version: row.version + 1 }));
  }),
  http.post("*/bookings/:id/:action", async ({ params, request }) => {
    const row = mockBookings.find((b) => b.id === params.id);
    const body = (await request.json()) as { version?: number };
    if (!row) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== row.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(
      envelope({ ...row, status: params.action === "confirm" ? "CONFIRMED" : "CANCELLED", version: row.version + 1 }),
    );
  }),
];
