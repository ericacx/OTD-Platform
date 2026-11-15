import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type AiChatRequest, type AiChatResult, type AiDocument, type AiExtractRequest, type AiProvider, AiProviderError, type AiUsageSink } from "./ai.types.js";

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaContentBlock = Anthropic.Beta.BetaContentBlock;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
type BetaToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOOL_TURNS = 8;
const MAX_UNPARSEABLE_RETRIES = 2;
const DROP_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "tool_use"]);

type StreamLike = { finalMessage: () => Promise<BetaMessage>; readonly request_id?: string | null | undefined };

export type ClaudeProviderOptions = { model: string; extractMaxTokens?: number; chatMaxTokens?: number };

export class ClaudeAiProvider implements AiProvider {
  readonly name = "claude";
  readonly available = true;
  private sink: AiUsageSink | null = null;

  constructor(
    private readonly client: Anthropic,
    private readonly options: ClaudeProviderOptions,
  ) {}

  setUsageSink(sink: AiUsageSink): void {
    this.sink = sink;
  }

  async extract<T>(req: AiExtractRequest<T>): Promise<T> {
    const format = zodOutputFormat(req.schema);
    const content: BetaContentBlockParam[] = [];
    if (req.document) content.push(documentBlock(req.document));
    content.push({ type: "text", text: req.text?.trim() ? req.text : "请按要求抽取上面原件中的要素。" });
    const message = await this.call(
      () =>
        this.client.beta.messages.stream({
          model: this.options.model,
          max_tokens: this.options.extractMaxTokens ?? 32000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium", format: { type: "json_schema", schema: format.schema } },
          system: req.instructions,
          messages: [{ role: "user", content }],
        }),
      req.purpose,
      req.userId,
    );
    if (message.stop_reason === "refusal") throw new AiProviderError(`模型拒绝处理：${message.stop_details?.explanation ?? "未说明原因"}`, "refusal");
    if (message.stop_reason === "max_tokens") throw new AiProviderError("输出超过长度上限，未能完成抽取", "max_tokens");
    const text = textOf(message.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiProviderError("模型输出不是合法 JSON", "invalid_output");
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) throw new AiProviderError(`模型输出不符合结构：${result.error.issues[0]?.message ?? ""}`, "invalid_output");
    return result.data;
  }

  async chat(req: AiChatRequest): Promise<AiChatResult> {
    const tools = (req.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true }));
    const byName = new Map((req.tools ?? []).map((t) => [t.name, t]));
    const messages: BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const toolCalls: AiChatResult["toolCalls"] = [];
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const message = await this.chatTurn(req, messages, tools);
      if (message.stop_reason === "refusal") return { text: "抱歉，这个请求我无法处理。", toolCalls };
      const content = echoable(message.content);
      const uses = content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason === "max_tokens" && uses.length) return { text: "回答超过长度上限，请缩小问题范围后重试。", toolCalls };
      messages.push({ role: "assistant", content });
      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason !== "tool_use" || !uses.length) return { text: textOf(message.content), toolCalls };
      const results = await Promise.all(
        uses.map(async (use): Promise<BetaToolResultBlockParam> => {
          const tool = byName.get(use.name);
          const input = (use.input ?? {}) as Record<string, unknown>;
          if (!tool) return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `未知工具 ${use.name}` };
          try {
            const output = await tool.run(input);
            toolCalls.push({ name: use.name, input, output });
            return { type: "tool_result", tool_use_id: use.id, content: typeof output === "string" ? output : JSON.stringify(output ?? null) };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toolCalls.push({ name: use.name, input, output: { error: msg } });
            return { type: "tool_result", tool_use_id: use.id, is_error: true, content: msg };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
    return { text: "工具调用次数超过上限，请缩小问题范围后重试。", toolCalls };
  }

  private async chatTurn(req: AiChatRequest, messages: BetaMessageParam[], tools: Anthropic.Beta.BetaTool[]): Promise<BetaMessage> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.call(
          () => {
            const stream = this.client.beta.messages.stream({
              model: this.options.model,
              max_tokens: this.options.chatMaxTokens ?? 64000,
              betas: [FALLBACK_BETA],
              fallbacks: "default",
              thinking: { type: "adaptive" },
              output_config: { effort: "medium" },
              cache_control: { type: "ephemeral" },
              system: req.system,
              messages,
              ...(tools.length ? { tools } : {}),
            });
            if (req.onText) stream.on("text", (delta) => req.onText?.(delta));
            return stream;
          },
          req.purpose,
          req.userId,
        );
      } catch (err) {
        if (err instanceof AiProviderError || attempt >= MAX_UNPARSEABLE_RETRIES) throw err;
      }
    }
  }

  private async call(open: () => StreamLike, purpose: string, userId: string | undefined): Promise<BetaMessage> {
    const started = performance.now();
    let message: BetaMessage;
    let requestId: string | null | undefined;
    try {
      const stream = open();
      message = await stream.finalMessage();
      requestId = stream.request_id;
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw new AiProviderError(`AI 服务调用失败（${err.status ?? "network"}）：${err.message}`, "api_error");
      throw err;
    }
    const u = message.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    this.sink?.({
      purpose,
      model: message.model ?? this.options.model,
      ...(userId ? { userId } : {}),
      inputTokens: (u.input_tokens ?? 0) + cacheWrite + cacheRead,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      ...(message.stop_reason ? { stopReason: message.stop_reason } : {}),
      durationMs: Math.round(performance.now() - started),
      ...(requestId ? { requestId } : {}),
    });
    return message;
  }
}

export function documentBlock(doc: AiDocument): BetaContentBlockParam {
  if (doc.contentType === "application/pdf") return { type: "document", title: doc.filename, source: { type: "base64", media_type: "application/pdf", data: doc.data.toString("base64") } };
  if (doc.contentType === "image/png" || doc.contentType === "image/jpeg") return { type: "image", source: { type: "base64", media_type: doc.contentType, data: doc.data.toString("base64") } };
  return { type: "document", title: doc.filename, source: { type: "text", media_type: "text/plain", data: doc.data.toString("utf8") } };
}

export function echoable(content: BetaContentBlock[]): BetaContentBlock[] {
  const types = content.map((b) => b.type as string);
  const boundary = types.lastIndexOf("fallback");
  if (boundary < 0) return content;
  return content.filter((b, i) => i >= boundary || !DROP_BEFORE_FALLBACK.has(b.type as string));
}

function textOf(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
