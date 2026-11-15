import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  catalogDeleteQuerySchema,
  effectiveRulePackQuerySchema,
  flowCardQuerySchema,
  flowCopySchema,
  flowDiffQuerySchema,
  flowDraftUpdateSchema,
  flowMigrateSchema,
  flowPublishSchema,
  flowRollbackSchema,
  flowRuntimeQuerySchema,
  migrationQuerySchema,
  moduleAssignSchema,
  rulePackListQuerySchema,
  rulePackRollbackSchema,
  rulePackUpsertSchema,
  serviceItemUpsertSchema,
  serviceModuleListQuerySchema,
  serviceModuleUpsertSchema,
} from "@otd/contracts/flow";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { CatalogService } from "./catalog.service.js";
import { CustomerFlowService } from "./customer-flow.service.js";
import { RulePackService } from "./rule-pack.service.js";

@Controller("flow")
export class FlowController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly flows: CustomerFlowService,
    private readonly packs: RulePackService,
  ) {}

  @Get("modules")
  @Permission("flow.module.view", "flow.customer.view")
  listModules(@Query(zod(serviceModuleListQuerySchema)) q: z.infer<typeof serviceModuleListQuerySchema>) {
    return this.catalog.listModules(q);
  }

  @Get("modules/:id")
  @Permission("flow.module.view", "flow.customer.view")
  getModule(@Param("id", ParseUUIDPipe) id: string) {
    return this.catalog.getModule(id);
  }

  @Post("modules")
  @Permission("flow.module.edit")
  createModule(@Access() ctx: AccessContext, @Body(zod(serviceModuleUpsertSchema)) body: z.infer<typeof serviceModuleUpsertSchema>) {
    return this.catalog.createModule(ctx, body);
  }

  @Put("modules/:id")
  @Permission("flow.module.edit")
  updateModule(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(serviceModuleUpsertSchema)) body: z.infer<typeof serviceModuleUpsertSchema>) {
    return this.catalog.updateModule(ctx, id, body);
  }

  @Delete("modules/:id")
  @Permission("flow.module.edit")
  async removeModule(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(catalogDeleteQuerySchema)) q: z.infer<typeof catalogDeleteQuerySchema>) {
    await this.catalog.removeModule(ctx, id, q.version);
    return null;
  }

  @Post("modules/:id/items")
  @Permission("flow.module.edit")
  createItem(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(serviceItemUpsertSchema)) body: z.infer<typeof serviceItemUpsertSchema>) {
    return this.catalog.createItem(ctx, id, body);
  }

  @Post("modules/:id/assign")
  @HttpCode(200)
  @Permission("flow.customer.edit")
  assignModule(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(moduleAssignSchema)) body: z.infer<typeof moduleAssignSchema>) {
    return this.flows.assignModule(ctx, id, body.customerIds);
  }

  @Put("items/:id")
  @Permission("flow.module.edit")
  updateItem(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(serviceItemUpsertSchema)) body: z.infer<typeof serviceItemUpsertSchema>) {
    return this.catalog.updateItem(ctx, id, body);
  }

  @Delete("items/:id")
  @Permission("flow.module.edit")
  async removeItem(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(catalogDeleteQuerySchema)) q: z.infer<typeof catalogDeleteQuerySchema>) {
    await this.catalog.removeItem(ctx, id, q.version);
    return null;
  }

  @Get("customers")
  @Permission("flow.customer.view")
  listCustomers(@Access() ctx: AccessContext, @Query(zod(flowCardQuerySchema)) q: z.infer<typeof flowCardQuerySchema>) {
    return this.flows.listCards(ctx, q);
  }

  @Get("customers/:customerId")
  @Permission("flow.customer.view")
  detail(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string) {
    return this.flows.detail(ctx, customerId);
  }

  @Put("customers/:customerId/draft")
  @Permission("flow.customer.edit")
  updateDraft(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Body(zod(flowDraftUpdateSchema)) body: z.infer<typeof flowDraftUpdateSchema>) {
    return this.flows.updateDraft(ctx, customerId, body);
  }

  @Post("customers/:customerId/copy")
  @HttpCode(200)
  @Permission("flow.customer.edit")
  copy(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Body(zod(flowCopySchema)) body: z.infer<typeof flowCopySchema>) {
    return this.flows.copyFrom(ctx, customerId, body);
  }

  @Post("customers/:customerId/publish")
  @HttpCode(200)
  @Permission("flow.customer.publish")
  publish(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Body(zod(flowPublishSchema)) body: z.infer<typeof flowPublishSchema>) {
    return this.flows.publish(ctx, customerId, body);
  }

  @Post("customers/:customerId/rollback")
  @HttpCode(200)
  @Permission("flow.customer.publish")
  rollback(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Body(zod(flowRollbackSchema)) body: z.infer<typeof flowRollbackSchema>) {
    return this.flows.rollback(ctx, customerId, body);
  }

  @Get("customers/:customerId/versions")
  @Permission("flow.customer.view")
  versions(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string) {
    return this.flows.versions(ctx, customerId);
  }

  @Get("customers/:customerId/versions/:versionId")
  @Permission("flow.customer.view")
  version(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Param("versionId", ParseUUIDPipe) versionId: string) {
    return this.flows.version(ctx, customerId, versionId);
  }

  @Get("customers/:customerId/diff")
  @Permission("flow.customer.view")
  diff(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Query(zod(flowDiffQuerySchema)) q: z.infer<typeof flowDiffQuerySchema>) {
    return this.flows.diff(ctx, customerId, q);
  }

  @Get("customers/:customerId/runtime")
  @Permission("flow.customer.view", "order.order.view", "order.monitor.view")
  runtime(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Query(zod(flowRuntimeQuerySchema)) q: z.infer<typeof flowRuntimeQuerySchema>) {
    return this.flows.runtime(ctx, customerId, q.versionId);
  }

  @Get("customers/:customerId/migration")
  @Permission("flow.customer.publish")
  migration(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Query(zod(migrationQuerySchema)) q: z.infer<typeof migrationQuerySchema>) {
    return this.flows.migrationPreview(ctx, customerId, q.targetVersionId);
  }

  @Post("customers/:customerId/migrate")
  @HttpCode(200)
  @Permission("flow.customer.publish")
  migrate(@Access() ctx: AccessContext, @Param("customerId", ParseUUIDPipe) customerId: string, @Body(zod(flowMigrateSchema)) body: z.infer<typeof flowMigrateSchema>) {
    return this.flows.migrate(ctx, customerId, body);
  }

  @Get("rule-packs")
  @Permission("flow.rulepack.view")
  listPacks(@Access() ctx: AccessContext, @Query(zod(rulePackListQuerySchema)) q: z.infer<typeof rulePackListQuerySchema>) {
    return this.packs.list(ctx, q);
  }

  @Get("rule-packs/effective")
  @Permission("flow.rulepack.view", "flow.customer.view")
  effectivePacks(@Access() ctx: AccessContext, @Query(zod(effectiveRulePackQuerySchema)) q: z.infer<typeof effectiveRulePackQuerySchema>) {
    return this.packs.effective(ctx, q.customerId);
  }

  @Get("rule-packs/:id")
  @Permission("flow.rulepack.view")
  getPack(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.packs.get(ctx, id);
  }

  @Post("rule-packs")
  @Permission("flow.rulepack.edit")
  createPack(@Access() ctx: AccessContext, @Body(zod(rulePackUpsertSchema)) body: z.infer<typeof rulePackUpsertSchema>) {
    return this.packs.create(ctx, body);
  }

  @Put("rule-packs/:id")
  @Permission("flow.rulepack.edit")
  updatePack(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(rulePackUpsertSchema)) body: z.infer<typeof rulePackUpsertSchema>) {
    return this.packs.update(ctx, id, body);
  }

  @Delete("rule-packs/:id")
  @Permission("flow.rulepack.edit")
  async removePack(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(catalogDeleteQuerySchema)) q: z.infer<typeof catalogDeleteQuerySchema>) {
    await this.packs.remove(ctx, id, q.version);
    return null;
  }

  @Get("rule-packs/:id/snapshots")
  @Permission("flow.rulepack.view")
  packSnapshots(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.packs.snapshots(ctx, id);
  }

  @Post("rule-packs/:id/rollback")
  @HttpCode(200)
  @Permission("flow.rulepack.edit")
  rollbackPack(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(rulePackRollbackSchema)) body: z.infer<typeof rulePackRollbackSchema>) {
    return this.packs.rollback(ctx, id, body);
  }
}
