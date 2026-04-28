'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit, Copy, Send, Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

interface Campaign {
  id: string; name: string; status: string;
  subject: string; from_name: string; from_email: string;
  reply_to?: string; html_body: string; account_id: string;
  list_ids: string[]; template_id?: string;
}

export default function CampaignActions({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [sending, setSending] = useState(false);
  const [copying, setCopying] = useState(false);

  const canEdit = ['draft', 'scheduled', 'failed'].includes(campaign.status);
  const canSend = ['draft', 'failed'].includes(campaign.status);

  async function handleSendNow() {
    if (!confirm(`Send "${campaign.name}" now?`)) return;
    setSending(true);
    setOpen(false);
    try {
      // Set status to sending first
      await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sending' }),
      });
      // Trigger queue
      const res = await fetch('/api/send/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });

      // Guard against non-JSON responses (e.g. Vercel 504 timeout returns an HTML error page)
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        if (res.status === 504 || res.status === 502) {
          alert('The server timed out while sending. The campaign may still be processing — check back in a few minutes before retrying.');
        } else {
          const text = await res.text();
          alert(`Send failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
        }
        return;
      }

      const data = await res.json();
      if (data.error) alert(`Send error: ${data.error}`);
      else router.push(`/campaigns/${campaign.id}`);
    } finally {
      setSending(false);
      router.refresh();
    }
  }

  async function handleCopy() {
    setCopying(true);
    setOpen(false);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        `${campaign.name} (Copy)`,
          subject:     campaign.subject,
          from_name:   campaign.from_name,
          from_email:  campaign.from_email,
          reply_to:    campaign.reply_to ?? '',
          html_body:   campaign.html_body,
          account_id:  campaign.account_id,
          list_ids:    campaign.list_ids,
          template_id: campaign.template_id ?? '',
          status:      'draft',
        }),
      });
      const data = await res.json();
      if (data.id) router.push(`/campaigns/${data.id}/edit`);
      else alert(data.error ?? 'Failed to copy');
    } finally {
      setCopying(false);
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    setOpen(false);
    await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="relative flex items-center gap-1">
      {/* Quick edit button */}
      {canEdit && (
        <Link
          href={`/campaigns/${campaign.id}/edit`}
          className="p-1.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
          title="Edit"
        >
          <Edit size={14} />
        </Link>
      )}

      {/* Quick send button */}
      {canSend && (
        <button
          onClick={handleSendNow}
          disabled={sending}
          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Send now"
        >
          {sending
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />
          }
        </button>
      )}

      {/* More menu */}
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="More options"
        >
          <MoreHorizontal size={14} />
        </button>

        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            {/* Dropdown */}
            <div className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-gray-100 shadow-lg py-1 w-44">
              {canEdit && (
                <Link
                  href={`/campaigns/${campaign.id}/edit`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Edit size={13} className="text-gray-400" /> Edit campaign
                </Link>
              )}
              <button
                onClick={handleCopy}
                disabled={copying}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {copying
                  ? <Loader2 size={13} className="text-gray-400 animate-spin" />
                  : <Copy size={13} className="text-gray-400" />
                }
                {copying ? 'Copying...' : 'Duplicate'}
              </button>
              {canSend && (
                <button
                  onClick={handleSendNow}
                  disabled={sending}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                >
                  {sending
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Send size={13} />
                  }
                  {sending ? 'Sending...' : 'Send now'}
                </button>
              )}
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
