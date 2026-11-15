import { HttpResponse, http } from "msw";

import { envelope, pageOf } from "./util";

import type { ReuseCheckResultDto, TestReportDto, TestRequestDetailDto } from "@otd/contracts/testing";
import type { HttpHandler } from "msw";

function report(over: Partial<TestReportDto> & Pick<TestReportDto, "id" | "docNo" | "agencyReportNo">): TestReportDto {
  return {
    agencyId: "a-1",
    agencyName: "BV 广州",
    styleId: "st-11151",
    styleNo: "11151",
    styleNameZh: "美丽诺像素提花中筒袜",
    customerId: "c-mrn",
    customerName: "晨跑者",
    items: ["COLORFAST", "FUNCTIONAL"],
    result: "PASS",
    failedItems: null,
    issuedDate: "2026-10-20",
    validUntil: "2027-10-20",
    daysToExpire: 364,
    status: "VALID",
    fileId: null,
    reuseKey: {},
    linkedStyles: [{ id: "st-11151", styleNo: "11151" }],
    testRequestId: "t-1",
    testRequestDocNo: "TST-2610-026",
    createdAt: "2026-10-20T00:00:00.000Z",
    version: 1,
    ...over,
  };
}

export const mockReports: TestReportDto[] = [
  report({ id: "rp-1", docNo: "RPT-2610-017", agencyReportNo: "BV-26-10523" }),
  report({
    id: "rp-2",
    docNo: "RPT-2511-004",
    agencyReportNo: "ITS-25-3307",
    validUntil: "2026-11-10",
    daysToExpire: 20,
    status: "EXPIRING",
    styleNo: "11737",
  }),
  report({
    id: "rp-3",
    docNo: "RPT-2510-002",
    agencyReportNo: "ITS-25-2810",
    validUntil: "2026-10-09",
    daysToExpire: -12,
    status: "EXPIRED",
    styleNo: "11063",
  }),
];

const steps: TestRequestDetailDto["steps"] = [
  {
    key: "APPLY",
    state: "DONE",
    at: "2026-10-16",
    description: "申请 BV 广州 ｜ 色牢度、功能性检测 ｜ 袜底部位 · 4 双",
  },
  { key: "LAB", state: "ACTIVE", at: "2026-10-17", description: "BV 广州 ｜ 加急 · 2 个工作日 ｜ 签收 2026-10-17" },
  { key: "REPORT", state: "PENDING", at: null, description: null },
  { key: "RESULT", state: "PENDING", at: null, description: null },
];

export const mockTest: TestRequestDetailDto = {
  id: "t-1",
  docNo: "TST-2610-026",
  styleId: "st-11151",
  styleNo: "11151",
  styleNameZh: "美丽诺像素提花中筒袜",
  styleNameEn: "Merino Pixel Pattern Quarter Gripper",
  styleImageFileId: null,
  customerId: "c-mrn",
  customerName: "晨跑者",
  customerPo: "PO0009631",
  colorSize: "炭黑 / L",
  stage: "BULK",
  entrust: "CUSTOMER_PLATFORM",
  agencyId: "a-1",
  agencyName: "BV 广州",
  serviceLevel: "加急 · 2 个工作日",
  items: ["COLORFAST", "FUNCTIONAL"],
  standard: "GB/T 3920 / AATCC 61",
  sampleQty: 4,
  sampleSite: "袜底部位",
  sentDate: "2026-10-16",
  labReceivedDate: "2026-10-17",
  dueDate: "2026-10-19",
  completedDate: null,
  trackingNo: "SF7710003425",
  senderId: "u-q",
  senderName: "赵敏",
  factoryId: "f-1",
  factoryName: "南湖五厂",
  seasonCode: "HO26",
  status: "TESTING",
  result: null,
  failedItems: null,
  correctiveAction: null,
  resultNote: null,
  overdue: true,
  overdueDays: 2,
  report: null,
  reusedReport: null,
  retestOf: null,
  retests: [],
  steps,
  ownerId: "u-sales",
  ownerName: "王芳",
  createdAt: "2026-10-15T00:00:00.000Z",
  version: 3,
  relatedReports: [mockReports[0]!],
};

const reuseResult: ReuseCheckResultDto = {
  styleId: "st-11151",
  items: ["COLORFAST", "FUNCTIONAL"],
  reuseKey: {},
  candidates: [
    {
      report: mockReports[0]!,
      sameCustomer: true,
      sameStyle: true,
      sameStructure: false,
      sameCraft: false,
      sameYarn: false,
      inValidity: true,
      passed: true,
      coveredItems: ["COLORFAST", "FUNCTIONAL"],
      missingItems: [],
      reusable: true,
      reasons: [],
    },
  ],
  coverage: [
    { item: "COLORFAST", reportId: "rp-1", reportDocNo: "RPT-2610-017" },
    { item: "FUNCTIONAL", reportId: "rp-1", reportDocNo: "RPT-2610-017" },
  ],
  bestReportId: "rp-1",
};

export const testingHandlers: HttpHandler[] = [
  http.get("*/tests/reports", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const result = url.searchParams.get("result");
    const items = mockReports.filter(
      (r) => (!status || status.split(",").includes(r.status)) && (!result || r.result === result),
    );
    return HttpResponse.json(envelope(pageOf(items, url)));
  }),
  http.post("*/tests/reuse-check", () => HttpResponse.json(envelope(reuseResult))),
  http.get("*/tests", ({ request }) => HttpResponse.json(envelope(pageOf([mockTest], new URL(request.url))))),
  http.get("*/tests/:id", () => HttpResponse.json(envelope(mockTest))),
  http.post("*/tests", () =>
    HttpResponse.json(envelope({ ...mockTest, id: "t-new", docNo: "TST-2610-030", status: "DRAFT" }), { status: 201 }),
  ),
  http.post("*/tests/:id/complete", async ({ request }) => {
    const body = (await request.json()) as { result: "PASS" | "FAIL"; report: { agencyReportNo: string } };
    return HttpResponse.json(
      envelope({
        ...mockTest,
        status: "COMPLETED",
        result: body.result,
        overdue: false,
        report: report({ id: "rp-new", docNo: "RPT-2610-030", agencyReportNo: body.report.agencyReportNo }),
        steps: steps.map((s) => ({ ...s, state: "DONE" as const })),
        version: mockTest.version + 1,
      }),
    );
  }),
];
