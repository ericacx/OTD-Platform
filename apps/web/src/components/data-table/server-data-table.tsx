import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { TableQueryControls } from "@/lib/hooks/use-table-query-state";
import type { ReactNode } from "react";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    sortKey?: string;
    align?: "left" | "right" | "center";
    className?: string;
    __types?: [TData, TValue];
  }
}

export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

type ServerDataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  page: PageResult<TData> | undefined;
  query: TableQueryControls;
  isLoading?: boolean;
  error?: Error | null;
  toolbar?: ReactNode;
  actions?: ReactNode;
  searchPlaceholder?: string;
  searchable?: boolean;
  emptyText?: string;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  pageSizes?: number[];
};

function SortIcon({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) return <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-40" />;
  return desc ? (
    <ArrowDown aria-hidden="true" className="size-3.5" />
  ) : (
    <ArrowUp aria-hidden="true" className="size-3.5" />
  );
}

export function ServerDataTable<TData>({
  columns,
  page,
  query,
  isLoading = false,
  error,
  toolbar,
  actions,
  searchPlaceholder,
  searchable = true,
  emptyText,
  getRowId,
  onRowClick,
  pageSizes = [10, 20, 50, 100],
}: ServerDataTableProps<TData>) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState(query.keyword ?? "");
  const [jump, setJump] = useState("");

  useEffect(() => {
    setKeyword(query.keyword ?? "");
  }, [query.keyword]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: page?.items ?? [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
  });

  const total = page?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const [sortField, sortDesc] = query.sort
    ? query.sort.startsWith("-")
      ? [query.sort.slice(1), true]
      : [query.sort, false]
    : [undefined, false];

  function toggleSort(key: string) {
    if (sortField !== key) query.setSort(key);
    else if (!sortDesc) query.setSort(`-${key}`);
    else query.setSort(undefined);
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
      {searchable || toolbar || actions ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {searchable ? (
            <form
              className="relative"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                query.setKeyword(keyword);
              }}
            >
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={searchPlaceholder ?? t("L4PY6A")}
                className="h-9 w-64 pl-8"
                placeholder={searchPlaceholder ?? t("L4PY6A")}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </form>
          ) : null}
          {toolbar}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {query.keyword || Object.keys(query.filters).length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => query.reset()}>
                {t("TBL_RESET")}
              </Button>
            ) : null}
            {actions}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="p-4">
          <ErrorState error={error} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-muted-foreground">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const sortKey = meta?.sortKey;
                    const content = header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <th
                        aria-sort={
                          sortKey && sortField === sortKey ? (sortDesc ? "descending" : "ascending") : undefined
                        }
                        className={cn(
                          "h-11 px-4 font-medium whitespace-nowrap",
                          meta?.align === "right"
                            ? "text-right"
                            : meta?.align === "center"
                              ? "text-center"
                              : "text-left",
                          meta?.className,
                        )}
                        key={header.id}
                      >
                        {sortKey ? (
                          <button
                            className="inline-flex items-center gap-1 hover:text-foreground"
                            type="button"
                            onClick={() => toggleSort(sortKey)}
                          >
                            {content}
                            <SortIcon active={sortField === sortKey} desc={sortDesc} />
                          </button>
                        ) : (
                          content
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={columns.length}>
                    {t("HX3QAV")}
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={columns.length}>
                    <EmptyState className="border-0" title={emptyText ?? t("83WV56")} />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    className={cn(
                      "h-12 border-t border-border transition-colors hover:bg-muted/50",
                      onRowClick && "cursor-pointer",
                    )}
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          className={cn(
                            "px-4 py-2.5",
                            meta?.align === "right"
                              ? "text-right"
                              : meta?.align === "center"
                                ? "text-center"
                                : "text-left",
                            meta?.className,
                          )}
                          key={cell.id}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <span>{t("PGTOTAL", { count: total })}</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("PGSIZE")}
            className="h-8 rounded-md border border-input bg-card px-2 text-sm"
            value={query.pageSize}
            onChange={(event) => query.setPageSize(Number(event.target.value))}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {t("PGSIZEOPT", { size })}
              </option>
            ))}
          </select>
          <Button disabled={query.page <= 1} size="sm" variant="outline" onClick={() => query.setPage(query.page - 1)}>
            {t("PGPREV")}
          </Button>
          <span className="tabular">{t("PGSUM", { current: query.page, total: pageCount })}</span>
          <Button
            disabled={query.page >= pageCount}
            size="sm"
            variant="outline"
            onClick={() => query.setPage(query.page + 1)}
          >
            {t("PGNEXT")}
          </Button>
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const target = Number(jump);
              if (Number.isInteger(target) && target >= 1 && target <= pageCount) query.setPage(target);
              setJump("");
            }}
          >
            <span>{t("PGJUMP")}</span>
            <Input
              aria-label={t("PGJUMP")}
              className="h-8 w-14 px-2"
              inputMode="numeric"
              value={jump}
              onChange={(event) => setJump(event.target.value)}
            />
          </form>
        </div>
      </div>
    </div>
  );
}
