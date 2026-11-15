import { COLLECTION_RESULT_LABELS, type ReceivableDto } from "@otd/contracts/receivable";
import { pickLabel } from "@otd/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useLookups } from "@/features/masterdata/lookups.queries";

export function useDictLabel(
  type: "receivableType" | "collectionChannel",
): (code: string | null | undefined) => string {
  const { i18n } = useTranslation();
  const lookups = useLookups();
  return useCallback(
    (code) => {
      if (!code) return "—";
      const entry = lookups.data?.dictionaries[type]?.find((d) => d.code === code);
      return entry ? pickLabel(entry.label, i18n.language) : code;
    },
    [lookups.data, i18n.language, type],
  );
}

export function resultLabel(result: keyof typeof COLLECTION_RESULT_LABELS, locale: string): string {
  return pickLabel(COLLECTION_RESULT_LABELS[result], locale);
}

export function isOpen(ar: Pick<ReceivableDto, "status">): boolean {
  return ar.status === "NOT_DUE" || ar.status === "DUE" || ar.status === "PARTIAL";
}
