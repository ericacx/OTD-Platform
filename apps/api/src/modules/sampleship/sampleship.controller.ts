import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { recipientUpsertSchema, sampleShipmentCreateSchema, sampleShipmentListQuerySchema, sampleShipmentSendSchema, sampleShipmentSignSchema } from "@otd/contracts/sampleship";
import { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { SampleShipService } from "./sampleship.service.js";

const recipientQuerySchema = z.object({ customerId: z.uuid().optional() });

@Controller("sample-shipments")
export class SampleShipController {
  constructor(private readonly service: SampleShipService) {}

  @Get("recipients")
  @Permission("sampleship.recipient.view", "sampleship.shipment.create")
  recipients(@Access() ctx: AccessContext, @Query(zod(recipientQuerySchema)) q: z.infer<typeof recipientQuerySchema>) {
    return this.service.listRecipients(ctx, q.customerId);
  }

  @Post("recipients")
  @Permission("sampleship.recipient.edit")
  createRecipient(@Access() ctx: AccessContext, @Body(zod(recipientUpsertSchema)) body: z.infer<typeof recipientUpsertSchema>) {
    return this.service.upsertRecipient(ctx, null, body);
  }

  @Put("recipients/:id")
  @Permission("sampleship.recipient.edit")
  updateRecipient(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(recipientUpsertSchema)) body: z.infer<typeof recipientUpsertSchema>) {
    return this.service.upsertRecipient(ctx, id, body);
  }

  @Get()
  @Permission("sampleship.shipment.view")
  list(@Access() ctx: AccessContext, @Query(zod(sampleShipmentListQuerySchema)) q: z.infer<typeof sampleShipmentListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get(":id")
  @Permission("sampleship.shipment.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("sampleship.shipment.create")
  create(@Access() ctx: AccessContext, @Body(zod(sampleShipmentCreateSchema)) body: z.infer<typeof sampleShipmentCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post(":id/send")
  @HttpCode(200)
  @Permission("sampleship.shipment.edit")
  send(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(sampleShipmentSendSchema)) body: z.infer<typeof sampleShipmentSendSchema>) {
    return this.service.send(ctx, id, body);
  }

  @Post(":id/sign")
  @HttpCode(200)
  @Permission("sampleship.shipment.edit")
  sign(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(sampleShipmentSignSchema)) body: z.infer<typeof sampleShipmentSignSchema>) {
    return this.service.sign(ctx, id, body);
  }
}
