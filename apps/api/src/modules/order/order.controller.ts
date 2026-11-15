import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  customerConfirmSchema,
  factoryReplyCreateSchema,
  orderAdvanceSchema,
  orderCancelSchema,
  orderConfirmSchema,
  orderCreateSchema,
  orderExtractSchema,
  orderListQuerySchema,
  orderReviseSchema,
  orderUpdateSchema,
  productionProgressCreateSchema,
} from "@otd/contracts/order";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Access, Permission, Req } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { badRequest } from "../../core/errors.js";
import { MAX_FILE_BYTES } from "../../core/files/file.service.js";
import { zod } from "../../core/zod.pipe.js";
import { OrderService } from "./order.service.js";

const uuid = z.uuid();

function fieldValue(fields: unknown, name: string): string | undefined {
  const f = (fields as Record<string, unknown> | undefined)?.[name];
  const one = Array.isArray(f) ? f[0] : f;
  const value = one && typeof one === "object" && "value" in one ? (one as { value: unknown }).value : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

@Controller("orders")
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Get()
  @Permission("order.order.view")
  list(@Access() ctx: AccessContext, @Query(zod(orderListQuerySchema)) q: z.infer<typeof orderListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Post()
  @Permission("order.order.create")
  create(@Access() ctx: AccessContext, @Body(zod(orderCreateSchema)) body: z.infer<typeof orderCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post("upload")
  @Permission("order.order.create")
  async upload(@Access() ctx: AccessContext, @Req() req: FastifyRequest) {
    if (req.isMultipart()) {
      const part = await req.file({ limits: { fileSize: MAX_FILE_BYTES } });
      if (!part) throw badRequest("file field missing");
      const data = await part.toBuffer();
      const customerId = fieldValue(part.fields, "customerId");
      if (customerId && !uuid.safeParse(customerId).success) throw badRequest("customerId must be a uuid");
      return this.service.upload(ctx, { file: { filename: part.filename, contentType: part.mimetype, data }, ...(customerId ? { customerId } : {}) });
    }
    const body = zod(orderExtractSchema).transform(req.body);
    return this.service.upload(ctx, { fileId: body.fileId, ...(body.customerId ? { customerId: body.customerId } : {}) });
  }

  @Get(":id")
  @Permission("order.order.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Put(":id")
  @Permission("order.order.edit")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(orderUpdateSchema)) body: z.infer<typeof orderUpdateSchema>) {
    return this.service.update(ctx, id, body);
  }

  @Post(":id/rule-check")
  @HttpCode(200)
  @Permission("order.order.edit", "order.order.confirm")
  recheck(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.recheck(ctx, id);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @Permission("order.order.confirm", "order.order.edit")
  confirm(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(orderConfirmSchema)) body: z.infer<typeof orderConfirmSchema>) {
    return this.service.confirm(ctx, id, body);
  }

  @Post(":id/advance")
  @HttpCode(200)
  @Permission("order.order.advance")
  advance(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(orderAdvanceSchema)) body: z.infer<typeof orderAdvanceSchema>) {
    return this.service.advance(ctx, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Permission("order.order.cancel")
  cancel(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(orderCancelSchema)) body: z.infer<typeof orderCancelSchema>) {
    return this.service.cancel(ctx, id, body);
  }

  @Post(":id/revise")
  @HttpCode(200)
  @Permission("order.order.edit")
  revise(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(orderReviseSchema)) body: z.infer<typeof orderReviseSchema>) {
    return this.service.revise(ctx, id, body);
  }

  @Post(":id/factory-replies")
  @HttpCode(200)
  @Permission("order.order.factoryReply")
  factoryReply(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(factoryReplyCreateSchema)) body: z.infer<typeof factoryReplyCreateSchema>) {
    return this.service.factoryReply(ctx, id, body);
  }

  @Post(":id/customer-confirm")
  @HttpCode(200)
  @Permission("order.order.edit", "order.order.confirm")
  customerConfirm(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(customerConfirmSchema)) body: z.infer<typeof customerConfirmSchema>) {
    return this.service.customerConfirm(ctx, id, body);
  }

  @Post(":id/production")
  @Permission("order.order.advance", "order.order.factoryReply", "order.order.edit")
  production(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(productionProgressCreateSchema)) body: z.infer<typeof productionProgressCreateSchema>) {
    return this.service.recordProduction(ctx, id, body);
  }
}
