import type { AiChatRequest, AiChatResult, AiExtractRequest, AiProvider } from "./ai.types.js";

export type FakeExtractHandler = (req: AiExtractRequest<unknown>) => unknown;
export type FakeChatHandler = (req: AiChatRequest) => Promise<AiChatResult> | AiChatResult;

export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  readonly available = true;
  private readonly extractHandlers = new Map<string, FakeExtractHandler>();
  private readonly chatHandlers = new Map<string, FakeChatHandler>();

  onExtract(purpose: string, handler: FakeExtractHandler): void {
    this.extractHandlers.set(purpose, handler);
  }

  onChat(purpose: string, handler: FakeChatHandler): void {
    this.chatHandlers.set(purpose, handler);
  }

  async extract<T>(req: AiExtractRequest<T>): Promise<T> {
    const handler = this.extractHandlers.get(req.purpose);
    if (!handler) throw new Error(`no fake extraction registered for ${req.purpose}`);
    return req.schema.parse(handler(req as AiExtractRequest<unknown>));
  }

  async chat(req: AiChatRequest): Promise<AiChatResult> {
    const handler = this.chatHandlers.get(req.purpose);
    const result = handler ? await handler(req) : { text: `（离线模式）已收到：${req.messages.at(-1)?.content ?? ""}`, toolCalls: [] };
    if (result.text) req.onText?.(result.text);
    return result;
  }
}
