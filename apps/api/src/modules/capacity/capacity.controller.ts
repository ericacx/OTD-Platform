import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  baseMachineUpdateSchema,
  capacityCompareQuerySchema,
  capacityDetailQuerySchema,
  capacityErpBacklogSchema,
  capacityRowCreateSchema,
  capacityRowDeleteQuerySchema,
  capacityRowUpdateSchema,
  capacitySummaryQuerySchema,
  capacityVersionCreateSchema,
  capacityVersionedSchema,
  ledgerTaskCompleteSchema,
  ledgerTaskUpdateSchema,
} from "@otd/contracts/capacity";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { CapacityService } from "./capacity.service.js";
import { LedgerTaskService } from "./ledger-task.service.js";

@Controller("capacity")
export class CapacityController {
  constructor(
    private readonly service: CapacityService,
    private readonly tasks: LedgerTaskService,
  ) {}

  @Get("versions")
  @Permission("capacity.ledger.view")
  versions() {
    return this.service.listVersions();
  }

  @Get("versions/:id")
  @Permission("capacity.ledger.view")
  detail(@Param("id", ParseUUIDPipe) id: string, @Query(zod(capacityDetailQuerySchema)) q: z.infer<typeof capacityDetailQuerySchema>) {
    return this.service.detail(id, q);
  }

  @Get("compare")
  @Permission("capacity.ledger.view")
  compare(@Query(zod(capacityCompareQuerySchema)) q: z.infer<typeof capacityCompareQuerySchema>) {
    return this.service.compare(q.from, q.to);
  }

  @Get("summary")
  @Permission("capacity.ledger.view")
  summary(@Query(zod(capacitySummaryQuerySchema)) q: z.infer<typeof capacitySummaryQuerySchema>) {
    return this.service.summary(q.published === "true");
  }

  @Post("versions")
  @Permission("capacity.ledger.edit")
  createVersion(@Access() ctx: AccessContext, @Body(zod(capacityVersionCreateSchema)) body: z.infer<typeof capacityVersionCreateSchema>) {
    return this.service.createVersion(ctx, body);
  }

  @Post("versions/:id/publish")
  @HttpCode(200)
  @Permission("capacity.ledger.publish")
  publish(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(capacityVersionedSchema)) body: z.infer<typeof capacityVersionedSchema>) {
    return this.service.publish(ctx, id, body.version);
  }

  @Post("versions/:id/rows")
  @Permission("capacity.ledger.edit")
  addRow(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(capacityRowCreateSchema)) body: z.infer<typeof capacityRowCreateSchema>) {
    return this.service.addRow(ctx, id, body);
  }

  @Put("versions/:id/rows/:rowId")
  @Permission("capacity.ledger.edit")
  setErpBacklog(
    @Access() ctx: AccessContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(zod(capacityErpBacklogSchema)) body: z.infer<typeof capacityErpBacklogSchema>,
  ) {
    return this.service.setErpBacklog(ctx, id, rowId, body);
  }

  @Put("rows/:id")
  @Permission("capacity.ledger.edit")
  updateRow(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(capacityRowUpdateSchema)) body: z.infer<typeof capacityRowUpdateSchema>) {
    return this.service.updateRow(ctx, id, body);
  }

  @Delete("rows/:id")
  @Permission("capacity.ledger.edit")
  async deleteRow(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(capacityRowDeleteQuerySchema)) q: z.infer<typeof capacityRowDeleteQuerySchema>) {
    await this.service.deleteRow(ctx, id, q.version);
    return null;
  }

  @Get("machines")
  @Permission("capacity.ledger.view")
  machines() {
    return this.service.listMachines();
  }

  @Put("machines")
  @Permission("capacity.ledger.edit")
  updateMachines(@Access() ctx: AccessContext, @Body(zod(baseMachineUpdateSchema)) body: z.infer<typeof baseMachineUpdateSchema>) {
    return this.service.updateMachines(ctx, body);
  }

  @Get("tasks")
  @Permission("capacity.task.view", "capacity.ledger.view")
  listTasks() {
    return this.tasks.list();
  }

  @Post("tasks/:id/start")
  @HttpCode(200)
  @Permission("capacity.task.edit", "capacity.ledger.view")
  startTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(capacityVersionedSchema)) body: z.infer<typeof capacityVersionedSchema>) {
    return this.tasks.start(ctx, id, body.version);
  }

  @Post("tasks/:id/complete")
  @HttpCode(200)
  @Permission("capacity.task.edit", "capacity.ledger.view")
  completeTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(ledgerTaskCompleteSchema)) body: z.infer<typeof ledgerTaskCompleteSchema>) {
    return this.tasks.complete(ctx, id, body);
  }

  @Put("tasks/:id")
  @Permission("capacity.task.edit")
  updateTask(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(ledgerTaskUpdateSchema)) body: z.infer<typeof ledgerTaskUpdateSchema>) {
    return this.tasks.update(ctx, id, body);
  }
}
