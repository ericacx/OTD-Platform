import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  syncCredentialUpdateSchema,
  syncEndpointCreateSchema,
  syncEndpointListQuerySchema,
  syncEndpointUpdateSchema,
  syncLogQuerySchema,
  syncMappingCreateSchema,
  syncMappingListQuerySchema,
  syncMappingPreviewSchema,
  syncMappingUpdateSchema,
  syncRetryQueueQuerySchema,
  syncRetryRecordsSchema,
  syncRunListQuerySchema,
  syncTaskCreateSchema,
  syncTaskListQuerySchema,
  syncTaskUpdateSchema,
  syncVersionSchema,
} from "@otd/contracts/sync";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { SyncEndpointService } from "./endpoint.service.js";
import { SyncMappingService } from "./mapping.service.js";
import { SyncTaskService } from "./task.service.js";

type Version = z.infer<typeof syncVersionSchema>;

@Controller("sync")
export class SyncController {
  constructor(
    private readonly endpoints: SyncEndpointService,
    private readonly mappings: SyncMappingService,
    private readonly tasks: SyncTaskService,
  ) {}

  @Get("endpoints")
  @Permission("sync.endpoint.view")
  listEndpoints(@Access() ctx: AccessContext, @Query(zod(syncEndpointListQuerySchema)) q: z.infer<typeof syncEndpointListQuerySchema>) {
    return this.endpoints.list(ctx, q);
  }

  @Get("endpoints/:id")
  @Permission("sync.endpoint.view")
  getEndpoint(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.endpoints.get(ctx, id);
  }

  @Post("endpoints")
  @Permission("sync.endpoint.edit")
  createEndpoint(@Access() ctx: AccessContext, @Body(zod(syncEndpointCreateSchema)) body: z.infer<typeof syncEndpointCreateSchema>) {
    return this.endpoints.create(ctx, body);
  }

  @Put("endpoints/:id")
  @Permission("sync.endpoint.edit")
  updateEndpoint(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncEndpointUpdateSchema)) body: z.infer<typeof syncEndpointUpdateSchema>) {
    return this.endpoints.update(ctx, id, body);
  }

  @Put("endpoints/:id/credential")
  @Permission("sync.endpoint.credential")
  updateCredential(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncCredentialUpdateSchema)) body: z.infer<typeof syncCredentialUpdateSchema>) {
    return this.endpoints.updateCredential(ctx, id, body);
  }

  @Post("endpoints/:id/test")
  @HttpCode(200)
  @Permission("sync.endpoint.edit")
  testEndpoint(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.endpoints.test(ctx, id);
  }

  @Post("endpoints/:id/enable")
  @HttpCode(200)
  @Permission("sync.endpoint.edit")
  enableEndpoint(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncVersionSchema)) body: Version) {
    return this.endpoints.setStatus(ctx, id, "ACTIVE", body.version);
  }

  @Post("endpoints/:id/disable")
  @HttpCode(200)
  @Permission("sync.endpoint.edit")
  disableEndpoint(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncVersionSchema)) body: Version) {
    return this.endpoints.setStatus(ctx, id, "DISABLED", body.version);
  }

  @Get("mappings")
  @Permission("sync.mapping.view")
  listMappings(@Access() ctx: AccessContext, @Query(zod(syncMappingListQuerySchema)) q: z.infer<typeof syncMappingListQuerySchema>) {
    return this.mappings.list(ctx, q);
  }

  @Post("mappings/preview")
  @HttpCode(200)
  @Permission("sync.mapping.view")
  previewMapping(@Access() ctx: AccessContext, @Body(zod(syncMappingPreviewSchema)) body: z.infer<typeof syncMappingPreviewSchema>) {
    return this.mappings.preview(ctx, body);
  }

  @Get("mappings/:id")
  @Permission("sync.mapping.view")
  getMapping(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.mappings.get(ctx, id);
  }

  @Post("mappings")
  @Permission("sync.mapping.edit")
  createMapping(@Access() ctx: AccessContext, @Body(zod(syncMappingCreateSchema)) body: z.infer<typeof syncMappingCreateSchema>) {
    return this.mappings.create(ctx, body);
  }

  @Put("mappings/:id")
  @Permission("sync.mapping.edit")
  updateMapping(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncMappingUpdateSchema)) body: z.infer<typeof syncMappingUpdateSchema>) {
    return this.mappings.update(ctx, id, body);
  }

  @Get("tasks")
  @Permission("sync.task.view")
  listTasks(@Access() ctx: AccessContext, @Query(zod(syncTaskListQuerySchema)) q: z.infer<typeof syncTaskListQuerySchema>) {
    return this.tasks.list(ctx, q);
  }

  @Get("tasks/:id")
  @Permission("sync.task.view")
  getTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.tasks.get(ctx, id);
  }

  @Post("tasks")
  @Permission("sync.task.edit")
  createTask(@Access() ctx: AccessContext, @Body(zod(syncTaskCreateSchema)) body: z.infer<typeof syncTaskCreateSchema>) {
    return this.tasks.create(ctx, body);
  }

  @Put("tasks/:id")
  @Permission("sync.task.edit")
  updateTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncTaskUpdateSchema)) body: z.infer<typeof syncTaskUpdateSchema>) {
    return this.tasks.update(ctx, id, body);
  }

  @Post("tasks/:id/enable")
  @HttpCode(200)
  @Permission("sync.task.edit")
  enableTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncVersionSchema)) body: Version) {
    return this.tasks.setEnabled(ctx, id, true, body.version);
  }

  @Post("tasks/:id/disable")
  @HttpCode(200)
  @Permission("sync.task.edit")
  disableTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncVersionSchema)) body: Version) {
    return this.tasks.setEnabled(ctx, id, false, body.version);
  }

  @Post("tasks/:id/run")
  @HttpCode(200)
  @Permission("sync.task.run")
  runTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncVersionSchema)) body: Version) {
    return this.tasks.run(ctx, id, body.version);
  }

  @Post("tasks/:id/retry-failed")
  @HttpCode(200)
  @Permission("sync.task.run", "sync.retry.run")
  retryFailed(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(syncVersionSchema)) body: Version) {
    return this.tasks.retryFailed(ctx, id, body.version);
  }

  @Get("tasks/:id/runs")
  @Permission("sync.task.view")
  listRuns(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(syncRunListQuerySchema)) q: z.infer<typeof syncRunListQuerySchema>) {
    return this.tasks.runs(ctx, id, q);
  }

  @Get("tasks/:id/logs")
  @Permission("sync.task.view")
  listLogs(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(syncLogQuerySchema)) q: z.infer<typeof syncLogQuerySchema>) {
    return this.tasks.logs(ctx, id, q);
  }

  @Get("runs/:id")
  @Permission("sync.task.view")
  getRun(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.tasks.runDetail(ctx, id);
  }

  @Get("retry-queue")
  @Permission("sync.retry.view")
  retryQueue(@Access() ctx: AccessContext, @Query(zod(syncRetryQueueQuerySchema)) q: z.infer<typeof syncRetryQueueQuerySchema>) {
    return this.tasks.retryQueue(ctx, q);
  }

  @Post("retry-queue/retry")
  @HttpCode(200)
  @Permission("sync.retry.run")
  retryRecords(@Access() ctx: AccessContext, @Body(zod(syncRetryRecordsSchema)) body: z.infer<typeof syncRetryRecordsSchema>) {
    return this.tasks.retryRecords(ctx, body.recordIds);
  }
}
