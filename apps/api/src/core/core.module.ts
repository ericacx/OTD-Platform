import { Global, Logger, Module, type OnApplicationShutdown, Inject } from "@nestjs/common";
import { type Database, type DatabaseHandle, createDatabase } from "@otd/db";
import { seedAll } from "@otd/db/seed";
import { sql } from "drizzle-orm";
import { AccessService } from "./access/access.service.js";
import { TokenService } from "./access/token.service.js";
import { createAiProvider } from "./ai/ai.provider.js";
import { AuditService } from "./audit.service.js";
import { Clock } from "./clock.js";
import { type Env, loadEnv } from "./env.js";
import { EventBus } from "./events.js";
import { DiskStorage } from "./files/file-storage.js";
import { FileService } from "./files/file.service.js";
import { FilesController } from "./files/files.controller.js";
import { NumberingService } from "./numbering.service.js";
import { Scheduler } from "./scheduler.js";
import { AI_PROVIDER, DB, ENV, FILE_STORAGE } from "./tokens.js";

export const DB_HANDLE = Symbol("DB_HANDLE");

export async function openDatabase(env: Env): Promise<DatabaseHandle> {
  const handle = createDatabase(env.DATABASE_URL);
  const logger = new Logger("Database");
  if (handle.kind === "pglite" || env.AUTO_MIGRATE) {
    await handle.migrate();
    logger.log(`migrated ${handle.kind}`);
  }
  if (handle.kind === "pglite" || env.AUTO_SEED) {
    const res = await handle.db.execute(sql`select count(*)::int as n from users`);
    const n = Number((res as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
    if (n === 0) {
      await seedAll(handle.db);
      logger.log("seeded reference and demo data");
    }
  }
  return handle;
}

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: DB_HANDLE, inject: [ENV], useFactory: (env: Env) => openDatabase(env) },
    { provide: DB, inject: [DB_HANDLE], useFactory: (h: DatabaseHandle): Database => h.db },
    { provide: FILE_STORAGE, inject: [ENV], useFactory: (env: Env) => new DiskStorage(env.FILE_STORAGE_DIR) },
    { provide: AI_PROVIDER, inject: [ENV], useFactory: (env: Env) => createAiProvider(env) },
    Clock,
    TokenService,
    AccessService,
    AuditService,
    NumberingService,
    EventBus,
    Scheduler,
    FileService,
  ],
  exports: [ENV, DB, DB_HANDLE, FILE_STORAGE, AI_PROVIDER, Clock, TokenService, AccessService, AuditService, NumberingService, EventBus, Scheduler, FileService],
})
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }
}
