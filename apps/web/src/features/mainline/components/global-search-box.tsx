import { Loader2, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { SEARCH_MIN_LENGTH, useGlobalSearchQuery } from "../mainline.queries";

import type { SearchResult, SearchType } from "../mainline.types";

const DEBOUNCE_MS = 250;

type GlobalSearchBoxProps = { className?: string };

export function GlobalSearchBox({ className }: GlobalSearchBoxProps) {
  const { t } = useTranslation("order");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const listId = useId();
  const blurTimer = useRef<number | undefined>(undefined);
  const [value, setValue] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTerm(value.trim());
      setActive(0);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const search = useGlobalSearchQuery(term);
  const ready = term.length >= SEARCH_MIN_LENGTH;
  const results = useMemo(() => (ready ? (search.data ?? []) : []), [ready, search.data]);
  const groups = useMemo(() => {
    const map = new Map<SearchType, { item: SearchResult; index: number }[]>();
    results.forEach((item, index) => map.set(item.type, [...(map.get(item.type) ?? []), { item, index }]));
    return [...map.entries()];
  }, [results]);

  function go(item: SearchResult | undefined) {
    if (!item) return;
    setOpen(false);
    setValue("");
    setTerm("");
    void navigate(item.link);
  }

  const showPanel = open && value.trim().length > 0;
  const activeId = results[active] ? `${listId}-${active}` : undefined;

  return (
    <div className={cn("relative w-full", className)} role="search">
      <Search aria-hidden="true" className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-activedescendant={showPanel ? activeId : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showPanel}
        aria-label={tc("TOP_SEARCH")}
        className="h-9 bg-muted pl-8"
        placeholder={tc("TOP_SEARCH")}
        role="combobox"
        value={value}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(results[active] ?? results[0]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showPanel ? (
        <div
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg"
          id={listId}
          role="listbox"
        >
          {!ready ? (
            <p className="px-3 py-2 text-muted-foreground">{t("SEARCH_HINT")}</p>
          ) : search.isFetching && !results.length ? (
            <p className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {t("SEARCH_LOADING")}
            </p>
          ) : !results.length ? (
            <p className="px-3 py-2 text-muted-foreground">{t("SEARCH_EMPTY", { q: term })}</p>
          ) : (
            <>
              {groups.map(([type, items]) => (
                <div className="py-1" key={type} role="group" aria-label={t(`TYPE_${type}`)}>
                  <p className="px-3 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">{t(`TYPE_${type}`)}</p>
                  {items.map(({ item, index }) => (
                    <div
                      aria-selected={index === active}
                      className={cn(
                        "cursor-pointer rounded-md px-3 py-1.5",
                        index === active ? "bg-primary-soft text-primary" : "hover:bg-muted",
                      )}
                      id={`${listId}-${index}`}
                      key={`${item.type}-${item.id}`}
                      role="option"
                      tabIndex={-1}
                      onClick={() => go(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") go(item);
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                    >
                      <span className="tabular font-medium">{item.docNo}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{item.title}</span>
                    </div>
                  ))}
                </div>
              ))}
              <p className="border-t border-border px-3 pt-1.5 pb-1 text-xs text-muted-foreground">
                {t("SEARCH_ENTER")}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
