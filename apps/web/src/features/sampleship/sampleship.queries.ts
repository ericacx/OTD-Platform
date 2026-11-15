import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { sampleshipKeys } from "./sampleship.keys";

import type { PageOf, RecipientDto, SampleShipmentDto } from "./sampleship.types";

type Params = Record<string, string | number | boolean | undefined>;

export function useShipmentsQuery(params: Params) {
  return useApiQuery<PageOf<SampleShipmentDto>>({
    queryKey: sampleshipKeys.list(params),
    queryFn: () => api.get<PageOf<SampleShipmentDto>>("/sample-shipments", params),
    placeholderData: keepPreviousData,
  });
}

export function useShipmentQuery(id: string | undefined) {
  return useApiQuery<SampleShipmentDto>({
    queryKey: sampleshipKeys.detail(id ?? "none"),
    queryFn: () => api.get<SampleShipmentDto>(`/sample-shipments/${id}`),
    enabled: Boolean(id),
  });
}

export function useRecipientsQuery(customerId?: string, enabled = true) {
  return useApiQuery<RecipientDto[]>({
    queryKey: sampleshipKeys.recipients(customerId),
    queryFn: () => api.get<RecipientDto[]>("/sample-shipments/recipients", customerId ? { customerId } : undefined),
    enabled,
  });
}
