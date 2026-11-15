import type { ColumnDef, SortingState, ColumnFiltersState } from "@tanstack/react-table";

export interface DataTablePaginationState {
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  total?: number;
}

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyText?: string;
  error?: Error | null;
  getRowId?: (row: TData, index: number) => string;
  isLoading?: boolean;
  pagination?: DataTablePaginationState;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  rowSelection?: Record<string, boolean>;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
}
