import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type { AuditStatus, FactoryAuditDto, FindingDto } from "@otd/contracts/factoryaudit";

const TODAY = "2026-11-15";

const FACTORIES: Record<string, { code: string; name: string; baseName: string }> = {
  "f-1": { code: "DC1", name: "东城一厂", baseName: "东城基地" },
  "f-2": { code: "DC2", name: "东城二厂", baseName: "东城基地" },
  "f-3": { code: "NH5", name: "南湖五厂", baseName: "南湖基地" },
  "f-4": { code: "HP3", name: "海防三厂", baseName: "越南基地" },
};

const CUSTOMERS: Record<string, string> = {
  "c-nsr": "北岸运动",
  "c-mrn": "晨跑者",
  "c-apx": "极线",
  "c-ssh": "海盐家居",
};

type AuditRow = Omit<
  FactoryAuditDto,
  | "factoryCode"
  | "factoryName"
  | "baseName"
  | "customerName"
  | "findingCount"
  | "openFindingCount"
  | "overdueFindingCount"
>;
type FindingRow = Pick<
  FindingDto,
  | "id"
  | "auditId"
  | "item"
  | "severity"
  | "correctiveAction"
  | "responsible"
  | "dueDate"
  | "status"
  | "closedAt"
  | "closeNote"
  | "version"
>;

function audit(
  row: Partial<AuditRow> & Pick<AuditRow, "id" | "docNo" | "factoryId" | "auditType" | "status" | "customerId">,
): AuditRow {
  return {
    plannedDate: null,
    actualDate: null,
    auditor: null,
    result: null,
    score: null,
    certificateValidUntil: null,
    note: null,
    ownerId: "u-7",
    ownerName: "赵敏",
    createdAt: "2026-10-01T01:00:00.000Z",
    updatedAt: "2026-10-01T01:00:00.000Z",
    version: 1,
    ...row,
  };
}

function seedAudits(): AuditRow[] {
  return [
    audit({
      id: "aud-1",
      docNo: "AUD-2607-001",
      factoryId: "f-4",
      auditType: "SOCIAL",
      customerId: "c-ssh",
      plannedDate: "2026-07-18",
      actualDate: "2026-07-20",
      auditor: "Qualspec · BSCI 年审",
      result: "PASS",
      score: 88,
      certificateValidUntil: "2027-07-18",
      status: "CLOSED",
      version: 3,
    }),
    audit({
      id: "aud-2",
      docNo: "AUD-2609-001",
      factoryId: "f-1",
      auditType: "SOCIAL",
      customerId: "c-nsr",
      plannedDate: "2026-09-16",
      actualDate: "2026-09-18",
      auditor: "BV 广州 · SMETA 4-Pillar",
      result: "PASS",
      score: 92,
      certificateValidUntil: "2027-09-15",
      status: "CLOSED",
      version: 3,
    }),
    audit({
      id: "aud-3",
      docNo: "AUD-2610-001",
      factoryId: "f-3",
      auditType: "CUSTOMER",
      customerId: "c-mrn",
      plannedDate: "2026-10-26",
      actualDate: "2026-10-28",
      auditor: "Morning Runner 合规团队",
      result: "CONDITIONAL",
      score: 78,
      status: "RECTIFYING",
      note: "客户要求 30 天内提交整改证据",
      version: 3,
    }),
    audit({
      id: "aud-4",
      docNo: "AUD-2611-001",
      factoryId: "f-4",
      auditType: "QUALITY",
      customerId: "c-apx",
      plannedDate: "2026-11-13",
      actualDate: "2026-11-14",
      auditor: "SGS 杭州 · ISO 9001 监督审核",
      status: "IN_PROGRESS",
      note: "现场审核第 2 天",
      version: 2,
    }),
    audit({
      id: "aud-5",
      docNo: "AUD-2611-002",
      factoryId: "f-2",
      auditType: "SECURITY",
      customerId: "c-nsr",
      plannedDate: "2026-11-27",
      auditor: "ITS 上海 · C-TPAT",
      status: "PLANNED",
    }),
    audit({
      id: "aud-6",
      docNo: "AUD-2612-001",
      factoryId: "f-1",
      auditType: "CUSTOMER",
      customerId: "c-nsr",
      plannedDate: "2026-12-10",
      auditor: "北岸运动 QA 团队",
      status: "PLANNED",
      note: "FA27 量产前验厂",
    }),
  ];
}

