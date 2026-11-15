import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/biz/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { CapacityRowDto } from "../capacity.types";

const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : typeof v === "string" && v ? v : "—");

type Props = {
  rows: CapacityRowDto[];
  editable: boolean;
  onEdit: (row: CapacityRowDto) => void;
  onDelete: (row: CapacityRowDto) => void;
};

function Actions({
  row,
  onEdit,
  onDelete,
}: {
  row: CapacityRowDto;
  onEdit: Props["onEdit"];
  onDelete: Props["onDelete"];
}) {
  const { t } = useTranslation("capacity");
  return (
    <td className="whitespace-nowrap">
      <Button className="h-auto px-1" variant="link" onClick={() => onEdit(row)}>
        {t("ROW_EDIT")}
      </Button>
      <Button className="h-auto px-1 text-danger" variant="link" onClick={() => onDelete(row)}>
        {t("ROW_DELETE")}
      </Button>
    </td>
  );
}

export function PackingTable({ rows, editable, onEdit, onDelete }: Props) {
  const { t } = useTranslation("capacity");
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="bg-muted text-muted-foreground">
        <tr className="[&>th]:h-10 [&>th]:px-3 [&>th]:font-medium">
          <th className="text-left">{t("BASE")}</th>
          <th className="text-right">{t("PK_LINES")}</th>
          <th className="text-right">{t("PK_MONTH_ORDERS")}</th>
          <th className="text-right">{t("PK_SCHEDULED")}</th>
          <th className="text-right">{t("PK_LOAD_RATE")}</th>
          {editable ? <th className="text-left">{t("ACTIONS")}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const load = typeof r.extra.loadRate === "number" ? r.extra.loadRate : null;
          return (
            <tr className="border-t border-border [&>td]:px-3 [&>td]:py-2" key={r.id}>
              <td>{r.baseName}</td>
              <td className="tabular text-right">{num(r.extra.lines)}</td>
              <td className="tabular text-right">{num(r.extra.monthOrders)}</td>
              <td className="tabular text-right">{num(r.extra.scheduled)}</td>
              <td className={cn("tabular text-right font-semibold", load !== null && load > 90 && "text-danger")}>
                {load === null ? "—" : `${load}%`}
              </td>
              {editable ? <Actions row={r} onDelete={onDelete} onEdit={onEdit} /> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpecialTable({ rows, editable, onEdit, onDelete }: Props) {
  const { t } = useTranslation("capacity");
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="bg-muted text-muted-foreground">
        <tr className="[&>th]:h-10 [&>th]:px-3 [&>th]:font-medium">
          <th className="text-left">{t("SP_PROCESS")}</th>
          <th className="text-left">{t("BASE")}</th>
          <th className="text-right">{t("SP_DAILY")}</th>
          <th className="text-left">{t("SP_BOOKED_UNTIL")}</th>
          <th className="text-left">{t("STATUS")}</th>
          {editable ? <th className="text-left">{t("ACTIONS")}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr className="border-t border-border [&>td]:px-3 [&>td]:py-2" key={r.id}>
            <td className="font-medium">{r.process ?? "—"}</td>
            <td>{r.baseName}</td>
            <td className="tabular text-right">{num(r.extra.dailyCapacity)}</td>
            <td className="tabular">{num(r.extra.bookedUntil)}</td>
            <td>
              {typeof r.extra.status === "string" ? <StatusBadge code={r.extra.status} machine="ledgerTask" /> : "—"}
            </td>
            {editable ? <Actions row={r} onDelete={onDelete} onEdit={onEdit} /> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
