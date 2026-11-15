import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { syncKeys } from "./sync.keys";

import type {
  SyncConnectionResult,
  SyncEndpointDto,
  SyncMappingDto,
  SyncMappingPreviewResult,
  SyncRetryResult,
  SyncTaskDetailDto,
  SyncTaskRetryResponse,
} from "./sync.types";
import type {
  syncEndpointCreateSchema,
  syncEndpointUpdateSchema,
  syncMappingCreateSchema,
  syncMappingPreviewSchema,
  syncMappingUpdateSchema,
  syncTaskCreateSchema,
  syncTaskUpdateSchema,
} from "@otd/contracts/sync";
import type { z } from "zod";

type EndpointCreate = z.input<typeof syncEndpointCreateSchema>;
type EndpointUpdate = z.input<typeof syncEndpointUpdateSchema>;
type MappingCreate = z.input<typeof syncMappingCreateSchema>;
type MappingUpdate = z.input<typeof syncMappingUpdateSchema>;
type TaskCreate = z.input<typeof syncTaskCreateSchema>;
type TaskUpdate = z.input<typeof syncTaskUpdateSchema>;
type MappingPreview = z.input<typeof syncMappingPreviewSchema>;

export function useSaveEndpointMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncEndpointDto, { id?: string; input: EndpointCreate | EndpointUpdate }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<SyncEndpointDto>(`/sync/endpoints/${id}`, input)
        : api.post<SyncEndpointDto>("/sync/endpoints", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}

export function useUpdateCredentialMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncEndpointDto, { id: string; credential: Record<string, string> | null; version: number }>({
    mutationFn: ({ id, credential, version }) =>
      api.put<SyncEndpointDto>(`/sync/endpoints/${id}/credential`, { credential, version }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: syncKeys.endpointsAll() });
    },
  });
}

export function useTestEndpointMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncConnectionResult, string>({
    mutationFn: (id) => api.post<SyncConnectionResult>(`/sync/endpoints/${id}/test`),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: syncKeys.endpointsAll() });
    },
  });
}

export function useToggleEndpointMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncEndpointDto, { id: string; enable: boolean; version: number }>({
    mutationFn: ({ id, enable, version }) =>
      api.post<SyncEndpointDto>(`/sync/endpoints/${id}/${enable ? "enable" : "disable"}`, { version }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}

export function useSaveMappingMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncMappingDto, { id?: string; input: MappingCreate | MappingUpdate }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<SyncMappingDto>(`/sync/mappings/${id}`, input) : api.post<SyncMappingDto>("/sync/mappings", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: syncKeys.mappingsAll() });
      await queryClient.invalidateQueries({ queryKey: syncKeys.tasksAll() });
    },
  });
}

export function usePreviewMappingMutation() {
  return useApiMutation<SyncMappingPreviewResult, MappingPreview>({
    mutationFn: (input) => api.post<SyncMappingPreviewResult>("/sync/mappings/preview", input),
  });
}

export function useSaveTaskMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncTaskDetailDto, { id?: string; input: TaskCreate | TaskUpdate }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<SyncTaskDetailDto>(`/sync/tasks/${id}`, input) : api.post<SyncTaskDetailDto>("/sync/tasks", input),
    async onSuccess(task) {
      queryClient.setQueryData(syncKeys.task(task.id), task);
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}

export function useToggleTaskMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncTaskDetailDto, { id: string; enable: boolean; version: number }>({
    mutationFn: ({ id, enable, version }) =>
      api.post<SyncTaskDetailDto>(`/sync/tasks/${id}/${enable ? "enable" : "disable"}`, { version }),
    async onSuccess(task) {
      queryClient.setQueryData(syncKeys.task(task.id), task);
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}

export function useRunTaskMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncTaskDetailDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.post<SyncTaskDetailDto>(`/sync/tasks/${id}/run`, { version }),
    async onSuccess(task) {
      queryClient.setQueryData(syncKeys.task(task.id), task);
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}

export function useRetryFailedMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncTaskRetryResponse, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.post<SyncTaskRetryResponse>(`/sync/tasks/${id}/retry-failed`, { version }),
    async onSuccess(res) {
      queryClient.setQueryData(syncKeys.task(res.task.id), res.task);
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}

export function useRetryRecordsMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SyncRetryResult, string[]>({
    mutationFn: (recordIds) => api.post<SyncRetryResult>("/sync/retry-queue/retry", { recordIds }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: syncKeys.all() });
    },
  });
}
