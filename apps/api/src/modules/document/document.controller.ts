import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  handoverChangeSchema,
  handoverCompleteSchema,
  handoverCreateSchema,
  handoverListQuerySchema,
  handoverTechPackSchema,
  kbDocumentUpsertSchema,
  kbListQuerySchema,
} from "@otd/contracts/document";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { HandoverService } from "./handover.service.js";
import { KbService } from "./kb.service.js";

@Controller("handovers")
export class HandoverController {
  constructor(private readonly service: HandoverService) {}

  @Get()
  @Permission("document.handover.view")
  list(@Access() ctx: AccessContext, @Query(zod(handoverListQuerySchema)) q: z.infer<typeof handoverListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get(":id")
  @Permission("document.handover.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("document.handover.edit")
  create(@Access() ctx: AccessContext, @Body(zod(handoverCreateSchema)) body: z.infer<typeof handoverCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post(":id/tech-pack")
  @HttpCode(200)
  @Permission("document.handover.edit")
  techPack(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(handoverTechPackSchema)) body: z.infer<typeof handoverTechPackSchema>) {
    return this.service.uploadTechPack(ctx, id, body);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @Permission("document.handover.complete")
  complete(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(handoverCompleteSchema)) body: z.infer<typeof handoverCompleteSchema>) {
    return this.service.complete(ctx, id, body.version);
  }

  @Post(":id/change")
  @HttpCode(200)
  @Permission("document.handover.change")
  change(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(handoverChangeSchema)) body: z.infer<typeof handoverChangeSchema>) {
    return this.service.change(ctx, id, body);
  }
}

@Controller("kb-documents")
export class KbController {
  constructor(private readonly service: KbService) {}

  @Get()
  @Permission("document.manual.view", "document.kb.view")
  list(@Access() ctx: AccessContext, @Query(zod(kbListQuerySchema)) q: z.infer<typeof kbListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get(":id")
  @Permission("document.manual.view", "document.kb.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("document.manual.edit", "document.kb.edit")
  create(@Access() ctx: AccessContext, @Body(zod(kbDocumentUpsertSchema)) body: z.infer<typeof kbDocumentUpsertSchema>) {
    return this.service.create(ctx, body);
  }

  @Put(":id")
  @Permission("document.manual.edit", "document.kb.edit")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(kbDocumentUpsertSchema)) body: z.infer<typeof kbDocumentUpsertSchema>) {
    return this.service.update(ctx, id, body);
  }
}
