import { Inject, Injectable } from "@nestjs/common";
import type { TodoBoard, TodoItem, todoCreateSchema } from "@otd/contracts/todo";
import { type Database, type DbOrTx, customers, todos } from "@otd/db";
import { and, asc, eq, inArray, like, ne } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { Clock } from "../../core/clock.js";
import { assertFound, forbidden } from "../../core/errors.js";
import { iso } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

export type TodoInput = {
  fingerprint: string;
  source: "FLOW" | "PATROL" | "MANUAL" | "AI";
  action: string;
  title: string;
  description?: string | null;
  docType?: string | null;
  docId?: string | null;
  docNo?: string | null;
  link?: string | null;
  customerId?: string | null;
  assigneeId: string;
  dueAt?: Date | null;
};

const DAY = 86_400_000;

@Injectable()
export class TodoService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async upsert(input: TodoInput, tx: DbOrTx = this.db): Promise<void> {
    const values = {
      source: input.source,
      action: input.action,
      title: input.title,
      description: input.description ?? null,
      docType: input.docType ?? null,
      docId: input.docId ?? null,
      docNo: input.docNo ?? null,
      link: input.link ?? null,
      customerId: input.customerId ?? null,
      assigneeId: input.assigneeId,
      dueAt: input.dueAt ?? null,
      fingerprint: input.fingerprint,
      status: "OPEN",
      doneAt: null,
    };
    await tx.insert(todos).values(values).onConflictDoUpdate({ target: todos.fingerprint, set: values });
  }

  async close(fingerprint: string, tx: DbOrTx = this.db): Promise<void> {
    await tx.update(todos).set({ status: "DONE", doneAt: this.clock.now() }).where(and(eq(todos.fingerprint, fingerprint), eq(todos.status, "OPEN")));
  }

  async closeByPrefix(prefix: string, tx: DbOrTx = this.db): Promise<void> {
    await tx.update(todos).set({ status: "DONE", doneAt: this.clock.now() }).where(and(like(todos.fingerprint, `${prefix}%`), eq(todos.status, "OPEN")));
  }

  async closeForDoc(docType: string, docId: string, tx: DbOrTx = this.db): Promise<void> {
    await tx.update(todos).set({ status: "DONE", doneAt: this.clock.now() }).where(and(eq(todos.docType, docType), eq(todos.docId, docId), eq(todos.status, "OPEN")));
  }

  async createManual(ctx: AccessContext, input: z.infer<typeof todoCreateSchema>): Promise<TodoItem> {
    const id = `manual:${ctx.userId}:${this.clock.now().getTime()}`;
    await this.upsert({ fingerprint: id, source: "MANUAL", action: "manual", title: input.title, description: input.description ?? null, link: input.link ?? null, assigneeId: input.assigneeId ?? ctx.userId, dueAt: input.dueAt ? new Date(input.dueAt) : null });
    const row = assertFound((await this.db.select().from(todos).where(eq(todos.fingerprint, id)))[0]);
    return (await this.toItems([row]))[0]!;
  }

  async complete(ctx: AccessContext, id: string): Promise<void> {
    const row = assertFound((await this.db.select().from(todos).where(eq(todos.id, id)))[0]);
    if (row.assigneeId !== ctx.userId && !ctx.permissions.has("iam.user.edit")) throw forbidden("todo.owner");
    await this.db.update(todos).set({ status: "DONE", doneAt: this.clock.now() }).where(eq(todos.id, id));
  }

  async board(ctx: AccessContext, userId: string = ctx.userId): Promise<TodoBoard> {
    const rows = await this.db.select().from(todos).where(and(eq(todos.assigneeId, userId), eq(todos.status, "OPEN"))).orderBy(asc(todos.dueAt), asc(todos.createdAt));
    const items = await this.toItems(rows);
    const now = this.clock.now();
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY);
    const overdue = items.filter((i) => i.dueAt && new Date(i.dueAt) < now);
    const today = items.filter((i) => i.dueAt && new Date(i.dueAt) >= now && new Date(i.dueAt) < endOfToday);
    const later = items.filter((i) => !i.dueAt || new Date(i.dueAt) >= endOfToday);
    const byDocType: Record<string, number> = {};
    for (const i of items) byDocType[i.docType ?? "other"] = (byDocType[i.docType ?? "other"] ?? 0) + 1;
    return { overdue, today, later, counts: { total: items.length, overdue: overdue.length, today: today.length, later: later.length, byDocType } };
  }

  async openFor(docType: string, docId: string): Promise<TodoItem[]> {
    return this.toItems(await this.db.select().from(todos).where(and(eq(todos.docType, docType), eq(todos.docId, docId), ne(todos.status, "DONE"))));
  }

  private async toItems(rows: (typeof todos.$inferSelect)[]): Promise<TodoItem[]> {
    const custIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const names = custIds.length ? new Map((await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds))).map((c) => [c.id, c.name])) : new Map<string, string>();
    const now = this.clock.now().getTime();
    return rows.map((r) => ({
      id: r.id,
      source: r.source as TodoItem["source"],
      action: r.action,
      title: r.title,
      description: r.description,
      docType: r.docType,
      docId: r.docId,
      docNo: r.docNo,
      link: r.link,
      customerId: r.customerId,
      customerName: r.customerId ? (names.get(r.customerId) ?? null) : null,
      dueAt: iso(r.dueAt),
      overdueDays: r.dueAt && r.dueAt.getTime() < now ? Math.floor((now - r.dueAt.getTime()) / DAY) : 0,
      status: r.status as TodoItem["status"],
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
