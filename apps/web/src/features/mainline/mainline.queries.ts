import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { mainlineKeys } from "./mainline.keys";

import type { MainlineDto, MonitorDto, SearchResult } from "./mainline.types";

export function useMonitorQuery(poNo: string | undefined) {
  return useApiQuery<MonitorDto>({
    queryKey: mainlineKeys.monitor(poNo ?? ""),
    queryFn: () => api.get<MonitorDto>("/orders/monitor", { poNo }),
    enabled: Boolean(poNo),
    retry: false,
  });
}

export function useOrderMainlineQuery(orderId: string | undefined) {
  return useApiQuery<MainlineDto>({
    queryKey: mainlineKeys.order(orderId ?? "none"),
    queryFn: () => api.get<MainlineDto>(`/orders/${orderId}/mainline`),
    enabled: Boolean(orderId),
  });
}

export const SEARCH_MIN_LENGTH = 2;

export function useGlobalSearchQuery(q: string) {
  const term = q.trim();
  return useApiQuery<SearchResult[]>({
    queryKey: mainlineKeys.search(term),
    queryFn: () => api.get<SearchResult[]>("/search", { q: term, limit: 5 }),
    enabled: term.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
