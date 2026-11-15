import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export type TableQueryState = {
  page: number;
  pageSize: number;
  sort: string | undefined;
  keyword: string | undefined;
  filters: Record<string, string>;
};

export type TableQueryControls = TableQueryState & {
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sort: string | undefined) => void;
  setKeyword: (keyword: string | undefined) => void;
  setFilter: (name: string, value: string | undefined) => void;
  reset: () => void;
  params: Record<string, string | number>;
};

const RESERVED = new Set(["page", "pageSize", "sort", "keyword"]);

export function useTableQueryState(defaults: { pageSize?: number; sort?: string } = {}): TableQueryControls {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultPageSize = defaults.pageSize ?? 20;
  const defaultSort = defaults.sort;

  const state = useMemo<TableQueryState>(() => {
    const filters: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!RESERVED.has(key) && value) filters[key] = value;
    }
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? String(defaultPageSize));
    return {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : defaultPageSize,
      sort: searchParams.get("sort") ?? defaultSort,
      keyword: searchParams.get("keyword") ?? undefined,
      filters,
    };
  }, [searchParams, defaultPageSize, defaultSort]);

  const update = useCallback(
    (patch: Record<string, string | undefined>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === "") next.delete(key);
            else next.set(key, value);
          }
          if (resetPage && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const params = useMemo(() => {
    const out: Record<string, string | number> = { page: state.page, pageSize: state.pageSize, ...state.filters };
    if (state.sort) out.sort = state.sort;
    if (state.keyword) out.keyword = state.keyword;
    return out;
  }, [state]);

  return {
    ...state,
    params,
    setPage: (page) => update({ page: page > 1 ? String(page) : undefined }, false),
    setPageSize: (pageSize) => update({ pageSize: String(pageSize) }),
    setSort: (sort) => update({ sort }),
    setKeyword: (keyword) => update({ keyword: keyword?.trim() || undefined }),
    setFilter: (name, value) => update({ [name]: value }),
    reset: () => setSearchParams(new URLSearchParams(), { replace: true }),
  };
}
