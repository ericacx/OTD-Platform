import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { type PatrolHitHandleInput, type PatrolHitQuery, type PatrolRuleUpdateInput, type PatrolRunQuery, patrolDocHitsQuerySchema, patrolHitHandleSchema, patrolHitQuerySchema, patrolRuleUpdateSchema, patrolRunQuerySchema } from "@otd/contracts/patrol";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { PatrolService } from "./patrol.service.js";

@Controller("patrol")
export class PatrolController {
  constructor(private readonly service: PatrolService) {}

  @Get("dashboard")
  @Permission("patrol.dashboard.view")
  dashboard(@Access() ctx: AccessContext, @Query(zod(patrolHitQuerySchema)) q: PatrolHitQuery) {
    return this.service.dashboard(ctx, q);
  }

  @Post("run")
  @HttpCode(200)
  @Permission("patrol.dashboard.run")
  run(@Access() ctx: AccessContext) {
    return this.service.runNow(ctx);
  }

  @Get("hits")
  @Permission("patrol.dashboard.view")
  hits(@Access() ctx: AccessContext, @Query(zod(patrolHitQuerySchema)) q: PatrolHitQuery) {
    return this.service.hits(ctx, q);
  }

  @Get("doc-hits")
  @Permission("patrol.dashboard.view")
  docHits(@Access() ctx: AccessContext, @Query(zod(patrolDocHitsQuerySchema)) q: z.infer<typeof patrolDocHitsQuerySchema>) {
    return this.service.docHits(ctx, q.docType, q.docId);
  }

  @Get("hits/:id")
  @Permission("patrol.dashboard.view")
  hit(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.hit(ctx, id);
  }

  @Post("hits/:id/handle")
  @HttpCode(200)
  @Permission("patrol.dashboard.view")
  handle(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(patrolHitHandleSchema)) body: PatrolHitHandleInput) {
    return this.service.handle(ctx, id, body);
  }

  @Get("rules")
  @Permission("patrol.rule.view")
  rules() {
    return this.service.rules();
  }

  @Put("rules/:id")
  @Permission("patrol.rule.edit")
  updateRule(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(patrolRuleUpdateSchema)) body: PatrolRuleUpdateInput) {
    return this.service.updateRule(ctx, id, body);
  }

  @Get("runs")
  @Permission("patrol.run.view")
  runs(@Query(zod(patrolRunQuerySchema)) q: PatrolRunQuery) {
    return this.service.runs(q);
  }

  @Get("runs/:id")
  @Permission("patrol.run.view")
  runDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.run(id);
  }
}
