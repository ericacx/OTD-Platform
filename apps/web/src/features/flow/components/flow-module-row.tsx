import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { FlowModuleView } from "../flow.types";
import type { DragEvent } from "react";

type FlowModuleRowProps = {
  view: FlowModuleView;
  index: number;
  total: number;
  departments: string[];
  canEdit: boolean;
  busy: boolean;
  dragOver: boolean;
  onMove: (delta: number) => void;
  onToggle: (itemCode: string) => void;
  onDepartment: (department: string) => void;
  onRemove: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

export function FlowModuleRow({
  view,
  index,
  total,
  departments,
  canEdit,
  busy,
  dragOver,
  onMove,
  onToggle,
  onDepartment,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: FlowModuleRowProps) {
  const { t, i18n } = useTranslation("flow");
  const editable = canEdit && !busy;
  const name = i18n.language.startsWith("en") && view.nameEn ? view.nameEn : view.name;
  return (
    <li
      aria-label={name}
      className={cn(
        "grid grid-cols-[24px_36px_minmax(0,1fr)] gap-3 rounded-[10px] border border-border bg-card px-4 py-3 shadow-xs transition-colors sm:grid-cols-[24px_36px_minmax(0,1fr)_auto]",
        dragOver && "border-primary bg-primary-soft/40",
      )}
      draggable={editable}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <div className="flex flex-col items-center gap-0.5 pt-0.5 text-muted-foreground">
        {canEdit ? (
          <>
            <GripVertical aria-hidden="true" className="size-4 cursor-grab" />
            <button
              aria-label={t("MOVE_UP")}
              className="rounded p-0.5 hover:bg-muted hover:text-primary disabled:opacity-30"
              disabled={!editable || index === 0}
              type="button"
              onClick={() => onMove(-1)}
            >
              <ChevronUp aria-hidden="true" className="size-3.5" />
            </button>
            <button
              aria-label={t("MOVE_DOWN")}
              className="rounded p-0.5 hover:bg-muted hover:text-primary disabled:opacity-30"
              disabled={!editable || index === total - 1}
              type="button"
              onClick={() => onMove(1)}
            >
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
      <div className="tabular grid h-[26px] place-items-center rounded-md bg-primary-soft text-[13px] font-bold text-primary">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{name}</span>
          {canEdit ? (
            <select
              aria-label={t("DEPARTMENT_OF", { name })}
              className="h-7 rounded-md border border-input bg-card px-2 text-xs"
              disabled={!editable}
              value={view.department}
              onChange={(event) => onDepartment(event.target.value)}
            >
              {[...new Set([...departments, view.department])].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <ToneBadge label={view.department} />
          )}
          {view.department !== view.defaultDepartment ? (
            <span className="text-xs text-muted-foreground">
              {t("DEFAULT_DEPARTMENT", { name: view.defaultDepartment })}
            </span>
          ) : null}
          {view.nodes.map((n) => (
            <ToneBadge key={n} label={n} tone="info" />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {view.items.map((item) => (
            <button
              aria-pressed={item.enabled}
              className={cn(
                "h-6 rounded-md border px-2 text-xs transition-colors",
                item.enabled
                  ? "border-transparent bg-primary-soft text-primary"
                  : "border-border text-muted-foreground line-through",
                item.deleted && "opacity-60",
              )}
              disabled={!editable || item.deleted}
              key={item.code}
              title={item.deleted ? t("ITEM_DELETED") : item.code}
              type="button"
              onClick={() => onToggle(item.code)}
            >
              {i18n.language.startsWith("en") && item.nameEn ? item.nameEn : item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="col-start-3 flex items-center justify-between gap-2 sm:col-start-auto sm:flex-col sm:items-end">
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{view.enabledCount}</span> / {view.totalCount}{" "}
          {t("ITEMS_UNIT")}
        </span>
        {canEdit ? (
          <Button disabled={!editable} size="sm" variant="outline" onClick={onRemove}>
            {t("REMOVE")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
