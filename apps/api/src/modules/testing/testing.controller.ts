import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  reportCreateSchema,
  reportListQuerySchema,
  reportUpdateSchema,
  reuseCheckSchema,
  testCompleteSchema,
  testReceiveSchema,
  testRequestCreateSchema,
  testRequestListQuerySchema,
  testRequestUpdateSchema,
  testRetestSchema,
  testSubmitSchema,
} from "@otd/contracts/testing";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { TestingService } from "./testing.service.js";

@Controller("tests")
export class TestingController {
  constructor(private readonly service: TestingService) {}

  @Get("reports")
  @Permission("testing.report.view")
  reports(@Access() ctx: AccessContext, @Query(zod(reportListQuerySchema)) q: z.infer<typeof reportListQuerySchema>) {
    return this.service.listReports(ctx, q);
  }

  @Post("reports")
  @Permission("testing.report.edit")
  createReport(@Access() ctx: AccessContext, @Body(zod(reportCreateSchema)) body: z.infer<typeof reportCreateSchema>) {
    return this.service.createReport(ctx, body);
  }

  @Get("reports/:id")
  @Permission("testing.report.view", "testing.request.view")
  report(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.getReport(ctx, id);
  }

  @Put("reports/:id")
  @Permission("testing.report.edit")
  updateReport(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(reportUpdateSchema)) body: z.infer<typeof reportUpdateSchema>) {
    return this.service.updateReport(ctx, id, body);
  }

  @Post("reuse-check")
  @HttpCode(200)
  @Permission("testing.request.view", "testing.request.create")
  reuseCheck(@Access() ctx: AccessContext, @Body(zod(reuseCheckSchema)) body: z.infer<typeof reuseCheckSchema>) {
    return this.service.reuseCheck(ctx, body);
  }

  @Get()
  @Permission("testing.request.view")
  list(@Access() ctx: AccessContext, @Query(zod(testRequestListQuerySchema)) q: z.infer<typeof testRequestListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get(":id")
  @Permission("testing.request.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("testing.request.create")
  create(@Access() ctx: AccessContext, @Body(zod(testRequestCreateSchema)) body: z.infer<typeof testRequestCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Put(":id")
  @Permission("testing.request.create", "testing.request.advance")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(testRequestUpdateSchema)) body: z.infer<typeof testRequestUpdateSchema>) {
    return this.service.update(ctx, id, body);
  }

  @Post(":id/submit")
  @HttpCode(200)
  @Permission("testing.request.create", "testing.request.advance")
  submit(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(testSubmitSchema)) body: z.infer<typeof testSubmitSchema>) {
    return this.service.submit(ctx, id, body);
  }

  @Post(":id/receive")
  @HttpCode(200)
  @Permission("testing.request.advance")
  receive(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(testReceiveSchema)) body: z.infer<typeof testReceiveSchema>) {
    return this.service.receive(ctx, id, body);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @Permission("testing.request.result")
  complete(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(testCompleteSchema)) body: z.infer<typeof testCompleteSchema>) {
    return this.service.complete(ctx, id, body);
  }

  @Post(":id/retest")
  @Permission("testing.request.create", "testing.request.advance")
  retest(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(testRetestSchema)) body: z.infer<typeof testRetestSchema>) {
    return this.service.retest(ctx, id, body.version);
  }
}
