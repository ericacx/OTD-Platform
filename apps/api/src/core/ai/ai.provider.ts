import type { Env } from "../env.js";
import type { AiProvider } from "./ai.types.js";
import { FakeAiProvider } from "./fake.provider.js";

export type AiProviderFactory = (env: Env) => AiProvider;

let factory: AiProviderFactory = () => new FakeAiProvider();

export function setAiProviderFactory(f: AiProviderFactory): void {
  factory = f;
}

export function createAiProvider(env: Env): AiProvider {
  return factory(env);
}