function seedFindings(): FindingRow[] {
  return [
    {
      id: "fd-1",
      auditId: "aud-1",
      item: "宿舍消防演练记录缺少 8 月",
      severity: "LOW",
      correctiveAction: "补做演练并建立月度台账",
      responsible: "海防三厂 行政主管",
      dueDate: "2026-08-07",
      status: "CLOSED",
      closedAt: "2026-08-03T08:00:00.000Z",
      closeNote: "已上传整改照片与记录",
      version: 2,
    },
    {
      id: "fd-2",
      auditId: "aud-2",
      item: "成品仓消防通道堆放纸箱",
      severity: "LOW",
      correctiveAction: "划线定置，纸箱移至二号仓",
      responsible: "东城一厂 仓库主管",
      dueDate: "2026-09-26",
      status: "CLOSED",
      closedAt: "2026-09-24T08:00:00.000Z",
      closeNote: "已上传整改照片与记录",
      version: 2,
    },
    {
      id: "fd-3",
      auditId: "aud-3",
      item: "化学品仓 MSDS 不全（缺 6 种助剂）",
      severity: "HIGH",
      correctiveAction: "向供应商索取 MSDS 并张贴中英文版本",
      responsible: "南湖五厂 安全主管",
      dueDate: "2026-11-12",
      status: "OPEN",
      closedAt: null,
      closeNote: null,
      version: 1,
    },
    {
      id: "fd-4",
      auditId: "aud-3",
      item: "员工加班记录与工资单不一致",
      severity: "MEDIUM",
      correctiveAction: "核对 9–10 月考勤与工资，补发差额并留存签收",
      responsible: "南湖五厂 人事经理",
      dueDate: "2026-11-22",
      status: "OPEN",
      closedAt: null,
      closeNote: null,
      version: 1,
    },
    {
      id: "fd-5",
      auditId: "aud-3",
      item: "车间急救箱药品过期",
      severity: "LOW",
      correctiveAction: "更换药品并指定专人每月检查",
      responsible: "南湖五厂 车间主任",
      dueDate: "2026-11-03",
      status: "CLOSED",
      closedAt: "2026-11-01T08:00:00.000Z",
      closeNote: "已上传整改照片与记录",
      version: 2,
    },
  ];
}

let audits = seedAudits();
let findings = seedFindings();
let sequence = 2;

