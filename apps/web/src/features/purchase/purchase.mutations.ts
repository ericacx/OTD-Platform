import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { purchaseKeys } from "./purchase.keys";

import type { PurchaseCreateInput, PurchaseDetailDto, PurchaseReceiveInput } from "./purchase.types";

export function useCreatePurchaseMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<PurchaseDetailDto, PurchaseCreateInput>({
    mutationFn: (input) => api.post<PurchaseDetailDto>("/purchases", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all() });
    },
  });
}

export function useReceivePurchaseMutation(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<PurchaseDetailDto, PurchaseReceiveInput>({
    mutationFn: (input) => api.post<PurchaseDetailDto>(`/purchases/${id}/receive`, input),
    async onSuccess(detail) {
      queryClient.setQueryData(purchaseKeys.detail(id), detail);
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all() });
    },
  });
}

export function useCancelPurchaseMutation(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<PurchaseDetailDto, { version: number; reason?: string | null }>({
    mutationFn: (input) => api.post<PurchaseDetailDto>(`/purchases/${id}/cancel`, input),
    async onSuccess(detail) {
      queryClient.setQueryData(purchaseKeys.detail(id), detail);
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all() });
    },
  });
}
