import { Module } from "@nestjs/common";
import { FlowModule } from "../flow/flow.module.js";
import { HandoverController, KbController } from "./document.controller.js";
import { HandoverService } from "./handover.service.js";
import { KbService } from "./kb.service.js";

@Module({
  imports: [FlowModule],
  controllers: [HandoverController, KbController],
  providers: [HandoverService, KbService],
  exports: [HandoverService, KbService],
})
export class DocumentModule {}