export function resetFactoryauditMocks() {
  audits = seedAudits();
  findings = seedFindings();
  sequence = 2;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function toFinding(f: FindingRow): FindingDto {
  const a = audits.find((x) => x.id === f.auditId)!;
  const overdue = f.status === "OPEN" && !!f.dueDate && f.dueDate < TODAY;
  return {
    ...f,
    auditDocNo: a.docNo,
    auditStatus: a.status,
    factoryId: a.factoryId,
    factoryName: FACTORIES[a.factoryId]?.name ?? "",
    customerName: CUSTOMERS[a.customerId] ?? "",
    overdue,
    overdueDays: overdue && f.dueDate ? daysBetween(f.dueDate, TODAY) : 0,
  };
}

function toAudit(a: AuditRow): FactoryAuditDto {
  const own = findings.filter((f) => f.auditId === a.id).map(toFinding);
  const open = own.filter((f) => f.status === "OPEN");
  const factory = FACTORIES[a.factoryId] ?? { code: "", name: "", baseName: "" };
  return {
    ...a,
    factoryCode: factory.code,
    factoryName: factory.name,
    baseName: factory.baseName,
    customerName: CUSTOMERS[a.customerId] ?? "",
    findingCount: own.length,
    openFindingCount: open.length,
    overdueFindingCount: open.filter((f) => f.overdue).length,
  };
}

const detail = (a: AuditRow) => ({
  ...toAudit(a),
  findings: findings.filter((f) => f.auditId === a.id).map(toFinding),
});
const notFound = () => fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
const conflict = () => fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
const illegal = (from: string, action: string) =>
  fail("FLOW_ILLEGAL_TRANSITION", `当前状态「${from}」不允许执行「${action}」`, 409, { from, action });

function listAudits(url: URL, defaults: AuditStatus[]) {
  const status = url.searchParams.get("status")?.split(",").filter(Boolean) ?? defaults;
  const type = url.searchParams.get("auditType");
  const factoryId = url.searchParams.get("factoryId");
  const rows = audits
    .filter((a) => status.includes(a.status))
    .filter((a) => !type || a.auditType === type)
    .filter((a) => !factoryId || a.factoryId === factoryId)
    .map(toAudit);
  return HttpResponse.json(envelope(pageOf(rows, url)));
}

function withoutVersion<T extends { version: number }>(body: T): Omit<T, "version"> {
  const { version, ...rest } = body;
  void version;
  return rest;
}

function update(id: string, patch: Partial<AuditRow>) {
  audits = audits.map((a) => (a.id === id ? { ...a, ...patch, version: a.version + 1 } : a));
  return audits.find((a) => a.id === id)!;
}

export const factoryauditHandlers = [
  http.get("*/factory-audits/plans", ({ request }) => listAudits(new URL(request.url), ["PLANNED", "IN_PROGRESS"])),
  http.get("*/factory-audits/records", ({ request }) => listAudits(new URL(request.url), ["RECTIFYING", "CLOSED"])),
  http.get("*/factory-audits/findings", ({ request }) => {
    const url = new URL(request.url);
    const p = url.searchParams;
    const rows = findings
      .map(toFinding)
      .filter((f) => !p.get("status") || f.status === p.get("status"))
      .filter((f) => !p.get("severity") || f.severity === p.get("severity"))
      .filter((f) => !p.get("auditId") || f.auditId === p.get("auditId"))
      .filter((f) => !p.get("factoryId") || f.factoryId === p.get("factoryId"))
      .filter((f) => (p.get("overdue") === "true" ? f.overdue : p.get("overdue") === "false" ? !f.overdue : true));
    return HttpResponse.json(envelope(pageOf(rows, url)));
  }),
  http.put("*/factory-audits/findings/:id", async ({ params, request }) => {
    const f = findings.find((x) => x.id === params.id);
    if (!f) return notFound();
    const body = (await request.json()) as Partial<FindingRow> & { version: number };
    if (body.version !== f.version) return conflict();
    if (f.status !== "OPEN") return fail("FACTORYAUDIT_FINDING_CLOSED", "整改项已关闭", 409);
    const patch = withoutVersion(body);
    findings = findings.map((x) => (x.id === f.id ? { ...x, ...patch, version: x.version + 1 } : x));
    return HttpResponse.json(envelope(toFinding(findings.find((x) => x.id === f.id)!)));
  }),
  http.post("*/factory-audits/findings/:id/close", async ({ params, request }) => {
    const f = findings.find((x) => x.id === params.id);
    if (!f) return notFound();
    const body = (await request.json()) as { version: number; closeNote?: string };
    if (body.version !== f.version) return conflict();
    if (f.status !== "OPEN") return fail("FACTORYAUDIT_FINDING_CLOSED", "整改项已关闭", 409);
    findings = findings.map((x) =>
      x.id === f.id
        ? {
            ...x,
            status: "CLOSED",
            closedAt: `${TODAY}T02:00:00.000Z`,
            closeNote: body.closeNote ?? null,
            version: x.version + 1,
          }
        : x,
    );
    return HttpResponse.json(envelope(toFinding(findings.find((x) => x.id === f.id)!)));
  }),
  http.get("*/factory-audits/:id", ({ params }) => {
    const a = audits.find((x) => x.id === params.id);
    return a ? HttpResponse.json(envelope(detail(a))) : notFound();
  }),
  http.post("*/factory-audits", async ({ request }) => {
    const body = (await request.json()) as Pick<
      AuditRow,
      "factoryId" | "auditType" | "plannedDate" | "auditor" | "note"
    > & {
      customerId?: string;
    };
    sequence += 1;
    const created = audit({
      id: `aud-new-${sequence}`,
      docNo: `AUD-2611-${String(sequence).padStart(3, "0")}`,
      factoryId: body.factoryId,
      auditType: body.auditType,
      plannedDate: body.plannedDate,
      auditor: body.auditor ?? null,
      note: body.note ?? null,
      customerId: body.customerId ?? "c-nsr",
      status: "PLANNED",
    });
    audits = [...audits, created];
    return HttpResponse.json(envelope(detail(created)), { status: 201 });
  }),
  http.put("*/factory-audits/:id", async ({ params, request }) => {
    const a = audits.find((x) => x.id === params.id);
    if (!a) return notFound();
    const body = (await request.json()) as Partial<AuditRow> & { version: number };
    if (body.version !== a.version) return conflict();
    if (a.status === "CLOSED") return illegal(a.status, "edit");
    return HttpResponse.json(envelope(detail(update(a.id, withoutVersion(body)))));
  }),
  http.post("*/factory-audits/:id/start", async ({ params, request }) => {
    const a = audits.find((x) => x.id === params.id);
    if (!a) return notFound();
    const body = (await request.json()) as { version: number; actualDate?: string };
    if (body.version !== a.version) return conflict();
    if (a.status !== "PLANNED") return illegal(a.status, "start");
    return HttpResponse.json(
      envelope(detail(update(a.id, { status: "IN_PROGRESS", actualDate: body.actualDate ?? TODAY }))),
    );
  }),
  http.post("*/factory-audits/:id/record", async ({ params, request }) => {
    const a = audits.find((x) => x.id === params.id);
    if (!a) return notFound();
    const body = (await request.json()) as Partial<AuditRow> & { version: number };
    if (body.version !== a.version) return conflict();
    if (a.status !== "IN_PROGRESS") return illegal(a.status, "record");
    const open = findings.filter((f) => f.auditId === a.id && f.status === "OPEN").length;
    return HttpResponse.json(
      envelope(detail(update(a.id, { ...withoutVersion(body), status: open ? "RECTIFYING" : "CLOSED" }))),
    );
  }),
  http.post("*/factory-audits/:id/close", async ({ params, request }) => {
    const a = audits.find((x) => x.id === params.id);
    if (!a) return notFound();
    const body = (await request.json()) as { version: number };
    if (body.version !== a.version) return conflict();
    if (a.status !== "RECTIFYING" && a.status !== "IN_PROGRESS") return illegal(a.status, "close");
    if (!a.result) return fail("FACTORYAUDIT_RESULT_REQUIRED", "请先登记审计结果", 422);
    const open = findings.filter((f) => f.auditId === a.id && f.status === "OPEN").length;
    if (open)
      return fail("FACTORYAUDIT_OPEN_FINDINGS", `还有 ${open} 项整改未关闭，不能关闭审计`, 409, { count: open });
    return HttpResponse.json(envelope(detail(update(a.id, { status: "CLOSED" }))));
  }),
  http.post("*/factory-audits/:id/findings", async ({ params, request }) => {
    const a = audits.find((x) => x.id === params.id);
    if (!a) return notFound();
    if (a.status !== "IN_PROGRESS" && a.status !== "RECTIFYING") return illegal(a.status, "addFinding");
    const body = (await request.json()) as Pick<
      FindingRow,
      "item" | "severity" | "correctiveAction" | "responsible" | "dueDate"
    >;
    const created: FindingRow = {
      id: `fd-new-${findings.length + 1}`,
      auditId: a.id,
      item: body.item,
      severity: body.severity,
      correctiveAction: body.correctiveAction ?? null,
      responsible: body.responsible ?? null,
      dueDate: body.dueDate ?? null,
      status: "OPEN",
      closedAt: null,
      closeNote: null,
      version: 1,
    };
    findings = [...findings, created];
    return HttpResponse.json(envelope(toFinding(created)), { status: 201 });
  }),
];
