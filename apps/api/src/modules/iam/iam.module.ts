import { Module } from "@nestjs/common";
import { IamController } from "./iam.controller.js";
import { OrgService } from "./org.service.js";
import { RoleService } from "./role.service.js";
import { SystemService } from "./system.service.js";
import { UserService } from "./user.service.js";

@Module({
  controllers: [IamController],
  providers: [OrgService, UserService, RoleService, SystemService],
  exports: [OrgService, UserService, RoleService, SystemService],
})
export class IamModule {}
