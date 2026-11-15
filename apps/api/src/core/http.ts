import { randomUUID } from "node:crypto";
import {
  type ArgumentsHost,
  type CallHandler,
  Catch,
  type ExceptionFilter,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import { commonErrors, formatMessage } from "@otd/contracts/errors";
import type { FastifyReply, FastifyRequest } from "fastify";
import { map, type Observable } from "rxjs";
import { AppError } from "./errors.js";
import type { AccessContext } from "./access/access.types.js";

declare module "fastify" {
  interface FastifyRequest {
    access?: AccessContext;
    requestId?: string;
  }
}

export function requestIdOf(req: FastifyRequest): string {
  if (!req.requestId) {
    const header = req.headers["x-trace-id"];
    req.requestId = typeof header === "string" && header.length <= 100 ? header : randomUUID();
  }
  return req.requestId;
}

export function languageOf(req: FastifyRequest): "zh" | "en" {
  const h = req.headers["x-language"];
  const lang = typeof h === "string" ? h : (req.access?.locale ?? "zh-CN");
  return lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const requestId = requestIdOf(req);
    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) return data;
        return { errcode: 0, errmsg: "", data: data ?? null, requestId };
      }),
    );
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const requestId = requestIdOf(req);
    const lang = languageOf(req);
    let appError: AppError;
    if (exception instanceof AppError) {
      appError = exception;
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      appError =
        status === 404
          ? new AppError(commonErrors.COMMON_NOT_FOUND)
          : status === 413 || status === 400 || status === 415
            ? new AppError(commonErrors.COMMON_BAD_REQUEST, { reason: exception.message })
            : new AppError({ ...commonErrors.COMMON_INTERNAL, status }, {});
    } else {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception), requestId);
      appError = new AppError(commonErrors.COMMON_INTERNAL);
    }
    const { def, params } = appError;
    void reply.status(def.status).send({
      errcode: def.code,
      errmsg: formatMessage(def.message[lang], params),
      errParams: params,
      requestId,
    });
  }
}
