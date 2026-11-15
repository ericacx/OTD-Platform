import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { RecipientFormDialog } from "@/features/sampleship/components/recipient-form-dialog";
import { useRecipientsQuery } from "@/features/sampleship/sampleship.queries";

import type { RecipientDto } from "@/features/sampleship/sampleship.types";

const TH = "h-11 px-4 text-left font-medium whitespace-nowrap";
const TD = "px-4 py-3";

export function RecipientsPage() {
  const { t } = useTranslation("sampleship");
  const { t: tc } = useTranslation();
  const lookups = useLookups();
  const [customerId, setCustomerId] = useState("");
  const recipients = useRecipientsQuery(customerId || undefined);
  const [editing, setEditing] = useState<RecipientDto | null | undefined>(undefined);
  const list = recipients.data ?? [];

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sampleship.recipient.edit">
            <Button onClick={() => setEditing(null)}>{t("RECIPIENT_NEW")}</Button>
          </RequirePermission>
        }
        description={t("RECIPIENTS_DESC")}
        title={t("RECIPIENTS_TITLE")}
      />
      <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <select
            aria-label={t("CUSTOMER")}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">{t("ALL_CUSTOMERS")}</option>
            {(lookups.data?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {recipients.isLoading ? (
          <LoadingState />
        ) : recipients.error ? (
          <div className="p-4">
            <ErrorState error={recipients.error} />
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState className="border-0" title={tc("83WV56")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className={TH}>{t("CUSTOMER")}</th>
                  <th className={TH}>{t("COMPANY")}</th>
                  <th className={TH}>{t("CONTACT_NAME")}</th>
                  <th className={TH}>{t("PHONE")}</th>
                  <th className={TH}>{t("EMAIL")}</th>
                  <th className={TH}>{t("ADDRESS")}</th>
                  <th className={TH}>{t("DEFAULT_COURIER")}</th>
                  <th className={TH}>{tc("TBL_ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr className="border-t border-border hover:bg-muted/50" key={r.id}>
                    <td className={TD}>{r.customerName}</td>
                    <td className={TD}>
                      <span className="font-medium">{r.company}</span>
                      {r.isDefault ? <ToneBadge className="ml-1.5" label={t("DEFAULT")} tone="info" /> : null}
                    </td>
                    <td className={TD}>{r.name}</td>
                    <td className={`${TD} tabular`}>{r.phone ?? "—"}</td>
                    <td className={TD}>{r.email ?? "—"}</td>
                    <td className={`${TD} max-w-80`}>{r.address}</td>
                    <td className={TD}>{r.courier ?? "—"}</td>
                    <td className={TD}>
                      <RequirePermission code="sampleship.recipient.edit">
                        <Button className="h-auto px-0" variant="link" onClick={() => setEditing(r)}>
                          {tc("1VV96U")}
                        </Button>
                      </RequirePermission>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          {tc("PGTOTAL", { count: list.length })}
        </p>
      </div>
      <RecipientFormDialog
        open={editing !== undefined}
        recipient={editing ?? null}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </section>
  );
}
