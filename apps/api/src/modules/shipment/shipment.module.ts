import { Module } from "@nestjs/common";
import { BookingController, ShipmentController } from "./shipment.controller.js";
import { ShipmentService } from "./shipment.service.js";

@Module({
  controllers: [BookingController, ShipmentController],
  providers: [ShipmentService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
