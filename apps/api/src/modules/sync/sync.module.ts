import { Module } from "@nestjs/common";
import { CredentialVault } from "./credential.js";
import { SyncEndpointService } from "./endpoint.service.js";
import { SyncMappingService } from "./mapping.service.js";
import { SyncRunner } from "./runner.service.js";
import { SyncController } from "./sync.controller.js";
import { SyncTaskService } from "./task.service.js";

@Module({
  controllers: [SyncController],
  providers: [CredentialVault, SyncRunner, SyncEndpointService, SyncMappingService, SyncTaskService],
  exports: [SyncRunner, SyncTaskService],
})
export class SyncModule {}
