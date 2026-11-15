import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  agencyUpsertSchema,
  baseMachineWriteSchema,
  baseUpsertSchema,
  dictionaryUpsertSchema,
  exchangeRateListQuerySchema,
  exchangeRateWriteSchema,
  factoryUpsertSchema,
  forwarderUpsertSchema,
  masterDeleteQuerySchema,
  masterListQuerySchema,
  materialUpsertSchema,
  needleTypeUpsertSchema,
  seasonUpsertSchema,
} from "@otd/contracts/masterdata";
import type { z } from "zod";
import { Access, Permission } from "../../core/access/decorators.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { zod } from "../../core/zod.pipe.js";
import { DictionaryService } from "./dictionary.service.js";
import { FactoryService } from "./factory.service.js";
import { NeedleService } from "./needle.service.js";
import { PartnerService } from "./partner.service.js";

type ListQuery = z.infer<typeof masterListQuerySchema>;
type DeleteQuery = z.infer<typeof masterDeleteQuerySchema>;

@Controller("masterdata")
export class ReferenceDataController {
  constructor(
    private readonly factories: FactoryService,
    private readonly needles: NeedleService,
    private readonly partners: PartnerService,
    private readonly dicts: DictionaryService,
  ) {}

  @Get("bases")
  @Permission("masterdata.factory.view")
  listBases(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.factories.listBases(q);
  }

  @Post("bases")
  @Permission("masterdata.factory.edit")
  createBase(@Access() ctx: AccessContext, @Body(zod(baseUpsertSchema)) body: z.infer<typeof baseUpsertSchema>) {
    return this.factories.createBase(ctx, body);
  }

