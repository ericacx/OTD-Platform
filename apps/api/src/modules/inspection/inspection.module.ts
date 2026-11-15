import { Module } from "@nestjs/common";
import { FlowModule } from "../flow/flow.module.js";
import { InspectionController } from "./inspection.controller.js";
import { InspectionService } from "./inspection.service.js";

@Module({
  imports: [FlowModule],
  controllers: [InspectionController],
  providers: [InspectionService],
  exports: [InspectionService],
})
export class InspectionModule {}
