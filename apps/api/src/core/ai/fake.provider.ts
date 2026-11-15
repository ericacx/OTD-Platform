import type { AiChatRequest, AiChatResult, AiExtractRequest, AiProvider } from "./ai.types.js";

export type FakeExtractHandler = (req: AiExtractRequest<unknown>) => unknown;
export type FakeChatHandler = (req: AiChatRequest) => Promise<AiChatResult> | AiChatResult;

export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  readonly available = true;
  private readonly extractHandlers = new Map<string, FakeExtractHandler>();
  private chatHandler: FakeChatHandler | null = null;

  onExtract(purpose: string, handler: FakeExtractHandler): void {
    this.extractHandlers.set(purpose, handler);
  }

  onChat(handler: FakeChatHandler): void {
    this.chatHandler = handler;
  }

  async extract<T>(req: AiExtractRequest<T>): Promise<T> {
    const handler = this.extractHandlers.get(req.purpose);
    if (!handler) throw new Error(`no fake extraction registered for ${req.purpose}`);
    return req.schema.parse(handler(req as AiExtractRequest<unknown>));
  }

  async chat(req: AiChatRequest): Promise<AiChatResult> {
    if (this.chatHandler) return this.chatHandler(req);
    const last = req.messages.at(-1)?.content ?? "";
    return { text: `（离线模式）已收到：${last}`, toolCalls: [] };
  }
}
