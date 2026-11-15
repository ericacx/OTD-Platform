import { pickLabel } from "@otd/shared";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { masterdataKeys } from "./masterdata.keys";

import type { Lookups } from "@otd/contracts/masterdata";

export type { Lookups };

export function useLookups() {
  return useApiQuery<Lookups>({
    queryKey: masterdataKeys.lookups(),
    queryFn: () => api.get<Lookups>("/lookups"),
    staleTime: 5 * 60_000,
  });
}

export function dictionaryOptions(
  lookups: Lookups | undefined,
  type: string,
  locale: string,
): { value: string; label: string }[] {
  return (lookups?.dictionaries[type] ?? []).map((d) => ({ value: d.code, label: pickLabel(d.label, locale) }));
}

export function nameOf<T extends { id: string; name: string }>(
  list: T[] | undefined,
  id: string | null | undefined,
): string {
  if (!id) return "—";
  return list?.find((item) => item.id === id)?.name ?? "—";
}
