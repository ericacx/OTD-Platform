import { HANDOVER_ITEMS } from "@otd/contracts/document";
import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type { HandoverDto, KbDocumentDto } from "@otd/contracts/document";

const ts = "2026-10-21T01:00:00.000Z";

function checklist(missing: string[], na: string[] = []): HandoverDto["checklist"] {
  const refs: Record<string, string> = {
    sampleApproved: "SP-2610-012 第 2 轮 SMS",
    quoteAccepted: "QT-12593-04",
    testReportValid: "RPT-2610-017 / BV-26-10523",
    qrsRetained: "样品间 A-03-2",
    techPackUploaded: "12593 技术资料包.pdf",
  };
  return HANDOVER_ITEMS.map((item) => {
    const applicable = !na.includes(item.key);
    const ok = applicable && !missing.includes(item.key);
    return {
      key: item.key,
      label: item.label,
      applicable,
      ok,
      ref: ok ? (refs[item.key] ?? null) : null,
      refId: null,
      note: !applicable ? "不适用（客户流程未启用）" : ok ? null : item.missing.zh,
    };
  });
}

function handover(id: string, styleNo: string, styleName: string, missing: string[], na: string[] = []): HandoverDto {
  const list = checklist(missing, na);
  return {
    id,
    docNo: `DH-2610-00${id.slice(-1)}`,
    styleId: `s-${styleNo}`,
    styleNo,
    styleName,
    seasonCode: "FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
    ownerId: "u-sales",
    ownerName: "王芳",
    status: "COLLECTING",
    checklist: list,
    ready: list.every((c) => !c.applicable || c.ok),
    missing: list.filter((c) => c.applicable && !c.ok).map((c) => c.label.zh),
    okCount: list.filter((c) => c.applicable && c.ok).length,
    applicableCount: list.filter((c) => c.applicable).length,
    techPackFile: missing.includes("techPackUploaded")
      ? null
      : { id: "file-tp", filename: "12593 技术资料包.pdf", contentType: "application/pdf", size: 2_457_600 },
    frozenAt: null,
    completedBy: null,
    completedByName: null,
    snapshot: null,
    changeLog: [],
    collectingSince: "2026-10-16T01:00:00.000Z",
    collectingDays: 5,
    createdAt: ts,
    updatedAt: ts,
    version: 3,
  };
}

export const mockHandovers: HandoverDto[] = [
  handover("h-1", "12593", "散点花卉瑜伽防滑隐形袜", ["qrsRetained"]),
  handover("h-2", "12810", "罗纹中筒休闲袜", [], ["testReportValid"]),
];

export const mockKbDocuments: KbDocumentDto[] = [
  {
    id: "kb-1",
    kind: "KB",
    title: "报价护栏与例外审批制度",
    customerId: null,
    customerName: null,
    tags: ["报价", "护栏"],
    content: "护栏是报价的最低毛利率底线。",
    excerpt: "护栏是报价的最低毛利率底线。",
    file: null,
    createdAt: ts,
    updatedAt: ts,
    updatedByName: "陈静",
    version: 1,
  },
  {
    id: "kb-2",
    kind: "MANUAL",
    title: "北岸运动 包装手册 FA27",
    customerId: "c-nsr",
    customerName: "北岸运动",
    tags: ["包装"],
    content: "每箱 120 双，外箱贴 GS1-128 箱标。",
    excerpt: "每箱 120 双，外箱贴 GS1-128 箱标。",
    file: null,
    createdAt: ts,
    updatedAt: ts,
    updatedByName: "陈静",
    version: 1,
  },
];

function findHandover(id: unknown) {
  return mockHandovers.find((h) => h.id === id);
}

export const documentHandlers = [
  http.get("*/handovers", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    return HttpResponse.json(
      envelope(pageOf(status ? mockHandovers.filter((h) => h.status === status) : mockHandovers, url)),
    );
  }),
  http.post("*/handovers", () => HttpResponse.json(envelope(mockHandovers[1]))),
  http.get("*/handovers/:id", ({ params }) => {
    const h = findHandover(params.id);
    return h ? HttpResponse.json(envelope(h)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/handovers/:id/complete", async ({ params, request }) => {
    const h = findHandover(params.id);
    const body = (await request.json()) as { version: number };
    if (!h) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== h.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    if (!h.ready)
      return fail("FLOW_GATE_BLOCKED", `G1 条件未满足：${h.missing.join("、")}`, 409, {
        gate: "G1",
        missingKeys: h.missing,
      });
    return HttpResponse.json(
      envelope({ ...h, status: "HANDED_OVER", frozenAt: ts, completedByName: "李强", version: h.version + 1 }),
    );
  }),
  http.post("*/handovers/:id/change", ({ params }) => {
    const h = findHandover(params.id);
    return h
      ? HttpResponse.json(envelope({ ...h, version: h.version + 1 }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/handovers/:id/tech-pack", ({ params }) => {
    const h = findHandover(params.id);
    return h
      ? HttpResponse.json(envelope({ ...h, version: h.version + 1 }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.get("*/kb-documents", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    return HttpResponse.json(
      envelope(pageOf(kind ? mockKbDocuments.filter((d) => d.kind === kind) : mockKbDocuments, url)),
    );
  }),
  http.post("*/kb-documents", async ({ request }) => {
    const body = (await request.json()) as Partial<KbDocumentDto>;
    return HttpResponse.json(envelope({ ...mockKbDocuments[0]!, ...body, id: "kb-new", version: 1 }));
  }),
  http.put("*/kb-documents/:id", async ({ request, params }) => {
    const body = (await request.json()) as Partial<KbDocumentDto>;
    const doc = mockKbDocuments.find((d) => d.id === params.id) ?? mockKbDocuments[0]!;
    return HttpResponse.json(envelope({ ...doc, ...body, version: doc.version + 1 }));
  }),
];
