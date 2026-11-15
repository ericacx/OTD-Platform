import { keepPreviousData, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { flowKeys } from "./flow.keys";

import type {
  FlowCardDto,
  FlowDetailDto,
  FlowDiffDto,
  FlowVersionDto,
  MigrationPreviewDto,
  PageOf,
  RulePackDto,
  RulePackSnapshotDto,
  ServiceModuleDetailDto,
  ServiceModuleDto,
} from "./flow.types";

type Params = Record<string, string | number | undefined>;

export function useServiceModulesQuery(params: Params = { pageSize: 100 }) {
  return useApiQuery<PageOf<ServiceModuleDto>>({
    queryKey: flowKeys.modules(params),
    queryFn: () => api.get<PageOf<ServiceModuleDto>>("/flow/modules", params),
    placeholderData: keepPreviousData,
  });
}

export function useServiceModuleQuery(id: string | null) {
  return useApiQuery<ServiceModuleDetailDto>({
    queryKey: flowKeys.module(id ?? ""),
    queryFn: () => api.get<ServiceModuleDetailDto>(`/flow/modules/${id}`),
    enabled: Boolean(id),
  });
}

export function useFlowCardsQuery(params: Params) {
  return useApiQuery<PageOf<FlowCardDto>>({
    queryKey: flowKeys.customers(params),
    queryFn: () => api.get<PageOf<FlowCardDto>>("/flow/customers", params),
    placeholderData: keepPreviousData,
  });
}

export function useFlowDetailQuery(customerId: string) {
  return useApiQuery<FlowDetailDto>({
    queryKey: flowKeys.customer(customerId),
    queryFn: () => api.get<FlowDetailDto>(`/flow/customers/${customerId}`),
    enabled: Boolean(customerId),
  });
}

export function useFlowVersionsQuery(customerId: string, enabled: boolean) {
  return useApiQuery<FlowVersionDto[]>({
    queryKey: flowKeys.versions(customerId),
    queryFn: () => api.get<FlowVersionDto[]>(`/flow/customers/${customerId}/versions`),
    enabled: enabled && Boolean(customerId),
  });
}

export function useFlowDiffQuery(customerId: string, enabled: boolean, from = "current", to = "draft") {
  return useApiQuery<FlowDiffDto>({
    queryKey: flowKeys.diff(customerId, from, to),
    queryFn: () => api.get<FlowDiffDto>(`/flow/customers/${customerId}/diff`, { from, to }),
    enabled: enabled && Boolean(customerId),
  });
}

export function useMigrationPreviewQuery(customerId: string, enabled: boolean) {
  return useApiQuery<MigrationPreviewDto>({
    queryKey: flowKeys.migration(customerId),
    queryFn: () => api.get<MigrationPreviewDto>(`/flow/customers/${customerId}/migration`),
    enabled: enabled && Boolean(customerId),
    retry: false,
  });
}

export function useRulePacksQuery(params: Params) {
  return useApiQuery<PageOf<RulePackDto>>({
    queryKey: flowKeys.rulePacks(params),
    queryFn: () => api.get<PageOf<RulePackDto>>("/flow/rule-packs", params),
    placeholderData: keepPreviousData,
  });
}

export function useRulePackSnapshotsQuery(id: string | null) {
  return useApiQuery<RulePackSnapshotDto[]>({
    queryKey: flowKeys.rulePackSnapshots(id ?? ""),
    queryFn: () => api.get<RulePackSnapshotDto[]>(`/flow/rule-packs/${id}/snapshots`),
    enabled: Boolean(id),
  });
}

export function fetchServiceModule(queryClient: QueryClient, id: string) {
  return queryClient.fetchQuery({
    queryKey: flowKeys.module(id),
    queryFn: () => api.get<ServiceModuleDetailDto>(`/flow/modules/${id}`),
  });
}
