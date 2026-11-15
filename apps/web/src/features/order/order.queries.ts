import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { orderKeys } from "./order.keys";

import type { OrderDetail, OrderListItem, PageOf } from "./order.types";

export function useOrdersQuery(params: Record<string, string | number | boolean | undefined>) {
  return useApiQuery<PageOf<OrderListItem>>({
    queryKey: orderKeys.list(params),
    queryFn: () => api.get<PageOf<OrderListItem>>("/orders", params),
    placeholderData: keepPreviousData,
  });
}

export function useOrderQuery(id: string | undefined) {
  return useApiQuery<OrderDetail>({
    queryKey: orderKeys.detail(id ?? "none"),
    queryFn: () => api.get<OrderDetail>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}
