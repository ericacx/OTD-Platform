import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/common/page-header";
import { AssistantChat } from "@/features/assistant/components/assistant-chat";

export function AssistantPage() {
  const { t } = useTranslation("assistant");
  return (
    <section className="space-y-4">
      <PageHeader title={t("TITLE")} />
      <AssistantChat variant="page" />
    </section>
  );
}
