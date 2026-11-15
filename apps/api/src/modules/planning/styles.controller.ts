import { Controller, Get, Inject, Query } from "@nestjs/common";
import { type StyleOptionDto, styleListQuerySchema } from "@otd/contracts/planning";
import { type Database, customers, styles } from "@otd/db";
import { type SQL, and, asc, eq, ilike, or } from "drizzle-orm";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { scoped } from "../../core/access/scope.js";
import { likeKeyword } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { zod } from "../../core/zod.pipe.js";

@Controller("styles")
export class StylesController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  @Permission("planning.planning.view", "sample.sample.view", "sample.library.view", "testing.request.view", "testing.report.view", "order.order.create", "order.order.edit")
  async list(@Access() ctx: AccessContext, @Query(zod(styleListQuerySchema)) q: z.infer<typeof styleListQuerySchema>): Promise<StyleOptionDto[]> {
    const conds: SQL[] = [scoped(styles, ctx)];
    if (q.customerId) conds.push(eq(styles.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw), ilike(styles.nameEn, kw))!);
    const rows = await this.db
      .select({ s: styles, customerName: customers.name })
      .from(styles)
      .innerJoin(customers, eq(customers.id, styles.customerId))
      .where(and(...conds))
      .orderBy(asc(styles.styleNo))
      .limit(q.limit);
    return rows.map(({ s, customerName }) => ({ id: s.id, styleNo: s.styleNo, nameZh: s.nameZh, nameEn: s.nameEn, seasonCode: s.seasonCode, productCode: s.productCode, customerId: s.customerId, customerName }));
  }
}
