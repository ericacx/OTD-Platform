import { and, eq, gte } from "drizzle-orm";
import { files, handoverPackages, kbDocuments, quoteRounds, quotes, sampleLibrary, sampleRounds, samples, styles, testReports } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

type HandoverSeed = { styleNo: string; status: "COLLECTING" | "HANDED_OVER"; since: number; frozen?: number; techPack?: string };

const HANDOVERS: HandoverSeed[] = [
  { styleNo: "11506", status: "HANDED_OVER", since: -96, frozen: -90, techPack: "11506 晨雾罗纹中筒袜 技术资料包.pdf" },
  { styleNo: "12593", status: "COLLECTING", since: -5, techPack: "12593 散点花卉瑜伽防滑隐形袜 技术资料包.pdf" },
  { styleNo: "11151", status: "COLLECTING", since: -10, techPack: "11151 美丽诺像素提花 工艺单.pdf" },
  { styleNo: "11152", status: "COLLECTING", since: -3 },
];

const KB: { kind: "MANUAL" | "KB"; title: string; customer: string | null; tags: string[]; content: string }[] = [
  {
    kind: "MANUAL",
    title: "北岸运动 包装手册 FA27",
    customer: "NSR",
    tags: ["包装", "箱唛", "FA27"],
    content:
      "一、内包装：每双袜子配卡头（90×60mm 300g 白卡）与透明挂钩，装入 0.04mm OPP 袋，袋口贴尺码贴。\n二、外箱：五层瓦楞纸箱，每箱 120 双，单箱毛重不超过 12 kg。箱唛正唛印客户 PO 号、款号、颜色、尺码配比与箱号，侧唛印毛重、净重与外箱尺寸。\n三、条码：每双印 UPC 条码，外箱贴 GS1-128 箱标。\n四、船样：大货装箱前寄 3 双船样至客户纽约办公室，船样确认后方可出货。",
  },
  {
    kind: "MANUAL",
    title: "晨跑者 测试要求",
    customer: "MRN",
    tags: ["测试", "色牢度", "成分"],
    content:
      "开发阶段：每个新款需提供成分检测、耐水洗色牢度（ISO 105-C06）、耐摩擦色牢度（ISO 105-X12）与 pH 值报告，机构限 BV 或 SGS。\n大货阶段：同结构、同工艺、同纱线配置的款可复用 12 个月内的报告，需在客户系统登记复用关系。\n不合格处理：任一项不合格须在 3 个工作日内提交整改方案并重新送测。",
  },
  {
    kind: "MANUAL",
    title: "蓝湾生活 验货标准",
    customer: "BBY",
    tags: ["验货", "AQL"],
    content: "抽样标准：AQL 1.5 Level II，严重缺陷零容忍。\n验货阶段：DPI 在生产完成 30% 时进行，FRI 在装箱完成 80% 以上时进行。\n放行条件：FRI 合格、测试报告在有效期内、包装方案已确认且装箱单齐套。",
  },
  {
    kind: "KB",
    title: "报价护栏与例外审批制度",
    customer: null,
    tags: ["报价", "护栏", "制度"],
    content:
      "1. 护栏是报价的最低毛利率底线，由报价策略设定（如 PS-002 为 12%）。\n2. 生成客户报价前系统即时校验：毛利率 =（客户报价 − 成本合计）÷ 客户报价。\n3. 低于护栏的报价不能直接发出，需业务经理在系统中填写例外理由后放行，理由与审批人记入报价轮次。\n4. 客户报价发出 14 天未反馈自动失效，业务员需在到期前跟进。",
  },
  {
    kind: "KB",
    title: "开发移交五项齐套操作指南",
    customer: null,
    tags: ["开发移交", "G1", "操作指南"],
    content:
      "开发移交（G1）要求五项齐套：① 样品已批准；② 报价已被客户接受；③ 测试报告在有效期内且合格；④ QRS 品质参考样已在样品库留存；⑤ 技术资料包（工艺单、纱线配置、尺寸表）已上传。\n五项齐全后由业务经理或技术员点击「确认移交」，系统冻结开发资料并生成移交快照。\n移交后如需修改，提交「开发变更」并写明原因，资料包回到齐套中，修改完成后重新移交。",
  },
  {
    kind: "KB",
    title: "常见问题：测试报告能否复用",
    customer: null,
    tags: ["测试", "FAQ"],
    content: "问：新款能否直接用老款的测试报告？\n答：结构、工艺、纱线配置三者都相同，且报告在有效期内时可以复用，复用关系需在测试管理里登记；客户另有规定的以客户手册为准。\n问：报告即将过期怎么办？\n答：系统在到期前 30 天提醒，品质员安排重新送测或续期。",
  },
];

