import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { customerUpsertSchema, masterListQuerySchema } from "@otd/contracts/masterdata";
import type { z } from "zod";
import { Access, Authenticated, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { CustomerService } from "./customer.service.js";
import { LookupService } from "./lookup.service.js";

@Controller()
export class MasterDataController {
  constructor(
    private readonly customers: CustomerService,
    private readonly lookups: LookupService,
  ) {}

  @Get("lookups")
  @Authenticated()
  allLookups(@Access() ctx: AccessContext) {
    return this.lookups.all(ctx);
  }

  @Get("masterdata/customers")
  @Permission("masterdata.customer.view", "flow.customer.view")
  listCustomers(@Access() ctx: AccessContext, @Query(zod(masterListQuerySchema)) q: z.infer<typeof masterListQuerySchema>) {
    return this.customers.list(ctx, q);
  }

  @Get("masterdata/customers/:id")
  @Permission("masterdata.customer.view", "flow.customer.view")
  getCustomer(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(ctx, id);
  }

  @Post("masterdata/customers")
  @Permission("masterdata.customer.edit")
  createCustomer(@Access() ctx: AccessContext, @Body(zod(customerUpsertSchema)) body: z.infer<typeof customerUpsertSchema>) {
    return this.customers.create(ctx, body);
  }

  @Put("masterdata/customers/:id")
  @Permission("masterdata.customer.edit")
  updateCustomer(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(customerUpsertSchema)) body: z.infer<typeof customerUpsertSchema>) {
    return this.customers.update(ctx, id, body);
  }
}
