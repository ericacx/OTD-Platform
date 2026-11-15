import { Inject, Injectable } from "@nestjs/common";
import type { Lookups } from "@otd/contracts/masterdata";
import { type Database, bases, customers, dictionaries, factories, forwarders, needleTypes, seasons, testAgencies, users } from "@otd/db";
import { CURRENCIES } from "@otd/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { customerScoped } from "../../core/access/scope.js";
import { DB } from "../../core/tokens.js";

@Injectable()
export class LookupService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async all(ctx: AccessContext): Promise<Lookups> {
    const [cust, fac, bas, needles, agencies, fwd, seas, dicts, people] = await Promise.all([
      this.db.select({ id: customers.id, code: customers.code, name: customers.name, nameEn: customers.nameEn }).from(customers).where(and(isNull(customers.deletedAt), eq(customers.status, "ACTIVE"), customerScoped(customers.id, ctx))).orderBy(asc(customers.code)),
      this.db.select({ id: factories.id, code: factories.code, name: factories.name, baseId: factories.baseId }).from(factories).where(isNull(factories.deletedAt)).orderBy(asc(factories.code)),
      this.db.select({ id: bases.id, code: bases.code, name: bases.name }).from(bases).where(isNull(bases.deletedAt)).orderBy(asc(bases.code)),
      this.db.select({ id: needleTypes.id, code: needleTypes.code }).from(needleTypes).orderBy(asc(needleTypes.needles)),
      this.db.select({ id: testAgencies.id, code: testAgencies.code, name: testAgencies.name }).from(testAgencies).where(isNull(testAgencies.deletedAt)).orderBy(asc(testAgencies.code)),
      this.db.select({ id: forwarders.id, code: forwarders.code, name: forwarders.name, type: forwarders.type }).from(forwarders).where(isNull(forwarders.deletedAt)).orderBy(asc(forwarders.code)),
      this.db.select().from(seasons).orderBy(asc(seasons.code)),
      this.db.select().from(dictionaries).where(eq(dictionaries.enabled, true)).orderBy(asc(dictionaries.type), asc(dictionaries.sort)),
      this.db.select({ id: users.id, name: users.name, orgId: users.primaryOrgId }).from(users).where(eq(users.status, "ACTIVE")).orderBy(asc(users.phone)),
    ]);
    const dictionaryMap: Lookups["dictionaries"] = {};
    for (const d of dicts) (dictionaryMap[d.type] ??= []).push({ code: d.code, label: d.label });
    return {
      customers: cust,
      factories: fac,
      bases: bas,
      needleTypes: needles,
      agencies,
      forwarders: fwd,
      seasons: seas.map((s) => ({ code: s.code, label: s.label })),
      dictionaries: dictionaryMap,
      users: people,
      currencies: [...CURRENCIES],
    };
  }
}
