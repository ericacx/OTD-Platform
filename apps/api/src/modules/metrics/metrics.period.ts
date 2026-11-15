import type { PeriodDto, PeriodKey } from "@otd/contracts/metrics";

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export type Period = PeriodDto & { prev: { start: string; end: string; code: string } };

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function range(key: PeriodKey, year: number, month: number): { start: string; end: string; code: string; label: { zh: string; en: string } } {
  if (key === "month") return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay(year, month))}`, code: `${year}-${pad(month)}`, label: { zh: `${year} 年 ${month} 月`, en: `${year}-${pad(month)}` } };
  if (key === "quarter") {
    const q = Math.floor((month - 1) / 3) + 1;
    const first = (q - 1) * 3 + 1;
    return { start: `${year}-${pad(first)}-01`, end: `${year}-${pad(first + 2)}-${pad(lastDay(year, first + 2))}`, code: `${year}-Q${q}`, label: { zh: `${year} 年第 ${q} 季度`, en: `Q${q} ${year}` } };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, code: `${year}`, label: { zh: `${year} 年`, en: `${year}` } };
}

export function periodOf(key: PeriodKey, today: string): Period {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const cur = range(key, year, month);
  const prevAnchor = key === "month" ? (month === 1 ? [year - 1, 12] : [year, month - 1]) : key === "quarter" ? (month <= 3 ? [year - 1, 12] : [year, month - 3]) : [year - 1, month];
  const prev = range(key, prevAnchor[0]!, prevAnchor[1]!);
  return { key, ...cur, prev: { start: prev.start, end: prev.end, code: prev.code } };
}

export function inRange(date: string | null | undefined, start: string, end: string): boolean {
  return !!date && date >= start && date <= end;
}

export function dateOf(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endCode = end.slice(0, 7);
  for (;;) {
    const code = `${y}-${pad(m)}`;
    out.push(code);
    if (code >= endCode) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
