import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/common/error-state";

interface ErrorBoundaryFallbackProps {
  error?: Error | null;
  onReset?: () => void;
}

export function ErrorBoundaryFallback({ error, onReset }: ErrorBoundaryFallbackProps) {
  const { t } = useTranslation("errors");
  const { t: tCommon } = useTranslation();

  return (
    <ErrorState
      title={t("BNDTIT")}
      description={error?.message ?? t("BNDMSG")}
      {...(error ? { error } : {})}
      action={
        onReset ? (
          <button
            className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium"
            onClick={onReset}
            type="button"
          >
            {tCommon("ACTRETRY")}
          </button>
        ) : undefined
      }
    />
  );
}
