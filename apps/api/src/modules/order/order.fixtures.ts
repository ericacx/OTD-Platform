import { customerOrders, factories, handoverPackages, quoteRounds, quotes, styles } from "@otd/db";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { TestApp } from "../../testing/test-app.js";

export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type StyleOptions = { customer?: string; owner?: string; org?: string; handedOver?: boolean; acceptedUsd?: number; season?: string };

export async function makeStyle(t: TestApp, styleNo: string, opts: StyleOptions = {}): Promise<string> {
  const owner = t.refs.users[opts.owner ?? "13800000001"]!;
  const orgId = t.refs.orgs[opts.org ?? "ORG003"]!;
  const customerId = t.refs.customers[opts.customer ?? "NSR"]!;
  const own = { ownerId: owner, orgId, customerId };
  const style = (await t.db.insert(styles).values({ styleNo, nameZh: `测试款 ${styleNo}`, seasonCode: opts.season ?? "AW26", ...own }).returning({ id: styles.id }))[0]!;
  if (opts.handedOver) await t.db.insert(handoverPackages).values({ docNo: `DH-T-${styleNo}`, styleId: style.id, status: "HANDED_OVER", checklist: {}, ...own });
  if (opts.acceptedUsd !== undefined) {
    const quote = (await t.db.insert(quotes).values({ styleId: style.id, status: "ACTIVE", ...own }).returning({ id: quotes.id }))[0]!;
    await t.db.insert(quoteRounds).values({ quoteId: quote.id, docNo: `QT-${styleNo}-01`, kind: "CUSTOMER", roundNo: 1, priceCny: opts.acceptedUsd * 7.1, priceUsd: opts.acceptedUsd, fx: 7.1, quantity: 10000, margin: 0.18, guardrailPassed: true, status: "ACCEPTED" });
  }
  return style.id;
}

export async function factoryIdOf(t: TestApp, code: string): Promise<string> {
  return (await t.db.select({ id: factories.id }).from(factories).where(eq(factories.code, code)))[0]!.id;
}

export async function insertOrder(t: TestApp, o: { poNo: string; status: string; due: string; pairs: number; customer?: string; owner?: string; org?: string; factoryReplyDate?: string | null; delayDays?: number | null }): Promise<string> {
  const row = (
    await t.db
      .insert(customerOrders)
      .values({ poNo: o.poNo, status: o.status, customerDueDate: o.due, totalPairs: o.pairs, factoryReplyDate: o.factoryReplyDate ?? null, delayDays: o.delayDays ?? null, ownerId: t.refs.users[o.owner ?? "13800000001"]!, orgId: t.refs.orgs[o.org ?? "ORG003"]!, customerId: t.refs.customers[o.customer ?? "NSR"]! })
      .returning({ id: customerOrders.id })
  )[0]!;
  return row.id;
}

export async function xlsxBuffer(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("PO");
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function pdfBuffer(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
}
