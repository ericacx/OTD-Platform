import { useEffect } from "react";
import { create } from "zustand";

export type PageDoc = { docType: string; docId: string; docNo: string };

type PageDocState = { doc: PageDoc | null; set: (doc: PageDoc | null) => void };

export const usePageDocStore = create<PageDocState>()((set) => ({
  doc: null,
  set: (doc) => set({ doc }),
}));

export function usePublishPageDoc(doc: PageDoc | null | undefined) {
  const docType = doc?.docType;
  const docId = doc?.docId;
  const docNo = doc?.docNo;
  useEffect(() => {
    if (!docType || !docId || !docNo) return;
    usePageDocStore.getState().set({ docType, docId, docNo });
    return () => {
      const current = usePageDocStore.getState().doc;
      if (current?.docId === docId) usePageDocStore.getState().set(null);
    };
  }, [docType, docId, docNo]);
}
