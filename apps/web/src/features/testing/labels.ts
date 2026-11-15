import { TEST_ITEM_LABELS, type TestItem } from "@otd/contracts/testing";
import { pickLabel } from "@otd/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export function useItemLabels() {
  const { i18n } = useTranslation();
  return useCallback(
    (items: string[]) =>
      items
        .map((item) => (item in TEST_ITEM_LABELS ? pickLabel(TEST_ITEM_LABELS[item as TestItem], i18n.language) : item))
        .join("、"),
    [i18n.language],
  );
}
