import type { ReceivableDto } from "@otd/contracts/receivable";

const BOM = String.fromCharCode(0xfeff);

export type StatementLabels = {
  headers: [string, string, string, string, string, string, string, string, string, string, string, string];
  subtotal: string;
  type: (code: string) => string;
  status: (code: string) => string;
};

function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildStatementCsv(rows: ReceivableDto[], labels: StatementLabels): string {
  const groups = new Map<string, ReceivableDto[]>();
  for (const row of rows) {
    const key = `${row.customerName}|${row.settlementEntity ?? ""}|${row.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const lines = [labels.headers.map(cell).join(",")];
  for (const [key, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [customer, entity, currency] = key.split("|");
    for (const r of items) {
      lines.push(
        [
          customer,
          entity,
          r.docNo,
          labels.type(r.type),
          r.poNo ? `${r.poNo}${r.shipmentNo ? ` / ${r.shipmentNo}` : ""}` : (r.sourceNo ?? ""),
          r.currency,
          r.amount.toFixed(2),
          r.receivedAmount.toFixed(2),
          r.outstanding.toFixed(2),
          r.dueDate,
          r.overdueDays,
          labels.status(r.status),
        ]
          .map(cell)
          .join(","),
      );
    }
    const sum = (pick: (r: ReceivableDto) => number) => items.reduce((s, r) => s + pick(r), 0).toFixed(2);
    lines.push(
      [
        customer,
        entity,
        labels.subtotal,
        "",
        "",
        currency,
        sum((r) => r.amount),
        sum((r) => r.receivedAmount),
        sum((r) => r.outstanding),
        "",
        "",
        "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${BOM}${lines.join("\n")}\n`;
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
