import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { metricsKeys, type DiagnosisParams } from "./metrics.keys";

import type { BoardKey, DiagnosisDto } from "@otd/contracts/metrics";

export function useRefreshDiagnosisMutation(board: BoardKey) {
  const queryClient = useQueryClient();
  return useApiMutation<DiagnosisDto, DiagnosisParams>({
    mutationFn: (params) => api.post<DiagnosisDto>(`/metrics/boards/${board}/diagnosis/refresh`, undefined, { params }),
    async onSuccess(data, params) {
      queryClient.setQueryData(metricsKeys.diagnosis(board, params), data);
      await queryClient.invalidateQueries({ queryKey: metricsKeys.diagnosisAll(board) });
    },
  });
}
