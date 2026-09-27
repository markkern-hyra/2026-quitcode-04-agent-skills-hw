"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page every few seconds so a queued quote picks up the result
// saved by the n8n callback. It only re-reads our own state: n8n is never polled.
// Polling stops after stopAfterMs: an open tab must not refresh forever if no callback comes.
export function RefreshWhileQueued({ intervalMs = 5000, stopAfterMs = 10 * 60 * 1000 }: { intervalMs?: number; stopAfterMs?: number }) {
  const router = useRouter();
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    const stop = setTimeout(() => {
      clearInterval(timer);
      setStopped(true);
    }, stopAfterMs);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [router, intervalMs, stopAfterMs]);

  return stopped ? (
    <p role="status" className="text-slate-600">
      Сторінка більше не оновлюється сама. Оновіть її пізніше, щоб побачити результат.
    </p>
  ) : null;
}
