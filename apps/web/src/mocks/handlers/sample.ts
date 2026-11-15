import { HttpResponse, http } from "msw";

import { envelope, pageOf } from "./util";

import type { LibraryItemDto, MaterialDto, RoundDto, SampleDetailDto, StageView } from "@otd/contracts/sample";
import type { HttpHandler } from "msw";

const stage = (
  s: StageView["stage"],
  state: StageView["state"],
  durationHours: number | null,
  avgHours: number,
): StageView => ({
  stage: s,
  state,
  enteredAt: state === "PENDING" ? null : "2026-10-15T00:00:00.000Z",
  completedAt: state === "DONE" ? "2026-10-20T15:00:00.000Z" : null,
  durationHours,
  avgHours,
  avgSource: "GROUP",
  slow: durationHours !== null && durationHours > avgHours,
  location: state === "PENDING" ? null : "东城一厂 · 打样中心",
  operatorName: state === "PENDING" ? null : "陈静",
  passes: s === "QC" ? 2 : state === "PENDING" ? 0 : 1,
});

const round: RoundDto = {
  id: "r-1",
  sampleId: "s-1",
  roundNo: 1,
  roundType: "PROTO",
  quantity: 6,
  status: "READY",
  stageIndex: 5,
  stageEnteredAt: "2026-10-20T22:00:00.000Z",
  reworkCount: 1,
  dueDate: "2026-11-24",
  remainingDays: 34,
  issuedAt: "2026-10-14T00:00:00.000Z",
  approvalResult: null,
  approvalDate: null,
  approvalNote: null,
  reviseNote: null,
  shipmentId: null,
  shipmentDocNo: null,
  progress: "NORMAL",
  stages: [
    stage("RECEIVING", "DONE", 10, 12),
    stage("SOURCING", "DONE", 50, 48),
    stage("KNITTING", "DONE", 36, 24),
    stage("QC", "DONE", 28.8, 20),
    stage("READY", "ACTIVE", 3, 12),
  ],
  logs: [],
  version: 8,
};

export const mockMaterials: MaterialDto[] = [
  {
    id: "m-1",
    sampleId: "s-1",
    sampleDocNo: "SP-2610-012",
    styleNo: "12593",
    customerName: "北岸运动",
    materialName: "40S/1*2 T80C20 纱线",
    spec: "酒红 · 主纱",
    quantity: 2.4,
    unit: "kg",
    supplier: "华茂纱业",
    arrivalDate: "2026-10-17",
    arrivedAt: null,
    status: "PENDING",
    overdue: true,
    note: null,
    version: 1,
  },
];

export const mockLibrary: LibraryItemDto[] = [
  {
    id: "l-1",
    styleId: "st-11506",
    styleNo: "11506",
    styleNameZh: "晨雾罗纹中筒袜",
    customerId: "c-nsr",
    customerName: "北岸运动",
    sampleId: "s-2",
    sampleDocNo: "SP-2606-008",
    roundId: "r-9",
    roundLabel: "SMS 第 2 轮",
    kind: "QRS",
    location: "样品间 A-03-2",
    quantity: 2,
    status: "IN_STOCK",
    borrower: null,
    lentAt: null,
    returnedAt: null,
    note: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    version: 1,
  },
];

export const mockSample: SampleDetailDto = {
  id: "s-1",
  docNo: "SP-2610-012",
  styleId: "st-12593",
  styleNo: "12593",
  styleNameZh: "散点花卉瑜伽防滑隐形袜",
  styleNameEn: "Tossed Floral Studio Gripper No Show",
  productCode: "NSR12593-FA27",
  seasonCode: "FA27",
  customerId: "c-nsr",
  customerName: "北岸运动",
  planningId: "p-3",
  planningDocNo: "BR-2610-003",
  factoryId: "f-1",
  factoryName: "东城一厂",
  dueDate: "2026-11-24",
  remainingDays: 34,
  currentRound: {
    id: round.id,
    roundNo: 1,
    roundType: "PROTO",
    status: "READY",
    stageIndex: 5,
    stageEnteredAt: round.stageEnteredAt,
    reworkCount: 1,
    progress: "NORMAL",
    version: round.version,
  },
  costStatus: "COST_REVIEW",
  ownerId: "u-sales",
  ownerName: "王芳",
  technicianId: "u-tech",
  technicianName: "陈静",
  createdAt: "2026-10-14T00:00:00.000Z",
  version: 1,
  teamOrgId: "o-3",
  teamOrgName: "业务一部",
  location: "东城一厂 · 打样中心",
  colorway: "酒红",
  size: "M",
  customerRef: "SR0006192 - FA27 - Flow 2 Protos",
  briefTranslation: "女款瑜伽防滑隐形袜，散点花卉提花，144 针。",
  yarnConfig: "主纱：40S/1*2 T80C20 纱线",
  craftNotes: "袜底点胶 18 点防滑",
  sampleNotes: "PROTO ｜ 6 双 ｜ 酒红 ｜ 按 TP 核对后上机",
  styleImageFileId: null,
  rounds: [round],
  materials: mockMaterials,
  library: [],
};

export const sampleHandlers: HttpHandler[] = [
  http.get("*/samples/library", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockLibrary, new URL(request.url)))),
  ),
  http.get("*/samples/materials", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockMaterials, new URL(request.url)))),
  ),
  http.post("*/samples/library/:id/:action", ({ params }) =>
    HttpResponse.json(
      envelope({ ...mockLibrary[0]!, status: params.action === "lend" ? "LENT" : "IN_STOCK", version: 2 }),
    ),
  ),
  http.post("*/samples/materials/:id/arrive", () =>
    HttpResponse.json(envelope({ ...mockMaterials[0]!, status: "ARRIVED", overdue: false, version: 2 })),
  ),
  http.get("*/samples", ({ request }) => HttpResponse.json(envelope(pageOf([mockSample], new URL(request.url))))),
  http.get("*/samples/:id", () => HttpResponse.json(envelope(mockSample))),
  http.post("*/samples/rounds/:roundId/advance", async ({ request }) => {
    const body = (await request.json()) as { to: RoundDto["status"] };
    const next = { ...round, status: body.to, version: round.version + 1 };
    return HttpResponse.json(
      envelope({
        ...mockSample,
        rounds: [next],
        currentRound: { ...mockSample.currentRound!, status: body.to, version: next.version },
      }),
    );
  }),
];
