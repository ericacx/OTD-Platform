import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { assistantKeys } from "./assistant.keys";

import type { AssistantMessageDto, AssistantProfileDto, ConversationDto } from "./assistant.types";

export function useAssistantProfileQuery() {
  return useApiQuery<AssistantProfileDto>({
    queryKey: assistantKeys.profile(),
    queryFn: () => api.get<AssistantProfileDto>("/assistant/profile"),
  });
}

export function useConversationsQuery() {
  return useApiQuery<ConversationDto[]>({
    queryKey: assistantKeys.conversations(),
    queryFn: () => api.get<ConversationDto[]>("/assistant/conversations"),
  });
}

export function useMessagesQuery(conversationId: string | null) {
  return useApiQuery<AssistantMessageDto[]>({
    queryKey: assistantKeys.messages(conversationId ?? "none"),
    queryFn: () => api.get<AssistantMessageDto[]>(`/assistant/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
  });
}
