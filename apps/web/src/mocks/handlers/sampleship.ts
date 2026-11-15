import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type { RecipientDto, SampleShipmentDto } from "@otd/contracts/sampleship";

const ts = "2026-10-21T01:00:00.000Z";

export const mockRecipients: RecipientDto[] = [
  {
    id: "rc-1",
    customerId: "c-nsr",
    customerName: "北岸运动",
    company: "NorthShore Design Studio",
    name: "Milena",
    address: "1 Harbor Rd, Portland, OR",
    phone: "+1 503 555 0100",
    email: "milena@northshore.example",
    courier: "DHL",
    isDefault: true,
    version: 1,
  },
];

export const mockShipments: SampleShipmentDto[] = [
  {
    id: "sm-1",
    docNo: "SM-2610-004",
    customerId: "c-nsr",
    customerName: "北岸运动",
    recipient: mockRecipients[0]!,
    method: "COURIER",
    courier: "DHL",
    trackingNo: null,
    sentAt: null,
    signedAt: null,
    status: "DRAFT",
    items: [{ styleId: "s-12593", styleNo: "12593", kind: "PROTO", quantity: 6 }],
    note: null,
    ownerId: "u-sales",
    ownerName: "王芳",
    createdAt: ts,
    version: 1,
  },
];

function find(id: unknown) {
  return mockShipments.find((s) => s.id === id);
}

export const sampleshipHandlers = [
  http.get("*/sample-shipments/recipients", () => HttpResponse.json(envelope(mockRecipients))),
  http.post("*/sample-shipments/recipients", async ({ request }) => {
    const body = (await request.json()) as Partial<RecipientDto>;
    return HttpResponse.json(envelope({ ...mockRecipients[0]!, ...body, id: "rc-new", version: 1 }));
  }),
  http.put("*/sample-shipments/recipients/:id", async ({ request }) => {
    const body = (await request.json()) as Partial<RecipientDto>;
    return HttpResponse.json(envelope({ ...mockRecipients[0]!, ...body, version: 2 }));
  }),
  http.get("*/sample-shipments", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    return HttpResponse.json(
      envelope(pageOf(status ? mockShipments.filter((s) => s.status === status) : mockShipments, url)),
    );
  }),
  http.post("*/sample-shipments", () => HttpResponse.json(envelope(mockShipments[0]))),
  http.get("*/sample-shipments/:id", ({ params }) => {
    const s = find(params.id);
    return s ? HttpResponse.json(envelope(s)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/sample-shipments/:id/send", async ({ params, request }) => {
    const s = find(params.id);
    const body = (await request.json()) as { trackingNo: string; version: number };
    if (!s) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== s.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(
      envelope({ ...s, status: "SENT", trackingNo: body.trackingNo, sentAt: ts, version: s.version + 1 }),
    );
  }),
  http.post("*/sample-shipments/:id/sign", ({ params }) => {
    const s = find(params.id);
    return s
      ? HttpResponse.json(envelope({ ...s, status: "SIGNED", signedAt: ts, version: s.version + 1 }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
];
