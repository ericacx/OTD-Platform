import { Module } from "@nestjs/common";
import { FlowModule } from "../flow/flow.module.js";
import { MainlineModule } from "../mainline/mainline.module.js";
import { OrderController } from "./order.controller.js";
import { OrderService } from "./order.service.js";

@Module({
  imports: [MainlineModule, FlowModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
