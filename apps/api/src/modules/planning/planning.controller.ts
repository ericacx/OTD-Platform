import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  planningConfirmSchema,
  planningCreateSchema,
  planningErrors,
  planningImportFieldsSchema,
  planningListQuerySchema,
  planningUpdateSchema,
  planningVersionSchema,
} from "@otd/contracts/planning";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { Access, Permission, Req } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import type { AiDocument } from "../../core/ai/ai.types.js";
import { AppError, badRequest } from "../../core/errors.js";
import { MAX_FILE_BYTES } from "../../core/files/file.service.js";
import { zod } from "../../core/zod.pipe.js";
import { PlanningService } from "./planning.service.js";

@Controller("plannings")
export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  @Get()
  @Permission("planning.planning.view")
  list(@Access() ctx: AccessContext, @Query(zod(planningListQuerySchema)) q: z.infer<typeof planningListQuerySchema>) {
    return this.service.list(ctx, q, false);
  }

  @Get("archived")
  @Permission("planning.archive.view")
  archived(@Access() ctx: AccessContext, @Query(zod(planningListQuerySchema)) q: z.infer<typeof planningListQuerySchema>) {
    return this.service.list(ctx, q, true);
  }

  @Get(":id")
  @Permission("planning.planning.view", "planning.archive.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post("import")
  @Permission("planning.planning.create")
  async import(@Access() ctx: AccessContext, @Req() req: FastifyRequest) {
    if (!req.isMultipart()) throw badRequest("multipart/form-data required");
    const fields: Record<string, string> = {};
    let file: AiDocument | null = null;
    for await (const part of req.parts({ limits: { fileSize: MAX_FILE_BYTES } })) {
      if (part.type === "file") file = { filename: part.filename, contentType: part.mimetype, data: await part.toBuffer() };
      else if (typeof part.value === "string" && part.value.trim() !== "") fields[part.fieldname] = part.value;
    }
    if (!file) throw new AppError(planningErrors.PLANNING_FILE_REQUIRED);
    const input = zod(planningImportFieldsSchema).transform(fields);
    return this.service.importFile(ctx, input, file);
  }

  @Post()
  @Permission("planning.planning.create")
  create(@Access() ctx: AccessContext, @Body(zod(planningCreateSchema)) body: z.infer<typeof planningCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Put(":id")
  @Permission("planning.planning.edit")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(planningUpdateSchema)) body: z.infer<typeof planningUpdateSchema>) {
    return this.service.update(ctx, id, body);
  }

  @Post(":id/recognize")
  @HttpCode(200)
  @Permission("planning.planning.create", "planning.planning.edit")
  recognize(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(planningVersionSchema)) body: z.infer<typeof planningVersionSchema>) {
    return this.service.retryRecognition(ctx, id, body.version);
  }

  @Post(":id/manual")
  @HttpCode(200)
  @Permission("planning.planning.edit")
  manual(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(planningVersionSchema)) body: z.infer<typeof planningVersionSchema>) {
    return this.service.manualEntry(ctx, id, body.version);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @Permission("planning.planning.confirm")
  confirm(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(planningConfirmSchema)) body: z.infer<typeof planningConfirmSchema>) {
    return this.service.confirm(ctx, id, body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @Permission("planning.planning.archive")
  archive(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(planningVersionSchema)) body: z.infer<typeof planningVersionSchema>) {
    return this.service.archive(ctx, id, body.version);
  }
}
