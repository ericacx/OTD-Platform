import { DATA_SCOPES, MENU, menuPermissionCodes, pickLabel, type MenuGroup } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { cn } from "@/lib/utils";

import { useGrantRoleMutation } from "../iam.mutations";
import { useRoleDetailQuery } from "../iam.queries";

import type { RoleDetail, RoleSummary } from "../iam.types";

const MENU_CODES = menuPermissionCodes();

function groupCodes(group: MenuGroup): string[] {
  return group.children.flatMap((leaf) => [leaf.permission, ...leaf.actions.map((a) => a.code)]);
}

function GrantBody({ detail, onClose }: { detail: RoleDetail; onClose: () => void }) {
  const { t, i18n } = useTranslation("iam");
  const { t: tc } = useTranslation();
  const lookups = useLookups();
  const grant = useGrantRoleMutation();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(detail.permissions));
  const [allCustomers, setAllCustomers] = useState(detail.allCustomers);
  const [customerIds, setCustomerIds] = useState<Set<string>>(() => new Set(detail.customers.map((c) => c.id)));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allCodes = useMemo(() => MENU.flatMap(groupCodes), []);
  const menuSelected = MENU_CODES.filter((code) => selected.has(code)).length;
  const customers = lookups.data?.customers ?? [];
  const lang = i18n.language;

  function toggle(codes: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  function toggleCustomer(id: string, on: boolean) {
    setCustomerIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    try {
      await grant.mutateAsync({
        id: detail.id,
        input: {
          permissions: [...selected],
          allCustomers,
          customerIds: allCustomers ? [] : [...customerIds],
          reason: reason || undefined,
          version: detail.version,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <span>
              {t("GRANT_MENU_COUNT")} <b className="tabular">{menuSelected}</b> / {MENU_CODES.length}
            </span>
            <button className="text-primary hover:underline" type="button" onClick={() => toggle(allCodes, true)}>
              {t("SELECT_ALL")}
            </button>
            <button className="text-primary hover:underline" type="button" onClick={() => setSelected(new Set())}>
              {t("CLEAR_ALL")}
            </button>
          </div>
          <span className="text-muted-foreground">
            {t("DATA_SCOPE")}：{pickLabel(DATA_SCOPES[detail.dataScope].label, lang)}
          </span>
        </div>

        <section className="rounded-lg border border-border">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold">
              {t("GRANT_CUSTOMERS")}{" "}
              <span className="tabular font-normal text-muted-foreground">
                {allCustomers ? t("ALL_CUSTOMERS") : `${customerIds.size} / ${customers.length}`}
              </span>
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <Switch aria-label={t("ALL_CUSTOMERS")} checked={allCustomers} onCheckedChange={setAllCustomers} />
              {t("ALL_CUSTOMERS")}
            </label>
          </header>
          <div
            className={cn(
              "grid grid-cols-2 gap-2 p-4 sm:grid-cols-4",
              allCustomers && "pointer-events-none opacity-50",
            )}
          >
            {customers.map((c) => (
              <label className="flex items-center gap-2 text-sm" key={c.id}>
                <Checkbox
                  aria-label={c.name}
                  checked={allCustomers || customerIds.has(c.id)}
                  onCheckedChange={(v) => toggleCustomer(c.id, v === true)}
                />
                <span className="truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.code}</span>
              </label>
            ))}
          </div>
        </section>

        {MENU.map((group) => {
          const codes = groupCodes(group);
          const count = codes.filter((c) => selected.has(c)).length;
          const full = count === codes.length;
          return (
            <section className="rounded-lg border border-border" data-group={group.module} key={group.module}>
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
                <h3 className="text-sm font-semibold">
                  {pickLabel(group.label, lang)}{" "}
                  <span className="tabular font-normal text-muted-foreground">
                    {count}/{codes.length}
                  </span>
                </h3>
                <button
                  className="text-sm text-primary hover:underline"
                  type="button"
                  onClick={() => toggle(codes, !full)}
                >
                  {full ? t("UNSELECT_GROUP") : t("SELECT_ALL")}
                </button>
              </header>
              <div className="space-y-2 px-4 py-3">
                {group.children.map((leaf) => {
                  const actionCodes = leaf.actions.map((a) => a.code);
                  const leafOn = selected.has(leaf.permission);
                  return (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2" key={leaf.permission}>
                      <label className="flex min-w-36 items-center gap-2 text-sm font-medium">
                        <Checkbox
                          aria-label={pickLabel(leaf.label, lang)}
                          checked={leafOn}
                          onCheckedChange={(v) =>
                            toggle(v === true ? [leaf.permission] : [leaf.permission, ...actionCodes], v === true)
                          }
                        />
                        {pickLabel(leaf.label, lang)}
                      </label>
                      {leaf.actions.map((action) => (
                        <label
                          className={cn(
                            "flex items-center gap-1.5 text-sm text-muted-foreground",
                            !leafOn && "opacity-50",
                          )}
                          key={action.code}
                        >
                          <Checkbox
                            aria-label={pickLabel(action.label, lang)}
                            checked={selected.has(action.code)}
                            disabled={!leafOn}
                            onCheckedChange={(v) => toggle([action.code], v === true)}
                          />
                          {pickLabel(action.label, lang)}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <Input
          aria-label={t("GRANT_REASON")}
          maxLength={200}
          placeholder={t("GRANT_REASON")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("ZCYE20")}
        </Button>
        <Button disabled={grant.isPending} type="button" onClick={() => void save()}>
          {grant.isPending ? tc("SBWT01") : t("GRANT_SAVE")}
        </Button>
      </DialogFooter>
    </>
  );
}

type RoleGrantDialogProps = { role: RoleSummary | null; onClose: () => void };

export function RoleGrantDialog({ role, onClose }: RoleGrantDialogProps) {
  const { t } = useTranslation("iam");
  const { t: tc } = useTranslation();
  const detail = useRoleDetailQuery(role?.id ?? null);

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>
            {t("GRANT_TITLE")} ｜ {role?.name} ({role?.code})
          </DialogTitle>
        </DialogHeader>
        {detail.data && detail.data.id === role?.id ? (
          <GrantBody detail={detail.data} key={`${detail.data.id}:${detail.data.version}`} onClose={onClose} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">{tc("HX3QAV")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
