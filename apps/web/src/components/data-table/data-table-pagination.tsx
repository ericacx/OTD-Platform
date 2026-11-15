import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { DataTablePaginationState } from "./types";

interface DataTablePaginationProps {
  pagination: DataTablePaginationState;
}

export function DataTablePagination({ pagination }: DataTablePaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(pagination.pageCount, 1);
  const canGoPrevious = pagination.pageIndex > 0;
  const canGoNext = pagination.pageIndex + 1 < pagination.pageCount;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        {t("PGSUM", { current: pagination.pageIndex + 1, total: totalPages })}
        {typeof pagination.total === "number" ? ` · ${t("PGTOT", { count: pagination.total })}` : ""}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={!canGoPrevious}
          size="sm"
          variant="outline"
          onClick={() => pagination.onPageChange?.(pagination.pageIndex - 1)}
        >
          {t("PGPREV")}
        </Button>
        <Button
          disabled={!canGoNext}
          size="sm"
          variant="outline"
          onClick={() => pagination.onPageChange?.(pagination.pageIndex + 1)}
        >
          {t("PGNEXT")}
        </Button>
      </div>
    </div>
  );
}
