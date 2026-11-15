import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { bookingCancelSchema, bookingConfirmSchema, bookingCreateSchema, bookingListQuerySchema, bookingUpdateSchema, shipmentAdvanceSchema, shipmentCreateSchema, shipmentListQuerySchema, shipmentSignSchema } from "@otd/contracts/shipment";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { ShipmentService } from "./shipment.service.js";

@Controller("bookings")
export class BookingController {
  constructor(private readonly service: ShipmentService) {}

  @Get()
  @Permission("shipment.booking.view")
  list(@Access() ctx: AccessContext, @Query(zod(bookingListQuerySchema)) q: z.infer<typeof bookingListQuerySchema>) {
    return this.service.listBookings(ctx, q);
  }

  @Get(":id")
  @Permission("shipment.booking.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.getBooking(ctx, id);
  }

  @Post()
  @Permission("shipment.booking.edit")
  create(@Access() ctx: AccessContext, @Body(zod(bookingCreateSchema)) body: z.infer<typeof bookingCreateSchema>) {
    return this.service.createBooking(ctx, body);
  }

  @Put(":id")
  @Permission("shipment.booking.edit")
  update(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(bookingUpdateSchema)) body: z.infer<typeof bookingUpdateSchema>) {
    return this.service.updateBooking(ctx, id, body);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @Permission("shipment.booking.edit")
  confirm(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(bookingConfirmSchema)) body: z.infer<typeof bookingConfirmSchema>) {
    return this.service.confirmBooking(ctx, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Permission("shipment.booking.edit")
  cancel(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(bookingCancelSchema)) body: z.infer<typeof bookingCancelSchema>) {
    return this.service.cancelBooking(ctx, id, body);
  }
}

@Controller("shipments")
export class ShipmentController {
  constructor(private readonly service: ShipmentService) {}

  @Get()
  @Permission("shipment.shipment.view")
  list(@Access() ctx: AccessContext, @Query(zod(shipmentListQuerySchema)) q: z.infer<typeof shipmentListQuerySchema>) {
    return this.service.list(ctx, q);
  }

  @Get("kpis")
  @Permission("shipment.shipment.view")
  kpis(@Access() ctx: AccessContext) {
    return this.service.kpis(ctx);
  }

  @Get(":id")
  @Permission("shipment.shipment.view")
  get(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post()
  @Permission("shipment.shipment.create")
  create(@Access() ctx: AccessContext, @Body(zod(shipmentCreateSchema)) body: z.infer<typeof shipmentCreateSchema>) {
    return this.service.create(ctx, body);
  }

  @Post(":id/advance")
  @HttpCode(200)
  @Permission("shipment.shipment.advance")
  advance(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(shipmentAdvanceSchema)) body: z.infer<typeof shipmentAdvanceSchema>) {
    return this.service.advance(ctx, id, body);
  }

  @Post(":id/sign")
  @HttpCode(200)
  @Permission("shipment.shipment.sign")
  sign(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(shipmentSignSchema)) body: z.infer<typeof shipmentSignSchema>) {
    return this.service.sign(ctx, id, body);
  }
}
