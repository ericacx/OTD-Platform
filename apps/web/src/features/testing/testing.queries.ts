import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { testingKeys } from "./testing.keys";

import type { PageOf, ReuseCheckResultDto, TestReportDto, TestRequestDetailDto, TestRequestDto } from "./testing.types";

type Params = Record<string, string | number | undefined>;

export function useTestRequestsQuery(params: Params) {
  return useApiQuery<PageOf<TestRequestDto>>({
    queryKey: testingKeys.list(params),
    queryFn: () => api.get<PageOf<TestRequestDto>>("/tests", params),
    placeholderData: keepPreviousData,
  });
}

export function useTestRequestQuery(id: string | undefined) {
  return useApiQuery<TestRequestDetailDto>({
    queryKey: testingKeys.detail(id ?? "none"),
    queryFn: () => api.get<TestRequestDetailDto>(`/tests/${id}`),
    enabled: Boolean(id),
  });
}

export function useReportsQuery(params: Params) {
  return useApiQuery<PageOf<TestReportDto>>({
    queryKey: testingKeys.reports(params),
    queryFn: () => api.get<PageOf<TestReportDto>>("/tests/reports", params),
    placeholderData: keepPreviousData,
  });
}

export function useReuseCheckQuery(styleId: string | undefined, items: string[]) {
  return useApiQuery<ReuseCheckResultDto>({
    queryKey: testingKeys.reuse(styleId ?? "none", items),
    queryFn: () => api.post<ReuseCheckResultDto>("/tests/reuse-check", { styleId, items }),
    enabled: Boolean(styleId) && items.length > 0,
  });
}
