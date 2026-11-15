import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  inspectionCancelSchema,
  inspectionCreateSchema,
  inspectionListQuerySchema,
  inspectionRecordSchema,
  inspectionReleaseSchema,
  inspectionReworkSchema,
  inspectionScheduleQuerySchema,
  inspectionScheduleSchema,
} from "@otd/contracts/inspection";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { InspectionService } from "./inspection.service.js";

@Controller("inspections")
export class InspectionController {
  constructor(private readonly service: InspectionService) {}

  @Get()
  @Permission("inspection.inspection.view")
  list(@Access() ctx: AccessContext, @Query(zod(inspectionListQuerySchema)) q: z.infer<typeof inspectionListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get("kpis")
  @Permission("inspection.inspection.view")
  kpis(@Access() ctx: AccessContext) {
    return this.service.kpis(ctx);
  }

  @Get("schedule")
  @Permission("inspection.schedule.view", "inspection.inspection.view")
  scheduleView(@Access() ctx: AccessContext, @Query(zod(inspectionScheduleQuerySchema)) q: z.infer<typeof inspectionScheduleQuerySchema>) {
    return this.service.scheduleView(ctx, q);
  }

  @Get(":id")
  @Permission("inspection.inspection.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Get(":id/release-check")
  @Permission("inspection.inspection.view")
  releaseCheck(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.releaseCheck(ctx, id);
  }

  @Post()
  @Permission("inspection.inspection.create")
  create(@Access() ctx: AccessContext, @Body(zod(inspectionCreateSchema)) body: z.infer<typeof inspectionCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post(":id/schedule")
  @HttpCode(200)
  @Permission("inspection.schedule.edit")
  schedule(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(inspectionScheduleSchema)) body: z.infer<typeof inspectionScheduleSchema>) {
    return this.service.schedule(ctx, id, body);
  }

  @Post(":id/result")
  @HttpCode(200)
  @Permission("inspection.inspection.result")
  result(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(inspectionRecordSchema)) body: z.infer<typeof inspectionRecordSchema>) {
    return this.service.record(ctx, id, body);
  }

  @Post(":id/rework")
  @HttpCode(200)
  @Permission("inspection.inspection.rework")
  rework(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(inspectionReworkSchema)) body: z.infer<typeof inspectionReworkSchema>) {
    return this.service.rework(ctx, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Permission("inspection.inspection.cancel")
  cancel(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(inspectionCancelSchema)) body: z.infer<typeof inspectionCancelSchema>) {
    return this.service.cancel(ctx, id, body);
  }

  @Post(":id/release")
  @HttpCode(200)
  @Permission("inspection.inspection.release")
  release(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(inspectionReleaseSchema)) body: z.infer<typeof inspectionReleaseSchema>) {
    return this.service.release(ctx, id, body);
  }
}
