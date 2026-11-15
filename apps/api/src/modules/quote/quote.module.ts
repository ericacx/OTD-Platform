import { Module } from "@nestjs/common";
import { QuoteController, QuoteStrategyController } from "./quote.controller.js";
import { QuoteService } from "./quote.service.js";

@Module({
  controllers: [QuoteStrategyController, QuoteController],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
