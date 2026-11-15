import { useTranslation } from "react-i18next";
import { isRouteErrorResponse, useRouteError } from "react-router";

export function RouteErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation("errors");

  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : t("RTETIT");
  const fallbackMessage = t("RTEUNK");
  const message =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? String(error.data || fallbackMessage)
        : fallbackMessage;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-xl border-l-4 border-primary pl-6">
        <p className="text-sm font-medium uppercase text-muted-foreground">{t("RTETIT")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{message}</p>
      </section>
    </main>
  );
}
