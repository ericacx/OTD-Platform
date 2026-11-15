import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { capacityKeys } from "./capacity.keys";

import type {
  BaseMachineDto,
  CapacityRowCreateInput,
  CapacityRowDto,
  CapacityVersionDetailDto,
  LedgerTaskCompleteInput,
  LedgerTaskDto,
} from "./capacity.types";

function useInvalidateCapacity() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: capacityKeys.all() });
}

export function useCreateVersionMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<CapacityVersionDetailDto, { asOfDate?: string; note?: string | null }>({
    mutationFn: (input) => api.post<CapacityVersionDetailDto>("/capacity/versions", input),
    onSuccess: invalidate,
  });
}

export function usePublishVersionMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<CapacityVersionDetailDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) =>
      api.post<CapacityVersionDetailDto>(`/capacity/versions/${id}/publish`, { version }),
    onSuccess: invalidate,
  });
}

export type RowPatch = {
  leadDays?: number;
  machineCount?: number;
  process?: string | null;
  extra?: Record<string, unknown>;
};

export function useUpdateRowMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<CapacityRowDto, { id: string; version: number; patch: RowPatch }>({
    mutationFn: ({ id, version, patch }) => api.put<CapacityRowDto>(`/capacity/rows/${id}`, { version, ...patch }),
    onSuccess: invalidate,
  });
}

export function useSetBacklogMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<CapacityRowDto, { versionId: string; rowId: string; version: number; erpBacklog: number }>({
    mutationFn: ({ versionId, rowId, version, erpBacklog }) =>
      api.put<CapacityRowDto>(`/capacity/versions/${versionId}/rows/${rowId}`, { version, erpBacklog }),
    onSuccess: invalidate,
  });
}

export function useAddRowMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<CapacityRowDto, { versionId: string; input: CapacityRowCreateInput }>({
    mutationFn: ({ versionId, input }) => api.post<CapacityRowDto>(`/capacity/versions/${versionId}/rows`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRowMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<null, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.delete<null>(`/capacity/rows/${id}`, { params: { version } }),
    onSuccess: invalidate,
  });
}

export function useTaskActionMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<
    LedgerTaskDto,
    ({ id: string; kind: "start" } & { version: number }) | ({ id: string; kind: "complete" } & LedgerTaskCompleteInput)
  >({
    mutationFn: ({ id, kind, ...body }) => api.post<LedgerTaskDto>(`/capacity/tasks/${id}/${kind}`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateMachineMutation() {
  const invalidate = useInvalidateCapacity();
  return useApiMutation<
    BaseMachineDto,
    { baseId: string; needleTypeId: string; machineCount: number; version: number }
  >({
    mutationFn: (input) => api.put<BaseMachineDto>("/capacity/machines", input),
    onSuccess: invalidate,
  });
}
