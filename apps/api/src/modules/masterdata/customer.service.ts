import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import type { CustomerDto, customerUpsertSchema, masterListQuerySchema } from "@otd/contracts/masterdata";
import { type Database, customers } from "@otd/db";
import { type SQL, and, asc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { customerScoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { assertFound, duplicate, versionConflict } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type Row = typeof customers.$inferSelect;

export function toCustomerDto(c: Row): CustomerDto {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    nameEn: c.nameEn,
    logoText: c.logoText,
    settlementEntity: c.settlementEntity,
    paymentTermsDays: c.paymentTermsDays,
    currency: c.currency,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    aiAllowed: c.aiAllowed,
    status: c.status,
    version: c.version,
  };
}

@Injectable()
export class CustomerService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AccessContext, q: z.infer<typeof masterListQuerySchema>): Promise<Page<CustomerDto>> {
    const conds: SQL[] = [isNull(customers.deletedAt), customerScoped(customers.id, ctx)];
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(customers.code, kw), ilike(customers.name, kw), ilike(customers.nameEn, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(customers).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(customers).where(where).orderBy(asc(customers.code)).limit(limit).offset(offset)).map(toCustomerDto),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<CustomerDto> {
    return toCustomerDto(assertFound((await this.db.select().from(customers).where(and(eq(customers.id, id), customerScoped(customers.id, ctx))))[0]));
  }

  async create(ctx: AccessContext, input: z.infer<typeof customerUpsertSchema>): Promise<CustomerDto> {
    if ((await this.db.select({ id: customers.id }).from(customers).where(eq(customers.code, input.code)))[0]) throw duplicate("code");
    const { version: _v, ...data } = input;
    const row = await this.db.transaction(async (tx) => {
      const created = (await tx.insert(customers).values({ ...data, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "masterdata.customer.create", objectType: "customer", objectId: created.id, docNo: created.code }, tx);
      return created;
    });
    return toCustomerDto(row);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof customerUpsertSchema>): Promise<CustomerDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(customers).where(eq(customers.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      if ((await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.code, input.code), ne(customers.id, id))))[0]) throw duplicate("code");
      const { version: _v, ...patch } = input;
      const updated = (await tx.update(customers).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(eq(customers.id, id)).returning())[0]!;
      await this.audit.log(ctx, { action: "masterdata.customer.update", objectType: "customer", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
      return updated;
    });
    return toCustomerDto(row);
  }
}
