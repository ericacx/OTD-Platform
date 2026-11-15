import { Body, Controller, Delete, Get, HttpCode, Logger, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { conversationCreateSchema, messageCreateSchema, proposalDecisionSchema } from "@otd/contracts/assistant";
import { commonErrors, formatMessage } from "@otd/contracts/errors";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { Access, Permission, Req } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { AppError } from "../../core/errors.js";
import { languageOf, requestIdOf } from "../../core/http.js";
import { zod } from "../../core/zod.pipe.js";
import { AssistantService } from "./assistant.service.js";

const USE = "assistant.chat.use";
const HEARTBEAT_MS = 15_000;
const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export function wantsEventStream(req: FastifyRequest): boolean {
  const accept = req.headers.accept;
  return typeof accept === "string" && accept.toLowerCase().includes("text/event-stream");
}

@Controller("assistant")
export class AssistantController {
  private readonly logger = new Logger("Assistant");

  constructor(private readonly service: AssistantService) {}

  private errorEnvelope(err: unknown, lang: "zh" | "en", requestId: string) {
    let error: AppError;
    if (err instanceof AppError) error = err;
    else {
      this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err), requestId);
      error = new AppError(commonErrors.COMMON_INTERNAL);
    }
    return { errcode: error.def.code, errmsg: formatMessage(error.def.message[lang], error.params), errParams: error.params, requestId };
  }

  @Get("profile")
  @Permission(USE)
  profile(@Access() ctx: AccessContext) {
    return this.service.profile(ctx);
  }

  @Get("conversations")
  @Permission(USE)
  list(@Access() ctx: AccessContext) {
    return this.service.listConversations(ctx);
  }

  @Post("conversations")
  @Permission(USE)
  create(@Access() ctx: AccessContext, @Body(zod(conversationCreateSchema)) body: z.infer<typeof conversationCreateSchema>) {
    return this.service.createConversation(ctx, body);
  }

  @Delete("conversations/:id")
  @Permission(USE)
  async remove(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.deleteConversation(ctx, id);
    return null;
  }

  @Get("conversations/:id/messages")
  @Permission(USE)
  messages(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.messages(ctx, id);
  }

  @Post("conversations/:id/messages")
  @Permission(USE)
  async ask(
    @Access() ctx: AccessContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(zod(messageCreateSchema)) body: z.infer<typeof messageCreateSchema>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const requestId = requestIdOf(req);
    if (!wantsEventStream(req)) {
      const data = await this.service.ask(ctx, id, body);
      await reply.code(201).send({ errcode: 0, errmsg: "", data, requestId });
      return;
    }
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { ...(reply.getHeaders() as Record<string, string>), ...SSE_HEADERS, "x-trace-id": requestId });
    const write = (chunk: string) => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(chunk);
    };
    const send = (event: "delta" | "done" | "error", data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    try {
      const data = await this.service.ask(ctx, id, body, (text) => {
        if (text) send("delta", { text });
      });
      send("done", data);
    } catch (err) {
      send("error", this.errorEnvelope(err, languageOf(req), requestId));
    } finally {
      clearInterval(heartbeat);
      if (!raw.writableEnded) raw.end();
    }
  }

  @Post("proposals/:id/confirm")
  @HttpCode(200)
  @Permission(USE)
  confirm(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(proposalDecisionSchema)) body: z.infer<typeof proposalDecisionSchema>) {
    return this.service.confirmProposal(ctx, id, body);
  }

  @Post("proposals/:id/reject")
  @HttpCode(200)
  @Permission(USE)
  reject(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(proposalDecisionSchema)) body: z.infer<typeof proposalDecisionSchema>) {
    return this.service.rejectProposal(ctx, id, body);
  }
}
