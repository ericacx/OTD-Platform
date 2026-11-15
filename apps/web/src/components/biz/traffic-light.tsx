import { LIGHTS, pickLabel, type Light } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const DOT: Record<Light, string> = { RED: "bg-danger", YELLOW: "bg-warning", GREEN: "bg-success" };

type TrafficLightProps = { light: Light; label?: string; className?: string };

export function TrafficLight({ light, label, className }: TrafficLightProps) {
  const { i18n } = useTranslation();
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)} data-light={light}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[light])} />
      <span>{label ?? pickLabel(LIGHTS[light].label, i18n.language)}</span>
    </span>
  );
}
