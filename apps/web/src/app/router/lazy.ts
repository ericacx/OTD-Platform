import type { ComponentType } from "react";

// Adapts a dynamic import that exports a named React component into the
// shape React Router v7 expects from the `lazy` field (`{ Component }`).
export function lazyRouteComponent<TExport extends string>(
  loader: () => Promise<Record<TExport, ComponentType>>,
  exportName: TExport,
) {
  return async () => {
    const loaded = await loader();

    return { Component: loaded[exportName] };
  };
}
