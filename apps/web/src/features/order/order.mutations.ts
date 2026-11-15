import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { mainlineKeys } from "../mainline/mainline.keys";
import { todoKeys } from "../todo/todo.keys";

import { orderKeys } from "./order.keys";

import type { OrderDetail, OrderStatus, ProductionProgressDto } from "./order.types";
import type { orderCreateSchema, orderReviseSchema, orderUpdateSchema } from "@otd/contracts/order";
import type { z } from "zod";

async function refresh(queryClient: QueryClient, detail?: OrderDetail) {
  if (detail) queryClient.setQueryData(orderKeys.detail(detail.id), detail);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: orderKeys.all() }),
    queryClient.invalidateQueries({ queryKey: mainlineKeys.all() }),
    queryClient.invalidateQueries({ queryKey: todoKeys.all() }),
  ]);
}

function useOrderAction<TVars extends { id: string }>(request: (vars: TVars) => Promise<OrderDetail>) {
  const queryClient = useQueryClient();
  return useApiMutation<OrderDetail, TVars>({
    mutationFn: request,
    async onSuccess(detail) {
      await refresh(queryClient, detail);
    },
  });
}

export function useUploadPoMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<OrderDetail, { fileId: string; customerId?: string | undefined }>({
    mutationFn: ({ fileId, customerId }) =>
      api.post<OrderDetail>("/orders/upload", { fileId, ...(customerId ? { customerId } : {}) }),
    async onSuccess(detail) {
      await refresh(queryClient, detail);
    },
  });
}

export function useConfirmOrderMutation() {
  return useOrderAction<{ id: string; version: number; overrideReason?: string | undefined }>(
    ({ id, version, overrideReason }) =>
      api.post<OrderDetail>(`/orders/${id}/confirm`, { version, ...(overrideReason ? { overrideReason } : {}) }),
  );
}

export function useAdvanceOrderMutation() {
  return useOrderAction<{ id: string; version: number; to?: OrderStatus; note?: string | undefined }>(
    ({ id, version, to, note }) =>
      api.post<OrderDetail>(`/orders/${id}/advance`, { version, ...(to ? { to } : {}), ...(note ? { note } : {}) }),
  );
}

export function useCancelOrderMutation() {
  return useOrderAction<{ id: string; version: number; reason: string }>(({ id, version, reason }) =>
    api.post<OrderDetail>(`/orders/${id}/cancel`, { version, reason }),
  );
}

export function useFactoryReplyMutation() {
  return useOrderAction<{ id: string; version: number; replyDate: string; note?: string | undefined }>(
    ({ id, version, replyDate, note }) =>
      api.post<OrderDetail>(`/orders/${id}/factory-replies`, { version, replyDate, ...(note ? { note } : {}) }),
  );
}

export function useCustomerConfirmMutation() {
  return useOrderAction<{ id: string; version: number; method: string; note?: string | undefined }>(
    ({ id, version, method, note }) =>
      api.post<OrderDetail>(`/orders/${id}/customer-confirm`, { version, method, ...(note ? { note } : {}) }),
  );
}

export function useRecheckOrderMutation() {
  return useOrderAction<{ id: string }>(({ id }) => api.post<OrderDetail>(`/orders/${id}/rule-check`));
}

export function useRecordProductionMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<
    ProductionProgressDto,
    { id: string; reportDate: string; knittedPairs: number; packedPairs: number; note?: string | undefined }
  >({
    mutationFn: ({ id, ...input }) => api.post<ProductionProgressDto>(`/orders/${id}/production`, input),
    async onSuccess(_data, vars) {
      await queryClient.invalidateQueries({ queryKey: orderKeys.detail(vars.id) });
      await refresh(queryClient);
    },
  });
}

export type OrderCreateInput = z.input<typeof orderCreateSchema>;
export type OrderUpdateInput = Omit<z.input<typeof orderUpdateSchema>, "version">;
export type OrderReviseInput = Omit<z.input<typeof orderReviseSchema>, "version">;

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<OrderDetail, OrderCreateInput>({
    mutationFn: (input) => api.post<OrderDetail>("/orders", input),
    async onSuccess(detail) {
      await refresh(queryClient, detail);
    },
  });
}

export function useUpdateOrderMutation() {
  return useOrderAction<{ id: string; version: number; input: OrderUpdateInput }>(({ id, version, input }) =>
    api.put<OrderDetail>(`/orders/${id}`, { ...input, version }),
  );
}

export function useReviseOrderMutation() {
  return useOrderAction<{ id: string; version: number; input: OrderReviseInput }>(({ id, version, input }) =>
    api.post<OrderDetail>(`/orders/${id}/revise`, { ...input, version }),
  );
}
