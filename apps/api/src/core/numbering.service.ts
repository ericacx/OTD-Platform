import { Inject, Injectable } from "@nestjs/common";
import { type Database, type DbOrTx, nextSequence } from "@otd/db";
import { DOC_TYPES, type DocType, formatDocNo, periodKey } from "@otd/shared";
import { Clock } from "./clock.js";
import { DB } from "./tokens.js";

@Injectable()
export class NumberingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async next(type: DocType, tx: DbOrTx = this.db, date: Date = this.clock.now()): Promise<string> {
    const seq = await nextSequence(tx, DOC_TYPES[type].prefix, periodKey(type, date));
    return formatDocNo(type, date, seq);
  }
}
