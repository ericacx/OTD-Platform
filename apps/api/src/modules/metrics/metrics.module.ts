import { Module } from "@nestjs/common";
import { DiagnosisService } from "./diagnosis.service.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, DiagnosisService],
  exports: [MetricsService],
})
export class MetricsModule {}
