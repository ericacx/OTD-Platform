import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { receivableKeys } from "./receivable.keys";

import type { Page } from "@otd/contracts/common";
import type {
  CollectionSummaryDto,
  InvoiceDto,
  ReceivableDetailDto,
  ReceivableDto,
  ReceivableKpiDto,
} from "@otd/contracts/receivable";

type Params = Record<string, string | number | boolean | undefined>;

export function useReceivablesQuery(params: Params, enabled = true) {
  return useApiQuery<Page<ReceivableDto>>({
    queryKey: receivableKeys.list(params),
    queryFn: () => api.get<Page<ReceivableDto>>("/receivables", params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useReceivableKpisQuery(params: Params) {
  return useApiQuery<ReceivableKpiDto>({
    queryKey: receivableKeys.kpis(params),
    queryFn: () => api.get<ReceivableKpiDto>("/receivables/kpis", params),
    placeholderData: keepPreviousData,
  });
}

export function useReceivableQuery(id: string) {
  return useApiQuery<ReceivableDetailDto>({
    queryKey: receivableKeys.detail(id),
    queryFn: () => api.get<ReceivableDetailDto>(`/receivables/${id}`),
  });
}

export function useCollectionQuery(params: Params) {
  return useApiQuery<Page<ReceivableDto>>({
    queryKey: receivableKeys.collection(params),
    queryFn: () => api.get<Page<ReceivableDto>>("/receivables/collection", params),
    placeholderData: keepPreviousData,
  });
}

export function useCollectionSummaryQuery(customerId: string | undefined) {
  return useApiQuery<CollectionSummaryDto>({
    queryKey: receivableKeys.summary(customerId),
    queryFn: () => api.get<CollectionSummaryDto>("/receivables/collection/summary", { customerId }),
  });
}

export function useInvoicesQuery(params: Params) {
  return useApiQuery<Page<InvoiceDto>>({
    queryKey: receivableKeys.invoices(params),
    queryFn: () => api.get<Page<InvoiceDto>>("/receivables/invoices", params),
    placeholderData: keepPreviousData,
  });
}

export function fetchCollectionRows(params: Params): Promise<Page<ReceivableDto>> {
  return api.get<Page<ReceivableDto>>("/receivables/collection", { ...params, page: 1, pageSize: 200 });
}
