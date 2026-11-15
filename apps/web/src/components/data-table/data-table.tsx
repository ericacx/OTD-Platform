import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Table,
} from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { cn } from "@/lib/utils";

import { DataTablePagination } from "./data-table-pagination";

import type { DataTableProps } from "./types";

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  emptyText,
  error,
  getRowId,
  isLoading = false,
  pagination,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  rowSelection,
  onRowSelectionChange,
}: DataTableProps<TData, TValue>) {
  const { t } = useTranslation();

  // TanStack Table exposes function-rich instances; this hook is the supported integration point.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table: Table<TData> = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: Boolean(pagination),
    ...(getRowId ? { getRowId } : {}),
    ...(sorting !== undefined
      ? {
          state: {
            sorting,
            ...(columnFilters !== undefined ? { columnFilters } : {}),
            ...(rowSelection !== undefined ? { rowSelection } : {}),
          },
        }
      : {}),
    ...(onSortingChange
      ? {
          onSortingChange: (updater) =>
            onSortingChange(typeof updater === "function" ? updater(sorting ?? []) : updater),
        }
      : {}),
    ...(onColumnFiltersChange
      ? {
          onColumnFiltersChange: (updater) =>
            onColumnFiltersChange(typeof updater === "function" ? updater(columnFilters ?? []) : updater),
        }
      : {}),
    ...(onRowSelectionChange
      ? {
          onRowSelectionChange: (updater) =>
            onRowSelectionChange(typeof updater === "function" ? updater(rowSelection ?? {}) : updater),
        }
      : {}),
  });

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (data.length === 0) {
    return <EmptyState title={emptyText ?? t("83WV56")} />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th className="h-11 px-4 text-left font-medium" key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr className={cn("border-t border-border", row.getIsSelected() && "bg-accent")} key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td className="px-4 py-3" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination ? <DataTablePagination pagination={pagination} /> : null}
    </div>
  );
}
