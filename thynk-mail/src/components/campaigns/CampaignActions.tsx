'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit, Copy, Send, Trash2, Loader2, MoreHorizontal, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

interface Campaign {
  id: string; name: string; status: string;
  subject: string; from_name: string; from_email: string;
  reply_to?: string; html_body: string; account_id: string;
  list_ids: string[]; template_id?: string;
}

interface SendState {
  phase: 'idle' | 'sending' | 'done' | 'error';
  sent: number; failed: number; total: number; pct: number;
  message: string;
}

export default function CampaignActions({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [copying, setCopying] = useState(false);
  const [sendState, setSendState] = useState<SendState>({
    phase: 'idle', sent: 0, failed: 0, total: 0, pct: 0, message: '',
  });

  const canEdit = ['draft', 'scheduled', 'failed'].includes(campaign.status);
  const canSend = ['draft', 'failed'].includes(campaign.status);
  const isSending = sendState.phase === 'sending';

  async function handleSendNow() {
    if (!confirm(`Send "${campaign.name}" now?`)) return;
    setOpen(false);
    setSendState({ phase: 'sending', sent: 0, failed: 0, total: 0, pct: 0, message: 'Connecting…' });

    try {
      const res = await fetch('/api/send/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        setSendState(s => ({ ...s, phase: 'error', message: text.slice(0, 200) }));
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const evMatch   = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!evMatch || !dataMatch) continue;
          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }
          const ev = evMatch[1];

          if (ev === 'progress') {
            setSendState({
              phase: 'sending',
              sent: data.sent, failed: data.failed, total: data.total, pct: data.pct,
              message: `Sent ${data.sent} of ${data.total}${data.failed ? ` · ${data.failed} failed` : ''}`,
            });
          } else if (ev === 'done') {
            setSendState({
              phase: 'done',
              sent: data.sent, failed: data.failed, total: data.total, pct: 100,
              message: `Done — ${data.sent} sent, ${data.failed} failed`,
            });
            setTimeout(() => {
              setSendState(s => ({ ...s, phase: 'idle' }));
              router.refresh();
            }, 3000);
          } else if (ev === 'error') {
            setSendState(s => ({ ...s, phase: 'error', message: data.error ?? 'Unknown error' }));
          }
        }
      }
    } catch (e: unknown) {
      setSendState(s => ({
        ...s, phase: 'error',
        message: e instanceof Error ? e.message : 'Network error',
      }));
    }
  }

  async function handleCopy() {
    setCopying(true); setOpen(false);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${campaign.name} (Copy)`, subject: campaign.subject,
          from_name: campaign.from_name, from_email: campaign.from_email,
          reply_to: campaign.reply_to ?? '', html_body: campaign.html_body,
          account_id: campaign.account_id, list_ids: campaign.list_ids,
          template_id: campaign.template_id ?? '', status: 'draft',
        }),
      });
      const data = await res.json();
      if (data.id) router.push(`/campaigns/${data.id}/edit`);
      else alert(data.error ?? 'Failed to copy');
    } finally { setCopying(false); router.refresh(); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    setOpen(false);
    await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <>
      {/* ── Send progress overlay ─────────────────────────────────────── */}
      {sendState.phase !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl border p-6 flex flex-col gap-4"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            {/* Header */}
            <div className="flex items-center gap-3">
              {sendState.phase === 'sending' && (
                <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <Loader2 size={18} className="text-teal-600 animate-spin" />
                </div>
              )}
              {sendState.phase === 'done' && (
                <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={18} className="text-green-600" />
                </div>
              )}
              {sendState.phase === 'error' && (
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <XCircle size={18} className="text-red-500" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {sendState.phase === 'sending' ? 'Sending campaign…'
                   : sendState.phase === 'done'   ? 'Campaign sent!'
                   : 'Send failed'}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{campaign.name}</p>
              </div>
            </div>

            {/* Progress bar */}
            {(sendState.phase === 'sending' || sendState.phase === 'done') && (
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>{sendState.message}</span>
                  <span className="font-mono font-semibold">{sendState.pct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${sendState.pct}%`,
                      background: sendState.phase === 'done'
                        ? 'linear-gradient(90deg,#10b981,#14b8a6)'
                        : 'linear-gradient(90deg,#14b8a6,#6366f1)',
                    }}
                  />
                </div>
                {sendState.total > 0 && (
                  <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>✓ <b style={{ color: '#10b981' }}>{sendState.sent}</b> sent</span>
                    {sendState.failed > 0 && (
                      <span>✗ <b style={{ color: '#ef4444' }}>{sendState.failed}</b> failed</span>
                    )}
                    <span style={{ marginLeft: 'auto' }}>{sendState.total} total</span>
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {sendState.phase === 'error' && (
              <div className="rounded-lg px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-100">
                {sendState.message}
              </div>
            )}

            {/* Actions */}
            {sendState.phase !== 'sending' && (
              <button
                onClick={() => { setSendState(s => ({ ...s, phase: 'idle' })); router.refresh(); }}
                className="btn-secondary w-full text-sm"
              >
                {sendState.phase === 'done' ? 'Close' : 'Dismiss'}
              </button>
            )}
            {sendState.phase === 'sending' && (
              <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                Keep this tab open · Do not close or refresh
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-1">
        {canEdit && (
          <Link href={`/campaigns/${campaign.id}/edit`}
            className="p-1.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Edit">
            <Edit size={14} />
          </Link>
        )}
        {canSend && (
          <button onClick={handleSendNow} disabled={isSending}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Send now">
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        )}

        <div className="relative">
          <button onClick={() => setOpen(v => !v)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="More">
            <MoreHorizontal size={14} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-gray-100 shadow-lg py-1 w-44">
                {canEdit && (
                  <Link href={`/campaigns/${campaign.id}/edit`} onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Edit size={13} className="text-gray-400" /> Edit campaign
                  </Link>
                )}
                <button onClick={handleCopy} disabled={copying}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {copying ? <Loader2 size={13} className="text-gray-400 animate-spin" /> : <Copy size={13} className="text-gray-400" />}
                  {copying ? 'Copying...' : 'Duplicate'}
                </button>
                {canSend && (
                  <button onClick={handleSendNow} disabled={isSending}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">
                    {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {isSending ? 'Sending...' : 'Send now'}
                  </button>
                )}
                <div className="border-t border-gray-100 my-1" />
                <button onClick={handleDelete}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
