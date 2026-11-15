import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { capacityKeys } from "./capacity.keys";

import type {
  BaseMachineDto,
  CapacityCompareDto,
  CapacityVersionDetailDto,
  CapacityVersionDto,
  LedgerTaskDto,
} from "./capacity.types";

export function useCapacityVersionsQuery() {
  return useApiQuery<CapacityVersionDto[]>({
    queryKey: capacityKeys.versions(),
    queryFn: () => api.get<CapacityVersionDto[]>("/capacity/versions"),
  });
}

export function useCapacityDetailQuery(id: string | undefined, keyword: string) {
  return useApiQuery<CapacityVersionDetailDto>({
    queryKey: capacityKeys.detail(id ?? "none", keyword),
    queryFn: () => api.get<CapacityVersionDetailDto>(`/capacity/versions/${id}`, keyword ? { keyword } : {}),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useCapacityCompareQuery(from: string | undefined, to: string | undefined) {
  return useApiQuery<CapacityCompareDto>({
    queryKey: capacityKeys.compare(from ?? "none", to ?? "none"),
    queryFn: () => api.get<CapacityCompareDto>("/capacity/compare", { from: from ?? "", to: to ?? "" }),
    enabled: Boolean(from && to && from !== to),
  });
}

export function useLedgerTasksQuery() {
  return useApiQuery<LedgerTaskDto[]>({
    queryKey: capacityKeys.tasks(),
    queryFn: () => api.get<LedgerTaskDto[]>("/capacity/tasks"),
  });
}

export function useBaseMachinesQuery(enabled: boolean) {
  return useApiQuery<BaseMachineDto[]>({
    queryKey: capacityKeys.machines(),
    queryFn: () => api.get<BaseMachineDto[]>("/capacity/machines"),
    enabled,
  });
}
