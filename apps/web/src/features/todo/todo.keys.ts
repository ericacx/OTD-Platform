export const todoKeys = {
  all: () => ["todo"] as const,
  overview: () => [...todoKeys.all(), "overview"] as const,
  board: () => [...todoKeys.all(), "board"] as const,
};
