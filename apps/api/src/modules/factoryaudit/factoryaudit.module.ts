import { Module } from "@nestjs/common";
import { FactoryAuditController } from "./factoryaudit.controller.js";
import { FactoryAuditService } from "./factoryaudit.service.js";

@Module({
  controllers: [FactoryAuditController],
  providers: [FactoryAuditService],
  exports: [FactoryAuditService],
})
export class FactoryAuditModule {}
