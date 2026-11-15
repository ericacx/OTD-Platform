import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { planningKeys } from "./planning.keys";

import type { PageOf, PlanningDto } from "./planning.types";
import type { StyleOptionDto } from "@otd/contracts/planning";

export function usePlanningsQuery(archived: boolean, params: Record<string, string | number | undefined>) {
  return useApiQuery<PageOf<PlanningDto>>({
    queryKey: planningKeys.list(archived, params),
    queryFn: () => api.get<PageOf<PlanningDto>>(archived ? "/plannings/archived" : "/plannings", params),
    placeholderData: keepPreviousData,
  });
}

export function usePlanningQuery(id: string | undefined) {
  return useApiQuery<PlanningDto>({
    queryKey: planningKeys.detail(id ?? "none"),
    queryFn: () => api.get<PlanningDto>(`/plannings/${id}`),
    enabled: Boolean(id),
  });
}

export function useStyleOptionsQuery(params: { keyword?: string | undefined; customerId?: string | undefined }) {
  return useApiQuery<StyleOptionDto[]>({
    queryKey: planningKeys.styles(params),
    queryFn: () => api.get<StyleOptionDto[]>("/styles", { ...params, limit: 200 }),
    staleTime: 60_000,
  });
}
