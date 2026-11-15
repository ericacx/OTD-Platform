import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Database, type DbOrTx, domainEvents } from "@otd/db";
import { eq } from "drizzle-orm";
import { DB } from "./tokens.js";

export type DomainEvent = {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
};

type StoredEvent = DomainEvent & { id: string; payload: Record<string, unknown> };
export type EventHandler = (event: StoredEvent) => Promise<void>;

@Injectable()
export class EventBus {
  private readonly logger = new Logger("EventBus");
  private readonly handlers: { pattern: string; name: string; handler: EventHandler }[] = [];

  constructor(@Inject(DB) private readonly db: Database) {}

  on(pattern: string, name: string, handler: EventHandler): void {
    this.handlers.push({ pattern, name, handler });
  }

  async record(events: DomainEvent[], tx: DbOrTx): Promise<StoredEvent[]> {
    if (!events.length) return [];
    const rows = await tx
      .insert(domainEvents)
      .values(events.map((e) => ({ type: e.type, aggregateType: e.aggregateType, aggregateId: e.aggregateId, payload: e.payload ?? {} })))
      .returning();
    return rows.map((r) => ({ id: r.id, type: r.type, aggregateType: r.aggregateType, aggregateId: r.aggregateId, payload: r.payload }));
  }

  async dispatch(events: StoredEvent[]): Promise<void> {
    for (const event of events) {
      const matching = this.handlers.filter((h) => matches(h.pattern, event.type));
      const errors: string[] = [];
      for (const h of matching) {
        try {
          await h.handler(event);
        } catch (err) {
          const msg = `${h.name}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          this.logger.error(msg);
        }
      }
      await this.db
        .update(domainEvents)
        .set(errors.length ? { attempts: 1, lastError: errors.join("; ") } : { processedAt: new Date(), attempts: 1 })
        .where(eq(domainEvents.id, event.id));
    }
  }

  async publish(events: DomainEvent[], tx: DbOrTx = this.db): Promise<void> {
    await this.dispatch(await this.record(events, tx));
  }
}

function matches(pattern: string, type: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

export async function inTransaction<T>(db: Database, bus: EventBus, work: (tx: DbOrTx, emit: (e: DomainEvent) => void) => Promise<T>): Promise<T> {
  const pending: DomainEvent[] = [];
  let stored: StoredEvent[] = [];
  const result = await db.transaction(async (tx) => {
    const value = await work(tx, (e) => pending.push(e));
    stored = await bus.record(pending, tx);
    return value;
  });
  await bus.dispatch(stored);
  return result;
}
