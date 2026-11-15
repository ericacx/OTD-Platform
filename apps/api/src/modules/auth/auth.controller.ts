import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { changePasswordSchema, loginInputSchema, preferencesSchema, refreshInputSchema } from "@otd/contracts/auth";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { Access, Authenticated, Public, Req } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { requestIdOf } from "../../core/http.js";
import { zod } from "../../core/zod.pipe.js";
import { AuthService } from "./auth.service.js";

function meta(req: FastifyRequest) {
  const ua = req.headers["user-agent"];
  return { ip: req.ip, userAgent: typeof ua === "string" ? ua : undefined, requestId: requestIdOf(req) };
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("auth/login")
  @Public()
  @HttpCode(200)
  login(@Body(zod(loginInputSchema)) body: z.infer<typeof loginInputSchema>, @Req() req: FastifyRequest) {
    return this.auth.login(body, { ...meta(req), device: body.device });
  }

  @Post("auth/refresh")
  @Public()
  @HttpCode(200)
  refresh(@Body(zod(refreshInputSchema)) body: z.infer<typeof refreshInputSchema>, @Req() req: FastifyRequest) {
    return this.auth.refresh(body.refreshToken, meta(req));
  }

  @Post("auth/logout")
  @Authenticated()
  @HttpCode(200)
  async logout(@Access() ctx: AccessContext) {
    await this.auth.logout(ctx);
    return null;
  }

  @Get("auth/session")
  @Authenticated()
  session(@Access() ctx: AccessContext) {
    return this.auth.session(ctx.userId);
  }

  @Put("me/preferences")
  @Authenticated()
  preferences(@Access() ctx: AccessContext, @Body(zod(preferencesSchema)) body: z.infer<typeof preferencesSchema>) {
    return this.auth.updatePreferences(ctx, body);
  }

  @Post("me/password")
  @Authenticated()
  @HttpCode(200)
  async password(@Access() ctx: AccessContext, @Body(zod(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>) {
    await this.auth.changePassword(ctx, body.oldPassword, body.newPassword);
    return null;
  }

  @Get("me/devices")
  @Authenticated()
  devices(@Access() ctx: AccessContext) {
    return this.auth.devices(ctx);
  }

  @Delete("me/devices/:id")
  @Authenticated()
  async revoke(@Access() ctx: AccessContext, @Param("id") id: string) {
    await this.auth.revokeDevice(ctx, id);
    return null;
  }
}
