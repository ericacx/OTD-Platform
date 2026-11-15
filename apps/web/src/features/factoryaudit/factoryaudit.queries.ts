import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { factoryauditKeys } from "./factoryaudit.keys";

import type { FactoryAuditDetailDto, FactoryAuditDto, FindingDto, PageOf } from "./factoryaudit.types";

type Params = Record<string, string | number | undefined>;

export function useAuditPlansQuery(params: Params) {
  return useApiQuery<PageOf<FactoryAuditDto>>({
    queryKey: factoryauditKeys.plans(params),
    queryFn: () => api.get<PageOf<FactoryAuditDto>>("/factory-audits/plans", params),
    placeholderData: keepPreviousData,
  });
}

export function useAuditRecordsQuery(params: Params) {
  return useApiQuery<PageOf<FactoryAuditDto>>({
    queryKey: factoryauditKeys.records(params),
    queryFn: () => api.get<PageOf<FactoryAuditDto>>("/factory-audits/records", params),
    placeholderData: keepPreviousData,
  });
}

export function useFindingsQuery(params: Params) {
  return useApiQuery<PageOf<FindingDto>>({
    queryKey: factoryauditKeys.findings(params),
    queryFn: () => api.get<PageOf<FindingDto>>("/factory-audits/findings", params),
    placeholderData: keepPreviousData,
  });
}

export function useAuditDetailQuery(id: string | null) {
  return useApiQuery<FactoryAuditDetailDto>({
    queryKey: factoryauditKeys.detail(id ?? ""),
    queryFn: () => api.get<FactoryAuditDetailDto>(`/factory-audits/${id}`),
    enabled: Boolean(id),
  });
}
