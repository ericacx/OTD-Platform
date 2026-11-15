import type { MetricUnit } from "@otd/contracts/metrics";

export function formatMetric(value: string | number | null | undefined, unit?: MetricUnit): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "wan" || unit === "days") return value.toFixed(1);
  return value.toLocaleString("en-US");
}
