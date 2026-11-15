import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { type Database, type DbOrTx, files, uuidv7 } from "@otd/db";
import { eq } from "drizzle-orm";
import type { AccessContext } from "../access/access.types.js";
import { badRequest, notFound } from "../errors.js";
import { DB, FILE_STORAGE } from "../tokens.js";
import type { FileStorage } from "./file-storage.js";

const ALLOWED: Record<string, string[]> = {
  "application/pdf": ["%PDF"],
  "image/png": ["\x89PNG"],
  "image/jpeg": ["\xff\xd8\xff"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["PK"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["PK"],
  "text/plain": [""],
  "text/csv": [""],
};
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type StoredFile = { id: string; filename: string; contentType: string; size: number; createdAt: string };

@Injectable()
export class FileService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async save(ctx: AccessContext | null, input: { filename: string; contentType: string; data: Buffer; ownerType?: string; ownerId?: string }, tx: DbOrTx = this.db): Promise<StoredFile> {
    if (input.data.length > MAX_FILE_BYTES) throw badRequest("file too large");
    const signatures = ALLOWED[input.contentType];
    if (!signatures) throw badRequest(`unsupported type ${input.contentType}`);
    const head = input.data.subarray(0, 8).toString("latin1");
    if (!signatures.some((s) => head.startsWith(s))) throw badRequest("file content does not match its type");
    const id = uuidv7();
    const storageKey = `${new Date().toISOString().slice(0, 7)}/${id}`;
    await this.storage.put(storageKey, input.data);
    const sha256 = createHash("sha256").update(input.data).digest("hex");
    const row = (
      await tx
        .insert(files)
        .values({ id, storageKey, filename: input.filename, contentType: input.contentType, size: input.data.length, sha256, ownerType: input.ownerType ?? null, ownerId: input.ownerId ?? null, uploadedBy: ctx && !ctx.system ? ctx.userId : null })
        .returning()
    )[0]!;
    return { id: row.id, filename: row.filename, contentType: row.contentType, size: row.size, createdAt: row.createdAt.toISOString() };
  }

  async attach(id: string, ownerType: string, ownerId: string, tx: DbOrTx = this.db): Promise<void> {
    await tx.update(files).set({ ownerType, ownerId }).where(eq(files.id, id));
  }

  async meta(id: string) {
    return (await this.db.select().from(files).where(eq(files.id, id)))[0];
  }

  async read(id: string): Promise<{ filename: string; contentType: string; data: Buffer }> {
    const row = await this.meta(id);
    if (!row) throw notFound();
    return { filename: row.filename, contentType: row.contentType, data: await this.storage.get(row.storageKey) };
  }
}
