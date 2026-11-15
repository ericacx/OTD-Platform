import { useTranslation } from "react-i18next";

export function ForbiddenPage() {
  const { t } = useTranslation("errors");

  return (
    <section className="border-l-4 border-primary pl-6">
      <p className="text-sm font-medium uppercase text-muted-foreground">{t("FBD_CODE")}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("FBD_TITLE")}</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{t("FBD_DESC")}</p>
    </section>
  );
}
