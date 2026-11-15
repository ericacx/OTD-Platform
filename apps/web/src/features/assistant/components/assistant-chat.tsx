import { pickLabel } from "@otd/shared";
import { Bot, ExternalLink, History, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ToneBadge } from "@/components/biz/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useActiveConversation } from "../assistant.active";
import {
  useAskMutation,
  useCreateConversationMutation,
  useDecideProposalMutation,
  useDeleteConversationMutation,
} from "../assistant.mutations";
import { useAssistantProfileQuery, useConversationsQuery, useMessagesQuery } from "../assistant.queries";

import { MessageItem, UserBubble } from "./assistant-message";
import { ChatInput } from "./chat-input";
import { ConversationList } from "./conversation-list";

import type { PageContext } from "../assistant.types";
import type { MouseEvent } from "react";

export type AssistantChatProps = {
  variant: "page" | "drawer";
  context?: PageContext | undefined;
  onNavigate?: (() => void) | undefined;
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function AssistantChat({ variant, context, onNavigate }: AssistantChatProps) {
  const { t } = useTranslation("assistant");
  const { t: tc, i18n } = useTranslation();
  const profile = useAssistantProfileQuery();
  const conversations = useConversationsQuery();
  const [activeId, setActive] = useActiveConversation();
  const list = conversations.data ?? [];
  const known = !conversations.isSuccess || list.some((c) => c.id === activeId);
  const currentId = activeId && known ? activeId : null;
  const messages = useMessagesQuery(currentId);
  const create = useCreateConversationMutation();
  const remove = useDeleteConversationMutation();
  const ask = useAskMutation();
  const decide = useDecideProposalMutation();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (activeId && !known) setActive(null);
  }, [activeId, known, setActive]);

  const messageCount = messages.data?.length ?? 0;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, pending, streamText, error]);

  const name = profile.data ? pickLabel(profile.data.name, i18n.language) : t("TITLE");
  const examples = profile.data?.examples ?? [];

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    setPending(content);
    setStreamText("");
    setInput("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let id = currentId;
      if (!id) {
        id = (await create.mutateAsync()).id;
        setActive(id);
      }
      await ask.mutateAsync({
        conversationId: id,
        content,
        context,
        language: i18n.language,
        signal: controller.signal,
        onDelta: (delta) => setStreamText((text) => text + delta),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setInput(content);
      setError(t("SEND_FAILED", { message: errorMessage(err, tc("BIZERR")) }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(null);
      setStreamText("");
    }
  }

  async function decideProposal(proposalId: string, decision: "confirm" | "reject", version: number) {
    if (!currentId) return;
    setError(null);
    setDecidingId(proposalId);
    try {
      await decide.mutateAsync({ conversationId: currentId, proposalId, decision, version });
    } catch (err) {
      setError(t("DECIDE_FAILED", { message: errorMessage(err, tc("BIZERR")) }));
    } finally {
      setDecidingId(null);
    }
  }

  async function deleteConversation(id: string) {
    await remove.mutateAsync(id);
    if (id === activeId) setActive(null);
  }

  function startNew() {
    setActive(null);
    setError(null);
  }

  function closeOnLink(event: MouseEvent<HTMLDivElement>) {
    if (onNavigate && (event.target as HTMLElement).closest("a")) onNavigate();
  }

  const showWelcome = !pending && (!currentId || (messages.isSuccess && messageCount === 0));
  const quota = profile.data ? (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      {t("QUOTA", profile.data.quota)}
      {profile.data.mode === "offline" ? <ToneBadge label={t("OFFLINE")} tone="info" /> : null}
    </span>
  ) : null;

  const log = (
    <div
      aria-label={t("CHAT_LOG")}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:px-6"
      onClickCapture={closeOnLink}
      ref={logRef}
      role="log"
    >
      {showWelcome ? (
        <div className="m-auto max-w-[560px] p-5 text-center">
          <span className="mx-auto mb-3.5 grid size-16 place-items-center rounded-[18px] bg-primary text-xl font-bold text-primary-foreground">
            AI
          </span>
          <h2 className="mb-1.5 text-lg font-semibold">{t("WELCOME_TITLE")}</h2>
          <p className="text-sm text-muted-foreground">{t("WELCOME_DESC", { name })}</p>
          {examples.length ? (
            <div aria-label={t("EXAMPLES")} className="mt-3 flex flex-wrap justify-center gap-2" role="group">
              {examples.map((q) => (
                <button
                  className="h-7 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  key={q}
                  onClick={() => void send(q)}
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        (messages.data ?? []).map((m) => (
          <MessageItem
            decidingId={decidingId}
            key={m.id}
            message={m}
            onDecide={(proposalId, decision, version) => void decideProposal(proposalId, decision, version)}
          />
        ))
      )}
      {pending ? (
        <>
          <UserBubble text={pending} />
          {streamText ? (
            <article
              aria-busy="true"
              className="w-full max-w-[760px] self-start rounded-[14px] border border-border bg-card p-4"
              data-testid="assistant-streaming"
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {streamText}
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom"
                />
              </p>
            </article>
          ) : (
            <div className="flex items-center gap-2 self-start rounded-[14px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-primary" />
              {t("THINKING")}
            </div>
          )}
        </>
      ) : null}
      {error ? (
        <Alert className="border-destructive/40" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );

  const inputBox = (
    <ChatInput disabled={pending !== null} onChange={setInput} onSubmit={() => void send(input)} value={input} />
  );

  if (variant === "drawer") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border py-3 pr-12 pl-4">
          <Bot aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            {quota}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={t("RECENT_MENU")} size="icon" type="button" variant="ghost">
                <History aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>{t("RECENT")}</DropdownMenuLabel>
              {list.length ? (
                list.slice(0, 12).map((c) => (
                  <DropdownMenuItem
                    className={cn(c.id === currentId && "bg-muted")}
                    key={c.id}
                    onSelect={() => setActive(c.id)}
                  >
                    <span className="truncate">{c.title}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>{t("RECENT_EMPTY")}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button aria-label={t("NEW_CHAT")} onClick={startNew} size="icon" type="button" variant="ghost">
            <Plus aria-hidden="true" className="size-4" />
          </Button>
          <Button aria-label={t("OPEN_FULL")} asChild size="icon" variant="ghost">
            <Link onClick={onNavigate} to="/assistant">
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </header>
        {log}
        {inputBox}
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-11rem)] min-h-[520px] grid-cols-1 overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-r border-border p-3.5 md:flex">
        <div className="min-h-0 flex-1">
          <ConversationList
            activeId={currentId}
            conversations={list}
            onDelete={deleteConversation}
            onNew={startNew}
            onSelect={(id) => {
              setActive(id);
              setError(null);
            }}
          />
        </div>
        {quota}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        {log}
        {inputBox}
      </div>
    </div>
  );
}
