import { Building2, ChevronRight, FolderTree, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { OrgNode } from "../iam.types";

type TreeNode = OrgNode & { children: TreeNode[] };

export function buildOrgTree(nodes: OrgNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    const parent = node.parentId ? map.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function matches(node: TreeNode, keyword: string): boolean {
  return (
    node.name.includes(keyword) ||
    node.code.toLowerCase().includes(keyword.toLowerCase()) ||
    node.children.some((c) => matches(c, keyword))
  );
}

type OrgTreeProps = { nodes: OrgNode[]; selectedId: string | null; onSelect: (id: string) => void };

export function OrgTree({ nodes, selectedId, onSelect }: OrgTreeProps) {
  const { t } = useTranslation("iam");
  const [keyword, setKeyword] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const roots = useMemo(() => buildOrgTree(nodes), [nodes]);

  function render(node: TreeNode, depth: number) {
    if (keyword && !matches(node, keyword)) return null;
    const open = keyword !== "" || !collapsed.has(node.id);
    const Icon = node.type === "GROUP" ? Building2 : node.children.length ? FolderTree : Users;
    return (
      <li key={node.id}>
        <div
          className={cn(
            "flex h-8 cursor-pointer items-center gap-1 rounded-md pr-2 text-sm hover:bg-muted",
            selectedId === node.id && "bg-primary-soft font-medium text-primary",
          )}
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          {node.children.length ? (
            <button
              aria-label={open ? t("COLLAPSE") : t("EXPAND")}
              className="inline-flex size-5 items-center justify-center rounded hover:bg-muted"
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
            >
              <ChevronRight aria-hidden="true" className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            </button>
          ) : (
            <span className="inline-block size-5" />
          )}
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            type="button"
            onClick={() => onSelect(node.id)}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
            {node.status !== "ACTIVE" ? <span className="text-xs text-muted-foreground">({t("DISABLED")})</span> : null}
          </button>
        </div>
        {open && node.children.length ? <ul>{node.children.map((c) => render(c, depth + 1))}</ul> : null}
      </li>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-2">
        <Search
          aria-hidden="true"
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t("ORG_SEARCH")}
          className="h-9 pl-8"
          placeholder={t("ORG_SEARCH")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>
      <ul aria-label={t("ORG_TREE")} className="flex-1 overflow-y-auto">
        {roots.map((root) => render(root, 0))}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        {t("ORG_COUNT", { count: nodes.length })}
      </p>
    </div>
  );
}
