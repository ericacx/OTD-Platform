export const assistantKeys = {
  all: () => ["assistant"] as const,
  profile: () => [...assistantKeys.all(), "profile"] as const,
  conversations: () => [...assistantKeys.all(), "conversations"] as const,
  messages: (conversationId: string) => [...assistantKeys.all(), "messages", conversationId] as const,
};
