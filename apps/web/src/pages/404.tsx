import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  const { t } = useTranslation("errors");
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-xl border-l-4 border-primary pl-6">
        <p className="text-sm font-medium uppercase text-muted-foreground">{t("NFD_CODE")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("NFD_TITLE")}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("NFD_DESC")}</p>
        <Button className="mt-6" size="sm" variant="link" onClick={() => void navigate("/")}>
          {t("NFD_BACK")}
        </Button>
      </section>
    </main>
  );
}
