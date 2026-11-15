import { Bot } from "lucide-react";

type AssistantFabProps = { label: string; size: number; onClick: () => void };

export function AssistantFab({ label, size, onClick }: AssistantFabProps) {
  return (
    <button
      aria-label={label}
      className="fixed right-6 bottom-6 z-40 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ width: size, height: size }}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Bot aria-hidden="true" style={{ width: size * 0.42, height: size * 0.42 }} />
    </button>
  );
}
