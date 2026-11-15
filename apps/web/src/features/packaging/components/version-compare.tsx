import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SectionCard } from "@/components/biz/detail-header-card";

import { usePackagingCompareQuery } from "../packaging.queries";

import type { PackagingPlanDetailDto, PackagingPlanField } from "../packaging.types";

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export function formatPlanValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return value
      .map((item: unknown) =>
        typeof item === "object" && item !== null
          ? `${scalar((item as { title?: unknown }).title)}：${scalar((item as { content?: unknown }).content)}`
          : scalar(item),
      )
      .join("；");
  }
  return scalar(value) || "—";
}

export function VersionCompare({ plan }: { plan: PackagingPlanDetailDto }) {
  const { t } = useTranslation("packaging");
  const numbers = plan.versions.map((v) => v.versionNo);
  const [from, setFrom] = useState(numbers[0] ?? 1);
  const [to, setTo] = useState(numbers[numbers.length - 1] ?? 1);
  const diff = usePackagingCompareQuery(plan.id, from, to);
  const select = (value: number, onChange: (n: number) => void, label: string) => (
    <select
      aria-label={label}
      className="h-8 rounded-md border border-input bg-card px-2 text-sm"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {numbers.map((n) => (
        <option key={n} value={n}>
          v{n}
        </option>
      ))}
    </select>
  );
  return (
    <SectionCard
      extra={
        <>
          {select(from, setFrom, t("COMPARE_FROM"))}
          <span>→</span>
          {select(to, setTo, t("COMPARE_TO"))}
        </>
      }
      title={t("COMPARE_TITLE")}
    >
      {numbers.length < 2 || from === to ? (
        <p className="text-sm text-muted-foreground">{t("COMPARE_PICK")}</p>
      ) : diff.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("LOADING")}</p>
      ) : (diff.data?.diffs.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">{t("COMPARE_SAME")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">{t("COMPARE_FIELD")}</th>
              <th className="py-2 pr-4 font-medium">v{from}</th>
              <th className="py-2 font-medium">v{to}</th>
            </tr>
          </thead>
          <tbody>
            {diff.data?.diffs.map((d) => (
              <tr className="border-t border-border align-top" key={d.field}>
                <td className="py-2 pr-4 whitespace-nowrap">{t(`F_${d.field as PackagingPlanField}`)}</td>
                <td className="py-2 pr-4 text-muted-foreground line-through decoration-danger/60">
                  {formatPlanValue(d.from)}
                </td>
                <td className="py-2 font-medium text-primary">{formatPlanValue(d.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
