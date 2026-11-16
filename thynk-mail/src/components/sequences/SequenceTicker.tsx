'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Invisible helper: while MailFlow is open in a browser tab it asks the server
 * to run the sequence scheduler + push sending campaigns forward once a minute.
 * Works without any cron service. (If a cron is also configured, the two are
 * safe together — the send engine locks each campaign.)
 */
export default function SequenceTicker() {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (running.current || stopped) return;
      running.current = true;
      try {
        const res = await fetch('/api/sequences/tick', { method: 'POST' });
        const d = await res.json().catch(() => null);
        if (res.ok && d && (d.sent > 0 || d.sequences?.activated || d.sequences?.completed || d.sequences?.paused)) router.refresh();
      } catch { /* try again next minute */ }
      finally { running.current = false; }
    }
    tick();
    const t = setInterval(tick, 60_000);
    return () => { stopped = true; clearInterval(t); };
  }, [router]);

  return null;
}
