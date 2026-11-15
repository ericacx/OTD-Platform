import { Controller, Get, Inject } from "@nestjs/common";
import type { Database } from "@otd/db";
import { sql } from "drizzle-orm";
import { Public } from "./core/access/decorators.js";
import { DB } from "./core/tokens.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get("live")
  @Public()
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @Public()
  async ready() {
    await this.db.execute(sql`select 1`);
    return { status: "ok", database: "up" };
  }
}
