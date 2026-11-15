import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { inspectionKeys } from "./inspection.keys";

import type { Page } from "@otd/contracts/common";
import type {
  InspectionDetailDto,
  InspectionDto,
  InspectionKpiDto,
  InspectionScheduleViewDto,
  ReleaseCheckDto,
} from "@otd/contracts/inspection";
import type { OrderDetail, OrderListItem } from "@otd/contracts/order";

type Params = Record<string, string | number | boolean | undefined>;

export function useInspectionsQuery(params: Params) {
  return useApiQuery<Page<InspectionDto>>({
    queryKey: inspectionKeys.list(params),
    queryFn: () => api.get<Page<InspectionDto>>("/inspections", params),
    placeholderData: keepPreviousData,
  });
}

export function useInspectionKpisQuery() {
  return useApiQuery<InspectionKpiDto>({
    queryKey: inspectionKeys.kpis(),
    queryFn: () => api.get<InspectionKpiDto>("/inspections/kpis"),
  });
}

export function useInspectionQuery(id: string) {
  return useApiQuery<InspectionDetailDto>({
    queryKey: inspectionKeys.detail(id),
    queryFn: () => api.get<InspectionDetailDto>(`/inspections/${id}`),
  });
}

export function useReleaseCheckQuery(id: string) {
  return useApiQuery<ReleaseCheckDto>({
    queryKey: inspectionKeys.releaseCheck(id),
    queryFn: () => api.get<ReleaseCheckDto>(`/inspections/${id}/release-check`),
  });
}

export function useInspectionScheduleQuery(params: Params) {
  return useApiQuery<InspectionScheduleViewDto>({
    queryKey: inspectionKeys.schedule(params),
    queryFn: () => api.get<InspectionScheduleViewDto>("/inspections/schedule", params),
    placeholderData: keepPreviousData,
  });
}

export function useOrderOptionsQuery(keyword: string, enabled = true) {
  return useApiQuery<Page<OrderListItem>>({
    queryKey: inspectionKeys.orderOptions(keyword),
    queryFn: () => api.get<Page<OrderListItem>>("/orders", { keyword: keyword || undefined, pageSize: 20 }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOrderDetailQuery(id: string | null | undefined) {
  return useApiQuery<OrderDetail>({
    queryKey: inspectionKeys.orderDetail(id ?? "none"),
    queryFn: () => api.get<OrderDetail>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}
