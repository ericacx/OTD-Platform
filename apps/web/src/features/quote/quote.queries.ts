import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { quoteKeys } from "./quote.keys";

import type {
  PageOf,
  QuoteDto,
  QuoteListItemDto,
  QuotePreviewDto,
  QuotePreviewInput,
  QuoteStrategyDto,
  StyleOptionDto,
} from "./quote.types";

type Params = Record<string, string | number | boolean | undefined>;

export function useQuotesQuery(params: Params) {
  return useApiQuery<PageOf<QuoteListItemDto>>({
    queryKey: quoteKeys.list(params),
    queryFn: () => api.get<PageOf<QuoteListItemDto>>("/quotes", params),
    placeholderData: keepPreviousData,
  });
}

export function useQuoteQuery(id: string | undefined) {
  return useApiQuery<QuoteDto>({
    queryKey: quoteKeys.detail(id ?? "none"),
    queryFn: () => api.get<QuoteDto>(`/quotes/${id}`),
    enabled: Boolean(id),
  });
}

export function useStrategiesQuery(enabled = true) {
  return useApiQuery<QuoteStrategyDto[]>({
    queryKey: quoteKeys.strategies(),
    queryFn: () => api.get<QuoteStrategyDto[]>("/quote-strategies"),
    staleTime: 60_000,
    enabled,
  });
}

export function useStyleOptionsQuery(params: { keyword?: string; customerId?: string }, enabled = true) {
  const query: Params = {
    keyword: params.keyword || undefined,
    customerId: params.customerId || undefined,
    limit: 100,
  };
  return useApiQuery<StyleOptionDto[]>({
    queryKey: quoteKeys.styleOptions(query),
    queryFn: () => api.get<StyleOptionDto[]>("/quotes/style-options", query),
    staleTime: 30_000,
    enabled,
  });
}

export function useQuotePreviewQuery(input: QuotePreviewInput | null) {
  return useApiQuery<QuotePreviewDto>({
    queryKey: quoteKeys.preview(input),
    queryFn: () => api.post<QuotePreviewDto>("/quotes/preview", input),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
  });
}
