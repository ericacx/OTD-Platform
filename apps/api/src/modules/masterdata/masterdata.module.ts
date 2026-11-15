import { Module } from "@nestjs/common";
import { CustomerService } from "./customer.service.js";
import { LookupService } from "./lookup.service.js";
import { MasterDataController } from "./masterdata.controller.js";

@Module({
  controllers: [MasterDataController],
  providers: [CustomerService, LookupService],
  exports: [CustomerService, LookupService],
})
export class MasterDataModule {}
