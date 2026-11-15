import { Module } from "@nestjs/common";
import { CatalogService } from "./catalog.service.js";
import { CustomerFlowService } from "./customer-flow.service.js";
import { FlowConfigService } from "./flow-config.service.js";
import { FlowController } from "./flow.controller.js";
import { RulePackService } from "./rule-pack.service.js";

@Module({
  controllers: [FlowController],
  providers: [FlowConfigService, CatalogService, CustomerFlowService, RulePackService],
  exports: [FlowConfigService],
})
export class FlowModule {}
