import { pickLabel } from "@otd/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useLookups } from "@/features/masterdata/lookups.queries";

export function useTransportLabel(): (code: string | null | undefined) => string {
  const { i18n } = useTranslation();
  const lookups = useLookups();
  return useCallback(
    (code) => {
      if (!code) return "—";
      const entry = lookups.data?.dictionaries.transportMode?.find((d) => d.code === code);
      return entry ? pickLabel(entry.label, i18n.language) : code;
    },
    [lookups.data, i18n.language],
  );
}

export function toIsoDateTime(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
