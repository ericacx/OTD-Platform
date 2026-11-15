import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  auditCloseSchema,
  auditCreateSchema,
  auditListQuerySchema,
  auditRecordSchema,
  auditStartSchema,
  auditUpdateSchema,
  findingCloseSchema,
  findingCreateSchema,
  findingListQuerySchema,
  findingUpdateSchema,
} from "@otd/contracts/factoryaudit";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { FactoryAuditService } from "./factoryaudit.service.js";

type ListQuery = z.infer<typeof auditListQuerySchema>;

@Controller("factory-audits")
export class FactoryAuditController {
  constructor(private readonly service: FactoryAuditService) {}

  @Get("plans")
  @Permission("factoryaudit.plan.view")
  plans(@Access() ctx: AccessContext, @Query(zod(auditListQuerySchema)) q: ListQuery) {
    return this.service.listPlans(ctx, q);
  }

  @Get("records")
  @Permission("factoryaudit.record.view")
  records(@Access() ctx: AccessContext, @Query(zod(auditListQuerySchema)) q: ListQuery) {
    return this.service.listRecords(ctx, q);
  }

  @Get("findings")
  @Permission("factoryaudit.finding.view")
  findings(@Access() ctx: AccessContext, @Query(zod(findingListQuerySchema)) q: z.infer<typeof findingListQuerySchema>) {
    return this.service.listFindings(ctx, q);
  }

  @Put("findings/:id")
  @Permission("factoryaudit.finding.edit")
  updateFinding(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(findingUpdateSchema)) body: z.infer<typeof findingUpdateSchema>) {
    return this.service.updateFinding(ctx, id, body);
  }

  @Post("findings/:id/close")
  @HttpCode(200)
  @Permission("factoryaudit.finding.edit")
  closeFinding(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(findingCloseSchema)) body: z.infer<typeof findingCloseSchema>) {
    return this.service.closeFinding(ctx, id, body);
  }

  @Get(":id")
  @Permission("factoryaudit.plan.view", "factoryaudit.record.view", "factoryaudit.finding.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("factoryaudit.plan.edit")
  create(@Access() ctx: AccessContext, @Body(zod(auditCreateSchema)) body: z.infer<typeof auditCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Put(":id")
  @Permission("factoryaudit.plan.edit")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(auditUpdateSchema)) body: z.infer<typeof auditUpdateSchema>) {
    return this.service.update(ctx, id, body);
  }

  @Post(":id/start")
  @HttpCode(200)
  @Permission("factoryaudit.record.edit")
  start(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(auditStartSchema)) body: z.infer<typeof auditStartSchema>) {
    return this.service.start(ctx, id, body);
  }

  @Post(":id/record")
  @HttpCode(200)
  @Permission("factoryaudit.record.edit")
  record(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(auditRecordSchema)) body: z.infer<typeof auditRecordSchema>) {
    return this.service.record(ctx, id, body);
  }

  @Post(":id/close")
  @HttpCode(200)
  @Permission("factoryaudit.record.edit")
  close(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(auditCloseSchema)) body: z.infer<typeof auditCloseSchema>) {
    return this.service.close(ctx, id, body);
  }

  @Post(":id/findings")
  @Permission("factoryaudit.record.edit", "factoryaudit.finding.edit")
  addFinding(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(findingCreateSchema)) body: z.infer<typeof findingCreateSchema>) {
    return this.service.addFinding(ctx, id, body);
  }
}
