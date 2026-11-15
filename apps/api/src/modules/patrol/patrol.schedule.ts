export type PatrolSchedule = { fullAt: string; intervalHours: number; workStart: string; workEnd: string };

export const DEFAULT_PATROL_SCHEDULE: PatrolSchedule = { fullAt: "00:50", intervalHours: 2, workStart: "08:00", workEnd: "20:00" };

export function normalizeSchedule(value: unknown): PatrolSchedule {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof PatrolSchedule, unknown>>;
  const time = (x: unknown, fallback: string) => (typeof x === "string" && /^\d{1,2}:\d{2}$/.test(x) ? x : fallback);
  const hours = typeof v.intervalHours === "number" && v.intervalHours > 0 ? v.intervalHours : DEFAULT_PATROL_SCHEDULE.intervalHours;
  return {
    fullAt: time(v.fullAt, DEFAULT_PATROL_SCHEDULE.fullAt),
    intervalHours: hours,
    workStart: time(v.workStart, DEFAULT_PATROL_SCHEDULE.workStart),
    workEnd: time(v.workEnd, DEFAULT_PATROL_SCHEDULE.workEnd),
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function atLocal(now: Date, hhmm: string): Date {
  const d = new Date(now);
  d.setHours(0, minutesOf(hhmm), 0, 0);
  return d;
}

export function dueAutoRun(schedule: PatrolSchedule, now: Date, lastAutoAt: Date | null): "FULL" | "INTERVAL" | null {
  const fullAt = atLocal(now, schedule.fullAt);
  if (now >= fullAt && (!lastAutoAt || lastAutoAt < fullAt)) return "FULL";
  const minute = now.getHours() * 60 + now.getMinutes();
  const inWork = minute >= minutesOf(schedule.workStart) && minute < minutesOf(schedule.workEnd);
  if (inWork && (!lastAutoAt || now.getTime() - lastAutoAt.getTime() >= schedule.intervalHours * 3_600_000)) return "INTERVAL";
  return null;
}
