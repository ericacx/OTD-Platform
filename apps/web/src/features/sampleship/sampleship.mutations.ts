import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { sampleshipKeys } from "./sampleship.keys";

import type { RecipientDto, SampleShipmentDto } from "./sampleship.types";

export type ShipmentCreateInput = {
  customerId: string;
  recipientId: string | null;
  method: "COURIER" | "FORWARDER";
  courier: string | null;
  items: { styleId: string; kind: string; quantity: number }[];
  note: string | null;
};

export type RecipientInput = {
  customerId: string;
  company: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  courier: string | null;
  isDefault: boolean;
  version?: number;
};

function useShipmentInvalidate() {
  const queryClient = useQueryClient();
  return async (shipment: SampleShipmentDto) => {
    queryClient.setQueryData(sampleshipKeys.detail(shipment.id), shipment);
    await queryClient.invalidateQueries({ queryKey: sampleshipKeys.lists() });
  };
}

export function useCreateShipmentMutation() {
  const invalidate = useShipmentInvalidate();
  return useApiMutation<SampleShipmentDto, ShipmentCreateInput>({
    mutationFn: (input) => api.post<SampleShipmentDto>("/sample-shipments", input),
    onSuccess: invalidate,
  });
}

export function useSendShipmentMutation() {
  const invalidate = useShipmentInvalidate();
  return useApiMutation<SampleShipmentDto, { id: string; trackingNo: string; courier?: string; version: number }>({
    mutationFn: ({ id, ...body }) => api.post<SampleShipmentDto>(`/sample-shipments/${id}/send`, body),
    onSuccess: invalidate,
  });
}

export function useSignShipmentMutation() {
  const invalidate = useShipmentInvalidate();
  return useApiMutation<SampleShipmentDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.post<SampleShipmentDto>(`/sample-shipments/${id}/sign`, { version }),
    onSuccess: invalidate,
  });
}

export function useSaveRecipientMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<RecipientDto, { id?: string; input: RecipientInput }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<RecipientDto>(`/sample-shipments/recipients/${id}`, input)
        : api.post<RecipientDto>("/sample-shipments/recipients", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: [...sampleshipKeys.all(), "recipients"] });
    },
  });
}
