import { Inject, Injectable } from "@nestjs/common";
import type { FlowRuntime, RuleKind } from "@otd/contracts/flow";
import { type Database, type DbOrTx, type FlowSnapshot, type ServiceItemEffect, customerFlowVersions, customerFlows, customers, rulePacks, serviceItems } from "@otd/db";
import type { GateCode, NodeCode } from "@otd/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "../../core/errors.js";
import { DB } from "../../core/tokens.js";
import { allOnRuntime, computeRuntime, effectiveParams } from "./flow-rules.js";

const CACHE_LIMIT = 500;

@Injectable()
export class FlowConfigService {
  private readonly cache = new Map<string, FlowRuntime>();

  constructor(@Inject(DB) private readonly db: Database) {}

  async currentVersionId(customerId: string, db: DbOrTx = this.db): Promise<string | null> {
    const row = (await db.select({ v: customerFlows.currentVersionId }).from(customerFlows).where(eq(customerFlows.customerId, customerId)))[0];
    return row?.v ?? null;
  }

  async enabledNodes(customerId: string, versionId?: string | null, db: DbOrTx = this.db): Promise<FlowRuntime> {
    const targetId = versionId ?? (await this.currentVersionId(customerId, db));
    if (!targetId) {
      const cust = (await db.select({ terms: customers.paymentTermsDays }).from(customers).where(eq(customers.id, customerId)))[0];
      return { customerId, versionId: null, versionNo: null, configured: false, ...allOnRuntime(), params: effectiveParams(null, cust?.terms ?? 60) };
    }
    const hit = this.cache.get(targetId);
    if (hit && hit.customerId === customerId) return hit;
    const version = (await db.select().from(customerFlowVersions).where(and(eq(customerFlowVersions.id, targetId), eq(customerFlowVersions.customerId, customerId))))[0];
    if (!version) throw notFound("flowVersion");
    const runtime = await this.runtimeOf(customerId, version.snapshot, { versionId: version.id, versionNo: version.versionNo }, db);
    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(targetId, runtime);
    return runtime;
  }

  async isNodeEnabled(customerId: string, node: NodeCode, versionId?: string | null, db: DbOrTx = this.db): Promise<boolean> {
    return (await this.enabledNodes(customerId, versionId, db)).nodes.includes(node);
  }

  async gateConditions(customerId: string, gate: GateCode, versionId?: string | null, db: DbOrTx = this.db): Promise<string[]> {
    return (await this.enabledNodes(customerId, versionId, db)).gateConditions[gate];
  }

  async rulePack(kind: RuleKind, customerId?: string | null, db: DbOrTx = this.db): Promise<Record<string, unknown>> {
    const rows = await db.select().from(rulePacks).where(and(eq(rulePacks.kind, kind), eq(rulePacks.enabled, true)));
    const base = rows.find((r) => r.customerId === null);
    const override = customerId ? rows.find((r) => r.customerId === customerId) : undefined;
    return { ...(base?.params ?? {}), ...(override?.params ?? {}) };
  }

  async runtimeOf(customerId: string, snapshot: FlowSnapshot, meta: { versionId: string | null; versionNo: number | null }, db: DbOrTx = this.db): Promise<FlowRuntime> {
    const effects = await this.effectsFor(snapshot, db);
    const cust = (await db.select({ terms: customers.paymentTermsDays }).from(customers).where(eq(customers.id, customerId)))[0];
    return {
      customerId,
      versionId: meta.versionId,
      versionNo: meta.versionNo,
      configured: meta.versionId !== null,
      ...computeRuntime(snapshot, (code) => effects.get(code)),
      params: effectiveParams(snapshot.params, cust?.terms ?? 60),
    };
  }

  async effectsFor(snapshot: FlowSnapshot, db: DbOrTx = this.db): Promise<Map<string, ServiceItemEffect>> {
    const missing = snapshot.modules.flatMap((m) => m.items.filter((i) => !i.effects).map((i) => i.itemCode));
    if (!missing.length) return new Map();
    const rows = await db.select({ code: serviceItems.code, effects: serviceItems.effects }).from(serviceItems).where(inArray(serviceItems.code, [...new Set(missing)]));
    return new Map(rows.map((r) => [r.code, r.effects]));
  }

  async liveEffects(codes: string[], db: DbOrTx = this.db): Promise<Map<string, ServiceItemEffect>> {
    if (!codes.length) return new Map();
    const rows = await db.select({ code: serviceItems.code, effects: serviceItems.effects }).from(serviceItems).where(and(inArray(serviceItems.code, [...new Set(codes)]), isNull(serviceItems.deletedAt)));
    return new Map(rows.map((r) => [r.code, r.effects]));
  }
}
