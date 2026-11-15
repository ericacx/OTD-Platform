import { pickLabel } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmDialog, type DeleteTarget } from "@/features/masterdata/components/delete-confirm-dialog";
import { DictionaryFormDialog } from "@/features/masterdata/components/dictionary-form-dialog";
import { RateFormDialog } from "@/features/masterdata/components/rate-form-dialog";
import { SeasonFormDialog } from "@/features/masterdata/components/season-form-dialog";
import { useLookups } from "@/features/masterdata/lookups.queries";
import {
  useDictionariesQuery,
  useDictionaryTypesQuery,
  useExchangeRatesQuery,
  useSeasonsQuery,
} from "@/features/masterdata/reference-data.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { DictionaryDto, ExchangeRateDto, SeasonDto } from "@otd/contracts/masterdata";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const FALLBACK_CURRENCIES = ["USD", "EUR", "JPY", "GBP", "HKD", "CNY"];

type TabKey = "dicts" | "rates" | "seasons";

export function DictionariesPage() {
  const { t } = useTranslation("masterdata");
  const query = useTableQueryState();
  const [tab, setTab] = useState<TabKey>("dicts");

  return (
    <section className="space-y-5">
      <PageHeader title={t("DICTS_TITLE")} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          query.reset();
          setTab(value as TabKey);
        }}
      >
        <TabsList>
          <TabsTrigger value="dicts">{t("TAB_DICTS")}</TabsTrigger>
          <TabsTrigger value="rates">{t("TAB_RATES")}</TabsTrigger>
          <TabsTrigger value="seasons">{t("TAB_SEASONS")}</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="dicts">
          <DictionaryTab />
        </TabsContent>
        <TabsContent className="mt-4" value="rates">
          <RatesTab />
        </TabsContent>
        <TabsContent className="mt-4" value="seasons">
          <SeasonsTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function DictionaryTab() {
  const { t, i18n } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const types = useDictionaryTypesQuery();
  const entries = useDictionariesQuery(query.params);
  const [editing, setEditing] = useState<DictionaryDto | null | undefined>(undefined);
  const [disabling, setDisabling] = useState<DeleteTarget | null>(null);
  const selectedType = query.filters.type;
  const lang = i18n.language;

  const columns = useMemo<ColumnDef<DictionaryDto, unknown>[]>(
    () => [
      {
        accessorKey: "type",
        header: t("DICT_TYPE"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.type}</span>,
      },
      {
        accessorKey: "code",
        header: t("COL_CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      { id: "labelZh", header: t("DICT_LABEL_ZH"), cell: ({ row }) => row.original.label.zh },
      { id: "labelEn", header: t("DICT_LABEL_EN"), cell: ({ row }) => row.original.label.en },
      {
        accessorKey: "sort",
        header: t("DICT_SORT"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.sort}</span>,
      },
      {
        accessorKey: "enabled",
        header: t("STATUS"),
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.enabled ? t("ACTIVE") : t("DISABLED")}
            tone={row.original.enabled ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.dictionary.edit">
            <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(row.original)}>
              {tc("1VV96U")}
            </Button>
            {row.original.enabled ? (
              <Button
                className="h-auto px-2 py-1 text-destructive"
                variant="link"
                onClick={() =>
                  setDisabling({
                    id: row.original.id,
                    version: row.original.version,
                    name: pickLabel(row.original.label, lang),
                  })
                }
              >
                {t("DICT_DISABLE")}
              </Button>
            ) : null}
          </RequirePermission>
        ),
      },
    ],
    [t, tc, lang],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav
        aria-label={t("DICT_TYPES")}
        className="h-fit rounded-[var(--radius)] border border-border bg-card p-2 shadow-xs"
      >
        <p className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">{t("DICT_TYPES")}</p>
        <ul className="space-y-0.5">
          <li>
            <button
              aria-pressed={!selectedType}
              className={cn(
                "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                !selectedType && "bg-primary-soft font-medium text-primary",
              )}
              type="button"
              onClick={() => query.setFilter("type", undefined)}
            >
              {t("ALL_DICT_TYPES")}
            </button>
          </li>
          {(types.data ?? []).map((item) => (
            <li key={item.type}>
              <button
                aria-pressed={selectedType === item.type}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  selectedType === item.type && "bg-primary-soft font-medium text-primary",
                )}
                type="button"
                onClick={() => query.setFilter("type", item.type)}
              >
                <span className="tabular truncate">{item.type}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">
                  {t("DICT_TYPE_COUNT", { enabled: item.enabledCount, count: item.count })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <ServerDataTable
        actions={
          <RequirePermission code="masterdata.dictionary.edit">
            <Button size="sm" onClick={() => setEditing(null)}>
              {t("DICT_NEW")}
            </Button>
          </RequirePermission>
        }
        columns={columns}
        error={entries.error}
        getRowId={(row) => row.id}
        isLoading={entries.isLoading}
        page={entries.data}
        query={query}
        searchPlaceholder={t("DICT_SEARCH")}
      />
      <DictionaryFormDialog
        defaultType={selectedType}
        entry={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <DeleteConfirmDialog
        confirmLabel={t("DICT_DISABLE")}
        description={t("DICT_DISABLE_CONFIRM", { name: disabling?.name ?? "" })}
        entity="dictionaries"
        target={disabling}
        title={t("DICT_DISABLE_TITLE")}
        onClose={() => setDisabling(null)}
      />
    </div>
  );
}

function RatesTab() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const rates = useExchangeRatesQuery(query.params);
  const lookups = useLookups();
  const currencies = lookups.data?.currencies.length ? lookups.data.currencies : FALLBACK_CURRENCIES;
  const [editing, setEditing] = useState<ExchangeRateDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const columns = useMemo<ColumnDef<ExchangeRateDto, unknown>[]>(
    () => [
      {
        accessorKey: "currency",
        header: t("RATE_CURRENCY"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.currency}</span>,
      },
      {
        accessorKey: "rateToCny",
        header: t("RATE_TO_CNY"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.rateToCny.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        ),
      },
      {
        accessorKey: "effectiveDate",
        header: t("RATE_DATE"),
        cell: ({ row }) => <span className="tabular">{row.original.effectiveDate}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.dictionary.edit">
            <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(row.original)}>
              {tc("1VV96U")}
            </Button>
            <Button
              className="h-auto px-2 py-1 text-destructive"
              variant="link"
              onClick={() =>
                setDeleting({
                  id: row.original.id,
                  version: row.original.version,
                  name: `${row.original.currency} ${row.original.effectiveDate}`,
                })
              }
            >
              {tc("jAiN8T")}
            </Button>
          </RequirePermission>
        ),
      },
    ],
    [t, tc],
  );

  return (
    <>
      <ServerDataTable
        actions={
          <RequirePermission code="masterdata.dictionary.edit">
            <Button size="sm" onClick={() => setEditing(null)}>
              {t("RATE_NEW")}
            </Button>
          </RequirePermission>
        }
        columns={columns}
        error={rates.error}
        getRowId={(row) => row.id}
        isLoading={rates.isLoading}
        page={rates.data}
        query={query}
        searchable={false}
        toolbar={
          <select
            aria-label={t("RATE_CURRENCY")}
            className={SELECT_CLASS}
            value={query.filters.currency ?? ""}
            onChange={(event) => query.setFilter("currency", event.target.value || undefined)}
          >
            <option value="">{t("ALL_CURRENCIES")}</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        }
      />
      <RateFormDialog
        currencies={currencies}
        open={editing !== undefined}
        rate={editing ?? null}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <DeleteConfirmDialog
        description={t("RATE_DELETE_CONFIRM", { name: deleting?.name ?? "" })}
        entity="exchangeRates"
        target={deleting}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function SeasonsTab() {
  const { t, i18n } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const seasons = useSeasonsQuery(query.params);
  const [editing, setEditing] = useState<SeasonDto | null | undefined>(undefined);
  const lang = i18n.language;

  const columns = useMemo<ColumnDef<SeasonDto, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("SEASON_CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      { id: "label", header: t("COL_NAME"), cell: ({ row }) => pickLabel(row.original.label, lang) },
      {
        accessorKey: "startDate",
        header: t("SEASON_START"),
        cell: ({ row }) => <span className="tabular">{row.original.startDate ?? "—"}</span>,
      },
      {
        accessorKey: "endDate",
        header: t("SEASON_END"),
        cell: ({ row }) => <span className="tabular">{row.original.endDate ?? "—"}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.dictionary.edit">
            <Button className="h-auto px-0" variant="link" onClick={() => setEditing(row.original)}>
              {tc("1VV96U")}
            </Button>
          </RequirePermission>
        ),
      },
    ],
    [t, tc, lang],
  );

  return (
    <>
      <ServerDataTable
        actions={
          <RequirePermission code="masterdata.dictionary.edit">
            <Button size="sm" onClick={() => setEditing(null)}>
              {t("SEASON_NEW")}
            </Button>
          </RequirePermission>
        }
        columns={columns}
        error={seasons.error}
        getRowId={(row) => row.code}
        isLoading={seasons.isLoading}
        page={seasons.data}
        query={query}
        searchPlaceholder={t("SEASON_SEARCH")}
      />
      <SeasonFormDialog
        open={editing !== undefined}
        season={editing ?? null}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </>
  );
}
