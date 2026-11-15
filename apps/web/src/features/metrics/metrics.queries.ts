import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { metricsKeys, type BoardParams, type DiagnosisParams } from "./metrics.keys";

import type { BoardDto, BoardKey, DiagnosisDto, MetricDefinitionDto } from "@otd/contracts/metrics";

export function useBoardQuery(board: BoardKey, params: BoardParams) {
  return useApiQuery<BoardDto>({
    queryKey: metricsKeys.board(board, params),
    queryFn: () => api.get<BoardDto>(`/metrics/boards/${board}`, params),
    placeholderData: keepPreviousData,
  });
}

export function useDiagnosisQuery(board: BoardKey, params: DiagnosisParams) {
  return useApiQuery<DiagnosisDto>({
    queryKey: metricsKeys.diagnosis(board, params),
    queryFn: () => api.get<DiagnosisDto>(`/metrics/boards/${board}/diagnosis`, params),
    staleTime: 5 * 60_000,
  });
}

export function useMetricDefinitionsQuery() {
  return useApiQuery<MetricDefinitionDto[]>({
    queryKey: metricsKeys.definitions(),
    queryFn: () => api.get<MetricDefinitionDto[]>("/metrics/definitions"),
    staleTime: 30 * 60_000,
  });
}
