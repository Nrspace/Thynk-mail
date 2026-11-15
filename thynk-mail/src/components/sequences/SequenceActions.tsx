'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Rocket, Pause, Play, Ban, Trash2, Edit, Loader2 } from 'lucide-react';

interface Props { id: string; name: string; status: string }

export default function SequenceActions({ id, name, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // Keep progress fresh while the sequence is running.
  useEffect(() => {
    if (status !== 'active') return;
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [status, router]);

  async function run(action: 'launch' | 'pause' | 'resume' | 'cancel', confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setBusy(action); setError('');
    try {
      const res = await fetch(`/api/sequences/${id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Action failed'); return; }
      if (action === 'launch' && data.startsNow && data.firstCampaignId) {
        fetch('/api/send/queue', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: data.firstCampaignId }),
        }).catch(() => null);
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally { setBusy(''); }
  }

  async function remove() {
    if (!confirm(`Delete "${name}"? Emails already sent stay in Campaigns and Reports. This cannot be undone.`)) return;
    setBusy('delete'); setError('');
    try {
      const res = await fetch(`/api/sequences/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Delete failed'); return; }
      router.push('/sequences'); router.refresh();
    } finally { setBusy(''); }
  }

  const Spin = ({ a }: { a: string }) => busy === a ? <Loader2 size={14} className="animate-spin" /> : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {status === 'draft' && (
          <>
            <Link href={`/sequences/${id}/edit`} className="btn-secondary"><Edit size={14} /> Edit</Link>
            <button disabled={!!busy} className="btn-primary"
              onClick={() => run('launch', `Launch "${name}"? Email 1 is sent right away (or at its start time) and the rest follow automatically.`)}>
              <Spin a="launch" />{busy !== 'launch' && <Rocket size={14} />} Launch
            </button>
          </>
        )}
        {status === 'active' && (
          <button disabled={!!busy} className="btn-secondary"
            onClick={() => run('pause', `Pause "${name}"? Nothing more will be sent until you resume.`)}>
            <Spin a="pause" />{busy !== 'pause' && <Pause size={14} />} Pause
          </button>
        )}
        {status === 'paused' && (
          <button disabled={!!busy} className="btn-primary"
            onClick={() => run('resume', `Resume "${name}"?`)}>
            <Spin a="resume" />{busy !== 'resume' && <Play size={14} />} Resume
          </button>
        )}
        {(status === 'active' || status === 'paused') && (
          <button disabled={!!busy} className="btn-secondary !text-red-600"
            onClick={() => run('cancel', `Cancel "${name}"? Emails that haven't been sent yet are removed and will not go out.`)}>
            <Spin a="cancel" />{busy !== 'cancel' && <Ban size={14} />} Cancel
          </button>
        )}
        {['draft', 'completed', 'cancelled'].includes(status) && (
          <button disabled={!!busy} className="btn-secondary !text-red-600" onClick={remove}>
            <Spin a="delete" />{busy !== 'delete' && <Trash2 size={14} />} Delete
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 max-w-sm text-right">{error}</p>}
    </div>
  );
}
