import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import type {
  DictionaryDto,
  DictionaryTypeDto,
  ExchangeRateDto,
  SeasonDto,
  dictionaryUpsertSchema,
  exchangeRateListQuerySchema,
  exchangeRateWriteSchema,
  masterListQuerySchema,
  seasonUpsertSchema,
} from "@otd/contracts/masterdata";
import { type Database, dictionaries, exchangeRates, seasons } from "@otd/db";
import { type SQL, and, asc, desc, eq, ilike, lte, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { assertFound, duplicate, versionConflict } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type DictRow = typeof dictionaries.$inferSelect;
type RateRow = typeof exchangeRates.$inferSelect;
type SeasonRow = typeof seasons.$inferSelect;

const toDict = (d: DictRow): DictionaryDto => ({ id: d.id, type: d.type, code: d.code, label: d.label, sort: d.sort, enabled: d.enabled, version: d.version });
const toRate = (r: RateRow): ExchangeRateDto => ({ id: r.id, currency: r.currency, rateToCny: r.rateToCny, effectiveDate: r.effectiveDate, version: r.version });
const toSeason = (s: SeasonRow): SeasonDto => ({ code: s.code, label: s.label, startDate: s.startDate, endDate: s.endDate, version: s.version });

@Injectable()
export class DictionaryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async types(): Promise<DictionaryTypeDto[]> {
    const rows = await this.db
      .select({ type: dictionaries.type, count: countAll, enabledCount: sql<number>`cast(count(*) filter (where ${dictionaries.enabled}) as int)` })
      .from(dictionaries)
      .groupBy(dictionaries.type)
      .orderBy(asc(dictionaries.type));
    return rows;
  }

  async listDictionaries(q: z.infer<typeof masterListQuerySchema>): Promise<Page<DictionaryDto>> {
    const conds: SQL[] = [];
    if (q.type) conds.push(eq(dictionaries.type, q.type));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(dictionaries.code, kw), sql`${dictionaries.label}->>'zh' ilike ${kw}`, sql`${dictionaries.label}->>'en' ilike ${kw}`)!);
    const where = conds.length ? and(...conds) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(dictionaries).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(dictionaries).where(where).orderBy(asc(dictionaries.type), asc(dictionaries.sort), asc(dictionaries.code)).limit(limit).offset(offset)).map(toDict),
    );
  }

  async createDictionary(ctx: AccessContext, input: z.infer<typeof dictionaryUpsertSchema>): Promise<DictionaryDto> {
    return toDict(
      await this.db.transaction(async (tx) => {
        if ((await tx.select({ id: dictionaries.id }).from(dictionaries).where(and(eq(dictionaries.type, input.type), eq(dictionaries.code, input.code))))[0]) throw duplicate("code");
        const { version: _v, ...data } = input;
        const created = (await tx.insert(dictionaries).values({ ...data, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "masterdata.dictionary.create", objectType: "dictionary", objectId: created.id, docNo: `${created.type}.${created.code}` }, tx);
        return created;
      }),
    );
  }

  async updateDictionary(ctx: AccessContext, id: string, input: z.infer<typeof dictionaryUpsertSchema>): Promise<DictionaryDto> {
    return toDict(
      await this.db.transaction(async (tx) => {
        const before = assertFound((await tx.select().from(dictionaries).where(eq(dictionaries.id, id)))[0]);
        if (input.version !== undefined && input.version !== before.version) throw versionConflict();
        if ((await tx.select({ id: dictionaries.id }).from(dictionaries).where(and(eq(dictionaries.type, input.type), eq(dictionaries.code, input.code), ne(dictionaries.id, id))))[0]) throw duplicate("code");
        const { version: _v, ...patch } = input;
        const updated = (await tx.update(dictionaries).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(dictionaries.id, id), eq(dictionaries.version, before.version))).returning())[0];
        if (!updated) throw versionConflict();
        await this.audit.log(ctx, { action: "masterdata.dictionary.update", objectType: "dictionary", objectId: id, docNo: `${before.type}.${before.code}`, diff: diffOf(before, patch) }, tx);
        return updated;
      }),
    );
  }

  async disableDictionary(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(dictionaries).where(eq(dictionaries.id, id)))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.update(dictionaries).set({ enabled: false, version: before.version + 1, updatedBy: ctx.userId }).where(eq(dictionaries.id, id));
      await this.audit.log(ctx, { action: "masterdata.dictionary.disable", objectType: "dictionary", objectId: id, docNo: `${before.type}.${before.code}` }, tx);
    });
  }

  async listRates(q: z.infer<typeof exchangeRateListQuerySchema>): Promise<Page<ExchangeRateDto>> {
    const conds: SQL[] = [];
    if (q.currency) conds.push(eq(exchangeRates.currency, q.currency.toUpperCase()));
    if (q.asOf) {
      conds.push(lte(exchangeRates.effectiveDate, q.asOf));
      const rows = await this.db.select().from(exchangeRates).where(and(...conds)).orderBy(asc(exchangeRates.currency), desc(exchangeRates.effectiveDate));
      const latest = rows.filter((r, i) => i === 0 || rows[i - 1]!.currency !== r.currency).map(toRate);
      const start = (q.page - 1) * q.pageSize;
      return { items: latest.slice(start, start + q.pageSize), total: latest.length, page: q.page, pageSize: q.pageSize };
    }
    const where = conds.length ? and(...conds) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(exchangeRates).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(exchangeRates).where(where).orderBy(desc(exchangeRates.effectiveDate), asc(exchangeRates.currency)).limit(limit).offset(offset)).map(toRate),
    );
  }

  async createRate(ctx: AccessContext, input: z.infer<typeof exchangeRateWriteSchema>): Promise<ExchangeRateDto> {
    return toRate(
      await this.db.transaction(async (tx) => {
        const currency = input.currency.toUpperCase();
        if ((await tx.select({ id: exchangeRates.id }).from(exchangeRates).where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.effectiveDate, input.effectiveDate))))[0]) throw duplicate("effectiveDate");
        const created = (await tx.insert(exchangeRates).values({ currency, rateToCny: input.rateToCny, effectiveDate: input.effectiveDate, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "masterdata.rate.create", objectType: "exchangeRate", objectId: created.id, docNo: `${currency}@${created.effectiveDate}`, diff: { rateToCny: created.rateToCny } }, tx);
        return created;
      }),
    );
  }

  async updateRate(ctx: AccessContext, id: string, input: z.infer<typeof exchangeRateWriteSchema>): Promise<ExchangeRateDto> {
    return toRate(
      await this.db.transaction(async (tx) => {
        const before = assertFound((await tx.select().from(exchangeRates).where(eq(exchangeRates.id, id)))[0]);
        if (input.version !== undefined && input.version !== before.version) throw versionConflict();
        const currency = input.currency.toUpperCase();
        if ((await tx.select({ id: exchangeRates.id }).from(exchangeRates).where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.effectiveDate, input.effectiveDate), ne(exchangeRates.id, id))))[0]) throw duplicate("effectiveDate");
        const patch = { currency, rateToCny: input.rateToCny, effectiveDate: input.effectiveDate };
        const updated = (await tx.update(exchangeRates).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(exchangeRates.id, id), eq(exchangeRates.version, before.version))).returning())[0];
        if (!updated) throw versionConflict();
        await this.audit.log(ctx, { action: "masterdata.rate.update", objectType: "exchangeRate", objectId: id, docNo: `${before.currency}@${before.effectiveDate}`, diff: diffOf(before, patch) }, tx);
        return updated;
      }),
    );
  }

  async removeRate(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(exchangeRates).where(eq(exchangeRates.id, id)))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.delete(exchangeRates).where(eq(exchangeRates.id, id));
      await this.audit.log(ctx, { action: "masterdata.rate.delete", objectType: "exchangeRate", objectId: id, docNo: `${before.currency}@${before.effectiveDate}`, diff: { rateToCny: before.rateToCny } }, tx);
    });
  }

  async listSeasons(q: z.infer<typeof masterListQuerySchema>): Promise<Page<SeasonDto>> {
    const kw = likeKeyword(q.keyword);
    const where = kw ? or(ilike(seasons.code, kw), sql`${seasons.label}->>'zh' ilike ${kw}`) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(seasons).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(seasons).where(where).orderBy(asc(seasons.code)).limit(limit).offset(offset)).map(toSeason),
    );
  }

  async createSeason(ctx: AccessContext, input: z.infer<typeof seasonUpsertSchema>): Promise<SeasonDto> {
    return toSeason(
      await this.db.transaction(async (tx) => {
        if ((await tx.select({ code: seasons.code }).from(seasons).where(eq(seasons.code, input.code)))[0]) throw duplicate("code");
        const created = (await tx.insert(seasons).values({ code: input.code, label: input.label, startDate: input.startDate ?? null, endDate: input.endDate ?? null, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "masterdata.season.create", objectType: "season", objectId: created.code, docNo: created.code }, tx);
        return created;
      }),
    );
  }

  async updateSeason(ctx: AccessContext, code: string, input: z.infer<typeof seasonUpsertSchema>): Promise<SeasonDto> {
    return toSeason(
      await this.db.transaction(async (tx) => {
        const before = assertFound((await tx.select().from(seasons).where(eq(seasons.code, code)))[0]);
        if (input.version !== undefined && input.version !== before.version) throw versionConflict();
        const patch = { label: input.label, startDate: input.startDate ?? null, endDate: input.endDate ?? null };
        const updated = (await tx.update(seasons).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(seasons.code, code), eq(seasons.version, before.version))).returning())[0];
        if (!updated) throw versionConflict();
        await this.audit.log(ctx, { action: "masterdata.season.update", objectType: "season", objectId: code, docNo: code, diff: diffOf(before, patch) }, tx);
        return updated;
      }),
    );
  }
}
