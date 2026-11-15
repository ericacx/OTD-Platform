import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { monitorQuerySchema, searchQuerySchema } from "@otd/contracts/mainline";
import type { z } from "zod";
import { Access, Authenticated, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { MainlineService } from "./mainline.service.js";
import { SearchService } from "./search.service.js";

@Controller()
export class MainlineController {
  constructor(
    private readonly service: MainlineService,
    private readonly searchService: SearchService,
  ) {}

  @Get("orders/monitor")
  @Permission("order.monitor.view", "order.order.view")
  monitor(@Access() ctx: AccessContext, @Query(zod(monitorQuerySchema)) q: z.infer<typeof monitorQuerySchema>) {
    return this.service.monitor(ctx, q.poNo);
  }

  @Get("orders/:id/mainline")
  @Permission("order.monitor.view", "order.order.view")
  mainline(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.mainline(ctx, id);
  }

  @Get("search")
  @Authenticated()
  search(@Access() ctx: AccessContext, @Query(zod(searchQuerySchema)) q: z.infer<typeof searchQuerySchema>) {
    return this.searchService.search(ctx, q.q, q.limit);
  }
}
