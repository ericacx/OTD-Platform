import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { BizError } from "@/lib/http/errors";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { assistantKeys } from "./assistant.keys";
import { streamAsk, type StreamAskInput } from "./assistant.stream";

import type { AssistantMessageDto, AssistantReplyDto, ConversationDto, ProposalDto } from "./assistant.types";

export function useCreateConversationMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<ConversationDto, void>({
    mutationFn: () => api.post<ConversationDto>("/assistant/conversations", {}),
    async onSuccess(conversation) {
      queryClient.setQueryData<AssistantMessageDto[]>(assistantKeys.messages(conversation.id), []);
      await queryClient.invalidateQueries({ queryKey: assistantKeys.conversations() });
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, string>({
    mutationFn: (id) => api.delete<null>(`/assistant/conversations/${id}`),
    async onSuccess(_data, id) {
      queryClient.removeQueries({ queryKey: assistantKeys.messages(id) });
      await queryClient.invalidateQueries({ queryKey: assistantKeys.conversations() });
    },
  });
}

export type AskVariables = Omit<StreamAskInput, "onDelta"> & { onDelta?: ((text: string) => void) | undefined };

export function useAskMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<AssistantReplyDto, AskVariables>({
    mutationFn: ({ onDelta, ...input }) => streamAsk({ ...input, onDelta: onDelta ?? (() => undefined) }),
    async onSuccess(reply, { conversationId }) {
      queryClient.setQueryData<AssistantMessageDto[]>(assistantKeys.messages(conversationId), (old) => [
        ...(old ?? []),
        reply.question,
        reply.answer,
      ]);
      await queryClient.invalidateQueries({ queryKey: assistantKeys.conversations() });
      await queryClient.invalidateQueries({ queryKey: assistantKeys.profile() });
    },
  });
}

export type DecideVariables = {
  conversationId: string;
  proposalId: string;
  decision: "confirm" | "reject";
  version: number;
};

function replaceProposal(messages: AssistantMessageDto[] | undefined, proposal: ProposalDto) {
  return messages?.map((m) =>
    m.answer?.proposals?.some((p) => p.id === proposal.id)
      ? {
          ...m,
          answer: { ...m.answer, proposals: m.answer.proposals.map((p) => (p.id === proposal.id ? proposal : p)) },
        }
      : m,
  );
}

export function useDecideProposalMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<ProposalDto, DecideVariables>({
    mutationFn: ({ proposalId, decision, version }) =>
      api.post<ProposalDto>(`/assistant/proposals/${proposalId}/${decision}`, { version }),
    async onSuccess(proposal, { conversationId }) {
      queryClient.setQueryData<AssistantMessageDto[]>(assistantKeys.messages(conversationId), (old) =>
        replaceProposal(old, proposal),
      );
      await queryClient.invalidateQueries({ queryKey: ["todo"] });
      await queryClient.invalidateQueries({ queryKey: ["receivable"] });
    },
    async onError(error, { conversationId }) {
      if (error instanceof BizError) {
        await queryClient.invalidateQueries({ queryKey: assistantKeys.messages(conversationId) });
      }
    },
  });
}
