import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { purchaseCancelSchema, purchaseCreateSchema, purchaseListQuerySchema, purchaseReceiptListQuerySchema, purchaseReceiveSchema, purchaseRequirementQuerySchema } from "@otd/contracts/purchase";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { PurchaseService } from "./purchase.service.js";

@Controller("purchases")
export class PurchaseController {
  constructor(private readonly service: PurchaseService) {}

  @Get()
  @Permission("purchase.order.view")
  list(@Access() ctx: AccessContext, @Query(zod(purchaseListQuerySchema)) q: z.infer<typeof purchaseListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get("receipts")
  @Permission("purchase.receipt.view")
  receipts(@Access() ctx: AccessContext, @Query(zod(purchaseReceiptListQuerySchema)) q: z.infer<typeof purchaseReceiptListQuerySchema>) {
    return this.service.listReceipts(ctx, q);
  }

  @Get("requirements")
  @Permission("purchase.order.view")
  requirements(@Access() ctx: AccessContext, @Query(zod(purchaseRequirementQuerySchema)) q: z.infer<typeof purchaseRequirementQuerySchema>) {
    return this.service.requirements(ctx, q.orderId);
  }

  @Get(":id")
  @Permission("purchase.order.view", "purchase.receipt.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("purchase.order.create")
  create(@Access() ctx: AccessContext, @Body(zod(purchaseCreateSchema)) body: z.infer<typeof purchaseCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post(":id/receive")
  @HttpCode(200)
  @Permission("purchase.receipt.create")
  receive(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(purchaseReceiveSchema)) body: z.infer<typeof purchaseReceiveSchema>) {
    return this.service.receive(ctx, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Permission("purchase.order.cancel")
  cancel(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(purchaseCancelSchema)) body: z.infer<typeof purchaseCancelSchema>) {
    return this.service.cancel(ctx, id, body);
  }
}
