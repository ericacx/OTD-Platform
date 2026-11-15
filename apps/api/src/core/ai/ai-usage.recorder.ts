import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { type Database, aiUsage } from "@otd/db";
import { AI_PROVIDER, DB } from "../tokens.js";
import type { AiProvider, AiUsageRecord } from "./ai.types.js";

@Injectable()
export class AiUsageRecorder implements OnModuleInit {
  private readonly logger = new Logger("AiUsage");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  onModuleInit(): void {
    this.ai.setUsageSink?.((u) => {
      void this.record(u);
    });
  }

  async record(u: AiUsageRecord): Promise<void> {
    try {
      await this.db.insert(aiUsage).values({ userId: u.userId ?? null, purpose: u.purpose, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens });
    } catch (err) {
      this.logger.warn(`ai_usage insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
