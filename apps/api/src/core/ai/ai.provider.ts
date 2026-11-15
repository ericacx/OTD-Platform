import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../env.js";
import type { AiProvider } from "./ai.types.js";
import { ClaudeAiProvider } from "./claude.provider.js";
import { FakeAiProvider } from "./fake.provider.js";
import { offlinePlanningExtract } from "./offline-planning.js";

export type AiProviderFactory = (env: Env) => AiProvider;

export function createOfflineProvider(): FakeAiProvider {
  const fake = new FakeAiProvider();
  fake.onExtract("planning.extract", (req) => offlinePlanningExtract(req));
  return fake;
}

export const defaultAiProviderFactory: AiProviderFactory = (env) => {
  if (env.ANTHROPIC_API_KEY) return new ClaudeAiProvider(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), { model: env.AI_MODEL });
  return createOfflineProvider();
};

let factory: AiProviderFactory = defaultAiProviderFactory;

export function setAiProviderFactory(f: AiProviderFactory): void {
  factory = f;
}

export function createAiProvider(env: Env): AiProvider {
  return factory(env);
}
