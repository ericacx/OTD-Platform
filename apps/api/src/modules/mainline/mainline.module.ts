import { Module } from "@nestjs/common";
import { FlowModule } from "../flow/flow.module.js";
import { MainlineController } from "./mainline.controller.js";
import { MainlineService } from "./mainline.service.js";
import { SearchService } from "./search.service.js";

@Module({
  imports: [FlowModule],
  controllers: [MainlineController],
  providers: [MainlineService, SearchService],
  exports: [MainlineService, SearchService],
})
export class MainlineModule {}
