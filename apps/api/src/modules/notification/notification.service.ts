import { Inject, Injectable } from "@nestjs/common";
import type { NotificationDto } from "@otd/contracts/todo";
import { type Database, type DbOrTx, notifications } from "@otd/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { Clock } from "../../core/clock.js";
import { iso } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

@Injectable()
export class NotificationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async notify(userIds: string[], message: { type: string; title: string; body?: string | null; link?: string | null }, tx: DbOrTx = this.db): Promise<void> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await tx.insert(notifications).values(unique.map((userId) => ({ userId, type: message.type, title: message.title, body: message.body ?? null, link: message.link ?? null })));
  }

  async list(ctx: AccessContext, limit = 30): Promise<{ items: NotificationDto[]; unread: number }> {
    const rows = await this.db.select().from(notifications).where(eq(notifications.userId, ctx.userId)).orderBy(desc(notifications.createdAt)).limit(limit);
    const unread = (await this.db.select({ n: sql<number>`cast(count(*) as int)` }).from(notifications).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt))))[0]!.n;
    return { items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, readAt: iso(r.readAt), createdAt: r.createdAt.toISOString() })), unread };
  }

  async markRead(ctx: AccessContext, id?: string): Promise<void> {
    const conds = [eq(notifications.userId, ctx.userId), isNull(notifications.readAt)];
    if (id) conds.push(eq(notifications.id, id));
    await this.db.update(notifications).set({ readAt: this.clock.now() }).where(and(...conds));
  }
}
