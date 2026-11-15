import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { commonErrors } from "@otd/contracts/errors";
import type { FastifyRequest } from "fastify";
import { Clock } from "../clock.js";
import { AppError, forbidden } from "../errors.js";
import { AccessService } from "./access.service.js";
import { AUTHENTICATED_KEY, PERMISSION_KEY, PUBLIC_KEY } from "./decorators.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new AppError(commonErrors.AUTH_UNAUTHENTICATED);
    const claims = await this.tokens.verifyAccess(token, this.clock.now());
    if (!claims) throw new AppError(commonErrors.AUTH_TOKEN_EXPIRED);
    const ctx = await this.access.load(claims.sub);
    if (!ctx) throw new AppError(commonErrors.AUTH_ACCOUNT_DISABLED);
    req.access = { ...ctx, sessionId: claims.sid };
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSION_KEY, targets);
    if (required && required.length) {
      if (!required.some((p) => ctx.permissions.has(p))) throw forbidden(required.join(" / "));
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets)) return true;
    throw forbidden("undeclared");
  }
}
