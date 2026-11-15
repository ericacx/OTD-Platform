import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { packagingKeys } from "./packaging.keys";

import type {
  CartonCoverageDto,
  CartonDto,
  OrderListItem,
  PackagingPlanDetailDto,
  PackagingPlanDto,
  PackagingVersionDiffDto,
  Page,
} from "./packaging.types";

type Params = Record<string, string | number | undefined>;

export function usePackagingPlansQuery(params: Params) {
  return useApiQuery<Page<PackagingPlanDto>>({
    queryKey: packagingKeys.plans(params),
    queryFn: () => api.get<Page<PackagingPlanDto>>("/packaging/plans", params),
    placeholderData: keepPreviousData,
  });
}

export function usePackagingPlanQuery(id: string | undefined) {
  return useApiQuery<PackagingPlanDetailDto>({
    queryKey: packagingKeys.plan(id ?? "none"),
    queryFn: () => api.get<PackagingPlanDetailDto>(`/packaging/plans/${id}`),
    enabled: Boolean(id),
  });
}

export function usePackagingCompareQuery(id: string, from: number, to: number) {
  return useApiQuery<PackagingVersionDiffDto>({
    queryKey: packagingKeys.compare(id, from, to),
    queryFn: () => api.get<PackagingVersionDiffDto>(`/packaging/plans/${id}/compare`, { from, to }),
    enabled: from > 0 && to > 0 && from !== to,
  });
}

export function useCartonsQuery(params: Params) {
  return useApiQuery<Page<CartonDto>>({
    queryKey: packagingKeys.cartons(params),
    queryFn: () => api.get<Page<CartonDto>>("/packaging/cartons", params),
    placeholderData: keepPreviousData,
  });
}

export function useCartonCoverageQuery(orderId: string | null | undefined) {
  return useApiQuery<CartonCoverageDto>({
    queryKey: packagingKeys.coverage(orderId ?? "none"),
    queryFn: () => api.get<CartonCoverageDto>("/packaging/cartons/coverage", { orderId: orderId ?? "" }),
    enabled: Boolean(orderId),
  });
}

export function usePackagingOrderOptionsQuery(enabled: boolean) {
  return useApiQuery<Page<OrderListItem>>({
    queryKey: packagingKeys.orderOptions(),
    queryFn: () => api.get<Page<OrderListItem>>("/orders", { pageSize: 200 }),
    enabled,
    staleTime: 60_000,
  });
}
