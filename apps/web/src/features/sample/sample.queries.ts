import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { sampleKeys } from "./sample.keys";

import type { LibraryItemDto, MaterialDto, PageOf, SampleDetailDto, SampleSummaryDto } from "./sample.types";

type Params = Record<string, string | number | undefined>;

export function useSamplesQuery(params: Params) {
  return useApiQuery<PageOf<SampleSummaryDto>>({
    queryKey: sampleKeys.list(params),
    queryFn: () => api.get<PageOf<SampleSummaryDto>>("/samples", params),
    placeholderData: keepPreviousData,
  });
}

export function useSampleQuery(id: string | undefined) {
  return useApiQuery<SampleDetailDto>({
    queryKey: sampleKeys.detail(id ?? "none"),
    queryFn: () => api.get<SampleDetailDto>(`/samples/${id}`),
    enabled: Boolean(id),
  });
}

export function useLibraryQuery(params: Params) {
  return useApiQuery<PageOf<LibraryItemDto>>({
    queryKey: sampleKeys.library(params),
    queryFn: () => api.get<PageOf<LibraryItemDto>>("/samples/library", params),
    placeholderData: keepPreviousData,
  });
}

export function useMaterialsQuery(params: Params) {
  return useApiQuery<PageOf<MaterialDto>>({
    queryKey: sampleKeys.materials(params),
    queryFn: () => api.get<PageOf<MaterialDto>>("/samples/materials", params),
    placeholderData: keepPreviousData,
  });
}
