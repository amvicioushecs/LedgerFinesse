"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_DRAFT, type AuditDraft } from "@/lib/audit-input/draft";

const STORAGE_KEY = "ledgerfinesse:draft:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedDraft: AuditDraft = EMPTY_DRAFT;

function readDraft(): AuditDraft {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedDraft;
  cachedRaw = raw;
  try {
    cachedDraft = raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<AuditDraft>) } : EMPTY_DRAFT;
  } catch {
    cachedDraft = EMPTY_DRAFT;
  }
  return cachedDraft;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The renter's in-progress audit, saved to this browser's localStorage only. */
export function useDraft() {
  const draft = useSyncExternalStore(subscribe, readDraft, () => EMPTY_DRAFT);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const setDraft = useCallback((update: (current: AuditDraft) => AuditDraft) => {
    const next = update(readDraft());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    listeners.forEach((listener) => listener());
  }, []);
  const clearDraft = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    listeners.forEach((listener) => listener());
  }, []);
  return { draft, setDraft, clearDraft, hydrated };
}
