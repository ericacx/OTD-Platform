import { useSyncExternalStore } from "react";

import { readStorage, writeStorage } from "@/lib/storage";

const STORAGE_KEY = "otd.assistant.activeConversation";
const listeners = new Set<() => void>();
let active: string | null = readStorage<string | null>(STORAGE_KEY, null);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActiveConversation(id: string | null) {
  active = id;
  writeStorage(STORAGE_KEY, id);
  for (const listener of listeners) listener();
}

export function useActiveConversation(): [string | null, (id: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => active,
    () => active,
  );
  return [value, setActiveConversation];
}
