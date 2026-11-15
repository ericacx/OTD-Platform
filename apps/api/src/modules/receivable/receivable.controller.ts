import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  collectionCreateSchema,
  collectionQuerySchema,
  disputeSchema,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  offsetSchema,
  receiptCreateSchema,
  receivableCreateSchema,
  receivableListQuerySchema,
} from "@otd/contracts/receivable";
import { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { ReceivableService } from "./receivable.service.js";

const summaryQuerySchema = z.object({ customerId: z.uuid().optional() });

@Controller("receivables")
export class ReceivableController {
  constructor(private readonly service: ReceivableService) {}

  @Get()
  @Permission("receivable.receivable.view")
  list(@Access() ctx: AccessContext, @Query(zod(receivableListQuerySchema)) q: z.infer<typeof receivableListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get("kpis")
  @Permission("receivable.receivable.view")
  kpis(@Access() ctx: AccessContext, @Query(zod(receivableListQuerySchema)) q: z.infer<typeof receivableListQuerySchema>) {
    return this.service.kpis(ctx, q);
  }

  @Get("collection")
  @Permission("receivable.collection.view")
  collection(@Access() ctx: AccessContext, @Query(zod(collectionQuerySchema)) q: z.infer<typeof collectionQuerySchema>) {
    return this.service.collection(ctx, q);
  }

  @Get("collection/summary")
  @Permission("receivable.collection.view")
  collectionSummary(@Access() ctx: AccessContext, @Query(zod(summaryQuerySchema)) q: z.infer<typeof summaryQuerySchema>) {
    return this.service.collectionSummary(ctx, q.customerId);
  }

  @Get("invoices")
  @Permission("receivable.invoice.view")
  invoices(@Access() ctx: AccessContext, @Query(zod(invoiceListQuerySchema)) q: z.infer<typeof invoiceListQuerySchema>) {
    return this.service.listInvoices(ctx, q);
  }

  @Post("invoices")
  @Permission("receivable.invoice.create")
  createInvoice(@Access() ctx: AccessContext, @Body(zod(invoiceCreateSchema)) body: z.infer<typeof invoiceCreateSchema>) {
    return this.service.createInvoice(ctx, body);
  }

  @Get(":id")
  @Permission("receivable.receivable.view", "receivable.collection.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("receivable.receivable.create")
  create(@Access() ctx: AccessContext, @Body(zod(receivableCreateSchema)) body: z.infer<typeof receivableCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post(":id/receipts")
  @HttpCode(200)
  @Permission("receivable.receivable.receipt")
  receipt(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(receiptCreateSchema)) body: z.infer<typeof receiptCreateSchema>) {
    return this.service.addReceipt(ctx, id, body);
  }

  @Post(":id/offset")
  @HttpCode(200)
  @Permission("receivable.receivable.receipt")
  offset(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(offsetSchema)) body: z.infer<typeof offsetSchema>) {
    return this.service.offset(ctx, id, body);
  }

  @Post(":id/collections")
  @HttpCode(200)
  @Permission("receivable.collection.log")
  logCollection(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(collectionCreateSchema)) body: z.infer<typeof collectionCreateSchema>) {
    return this.service.logCollection(ctx, id, body);
  }

  @Post(":id/dispute")
  @HttpCode(200)
  @Permission("receivable.collection.log")
  dispute(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(disputeSchema)) body: z.infer<typeof disputeSchema>) {
    return this.service.setDispute(ctx, id, body);
  }
}
