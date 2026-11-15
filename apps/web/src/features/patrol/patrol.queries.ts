import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { patrolKeys, type PatrolHitParams, type PatrolRunParams } from "./patrol.keys";

import type { PatrolDashboardDto, PatrolRuleDto, PatrolRunDto } from "@otd/contracts/patrol";

export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };

export function usePatrolDashboardQuery(params: PatrolHitParams) {
  return useApiQuery<PatrolDashboardDto>({
    queryKey: patrolKeys.dashboard(params),
    queryFn: () => api.get<PatrolDashboardDto>("/patrol/dashboard", params),
    placeholderData: keepPreviousData,
  });
}

export function usePatrolRulesQuery() {
  return useApiQuery<PatrolRuleDto[]>({ queryKey: patrolKeys.rules(), queryFn: () => api.get<PatrolRuleDto[]>("/patrol/rules") });
}

export function usePatrolRunsQuery(params: PatrolRunParams) {
  return useApiQuery<PageOf<PatrolRunDto>>({
    queryKey: patrolKeys.runs(params),
    queryFn: () => api.get<PageOf<PatrolRunDto>>("/patrol/runs", params),
    placeholderData: keepPreviousData,
  });
}
