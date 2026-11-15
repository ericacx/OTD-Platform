import { type ExecutionContext, SetMetadata, createParamDecorator } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AccessContext } from "./access.types.js";

export const PUBLIC_KEY = "otd:public";
export const AUTHENTICATED_KEY = "otd:authenticated";
export const PERMISSION_KEY = "otd:permission";

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);
export const Permission = (...codes: string[]) => SetMetadata(PERMISSION_KEY, codes);

export const Access = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessContext => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!req.access) throw new Error("access context missing");
  return req.access;
});

export const Req = createParamDecorator((_data: unknown, ctx: ExecutionContext): FastifyRequest => ctx.switchToHttp().getRequest<FastifyRequest>());
