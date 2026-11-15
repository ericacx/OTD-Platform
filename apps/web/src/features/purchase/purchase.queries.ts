import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { purchaseKeys } from "./purchase.keys";

import type {
  OrderListItem,
  Page,
  PurchaseDetailDto,
  PurchaseDto,
  PurchaseMaterialDto,
  PurchaseReceiptDto,
  PurchaseRequirementDto,
} from "./purchase.types";

type Params = Record<string, string | number | undefined>;

export function usePurchasesQuery(params: Params) {
  return useApiQuery<Page<PurchaseDto>>({
    queryKey: purchaseKeys.list(params),
    queryFn: () => api.get<Page<PurchaseDto>>("/purchases", params),
    placeholderData: keepPreviousData,
  });
}

export function usePurchaseQuery(id: string | undefined) {
  return useApiQuery<PurchaseDetailDto>({
    queryKey: purchaseKeys.detail(id ?? "none"),
    queryFn: () => api.get<PurchaseDetailDto>(`/purchases/${id}`),
    enabled: Boolean(id),
  });
}

export function useReceiptsQuery(params: Params) {
  return useApiQuery<Page<PurchaseReceiptDto>>({
    queryKey: purchaseKeys.receipts(params),
    queryFn: () => api.get<Page<PurchaseReceiptDto>>("/purchases/receipts", params),
    placeholderData: keepPreviousData,
  });
}

export function useRequirementsQuery(orderId: string | null | undefined) {
  return useApiQuery<PurchaseRequirementDto>({
    queryKey: purchaseKeys.requirements(orderId ?? "none"),
    queryFn: () => api.get<PurchaseRequirementDto>("/purchases/requirements", { orderId: orderId ?? "" }),
    enabled: Boolean(orderId),
  });
}

export function useMaterialsQuery(enabled: boolean) {
  return useApiQuery<PurchaseMaterialDto[]>({
    queryKey: purchaseKeys.materials(),
    queryFn: () => api.get<PurchaseMaterialDto[]>("/purchases/materials"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function usePurchaseOrderOptionsQuery(enabled: boolean) {
  return useApiQuery<Page<OrderListItem>>({
    queryKey: purchaseKeys.orderOptions(),
    queryFn: () => api.get<Page<OrderListItem>>("/orders", { pageSize: 200 }),
    enabled,
    staleTime: 60_000,
  });
}
