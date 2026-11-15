import type { CostCategory, QuoteDto, QuoteExportForm, QuoteRoundDto } from "@otd/contracts/quote";
import { statusLabel } from "@otd/shared";
import ExcelJS from "exceljs";

const CATEGORY: Record<CostCategory, string> = { YARN: "纱线", LABOR: "工费", TRIMS: "辅料", OTHER: "其他" };
const FORM_NAME: Record<QuoteExportForm, string> = { summary: "报价记录汇总", "cost-detail": "成本明细表" };
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function header(ws: ExcelJS.Worksheet, title: string, quote: QuoteDto, width: number): void {
  ws.mergeCells(1, 1, 1, width);
  const cell = ws.getCell(1, 1);
  cell.value = `${title} · #${quote.styleNo} ${quote.styleName}`;
  cell.font = { bold: true, size: 14 };
  const info: [string, string][] = [
    ["客户", quote.customerName],
    ["季节", quote.seasonCode ?? "—"],
    ["品号", quote.productCode ?? "—"],
    ["承做工厂", quote.factoryName ?? "—"],
    ["起订量", quote.moq != null ? `${quote.moq} 双` : "—"],
    ["客户目标价", quote.targetPriceUsd != null ? `$${quote.targetPriceUsd.toFixed(2)}${quote.targetPriceCny != null ? ` ｜ ¥${quote.targetPriceCny.toFixed(2)}（锁汇 ${quote.targetFx}）` : ""}` : "—"],
    ["报价策略", quote.strategy ? `${quote.strategy.code} · ${quote.strategy.name}` : "—"],
  ];
  info.forEach(([k, v], i) => {
    ws.getCell(2 + i, 1).value = k;
    ws.getCell(2 + i, 1).font = { bold: true };
    ws.getCell(2 + i, 2).value = v;
  });
}

function tableHeader(ws: ExcelJS.Worksheet, rowNo: number, titles: string[]): void {
  const row = ws.getRow(rowNo);
  titles.forEach((t, i) => {
    const c = row.getCell(i + 1);
    c.value = t;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });
}

function summary(wb: ExcelJS.Workbook, quote: QuoteDto, canCost: boolean): void {
  const ws = wb.addWorksheet("报价记录汇总");
  const titles = ["类型", "轮次", "报价单号", "报价（元/双）", "报价（USD）", "报价数量", "策略", ...(canCost ? ["毛利率"] : []), "护栏校验", "对比目标价（USD）", "状态", "报价人", "日期", "备注"];
  header(ws, "报价记录汇总", quote, titles.length);
  const start = 11;
  tableHeader(ws, start, titles);
  const rounds: QuoteRoundDto[] = [...(canCost ? (quote.internalRounds ?? []) : []), ...quote.customerRounds];
  rounds.forEach((r, i) => {
    const values: (string | number | null)[] = [
      r.kind === "INTERNAL" ? "内部报价" : "客户报价",
      `第 ${r.seq} 轮${r.isLatest ? "（最新）" : ""}`,
      r.docNo,
      r.priceCny,
      r.priceUsd,
      r.quantity,
      r.strategyCode,
      ...(canCost ? [r.margin ?? null] : []),
      r.guardrailPassed ? "通过" : r.overrideReason ? `例外放行：${r.overrideReason}` : "未通过",
      r.diffToTargetUsd,
      statusLabel("quoteRound", r.status).zh,
      r.quotedByName,
      r.quotedAt ? r.quotedAt.slice(0, 10) : null,
      r.note,
    ];
    const row = ws.getRow(start + 1 + i);
    values.forEach((v, j) => {
      row.getCell(j + 1).value = v;
    });
    row.getCell(4).numFmt = "0.00";
    row.getCell(5).numFmt = "$0.00";
    row.getCell(6).numFmt = "#,##0";
    if (canCost) row.getCell(8).numFmt = "0.0%";
  });
  ws.getRow(start + rounds.length + 2).getCell(1).value = `共 ${quote.roundCounts.internal + quote.roundCounts.customer} 轮（内部 ${quote.roundCounts.internal} / 客户 ${quote.roundCounts.customer}）`;
  ws.columns.forEach((c, i) => {
    c.width = i === titles.length - 1 ? 36 : i === 0 ? 14 : 16;
  });
}

function costDetail(wb: ExcelJS.Workbook, quote: QuoteDto): void {
  const ws = wb.addWorksheet("成本明细表");
  const titles = ["类别", "品名", "规格", "用量", "单价", "金额（元/双）"];
  header(ws, "成本明细表", quote, titles.length);
  const start = 11;
  tableHeader(ws, start, titles);
  let rowNo = start + 1;
  for (const item of quote.costItems ?? []) {
    const row = ws.getRow(rowNo++);
    [CATEGORY[item.category], item.name, item.spec, item.quantity, item.unitPrice, item.amount].forEach((v, j) => {
      row.getCell(j + 1).value = v;
    });
    row.getCell(6).numFmt = "0.0000";
  }
  rowNo++;
  const b = quote.costBreakdown;
  const totals: [string, number | null | undefined][] = b
    ? [
        [`纱线（含损耗 ${Math.round(b.yarnLossRate * 100)}%）`, b.yarn],
        [`工费（制造费上浮 ${Math.round(b.overheadRate * 100)}%）`, b.labor],
        ["辅料", b.trims],
        ["其他", b.other],
        ["成本合计", quote.costTotal],
      ]
    : [["成本合计", quote.costTotal]];
  for (const [k, v] of totals) {
    const row = ws.getRow(rowNo++);
    row.getCell(5).value = k;
    row.getCell(5).font = { bold: true };
    row.getCell(6).value = v ?? null;
    row.getCell(6).numFmt = "0.00";
  }
  ws.columns.forEach((c, i) => {
    c.width = [10, 22, 22, 12, 12, 16][i] ?? 14;
  });
}

export async function buildQuoteWorkbook(form: QuoteExportForm, quote: QuoteDto, canCost: boolean): Promise<{ filename: string; data: Buffer }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OTD";
  if (form === "summary") summary(wb, quote, canCost);
  else costDetail(wb, quote);
  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { filename: `QT-${quote.styleNo} ${FORM_NAME[form]}.xlsx`, data };
}
