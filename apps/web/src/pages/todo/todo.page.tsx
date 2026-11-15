import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/app/providers/auth-provider";
import { EmptyState } from "@/components/common/empty-state";
import { formatDate } from "@/lib/date";

function greetingKey(hour: number): "GREET_MORNING" | "GREET_AFTERNOON" | "GREET_EVENING" {
  if (hour < 12) return "GREET_MORNING";
  if (hour < 18) return "GREET_AFTERNOON";
  return "GREET_EVENING";
}

export function TodoPage() {
  const { t } = useTranslation("todo");
  const { user } = useAuth();
  const now = new Date();

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-card px-6 py-6 shadow-xs">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-primary-soft to-transparent"
        />
        <div className="relative">
          <h1 className="text-2xl font-semibold">{t(greetingKey(now.getHours()), { name: user?.name ?? "" })}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {formatDate(now)} · {user?.roleNames.join(" / ")} · {user?.orgName}
          </p>
        </div>
      </div>
      <EmptyState description={t("EMPTY_DESC")} icon={ClipboardCheck} title={t("EMPTY_TITLE")} />
    </section>
  );
}
