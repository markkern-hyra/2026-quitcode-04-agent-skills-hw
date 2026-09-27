"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page every few seconds so a queued quote picks up the result
// saved by the n8n callback. It only re-reads our own state: n8n is never polled.
export function RefreshWhileQueued({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