export async function seedDocumentDemo(ctx: SeedContext): Promise<void> {
  for (const h of HANDOVERS) {
    const styleId = ctx.styles[h.styleNo];
    if (!styleId) continue;
    const style = (await ctx.db.select().from(styles).where(eq(styles.id, styleId)))[0]!;
    const docNo = await ctx.docNo("handover", ctx.at(h.since));
    let techPackFileId: string | null = null;
    if (h.techPack) {
      techPackFileId = (
        await ctx.db
          .insert(files)
          .values({ storageKey: `demo/handover/${h.styleNo}.pdf`, filename: h.techPack, contentType: "application/pdf", size: 2_457_600, sha256: `demo-handover-${h.styleNo}`, ownerType: "handover", uploadedBy: style.ownerId })
          .returning({ id: files.id })
      )[0]!.id;
    }
    const frozen = h.status === "HANDED_OVER" && h.frozen !== undefined ? ctx.at(h.frozen, 16) : null;
    let snapshot: Record<string, unknown> | null = null;
    let checklist: Record<string, { ok: boolean; applicable?: boolean; ref?: string; refId?: string; note?: string }> = {};
    let qrsLibraryId: string | null = null;
    if (frozen) {
      const approved = await ctx.db
        .select({ id: sampleRounds.id, roundNo: sampleRounds.roundNo, roundType: sampleRounds.roundType, docNo: samples.docNo })
        .from(sampleRounds)
        .innerJoin(samples, eq(samples.id, sampleRounds.sampleId))
        .where(and(eq(samples.styleId, styleId), eq(sampleRounds.status, "APPROVED")));
      const accepted = await ctx.db
        .select({ id: quoteRounds.id, docNo: quoteRounds.docNo })
        .from(quoteRounds)
        .innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId))
        .where(and(eq(quotes.styleId, styleId), eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "ACCEPTED")));
      const reports = await ctx.db.select().from(testReports).where(and(eq(testReports.styleId, styleId), eq(testReports.result, "PASS"), gte(testReports.validUntil, ctx.day(h.frozen!))));
      const qrs = await ctx.db.select().from(sampleLibrary).where(and(eq(sampleLibrary.styleId, styleId), eq(sampleLibrary.kind, "QRS")));
      const sample = approved.sort((a, b) => b.roundNo - a.roundNo)[0];
      const quote = accepted[0];
      const report = reports[0];
      qrsLibraryId = qrs[0]?.id ?? null;
      const sampleRef = sample ? `${sample.docNo} 第 ${sample.roundNo} 轮 ${sample.roundType}` : "SMS 第 2 轮 已批准";
      const reportRef = report ? `${report.docNo} / ${report.agencyReportNo}` : "BV-26-08817 色牢度 · 成分";
      checklist = {
        sampleApproved: { ok: true, applicable: true, ref: sampleRef, ...(sample ? { refId: sample.id } : {}) },
        quoteAccepted: { ok: true, applicable: true, ref: quote?.docNo ?? `QT-${h.styleNo}-03`, ...(quote ? { refId: quote.id } : {}) },
        testReportValid: { ok: true, applicable: true, ref: reportRef, ...(report ? { refId: report.id, note: `有效期至 ${report.validUntil}` } : {}) },
        qrsRetained: { ok: true, applicable: true, ref: qrs[0]?.location ?? "样品间 A-03-2", ...(qrs[0] ? { refId: qrs[0].id } : {}) },
        techPackUploaded: { ok: true, applicable: true, ref: h.techPack ?? "", ...(techPackFileId ? { refId: techPackFileId } : {}) },
      };
      snapshot = {
        styleId,
        styleNo: h.styleNo,
        sampleRoundIds: approved.map((a) => a.id),
        sampleRef,
        quoteRoundId: quote?.id ?? null,
        quoteDocNo: quote?.docNo ?? null,
        reportIds: reports.map((r) => r.id),
        reportRef,
        qrsLibraryId,
        techPackFileId,
        conditions: ["sampleApproved", "quoteAccepted", "testReportValid", "qrsRetained", "techPackUploaded"],
        checkedAt: frozen.toISOString(),
      };
    }
    const created = (
      await ctx.db
        .insert(handoverPackages)
        .values({
          docNo,
          styleId,
          status: h.status,
          checklist,
          techPackFileId,
          qrsLibraryId,
          frozenAt: frozen,
          completedBy: frozen ? ctx.user("13800000002") : null,
          snapshot,
          collectingSince: ctx.at(h.since),
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: style.ownerId,
          createdAt: ctx.at(h.since),
        })
        .returning({ id: handoverPackages.id })
    )[0]!;
    if (techPackFileId) await ctx.db.update(files).set({ ownerId: created.id }).where(eq(files.id, techPackFileId));
  }

  const editor = ctx.user("13800000006");
  for (const [i, k] of KB.entries()) {
    await ctx.db.insert(kbDocuments).values({
      kind: k.kind,
      title: k.title,
      customerId: k.customer ? ctx.customer(k.customer) : null,
      content: k.content,
      tags: k.tags,
      createdBy: editor,
      updatedBy: editor,
      createdAt: ctx.at(-30 + i * 3),
      updatedAt: ctx.at(-30 + i * 3),
    });
  }
}
