import { Module } from "@nestjs/common";
import { FlowModule } from "../flow/flow.module.js";
import { PatrolRunner } from "./patrol-runner.service.js";
import { PatrolController } from "./patrol.controller.js";
import { PatrolService } from "./patrol.service.js";

@Module({
  imports: [FlowModule],
  controllers: [PatrolController],
  providers: [PatrolRunner, PatrolService],
  exports: [PatrolRunner, PatrolService],
})
export class PatrolModule {}
