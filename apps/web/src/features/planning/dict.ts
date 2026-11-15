import { pickLabel } from "@otd/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useLookups } from "@/features/masterdata/lookups.queries";

export function useDictLabel() {
  const lookups = useLookups();
  const { i18n } = useTranslation();
  const dictionaries = lookups.data?.dictionaries;
  return useCallback(
    (type: string, code: string | null | undefined): string => {
      if (!code) return "—";
      const hit = dictionaries?.[type]?.find((d) => d.code === code);
      return hit ? pickLabel(hit.label, i18n.language) : code;
    },
    [dictionaries, i18n.language],
  );
}

export function useDictOptions(type: string, fallback: string[] = []) {
  const lookups = useLookups();
  const { i18n } = useTranslation();
  const list = lookups.data?.dictionaries[type];
  if (list?.length) return list.map((d) => ({ value: d.code, label: pickLabel(d.label, i18n.language) }));
  return fallback.map((code) => ({ value: code, label: code }));
}
