import { z } from "zod";

export const idSchema = z.uuid();
export const dateSchema = z.iso.date();
export const dateTimeSchema = z.iso.datetime({ offset: true });
export const labelSchema = z.object({ zh: z.string(), en: z.string() });
export type LabelDto = z.infer<typeof labelSchema>;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.string().optional(),
  keyword: z.string().trim().optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
}
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const versionedSchema = z.object({ version: z.number().int().min(1) });

export const refSchema = z.object({ id: z.uuid(), name: z.string() });
export type Ref = z.infer<typeof refSchema>;

export const auditMetaSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});

export type Envelope<T> = {
  errcode: 0 | string;
  errmsg?: string;
  errParams?: Record<string, unknown>;
  data?: T;
  requestId: string;
};

export const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)));
