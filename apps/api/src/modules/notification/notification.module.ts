import { Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Access, Authenticated } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { NotificationService } from "./notification.service.js";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @Authenticated()
  list(@Access() ctx: AccessContext) {
    return this.service.list(ctx);
  }

  @Post("read-all")
  @HttpCode(200)
  @Authenticated()
  async readAll(@Access() ctx: AccessContext) {
    await this.service.markRead(ctx);
    return null;
  }

  @Post(":id/read")
  @HttpCode(200)
  @Authenticated()
  async read(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.markRead(ctx, id);
    return null;
  }
}

@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
