import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ToneBadge } from "@/components/biz/status-badge";
import { Button } from "@/components/ui/button";

import type { ProposalDto } from "../assistant.types";

const STATUS = {
  PENDING: { key: "PROPOSAL_PENDING", tone: "warning" },
  CONFIRMED: { key: "PROPOSAL_CONFIRMED", tone: "success" },
  REJECTED: { key: "PROPOSAL_REJECTED", tone: "neutral" },
} as const;

type ProposalCardProps = {
  proposal: ProposalDto;
  busy: boolean;
  onDecide: (decision: "confirm" | "reject") => void;
};

export function ProposalCard({ proposal, busy, onDecide }: ProposalCardProps) {
  const { t } = useTranslation("assistant");
  const status = STATUS[proposal.status];
  return (
    <section
      aria-label={proposal.title}
      className="space-y-2.5 rounded-lg border border-primary/30 bg-primary-soft/40 p-3"
      data-status={proposal.status}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardCheck aria-hidden="true" className="size-4 text-primary" />
          {proposal.title}
        </span>
        <ToneBadge label={t(status.key)} tone={status.tone} />
      </header>
      <p className="text-sm">{proposal.summary}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {proposal.fields.map((f) => (
          <div className="contents" key={f.label}>
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="break-words">{f.value}</dd>
          </div>
        ))}
      </dl>
      {proposal.targets.length ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("PROPOSAL_TARGETS")}</span>
          {proposal.targets.map((target) =>
            target.link ? (
              <Link className="text-primary hover:underline" key={target.label} to={target.link}>
                {target.label}
              </Link>
            ) : (
              <span key={target.label}>{target.label}</span>
            ),
          )}
        </p>
      ) : null}
      {proposal.status === "PENDING" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => onDecide("confirm")} size="sm" type="button">
            {t("CONFIRM")}
          </Button>
          <Button disabled={busy} onClick={() => onDecide("reject")} size="sm" type="button" variant="outline">
            {t("REJECT")}
          </Button>
          <span className="text-[11px] text-muted-foreground">{t("PROPOSAL_HINT")}</span>
        </div>
      ) : proposal.result ? (
        <p className="text-xs text-muted-foreground">
          {proposal.result.link ? (
            <Link className="text-primary hover:underline" to={proposal.result.link}>
              {proposal.result.message}
            </Link>
          ) : (
            proposal.result.message
          )}
        </p>
      ) : null}
    </section>
  );
}
