import { Module } from "@nestjs/common";
import { AiUsageRecorder } from "../../core/ai/ai-usage.recorder.js";
import { SampleModule } from "../sample/sample.module.js";
import { PlanningController } from "./planning.controller.js";
import { PlanningService } from "./planning.service.js";

@Module({
  imports: [SampleModule],
  controllers: [PlanningController],
  providers: [PlanningService, AiUsageRecorder],
  exports: [PlanningService],
})
export class PlanningModule {}
