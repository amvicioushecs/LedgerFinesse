"use client";

import { useEffect } from "react";

/**
 * Polls the audit status and reloads the clean audit URL once it changes from `waitingFor`
 * (e.g. preview_ready → unlocked after the Stripe webhook). Gives up after ~2 minutes.
 */
export function WaitForStatus({ auditId, href, waitingFor, everyMs = 2000, maxTries = 60 }: { auditId: string; href: string; waitingFor: string; everyMs?: number; maxTries?: number }) {
  useEffect(() => {
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      if (tries > maxTries) return clearInterval(id);
      const res = await fetch(`/api/audits/${auditId}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const { status } = (await res.json()) as { status: string };
      if (status !== waitingFor) {
        clearInterval(id);
        window.location.replace(href);
      }
    }, everyMs);
    return () => clearInterval(id);
  }, [auditId, href, waitingFor, everyMs, maxTries]);
  return null;
}
