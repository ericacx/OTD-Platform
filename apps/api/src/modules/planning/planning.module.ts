import { Module } from "@nestjs/common";
import { SampleModule } from "../sample/sample.module.js";
import { PlanningController } from "./planning.controller.js";
import { PlanningService } from "./planning.service.js";
import { StylesController } from "./styles.controller.js";

@Module({
  imports: [SampleModule],
  controllers: [PlanningController, StylesController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
