import { DOC_TYPES, type DocType, formatDocNo, periodKey } from "@otd/shared";
import type { Database } from "../../client.js";
import { nextSequence } from "../../sequence.js";

export { nextSequence };

export type SeedRefs = {
  users: Record<string, string>;
  customers: Record<string, string>;
  orgs: Record<string, string>;
  roles: Record<string, string>;
};

export type SeedContext = SeedRefs & {
  db: Database;
  now: Date;
  day: (offsetDays: number) => string;
  at: (offsetDays: number, hour?: number) => Date;
  docNo: (type: DocType, date?: Date) => Promise<string>;
  user: (phone: string) => string;
  customer: (code: string) => string;
  org: (code: string) => string;
  styles: Record<string, string>;
  orders: Record<string, string>;
  factories: Record<string, string>;
  agencies: Record<string, string>;
  strategies: Record<string, string>;
};

export function createSeedContext(db: Database, refs: SeedRefs, now = new Date()): SeedContext {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    ...refs,
    db,
    now,
    day: (offset) => new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10),
    at: (offset, hour = 9) => new Date(base.getTime() + offset * 86_400_000 + hour * 3_600_000),
    docNo: async (type, date = now) => {
      const period = periodKey(type, date);
      const seq = await nextSequence(db, DOC_TYPES[type].prefix, period);
      return formatDocNo(type, date, seq);
    },
    user: (phone) => refs.users[phone] ?? fail(`user ${phone}`),
    customer: (code) => refs.customers[code] ?? fail(`customer ${code}`),
    org: (code) => refs.orgs[code] ?? fail(`org ${code}`),
    styles: {},
    orders: {},
    factories: {},
    agencies: {},
    strategies: {},
  };
}

function fail(what: string): never {
  throw new Error(`seed reference missing: ${what}`);
}
