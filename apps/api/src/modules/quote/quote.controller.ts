import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from "@nestjs/common";
import {
  quoteArchiveSchema,
  quoteAttachFileSchema,
  quoteCreateSchema,
  quoteExportFormSchema,
  quoteFeedbackSchema,
  quoteListQuerySchema,
  quotePreviewSchema,
  quoteRoundCreateSchema,
  quoteStrategyUpsertSchema,
  quoteUpdateSchema,
} from "@otd/contracts/quote";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { XLSX_TYPE } from "./quote.export.js";
import { QuoteService } from "./quote.service.js";

@Controller("quote-strategies")
export class QuoteStrategyController {
  constructor(private readonly service: QuoteService) {}

  @Get()
  @Permission("quote.strategy.view", "quote.quote.view")
  list() {
    return this.service.listStrategies();
  }

  @Post()
  @Permission("quote.strategy.edit")
  create(@Access() ctx: AccessContext, @Body(zod(quoteStrategyUpsertSchema)) body: z.infer<typeof quoteStrategyUpsertSchema>) {
    return this.service.createStrategy(ctx, body);
  }

  @Put(":id")
  @Permission("quote.strategy.edit")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(quoteStrategyUpsertSchema)) body: z.infer<typeof quoteStrategyUpsertSchema>) {
    return this.service.updateStrategy(ctx, id, body);
  }
}

@Controller("quotes")
export class QuoteController {
  constructor(private readonly service: QuoteService) {}

  @Get()
  @Permission("quote.quote.view")
  list(@Access() ctx: AccessContext, @Query(zod(quoteListQuerySchema)) q: z.infer<typeof quoteListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Post("preview")
  @HttpCode(200)
  @Permission("quote.quote.create", "quote.quote.submit")
  preview(@Access() ctx: AccessContext, @Body(zod(quotePreviewSchema)) body: z.infer<typeof quotePreviewSchema>) {
    return this.service.preview(ctx, body);
  }

  @Get(":id")
  @Permission("quote.quote.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Get(":id/export/:form")
  @Permission("quote.quote.view")
  async export(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Param("form", zod(quoteExportFormSchema)) form: z.infer<typeof quoteExportFormSchema>) {
    const file = await this.service.exportForm(ctx, id, form);
    return new StreamableFile(file.data, { type: XLSX_TYPE, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, length: file.data.length });
  }

  @Post()
  @Permission("quote.quote.create")
  create(@Access() ctx: AccessContext, @Body(zod(quoteCreateSchema)) body: z.infer<typeof quoteCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Put(":id")
  @Permission("quote.quote.create")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(quoteUpdateSchema)) body: z.infer<typeof quoteUpdateSchema>) {
    return this.service.update(ctx, id, body);
  }

  @Post(":id/rounds")
  @HttpCode(200)
  @Permission("quote.quote.submit")
  createRound(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(quoteRoundCreateSchema)) body: z.infer<typeof quoteRoundCreateSchema>) {
    return this.service.createRound(ctx, id, body);
  }

  @Post(":id/rounds/:roundId/feedback")
  @HttpCode(200)
  @Permission("quote.quote.feedback")
  feedback(
    @Access() ctx: AccessContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("roundId", ParseUUIDPipe) roundId: string,
    @Body(zod(quoteFeedbackSchema)) body: z.infer<typeof quoteFeedbackSchema>,
  ) {
    return this.service.feedback(ctx, id, roundId, body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @Permission("quote.quote.archive")
  archive(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(quoteArchiveSchema)) body: z.infer<typeof quoteArchiveSchema>) {
    return this.service.archive(ctx, id, body.version);
  }

  @Post(":id/files")
  @HttpCode(200)
  @Permission("quote.quote.create")
  attach(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(quoteAttachFileSchema)) body: z.infer<typeof quoteAttachFileSchema>) {
    return this.service.attachFile(ctx, id, body);
  }
}
