export type {
  SyncBatchDto,
  SyncCodeMaps,
  SyncConnectionResult,
  SyncEndpointDto,
  SyncLogDto,
  SyncMappingDto,
  SyncMappingField,
  SyncMappingIssue,
  SyncMappingPreviewResult,
  SyncRecordDto,
  SyncRetryResult,
  SyncRunDto,
  SyncTaskDetailDto,
  SyncTaskDto,
  SyncTaskRetryResponse,
} from "@otd/contracts/sync";

export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };
