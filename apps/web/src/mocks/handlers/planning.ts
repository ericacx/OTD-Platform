import { PRODUCT_ATTRS } from "@otd/contracts/planning";
import { HttpResponse, http } from "msw";

import { envelope, pageOf } from "./util";

import type { PlanningDto, StyleOptionDto } from "@otd/contracts/planning";
import type { HttpHandler } from "msw";

const field = (value: string | null, confidence = 0.95) => ({
  value,
  confidence: value === null ? 0 : confidence,
  source: value ? `Tech Pack P1 · ${value}` : null,
  page: value ? 1 : null,
});

function planning(over: Partial<PlanningDto> & Pick<PlanningDto, "id" | "docNo" | "status">): PlanningDto {
  return {
    styleId: null,
    styleNo: "12593",
    seasonCode: "FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
    nameZh: "散点花卉瑜伽防滑隐形袜",
    nameEn: "Tossed Floral Studio Gripper No Show",
    category: "WOMEN",
    subCategory: "NO_SHOW",
    defaultSize: "M",
    sizeRange: "S / M / L",
    supplier: "东城一厂",
    buyerName: "Milena Ortiz",
    designer: null,
    needleCount: "144N",
    sockWeight: "Light 薄款",
    requiredSampleDate: "2026-11-24",
    briefTranslation: "女款瑜伽防滑隐形袜，散点花卉提花，144 针。",
    productAttrs: PRODUCT_ATTRS.map((a) => ({
      key: a.key,
      labelZh: a.zh,
      labelEn: a.en,
      original: a.key === "cuff" ? "Hidden cuff" : null,
      translated: a.key === "cuff" ? "隐藏式罗口" : null,
      confidence: a.key === "cuff" ? 0.9 : null,
    })),
    extraction: {
      styleNo: field("12593"),
      nameEn: field("Tossed Floral Studio Gripper No Show"),
      defaultSize: field("M", 0.62),
      sockWeight: field("Light 薄款", 0.55),
      needleCount: field("144N"),
    },
    lowConfidenceFields: ["defaultSize", "sockWeight"],
    sourceFile: { id: "file-1", filename: "NSR_12593_FA27_TechPack.pdf" },
    imageFileIds: [],
    recognitionError: null,
    recognizedAt: "2026-10-21T01:02:00.000Z",
    confirmedAt: null,
    confirmedByName: null,
    archivedAt: null,
    sample: null,
    ownerId: "u-sales",
    ownerName: "王芳",
    createdAt: "2026-10-21T01:00:00.000Z",
    updatedAt: "2026-10-21T01:02:00.000Z",
    version: 2,
    ...over,
  };
}

export const mockPlannings: PlanningDto[] = [
  planning({
    id: "p-1",
    docNo: "BR-2610-021",
    status: "RECOGNIZING",
    styleNo: "12810",
    nameZh: null,
    nameEn: null,
    extraction: null,
    lowConfidenceFields: [],
  }),
  planning({ id: "p-2", docNo: "BR-2610-009", status: "EXTRACTED" }),
  planning({
    id: "p-3",
    docNo: "BR-2610-003",
    status: "CONFIRMED",
    styleNo: "12744",
    nameZh: "小黄鸟花朵翻口防滑童袜",
    lowConfidenceFields: [],
    confirmedAt: "2026-10-04T02:00:00.000Z",
    confirmedByName: "王芳",
    sample: { id: "s-1", docNo: "SP-2610-004" },
    version: 3,
  }),
  planning({
    id: "p-4",
    docNo: "BR-2606-021",
    status: "ARCHIVED",
    styleNo: "11506",
    nameZh: "晨雾罗纹中筒袜",
    seasonCode: "AW26",
  }),
];

export const mockStyles: StyleOptionDto[] = [
  {
    id: "st-12593",
    styleNo: "12593",
    nameZh: "散点花卉瑜伽防滑隐形袜",
    nameEn: "Tossed Floral",
    seasonCode: "FA27",
    productCode: "NSR12593-FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
  },
  {
    id: "st-12810",
    styleNo: "12810",
    nameZh: "罗纹中筒休闲袜",
    nameEn: "Ribbed Everyday Crew",
    seasonCode: "FA27",
    productCode: "NSR12810-FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
  },
];

function find(id: string | readonly string[] | undefined): PlanningDto {
  return mockPlannings.find((p) => p.id === id) ?? mockPlannings[1]!;
}

export const planningHandlers: HttpHandler[] = [
  http.post("*/files", () =>
    HttpResponse.json(
      envelope({
        id: "file-new",
        filename: "NSR_12812_FA27_Argyle.pdf",
        contentType: "application/pdf",
        size: 2_457_600,
        createdAt: "2026-10-21T01:00:00.000Z",
      }),
    ),
  ),
  http.get("*/styles", () => HttpResponse.json(envelope(mockStyles))),
  http.get("*/plannings/archived", ({ request }) =>
    HttpResponse.json(
      envelope(
        pageOf(
          mockPlannings.filter((p) => p.status === "ARCHIVED"),
          new URL(request.url),
        ),
      ),
    ),
  ),
  http.get("*/plannings", ({ request }) =>
    HttpResponse.json(
      envelope(
        pageOf(
          mockPlannings.filter((p) => p.status !== "ARCHIVED"),
          new URL(request.url),
        ),
      ),
    ),
  ),
  http.get("*/plannings/:id", ({ params }) => HttpResponse.json(envelope(find(params.id)))),
  http.post("*/plannings", async ({ request }) => {
    const body = (await request.json()) as Record<string, string | undefined>;
    return HttpResponse.json(
      envelope(
        planning({
          id: "p-new",
          docNo: "BR-2610-022",
          status: "EXTRACTED",
          styleNo: body.styleNo ?? "12812",
          nameZh: body.nameZh ?? "提花菱格中筒袜",
          nameEn: "Argyle Jacquard Crew",
          sourceFile: body.fileId ? { id: body.fileId, filename: "NSR_12812_FA27_Argyle.pdf" } : null,
        }),
      ),
      { status: 201 },
    );
  }),
  http.put("*/plannings/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<PlanningDto> & { version: number };
    const current = find(params.id);
    return HttpResponse.json(
      envelope({ ...current, ...body, productAttrs: current.productAttrs, version: current.version + 1 }),
    );
  }),
  http.post("*/plannings/:id/confirm", ({ params }) => {
    const current = find(params.id);
    return HttpResponse.json(
      envelope({
        ...current,
        status: "CONFIRMED",
        confirmedAt: "2026-10-21T02:00:00.000Z",
        sample: { id: "s-new", docNo: "SP-2610-013" },
        version: current.version + 1,
      }),
    );
  }),
  http.post("*/plannings/:id/:action", ({ params }) => {
    const current = find(params.id);
    const status = params.action === "archive" ? "ARCHIVED" : "EXTRACTED";
    return HttpResponse.json(envelope({ ...current, status, version: current.version + 1 }));
  }),
];
