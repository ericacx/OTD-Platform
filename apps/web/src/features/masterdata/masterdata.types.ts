import type { customerUpsertSchema } from "@otd/contracts/masterdata";
import type { z } from "zod";

export type { CustomerDto } from "@otd/contracts/masterdata";
export type CustomerUpsert = z.input<typeof customerUpsertSchema>;
export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };
