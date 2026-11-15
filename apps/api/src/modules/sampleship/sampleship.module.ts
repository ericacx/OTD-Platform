import { Module } from "@nestjs/common";
import { SampleShipController } from "./sampleship.controller.js";
import { SampleShipService } from "./sampleship.service.js";

@Module({
  controllers: [SampleShipController],
  providers: [SampleShipService],
  exports: [SampleShipService],
})
export class SampleShipModule {}
