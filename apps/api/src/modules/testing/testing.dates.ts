const DAY = 86_400_000;

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

export function addWorkdays(date: string, days: number): string {
  let d = new Date(`${date}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + DAY);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY);
}

export function serviceWorkdays(serviceLevel: string | null | undefined): number | null {
  if (!serviceLevel) return null;
  const m = /(\d+)\s*个?\s*工作日/.exec(serviceLevel) ?? /(\d+)\s*working\s*days?/i.exec(serviceLevel);
  return m ? Number(m[1]) : null;
}
