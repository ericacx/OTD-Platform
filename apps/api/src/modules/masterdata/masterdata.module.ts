import { Module } from "@nestjs/common";
import { CustomerService } from "./customer.service.js";
import { DictionaryService } from "./dictionary.service.js";
import { FactoryService } from "./factory.service.js";
import { LookupService } from "./lookup.service.js";
import { MasterDataController } from "./masterdata.controller.js";
import { NeedleService } from "./needle.service.js";
import { PartnerService } from "./partner.service.js";
import { ReferenceDataController } from "./reference-data.controller.js";

@Module({
  controllers: [MasterDataController, ReferenceDataController],
  providers: [CustomerService, LookupService, FactoryService, NeedleService, PartnerService, DictionaryService],
  exports: [CustomerService, LookupService, FactoryService],
})
export class MasterDataModule {}
