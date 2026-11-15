import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { auditLogQuerySchema, orgUpsertSchema, roleGrantSchema, roleUpsertSchema, systemParamUpdateSchema, userListQuerySchema, userUpsertSchema } from "@otd/contracts/iam";
import { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { OrgService } from "./org.service.js";
import { RoleService } from "./role.service.js";
import { SystemService } from "./system.service.js";
import { UserService } from "./user.service.js";

const rollbackSchema = z.object({ reason: z.string().min(1).max(200) });
const snapshotQuerySchema = z.object({ objectType: z.string(), objectId: z.string() });

@Controller("system")
export class IamController {
  constructor(
    private readonly orgs: OrgService,
    private readonly users: UserService,
    private readonly roles: RoleService,
    private readonly system: SystemService,
  ) {}

  @Get("orgs")
  @Permission("iam.org.view", "iam.user.view", "iam.role.view")
  orgTree() {
    return this.orgs.tree();
  }

  @Post("orgs")
  @Permission("iam.org.edit")
  createOrg(@Access() ctx: AccessContext, @Body(zod(orgUpsertSchema)) body: z.infer<typeof orgUpsertSchema>) {
    return this.orgs.create(ctx, body);
  }

  @Put("orgs/:id")
  @Permission("iam.org.edit")
  updateOrg(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(orgUpsertSchema)) body: z.infer<typeof orgUpsertSchema>) {
    return this.orgs.update(ctx, id, body);
  }

  @Delete("orgs/:id")
  @Permission("iam.org.edit")
  async deleteOrg(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.orgs.remove(ctx, id);
    return null;
  }

  @Get("users")
  @Permission("iam.user.view", "iam.org.view")
  listUsers(@Query(zod(userListQuerySchema)) q: z.infer<typeof userListQuerySchema>) {
    return this.users.list(q);
  }

  @Post("users")
  @Permission("iam.user.edit")
  createUser(@Access() ctx: AccessContext, @Body(zod(userUpsertSchema)) body: z.infer<typeof userUpsertSchema>) {
    return this.users.create(ctx, body);
  }

  @Put("users/:id")
  @Permission("iam.user.edit")
  updateUser(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(userUpsertSchema)) body: z.infer<typeof userUpsertSchema>) {
    return this.users.update(ctx, id, body);
  }

  @Post("users/:id/reset-password")
  @HttpCode(200)
  @Permission("iam.user.resetPassword")
  resetPassword(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.resetPassword(ctx, id);
  }

  @Get("roles")
  @Permission("iam.role.view", "iam.user.view")
  listRoles() {
    return this.roles.list();
  }

  @Get("roles/:id")
  @Permission("iam.role.view")
  role(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.detail(id);
  }

  @Post("roles")
  @Permission("iam.role.edit")
  createRole(@Access() ctx: AccessContext, @Body(zod(roleUpsertSchema)) body: z.infer<typeof roleUpsertSchema>) {
    return this.roles.create(ctx, body);
  }

  @Put("roles/:id")
  @Permission("iam.role.edit")
  updateRole(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(roleUpsertSchema)) body: z.infer<typeof roleUpsertSchema>) {
    return this.roles.update(ctx, id, body);
  }

  @Delete("roles/:id")
  @Permission("iam.role.edit")
  async deleteRole(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.roles.remove(ctx, id);
    return null;
  }

  @Put("roles/:id/grants")
  @Permission("iam.role.grant")
  grant(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(roleGrantSchema)) body: z.infer<typeof roleGrantSchema>) {
    return this.roles.grant(ctx, id, body);
  }

  @Get("audit-logs")
  @Permission("iam.audit.view")
  auditLogs(@Query(zod(auditLogQuerySchema)) q: z.infer<typeof auditLogQuerySchema>) {
    return this.system.auditLogs(q);
  }

  @Get("snapshots")
  @Permission("iam.audit.view")
  snapshots(@Query(zod(snapshotQuerySchema)) q: z.infer<typeof snapshotQuerySchema>) {
    return this.system.snapshots(q.objectType, q.objectId);
  }

  @Post("snapshots/:id/rollback")
  @HttpCode(200)
  @Permission("iam.audit.rollback")
  async rollback(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(rollbackSchema)) body: z.infer<typeof rollbackSchema>) {
    await this.system.rollback(ctx, id, body.reason);
    return null;
  }

  @Get("params")
  @Permission("iam.param.view")
  params() {
    return this.system.params();
  }

  @Put("params/:key")
  @Permission("iam.param.edit")
  updateParam(@Access() ctx: AccessContext, @Param("key") key: string, @Body(zod(systemParamUpdateSchema)) body: z.infer<typeof systemParamUpdateSchema>) {
    return this.system.updateParam(ctx, key, body.value, body.reason);
  }
}
