import { Module } from "@nestjs/common";
import { CapacityController } from "./capacity.controller.js";
import { CapacityService } from "./capacity.service.js";
import { LedgerTaskService } from "./ledger-task.service.js";

@Module({
  controllers: [CapacityController],
  providers: [CapacityService, LedgerTaskService],
  exports: [CapacityService, LedgerTaskService],
})
export class CapacityModule {}
