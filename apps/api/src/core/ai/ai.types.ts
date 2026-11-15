import type { ZodType } from "zod";

export type AiDocument = { filename: string; contentType: string; data: Buffer };

export type AiExtractRequest<T> = {
  purpose: string;
  instructions: string;
  document?: AiDocument;
  text?: string;
  schema: ZodType<T>;
  userId?: string;
};

export type AiChatMessage = { role: "user" | "assistant"; content: string };

export type AiTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

export type AiChatRequest = {
  purpose: string;
  system: string;
  messages: AiChatMessage[];
  tools?: AiTool[];
  userId?: string;
};

export type AiChatResult = { text: string; toolCalls: { name: string; input: unknown; output: unknown }[] };

export interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  extract<T>(req: AiExtractRequest<T>): Promise<T>;
  chat(req: AiChatRequest): Promise<AiChatResult>;
}
