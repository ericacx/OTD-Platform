import type { Page } from "@otd/contracts/common";
import { type SQL, asc, desc, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export async function paginate<T>(query: { page: number; pageSize: number }, count: () => Promise<number>, list: (limit: number, offset: number) => Promise<T[]>): Promise<Page<T>> {
  const [total, items] = await Promise.all([count(), list(query.pageSize, (query.page - 1) * query.pageSize)]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export function orderBy(sort: string | undefined, columns: Record<string, PgColumn>, fallback: SQL[]): SQL[] {
  if (!sort) return fallback;
  const parts = sort
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const descending = s.startsWith("-");
      const col = columns[descending ? s.slice(1) : s];
      return col ? (descending ? desc(col) : asc(col)) : null;
    })
    .filter((x): x is SQL => x !== null);
  return parts.length ? parts : fallback;
}

export const countAll = sql<number>`cast(count(*) as int)`;

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function likeKeyword(keyword: string | undefined): string | null {
  const k = keyword?.trim();
  return k ? `%${k.replace(/[%_]/g, (c) => `\\${c}`)}%` : null;
}
