import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

export function FormulaNote({ windowDays }: { windowDays: number }) {
  const { t } = useTranslation("capacity");
  return (
    <div className="flex gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
      <p>{t("FORMULA", { window: windowDays })}</p>
    </div>
  );
}
