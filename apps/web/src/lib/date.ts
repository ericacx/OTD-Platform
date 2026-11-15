const DAY_MS = 86_400_000;

export type DueState =
  | { kind: "overdue"; days: number }
  | { kind: "today"; time: string }
  | { kind: "tomorrow" }
  | { kind: "remaining"; days: number };

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59`) : new Date(value);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function dueState(due: string | Date, now: Date = new Date()): DueState {
  const dueDate = toDate(due);
  const dayDiff = Math.round((startOfDay(dueDate) - startOfDay(now)) / DAY_MS);
  if (dueDate.getTime() < now.getTime() && dayDiff < 0) return { kind: "overdue", days: -dayDiff };
  if (dayDiff <= 0) {
    if (dueDate.getTime() < now.getTime()) return { kind: "overdue", days: 0 };
    return { kind: "today", time: `${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}` };
  }
  if (dayDiff === 1) return { kind: "tomorrow" };
  return { kind: "remaining", days: dayDiff };
}

export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((startOfDay(toDate(to)) - startOfDay(toDate(from))) / DAY_MS);
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date =
    value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

export function formatDuration(hours: number): { value: number; unit: "hour" | "day" } {
  if (hours < 24) return { value: Math.round(hours * 10) / 10, unit: "hour" };
  return { value: Math.round((hours / 24) * 10) / 10, unit: "day" };
}
