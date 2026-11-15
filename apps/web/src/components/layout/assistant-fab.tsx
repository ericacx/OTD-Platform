import { Bot } from "lucide-react";
import { Link } from "react-router";

type AssistantFabProps = { to: string; label: string; size: number };

export function AssistantFab({ to, label, size }: AssistantFabProps) {
  return (
    <Link
      aria-label={label}
      className="fixed right-6 bottom-6 z-40 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ width: size, height: size }}
      title={label}
      to={to}
    >
      <Bot aria-hidden="true" style={{ width: size * 0.42, height: size * 0.42 }} />
    </Link>
  );
}