  @Put("bases/:id")
  @Permission("masterdata.factory.edit")
  updateBase(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(baseUpsertSchema)) body: z.infer<typeof baseUpsertSchema>) {
    return this.factories.updateBase(ctx, id, body);
  }

  @Delete("bases/:id")
  @Permission("masterdata.factory.edit")
  async removeBase(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.factories.removeBase(ctx, id, q.version);
    return null;
  }

  @Get("factories")
  @Permission("masterdata.factory.view")
  listFactories(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.factories.listFactories(q);
  }

  @Get("factories/:id")
  @Permission("masterdata.factory.view")
  getFactory(@Param("id", ParseUUIDPipe) id: string) {
    return this.factories.getFactory(id);
  }

  @Post("factories")
  @Permission("masterdata.factory.edit")
  createFactory(@Access() ctx: AccessContext, @Body(zod(factoryUpsertSchema)) body: z.infer<typeof factoryUpsertSchema>) {
    return this.factories.createFactory(ctx, body);
  }

  @Put("factories/:id")
  @Permission("masterdata.factory.edit")
  updateFactory(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(factoryUpsertSchema)) body: z.infer<typeof factoryUpsertSchema>) {
    return this.factories.updateFactory(ctx, id, body);
  }

  @Delete("factories/:id")
  @Permission("masterdata.factory.edit")
  async removeFactory(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.factories.removeFactory(ctx, id, q.version);
    return null;
  }

  @Get("needle-types")
  @Permission("masterdata.needle.view")
  listNeedles(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.needles.listNeedles(q);
  }

  @Post("needle-types")
  @Permission("masterdata.needle.edit")
  createNeedle(@Access() ctx: AccessContext, @Body(zod(needleTypeUpsertSchema)) body: z.infer<typeof needleTypeUpsertSchema>) {
    return this.needles.createNeedle(ctx, body);
  }

  @Put("needle-types/:id")
  @Permission("masterdata.needle.edit")
  updateNeedle(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(needleTypeUpsertSchema)) body: z.infer<typeof needleTypeUpsertSchema>) {
    return this.needles.updateNeedle(ctx, id, body);
  }

  @Get("base-machines")
  @Permission("masterdata.needle.view")
  listMachines(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.needles.listMachines(q);
  }

  @Post("base-machines")
  @Permission("masterdata.needle.edit")
  createMachine(@Access() ctx: AccessContext, @Body(zod(baseMachineWriteSchema)) body: z.infer<typeof baseMachineWriteSchema>) {
    return this.needles.createMachine(ctx, body);
  }

  @Put("base-machines/:id")
  @Permission("masterdata.needle.edit")
  updateMachine(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(baseMachineWriteSchema)) body: z.infer<typeof baseMachineWriteSchema>) {
    return this.needles.updateMachine(ctx, id, body);
  }

  @Delete("base-machines/:id")
  @Permission("masterdata.needle.edit")
  async removeMachine(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.needles.removeMachine(ctx, id, q.version);
    return null;
  }

  @Get("materials")
  @Permission("masterdata.material.view")
  listMaterials(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.partners.listMaterials(q);
  }

  @Post("materials")
  @Permission("masterdata.material.edit")
  createMaterial(@Access() ctx: AccessContext, @Body(zod(materialUpsertSchema)) body: z.infer<typeof materialUpsertSchema>) {
    return this.partners.createMaterial(ctx, body);
  }

  @Put("materials/:id")
  @Permission("masterdata.material.edit")
  updateMaterial(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(materialUpsertSchema)) body: z.infer<typeof materialUpsertSchema>) {
    return this.partners.updateMaterial(ctx, id, body);
  }

  @Delete("materials/:id")
  @Permission("masterdata.material.edit")
  async removeMaterial(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.partners.removeMaterial(ctx, id, q.version);
    return null;
  }

  @Get("test-agencies")
  @Permission("masterdata.agency.view")
  listAgencies(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.partners.listAgencies(q);
  }

  @Post("test-agencies")
  @Permission("masterdata.agency.edit")
  createAgency(@Access() ctx: AccessContext, @Body(zod(agencyUpsertSchema)) body: z.infer<typeof agencyUpsertSchema>) {
    return this.partners.createAgency(ctx, body);
  }

  @Put("test-agencies/:id")
  @Permission("masterdata.agency.edit")
  updateAgency(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(agencyUpsertSchema)) body: z.infer<typeof agencyUpsertSchema>) {
    return this.partners.updateAgency(ctx, id, body);
  }

  @Delete("test-agencies/:id")
  @Permission("masterdata.agency.edit")
  async removeAgency(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.partners.removeAgency(ctx, id, q.version);
    return null;
  }

  @Get("forwarders")
  @Permission("masterdata.forwarder.view")
  listForwarders(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.partners.listForwarders(q);
  }

  @Post("forwarders")
  @Permission("masterdata.forwarder.edit")
  createForwarder(@Access() ctx: AccessContext, @Body(zod(forwarderUpsertSchema)) body: z.infer<typeof forwarderUpsertSchema>) {
    return this.partners.createForwarder(ctx, body);
  }

  @Put("forwarders/:id")
  @Permission("masterdata.forwarder.edit")
  updateForwarder(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(forwarderUpsertSchema)) body: z.infer<typeof forwarderUpsertSchema>) {
    return this.partners.updateForwarder(ctx, id, body);
  }

  @Delete("forwarders/:id")
  @Permission("masterdata.forwarder.edit")
  async removeForwarder(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.partners.removeForwarder(ctx, id, q.version);
    return null;
  }

  @Get("dictionaries/types")
  @Permission("masterdata.dictionary.view")
  dictionaryTypes() {
    return this.dicts.types();
  }

  @Get("dictionaries")
  @Permission("masterdata.dictionary.view")
  listDictionaries(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.dicts.listDictionaries(q);
  }

  @Post("dictionaries")
  @Permission("masterdata.dictionary.edit")
  createDictionary(@Access() ctx: AccessContext, @Body(zod(dictionaryUpsertSchema)) body: z.infer<typeof dictionaryUpsertSchema>) {
    return this.dicts.createDictionary(ctx, body);
  }

  @Put("dictionaries/:id")
  @Permission("masterdata.dictionary.edit")
  updateDictionary(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(dictionaryUpsertSchema)) body: z.infer<typeof dictionaryUpsertSchema>) {
    return this.dicts.updateDictionary(ctx, id, body);
  }

  @Delete("dictionaries/:id")
  @Permission("masterdata.dictionary.edit")
  async disableDictionary(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.dicts.disableDictionary(ctx, id, q.version);
    return null;
  }

  @Get("exchange-rates")
  @Permission("masterdata.dictionary.view")
  listRates(@Query(zod(exchangeRateListQuerySchema)) q: z.infer<typeof exchangeRateListQuerySchema>) {
    return this.dicts.listRates(q);
  }

  @Post("exchange-rates")
  @Permission("masterdata.dictionary.edit")
  createRate(@Access() ctx: AccessContext, @Body(zod(exchangeRateWriteSchema)) body: z.infer<typeof exchangeRateWriteSchema>) {
    return this.dicts.createRate(ctx, body);
  }

  @Put("exchange-rates/:id")
  @Permission("masterdata.dictionary.edit")
  updateRate(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Body(zod(exchangeRateWriteSchema)) body: z.infer<typeof exchangeRateWriteSchema>) {
    return this.dicts.updateRate(ctx, id, body);
  }

  @Delete("exchange-rates/:id")
  @Permission("masterdata.dictionary.edit")
  async removeRate(@Access() ctx: AccessContext, @Param("id", ParseUUIDPipe) id: string, @Query(zod(masterDeleteQuerySchema)) q: DeleteQuery) {
    await this.dicts.removeRate(ctx, id, q.version);
    return null;
  }

  @Get("seasons")
  @Permission("masterdata.dictionary.view")
  listSeasons(@Query(zod(masterListQuerySchema)) q: ListQuery) {
    return this.dicts.listSeasons(q);
  }

  @Post("seasons")
  @Permission("masterdata.dictionary.edit")
  createSeason(@Access() ctx: AccessContext, @Body(zod(seasonUpsertSchema)) body: z.infer<typeof seasonUpsertSchema>) {
    return this.dicts.createSeason(ctx, body);
  }

  @Put("seasons/:code")
  @Permission("masterdata.dictionary.edit")
  updateSeason(@Access() ctx: AccessContext, @Param("code") code: string, @Body(zod(seasonUpsertSchema)) body: z.infer<typeof seasonUpsertSchema>) {
    return this.dicts.updateSeason(ctx, code, body);
  }
}
