import { HttpResponse, http } from "msw";

import { mockCustomers, mockOrgs, mockUsers } from "../fixtures/iam";

import { envelope, pageOf } from "./util";

import type { Lookups } from "@otd/contracts/masterdata";

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
];
