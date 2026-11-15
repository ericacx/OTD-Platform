import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  InspectionDetailDto,
  InspectionDto,
  InspectionKpiDto,
  InspectionScheduleViewDto,
  ReleaseCheckDto,
} from "@otd/contracts/inspection";

const base: Omit<InspectionDto, "id" | "docNo" | "stage" | "status" | "roundNo" | "result"> = {
  orderId: "o-9631",
  poNo: "PO0009631",
  customerId: "c-mrn",
  customerName: "晨跑者",
  styleId: "s-11151",
  styleNo: "11151",
  styleName: "美丽诺像素提花中筒袜",
  styleNameEn: "Merino Pixel Pattern Quarter Gripper",
  color: "Black",
  factoryId: "f-nh5",
  factoryName: "南湖五厂",
  seasonCode: "HO26",
  plannedDate: "2026-11-11",
  actualDate: "2026-11-11",
  plannedExFactory: "2026-11-28",
  method: "认证 QC 代检",
  inspector: "张磊",
  channel: "Inspectorio",
  aql: "AQL 1.5 Level I",
  granularity: "PO + 款号 + SKU + 尺码",
  orderQty: 12600,
  cartonCount: 105,
  productionRate: 1,
  packingRate: 0.8,
  plannedSampleQty: 315,
  actualSampleQty: 315,
  defectQty: 7,
  defectRate: 0.0222,
  preconditions: ["尺寸表", "纱线测试结果", "封样扣样"],
  requirements: null,
  defectNote: "对色不符",
  correctiveAction: "换片重缝并全检",
  releasedAt: null,
  releaseCheck: null,
  concession: false,
  concessionReason: null,
  cancelReason: null,
  scheduleWarning: null,
  ownerId: "u-sales",
  ownerName: "王芳",
  createdAt: "2026-11-01T01:00:00.000Z",
  updatedAt: "2026-11-11T08:00:00.000Z",
  version: 4,
};

export const mockInspections: InspectionDto[] = [
  { ...base, id: "insp-dpi", docNo: "INSP-2611-002", stage: "DPI", status: "INSPECTED", roundNo: 2, result: "FAIL" },
  {
    ...base,
    id: "insp-fri",
    docNo: "INSP-2611-003",
    stage: "FRI",
    status: "INSPECTED",
    roundNo: 1,
    result: "PASS",
    defectQty: 0,
    defectRate: 0,
    defectNote: null,
    correctiveAction: null,
    version: 3,
  },
  {
    ...base,
    id: "insp-todo",
    docNo: "INSP-2611-004",
    stage: "FRI",
    status: "TO_SCHEDULE",
    roundNo: 1,
    result: null,
    plannedDate: null,
    actualDate: null,
    actualSampleQty: null,
    defectQty: null,
    defectRate: null,
    defectNote: null,
    correctiveAction: null,
    version: 1,
  },
];

export const mockReleaseCheck: ReleaseCheckDto = {
  passed: true,
  refDate: "2026-11-28",
  items: [
    {
      key: "finalPassed",
      label: { zh: "终验结论合格", en: "Final inspection passed" },
      passed: true,
      applicable: true,
      detail: "INSP-2611-003 尾验第 1 轮合格",
    },
    {
      key: "reportsValid",
      label: { zh: "测试报告在有效期内且合格", en: "Test reports valid" },
      passed: true,
      applicable: false,
      detail: "不适用（客户流程未启用）",
    },
    {
      key: "packingReady",
      label: { zh: "包装方案已确认且装箱齐套", en: "Packing confirmed & complete" },
      passed: true,
      applicable: true,
      detail: "PK-2611-001 v3 · CT-2611-001",
    },
  ],
  missing: [],
  releasable: true,
  concessionAvailable: false,
  dailyLimit: 5,
  releaseDays: 12,
};

const kpis: InspectionKpiDto = {
  total: 3,
  byStage: { IPI: 0, DPI: 1, FRI: 2 },
  toSchedule: 1,
  failed: 1,
  toRelease: 1,
  released: 0,
};

function detailOf(row: InspectionDto): InspectionDetailDto {
  return {
    ...row,
    rounds: row.result
      ? [
          {
            roundNo: row.roundNo,
            result: row.result,
            actualDate: row.actualDate,
            actualSampleQty: row.actualSampleQty,
            defectQty: row.defectQty,
            defectRate: row.defectRate,
            defectNote: row.defectNote,
            correctiveAction: row.correctiveAction,
            recordedAt: "2026-11-11T08:00:00.000Z",
            recordedBy: "张磊",
          },
        ]
      : [],
    logs: [
      {
        id: `${row.id}-l1`,
        at: "2026-11-01T01:00:00.000Z",
        action: "create",
        fromStatus: null,
        toStatus: "TO_SCHEDULE",
        note: `${row.stage} 验货申请`,
        operatorName: "王芳",
      },
    ],
    sameOrder: mockInspections,
  };
}

const NEXT: Record<string, InspectionDto["status"]> = {
  schedule: "SCHEDULED",
  result: "INSPECTED",
  rework: "REWORK",
  cancel: "CANCELLED",
  release: "RELEASED",
};

export const inspectionHandlers = [
  http.get("*/inspections/kpis", () => HttpResponse.json(envelope(kpis))),
  http.get("*/inspections/schedule", ({ request }) => {
    const url = new URL(request.url);
    const view: InspectionScheduleViewDto = {
      from: url.searchParams.get("from") ?? "2026-11-15",
      to: url.searchParams.get("to") ?? "2026-11-28",
      limit: 5,
      days: [
        {
          date: "2026-11-18",
          factoryId: "f-nh5",
          factoryName: "南湖五厂",
          styleCount: 5,
          limit: 5,
          full: true,
          items: [
            {
              id: "insp-fri",
              docNo: "INSP-2611-003",
              stage: "FRI",
              status: "SCHEDULED",
              poNo: "PO0009631",
              customerName: "晨跑者",
              styleNo: "11151",
              inspector: "张磊",
              channel: "Inspectorio",
            },
          ],
        },
      ],
      unscheduled: mockInspections.filter((i) => i.status === "TO_SCHEDULE"),
    };
    return HttpResponse.json(envelope(view));
  }),
  http.get("*/inspections", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockInspections, new URL(request.url)))),
  ),
  http.get("*/inspections/:id/release-check", () => HttpResponse.json(envelope(mockReleaseCheck))),
  http.get("*/inspections/:id", ({ params }) => {
    const row = mockInspections.find((i) => i.id === params.id);
    return row ? HttpResponse.json(envelope(detailOf(row))) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/inspections", async ({ request }) => {
    const body = (await request.json()) as Partial<InspectionDto>;
    return HttpResponse.json(
      envelope({ ...mockInspections[2]!, ...body, id: "insp-new", docNo: "INSP-2611-009", version: 1 }),
      { status: 201 },
    );
  }),
  http.post("*/inspections/:id/:action", async ({ params, request }) => {
    const row = mockInspections.find((i) => i.id === params.id);
    const body = (await request.json()) as { version?: number };
    if (!row) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== row.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(
      envelope({ ...row, status: NEXT[String(params.action)] ?? row.status, version: row.version + 1 }),
    );
  }),
];
