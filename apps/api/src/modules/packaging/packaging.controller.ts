import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  cartonAdjustSchema,
  cartonGenerateSchema,
  cartonListQuerySchema,
  packagingCompareQuerySchema,
  packagingConfirmSchema,
  packagingPlanCreateSchema,
  packagingPlanListQuerySchema,
  packagingPlanUpdateSchema,
  packagingReturnSchema,
  packagingVersionedSchema,
} from "@otd/contracts/packaging";
import { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { PackagingService } from "./packaging.service.js";

const coverageQuerySchema = z.object({ orderId: z.uuid() });

@Controller("packaging")
export class PackagingController {
  constructor(private readonly service: PackagingService) {}

  @Get("plans")
  @Permission("packaging.plan.view")
  listPlans(@Access() ctx: AccessContext, @Query(zod(packagingPlanListQuerySchema)) q: z.infer<typeof packagingPlanListQuerySchema>) {
    return this.service.listPlans(ctx, q);
  }

  @Get("plans/:id")
  @Permission("packaging.plan.view")
  getPlan(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.getPlan(ctx, id);
  }

  @Get("plans/:id/compare")
  @Permission("packaging.plan.view")
  compare(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(packagingCompareQuerySchema)) q: z.infer<typeof packagingCompareQuerySchema>) {
    return this.service.compareVersions(ctx, id, q.from, q.to);
  }

  @Post("plans")
  @Permission("packaging.plan.create")
  createPlan(@Access() ctx: AccessContext, @Body(zod(packagingPlanCreateSchema)) body: z.infer<typeof packagingPlanCreateSchema>) {
    return this.service.createPlan(ctx, body);
  }

  @Put("plans/:id")
  @Permission("packaging.plan.edit")
  updatePlan(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(packagingPlanUpdateSchema)) body: z.infer<typeof packagingPlanUpdateSchema>) {
    return this.service.updatePlan(ctx, id, body);
  }

  @Post("plans/:id/submit")
  @HttpCode(200)
  @Permission("packaging.plan.edit")
  submit(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(packagingVersionedSchema)) body: z.infer<typeof packagingVersionedSchema>) {
    return this.service.submitPlan(ctx, id, body.version);
  }

  @Post("plans/:id/return")
  @HttpCode(200)
  @Permission("packaging.plan.edit", "packaging.plan.confirm")
  returnPlan(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(packagingReturnSchema)) body: z.infer<typeof packagingReturnSchema>) {
    return this.service.returnPlan(ctx, id, body);
  }

  @Post("plans/:id/confirm")
  @HttpCode(200)
  @Permission("packaging.plan.confirm")
  confirm(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(packagingConfirmSchema)) body: z.infer<typeof packagingConfirmSchema>) {
    return this.service.confirmPlan(ctx, id, body);
  }

  @Get("cartons")
  @Permission("packaging.carton.view")
  listCartons(@Access() ctx: AccessContext, @Query(zod(cartonListQuerySchema)) q: z.infer<typeof cartonListQuerySchema>) {
    return this.service.listCartons(ctx, q);
  }

  @Get("cartons/coverage")
  @Permission("packaging.carton.view", "packaging.plan.view")
  coverage(@Access() ctx: AccessContext, @Query(zod(coverageQuerySchema)) q: z.infer<typeof coverageQuerySchema>) {
    return this.service.coverageFor(ctx, q.orderId);
  }

  @Get("cartons/:id")
  @Permission("packaging.carton.view")
  getCarton(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.getCarton(ctx, id);
  }

  @Post("cartons/generate")
  @Permission("packaging.carton.edit")
  generate(@Access() ctx: AccessContext, @Body(zod(cartonGenerateSchema)) body: z.infer<typeof cartonGenerateSchema>) {
    return this.service.generateCartons(ctx, body);
  }

  @Put("cartons/:id")
  @Permission("packaging.carton.edit")
  adjust(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(cartonAdjustSchema)) body: z.infer<typeof cartonAdjustSchema>) {
    return this.service.adjustCarton(ctx, id, body);
  }

  @Post("cartons/:id/start")
  @HttpCode(200)
  @Permission("packaging.carton.edit")
  start(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(packagingVersionedSchema)) body: z.infer<typeof packagingVersionedSchema>) {
    return this.service.startCarton(ctx, id, body.version);
  }

  @Post("cartons/:id/finish")
  @HttpCode(200)
  @Permission("packaging.carton.edit")
  finish(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(packagingVersionedSchema)) body: z.infer<typeof packagingVersionedSchema>) {
    return this.service.finishCarton(ctx, id, body.version);
  }
}
