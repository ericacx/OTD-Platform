import { boolean, date, integer, jsonb, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "../id.js";

export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const ts = () => timestamp({ withTimezone: true, mode: "date" });
export const day = () => date({ mode: "string" });
export const money = () => numeric({ precision: 18, scale: 4, mode: "number" });
export const qty = () => numeric({ precision: 14, scale: 3, mode: "number" });
export const rate = () => numeric({ precision: 9, scale: 4, mode: "number" });
export const label = () => jsonb().$type<{ zh: string; en: string }>();
export const flag = () => boolean().notNull().default(false);

export const auditColumns = {
  createdAt: ts().notNull().defaultNow(),
  createdBy: uuid(),
  updatedAt: ts()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: uuid(),
  version: integer().notNull().default(1),
};

export const ownershipColumns = {
  ownerId: uuid().notNull(),
  orgId: uuid().notNull(),
  customerId: uuid().notNull(),
};

export const docNoColumn = () => text().notNull().unique();
export const statusColumn = () => text().notNull();
