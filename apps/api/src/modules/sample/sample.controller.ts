import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  libraryLendSchema,
  libraryListQuerySchema,
  libraryReturnSchema,
  libraryUpsertSchema,
  materialArriveSchema,
  materialListQuerySchema,
  materialUpsertSchema,
  roundAdvanceSchema,
  roundApproveSchema,
  roundCreateSchema,
  sampleCreateSchema,
  sampleListQuerySchema,
  sampleUpdateSchema,
} from "@otd/contracts/sample";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { SampleService } from "./sample.service.js";

@Controller("samples")
export class SampleController {
  constructor(private readonly service: SampleService) {}

  @Get("library")
  @Permission("sample.library.view")
  library(@Access() ctx: AccessContext, @Query(zod(libraryListQuerySchema)) q: z.infer<typeof libraryListQuerySchema>) {
    return this.service.listLibrary(ctx, q);
  }

  @Post("library")
  @Permission("sample.library.edit")
  createLibrary(@Access() ctx: AccessContext, @Body(zod(libraryUpsertSchema)) body: z.infer<typeof libraryUpsertSchema>) {
    return this.service.upsertLibrary(ctx, null, body);
  }

  @Put("library/:id")
  @Permission("sample.library.edit")
  updateLibrary(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(libraryUpsertSchema)) body: z.infer<typeof libraryUpsertSchema>) {
    return this.service.upsertLibrary(ctx, id, body);
  }

  @Post("library/:id/lend")
  @HttpCode(200)
  @Permission("sample.library.edit")
  lend(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(libraryLendSchema)) body: z.infer<typeof libraryLendSchema>) {
    return this.service.lendLibrary(ctx, id, body);
  }

  @Post("library/:id/return")
  @HttpCode(200)
  @Permission("sample.library.edit")
  giveBack(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(libraryReturnSchema)) body: z.infer<typeof libraryReturnSchema>) {
    return this.service.returnLibrary(ctx, id, body);
  }

  @Get("materials")
  @Permission("sample.material.view")
  materials(@Access() ctx: AccessContext, @Query(zod(materialListQuerySchema)) q: z.infer<typeof materialListQuerySchema>) {
    return this.service.listMaterials(ctx, q);
  }

  @Post("materials")
  @Permission("sample.material.edit")
  createMaterial(@Access() ctx: AccessContext, @Body(zod(materialUpsertSchema)) body: z.infer<typeof materialUpsertSchema>) {
    return this.service.upsertMaterial(ctx, null, body);
  }

  @Put("materials/:id")
  @Permission("sample.material.edit")
  updateMaterial(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(materialUpsertSchema)) body: z.infer<typeof materialUpsertSchema>) {
    return this.service.upsertMaterial(ctx, id, body);
  }

  @Post("materials/:id/arrive")
  @HttpCode(200)
  @Permission("sample.material.edit")
  arrive(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(materialArriveSchema)) body: z.infer<typeof materialArriveSchema>) {
    return this.service.arriveMaterial(ctx, id, body);
  }

  @Post("rounds/:roundId/advance")
  @HttpCode(200)
  @Permission("sample.sample.advance", "sample.sample.approve")
  advance(@Access() ctx: AccessContext, @Param("roundId", ParseUUIDPipe) roundId: string, @Body(zod(roundAdvanceSchema)) body: z.infer<typeof roundAdvanceSchema>) {
    return this.service.advance(ctx, roundId, body);
  }

  @Post("rounds/:roundId/approve")
  @HttpCode(200)
  @Permission("sample.sample.approve")
  approve(@Access() ctx: AccessContext, @Param("roundId", ParseUUIDPipe) roundId: string, @Body(zod(roundApproveSchema)) body: z.infer<typeof roundApproveSchema>) {
    return this.service.approve(ctx, roundId, body);
  }

  @Get()
  @Permission("sample.sample.view")
  list(@Access() ctx: AccessContext, @Query(zod(sampleListQuerySchema)) q: z.infer<typeof sampleListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get(":id")
  @Permission("sample.sample.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("sample.sample.create")
  create(@Access() ctx: AccessContext, @Body(zod(sampleCreateSchema)) body: z.infer<typeof sampleCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Put(":id")
  @Permission("sample.sample.create", "sample.sample.advance")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(sampleUpdateSchema)) body: z.infer<typeof sampleUpdateSchema>) {
    return this.service.update(ctx, id, body);
  }

  @Post(":id/rounds")
  @Permission("sample.sample.create")
  createRound(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(roundCreateSchema)) body: z.infer<typeof roundCreateSchema>) {
    return this.service.createRound(ctx, id, body);
  }
}
