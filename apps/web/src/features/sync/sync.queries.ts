import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { syncKeys } from "./sync.keys";

import type {
  PageOf,
  SyncEndpointDto,
  SyncLogDto,
  SyncMappingDto,
  SyncRecordDto,
  SyncTaskDetailDto,
  SyncTaskDto,
} from "./sync.types";

type Params = Record<string, string | number | boolean | undefined>;

export function useSyncEndpointsQuery(params: Params) {
  return useApiQuery<PageOf<SyncEndpointDto>>({
    queryKey: syncKeys.endpoints(params),
    queryFn: () => api.get<PageOf<SyncEndpointDto>>("/sync/endpoints", params),
    placeholderData: keepPreviousData,
  });
}

export function useSyncMappingsQuery(params: Params, enabled = true) {
  return useApiQuery<PageOf<SyncMappingDto>>({
    queryKey: syncKeys.mappings(params),
    queryFn: () => api.get<PageOf<SyncMappingDto>>("/sync/mappings", params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSyncMappingQuery(id: string | null | undefined) {
  return useApiQuery<SyncMappingDto>({
    queryKey: syncKeys.mapping(id ?? "none"),
    queryFn: () => api.get<SyncMappingDto>(`/sync/mappings/${id}`),
    enabled: Boolean(id),
  });
}

export function useSyncTasksQuery(params: Params) {
  return useApiQuery<PageOf<SyncTaskDto>>({
    queryKey: syncKeys.tasks(params),
    queryFn: () => api.get<PageOf<SyncTaskDto>>("/sync/tasks", params),
    placeholderData: keepPreviousData,
  });
}

export function useSyncTaskQuery(id: string | undefined) {
  return useApiQuery<SyncTaskDetailDto>({
    queryKey: syncKeys.task(id ?? "none"),
    queryFn: () => api.get<SyncTaskDetailDto>(`/sync/tasks/${id}`),
    enabled: Boolean(id),
  });
}

export function useSyncTaskLogsQuery(id: string | undefined, params: Params = { pageSize: 50 }) {
  return useApiQuery<PageOf<SyncLogDto>>({
    queryKey: syncKeys.taskLogs(id ?? "none", params),
    queryFn: () => api.get<PageOf<SyncLogDto>>(`/sync/tasks/${id}/logs`, params),
    enabled: Boolean(id),
  });
}

export function useRetryQueueQuery(params: Params) {
  return useApiQuery<PageOf<SyncRecordDto>>({
    queryKey: syncKeys.retryQueue(params),
    queryFn: () => api.get<PageOf<SyncRecordDto>>("/sync/retry-queue", params),
    placeholderData: keepPreviousData,
  });
}
