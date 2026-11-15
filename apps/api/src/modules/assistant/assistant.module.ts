import { Module } from "@nestjs/common";
import { CapacityModule } from "../capacity/capacity.module.js";
import { MainlineModule } from "../mainline/mainline.module.js";
import { ReceivableModule } from "../receivable/receivable.module.js";
import { AssistantController } from "./assistant.controller.js";
import { AssistantService } from "./assistant.service.js";
import { AssistantTools } from "./assistant.tools.js";

@Module({
  imports: [MainlineModule, ReceivableModule, CapacityModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantTools],
  exports: [AssistantService],
})
export class AssistantModule {}
