import { auditFindings, factoryAudits, todos } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

type FindingSeed = { item: string; severity: "HIGH" | "MEDIUM" | "LOW"; action: string; responsible: string; due: number; closed?: number };

type AuditSeed = {
  factory: string;
  type: "SOCIAL" | "QUALITY" | "CUSTOMER" | "SECURITY";
  customer: string;
  planned: number;
  actual?: number;
  auditor: string;
  result?: "PASS" | "CONDITIONAL" | "FAIL";
  score?: number;
  certUntil?: number;
  status: "PLANNED" | "IN_PROGRESS" | "RECTIFYING" | "CLOSED";
  note?: string;
  findings?: FindingSeed[];
};

const AUDITS: AuditSeed[] = [
  {
    factory: "HP3",
    type: "SOCIAL",
    customer: "SSH",
    planned: -120,
    actual: -118,
    auditor: "Qualspec · BSCI 年审",
    result: "PASS",
    score: 88,
    certUntil: 245,
    status: "CLOSED",
    findings: [{ item: "宿舍消防演练记录缺少 8 月", severity: "LOW", action: "补做演练并建立月度台账", responsible: "海防三厂 行政主管", due: -100, closed: -104 }],
  },
  {
    factory: "DC1",
    type: "SOCIAL",
    customer: "NSR",
    planned: -60,
    actual: -58,
    auditor: "BV 广州 · SMETA 4-Pillar",
    result: "PASS",
    score: 92,
    certUntil: 305,
    status: "CLOSED",
    findings: [{ item: "成品仓消防通道堆放纸箱", severity: "LOW", action: "划线定置，纸箱移至二号仓", responsible: "东城一厂 仓库主管", due: -50, closed: -52 }],
  },
  {
    factory: "NH5",
    type: "CUSTOMER",
    customer: "MRN",
    planned: -20,
    actual: -18,
    auditor: "Morning Runner 合规团队",
    result: "CONDITIONAL",
    score: 78,
    status: "RECTIFYING",
    note: "客户要求 30 天内提交整改证据",
    findings: [
      { item: "化学品仓 MSDS 不全（缺 6 种助剂）", severity: "HIGH", action: "向供应商索取 MSDS 并张贴中英文版本", responsible: "南湖五厂 安全主管", due: -3 },
      { item: "员工加班记录与工资单不一致", severity: "MEDIUM", action: "核对 9–10 月考勤与工资，补发差额并留存签收", responsible: "南湖五厂 人事经理", due: 7 },
      { item: "车间急救箱药品过期", severity: "LOW", action: "更换药品并指定专人每月检查", responsible: "南湖五厂 车间主任", due: -12, closed: -14 },
    ],
  },
  { factory: "HP3", type: "QUALITY", customer: "APX", planned: -2, actual: -1, auditor: "SGS 杭州 · ISO 9001 监督审核", status: "IN_PROGRESS", note: "现场审核第 2 天" },
  { factory: "DC2", type: "SECURITY", customer: "NSR", planned: 12, auditor: "ITS 上海 · C-TPAT", status: "PLANNED" },
  { factory: "DC1", type: "CUSTOMER", customer: "NSR", planned: 25, auditor: "北岸运动 QA 团队", status: "PLANNED", note: "FA27 量产前验厂" },
];

export async function seedFactoryauditDemo(ctx: SeedContext): Promise<void> {
  const quality = ctx.user("13800000007");
  const org = ctx.org("ORG008");
  for (const a of AUDITS) {
    const factoryId = ctx.factories[a.factory];
    if (!factoryId) continue;
    const docNo = await ctx.docNo("factoryAudit", ctx.at(a.planned));
    const audit = (
      await ctx.db
        .insert(factoryAudits)
        .values({
          docNo,
          factoryId,
          auditType: a.type,
          plannedDate: ctx.day(a.planned),
          actualDate: a.actual === undefined ? null : ctx.day(a.actual),
          auditor: a.auditor,
          result: a.result ?? null,
          score: a.score ?? null,
          certificateValidUntil: a.certUntil === undefined ? null : ctx.day(a.certUntil),
          status: a.status,
          note: a.note ?? null,
          ownerId: quality,
          orgId: org,
          customerId: ctx.customer(a.customer),
          createdBy: quality,
          createdAt: ctx.at(a.planned - 14),
        })
        .returning({ id: factoryAudits.id })
    )[0]!;
    for (const f of a.findings ?? []) {
      const finding = (
        await ctx.db
          .insert(auditFindings)
          .values({
            auditId: audit.id,
            item: f.item,
            severity: f.severity,
            correctiveAction: f.action,
            responsible: f.responsible,
            dueDate: ctx.day(f.due),
            status: f.closed === undefined ? "OPEN" : "CLOSED",
            closedAt: f.closed === undefined ? null : ctx.at(f.closed, 16),
            closeNote: f.closed === undefined ? null : "已上传整改照片与记录",
            createdBy: quality,
          })
          .returning({ id: auditFindings.id })
      )[0]!;
      if (f.closed === undefined && f.due < 0) {
        await ctx.db.insert(todos).values({
          source: "FLOW",
          action: "factoryaudit.finding.overdue",
          title: `整改项到期未关闭：${f.item}`,
          description: `${docNo} · ${f.responsible}`,
          docType: "factoryAudit",
          docId: audit.id,
          docNo,
          link: `/factory-audits/findings?auditId=${audit.id}`,
          customerId: ctx.customer(a.customer),
          assigneeId: quality,
          dueAt: ctx.at(f.due + 1, 0),
          fingerprint: `factoryaudit:finding:${finding.id}:${quality}`,
        });
      }
    }
  }
}
