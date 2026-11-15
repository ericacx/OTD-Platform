import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

import { AnswerCard } from "./answer-cards";
import { ProposalCard } from "./proposal-card";

import type { AssistantAnswer, AssistantMessageDto } from "../assistant.types";

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
      {text}
    </div>
  );
}

type AnswerViewProps = {
  answer: AssistantAnswer;
  decidingId: string | null;
  onDecide: (proposalId: string, decision: "confirm" | "reject", version: number) => void;
};

export function AnswerView({ answer, decidingId, onDecide }: AnswerViewProps) {
  const { t } = useTranslation("assistant");
  return (
    <article className="@container w-full max-w-[760px] space-y-3 self-start rounded-[14px] border border-border bg-card p-4">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.text}</p>
      {answer.cards.map((card, index) => (
        <AnswerCard card={card} key={`${card.type}-${index}`} />
      ))}
      {answer.proposals?.map((p) => (
        <ProposalCard
          busy={decidingId === p.id}
          key={p.id}
          onDecide={(decision) => onDecide(p.id, decision, p.version)}
          proposal={p}
        />
      ))}
      {answer.actions.length ? (
        <div className="flex flex-wrap gap-2">
          {answer.actions.map((action) => (
            <Button asChild key={action.link} size="sm" variant="outline">
              <Link to={action.link}>{action.label}</Link>
            </Button>
          ))}
        </div>
      ) : null}
      <footer className="border-t border-dashed border-border pt-2 text-[11px] text-subtle-foreground">
        {t("SOURCE")}：
        {answer.sources.map((s, i) => (
          <span key={`${s.module}-${s.label}`}>
            {i > 0 ? "；" : ""}
            {s.label} · {t("AS_OF", { time: formatDate(s.asOf, true) })}
          </span>
        ))}
      </footer>
    </article>
  );
}

type MessageItemProps = Omit<AnswerViewProps, "answer"> & { message: AssistantMessageDto };

export function MessageItem({ message, ...rest }: MessageItemProps) {
  if (message.role === "user" || !message.answer) return <UserBubble text={message.text} />;
  return <AnswerView answer={message.answer} {...rest} />;
}
