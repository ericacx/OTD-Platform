import { Module } from "@nestjs/common";
import { SampleModule } from "../sample/sample.module.js";
import { PlanningController } from "./planning.controller.js";
import { PlanningService } from "./planning.service.js";

@Module({
  imports: [SampleModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
