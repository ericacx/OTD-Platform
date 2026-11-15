import { Link } from "react-router";

import { cn } from "@/lib/utils";

type DocNoLinkProps = { no: string | null | undefined; to?: string; className?: string };

export function DocNoLink({ no, to, className }: DocNoLinkProps) {
  if (!no) return <span className="text-muted-foreground">—</span>;
  const classes = cn("tabular font-medium whitespace-nowrap", className);
  return to ? (
    <Link className={cn(classes, "text-primary hover:underline")} to={to}>
      {no}
    </Link>
  ) : (
    <span className={classes}>{no}</span>
  );
}
