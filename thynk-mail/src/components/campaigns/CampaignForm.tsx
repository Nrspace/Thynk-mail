'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Save, Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface Account    { id: string; name: string; email: string; daily_limit: number; sent_today: number; last_reset_date?: string; }
interface ContactList { id: string; name: string; contact_count: number; }
interface Template   { id: string; name: string; subject: string; html_body: string; }

interface CampaignFormData {
  name: string; subject: string; from_name: string; from_email: string;
  reply_to: string; html_body: string; account_id: string;
  list_ids: string[]; template_id: string; scheduled_at: string;
}

interface Props {
  mode: 'new' | 'edit';
  campaignId?: string;
  initial?: Partial<CampaignFormData>;
}

export default function CampaignForm({ mode, campaignId, initial }: Props) {
  const router = useRouter();
  const [saving, setSaving]   = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendProgress, setSendProgress] = useState<{ sent: number; failed: number; total: number; pct: number } | null>(null);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [lists, setLists]         = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [form, setForm] = useState<CampaignFormData>({
    name: '', subject: '', from_name: '', from_email: '',
    reply_to: '', html_body: '', account_id: '',
    list_ids: [], template_id: '', scheduled_at: '',
    ...initial,
  });

  useEffect(() => {
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.data ?? []));
    fetch('/api/contacts/lists').then(r => r.json()).then(d => setLists(d.data ?? []));
    fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.data ?? []));
  }, []);

  const set = (k: keyof CampaignFormData, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleTemplateChange = (id: string) => {
    const t = templates.find(t => t.id === id);
    if (t) { set('template_id', id); set('subject', t.subject); set('html_body', t.html_body); }
    else set('template_id', id);
  };

  const toggleList = (id: string) =>
    setForm(f => ({
      ...f,
      list_ids: f.list_ids.includes(id)
        ? f.list_ids.filter(x => x !== id)
        : [...f.list_ids, id],
    }));

  // Validate before save/send
  function validate(): string {
    if (!form.name.trim())       return 'Campaign name is required';
    if (!form.subject.trim())    return 'Subject line is required';
    if (!form.from_name.trim())  return 'From name is required';
    if (!form.from_email.trim()) return 'From email is required';
    if (!form.account_id)        return 'Please select a sending account';
    if (form.list_ids.length === 0) return 'Please select at least one recipient list';
    if (!form.html_body.trim())  return 'Email body cannot be empty';
    return '';
  }

  // Sanitize — convert empty strings to null for nullable fields
  function sanitizeForm(f: CampaignFormData) {
    return {
      ...f,
      scheduled_at: f.scheduled_at || null,
      reply_to:     f.reply_to     || null,
      template_id:  f.template_id  || null,
    };
  }

  // Save draft or schedule
  const handleSave = async (status: 'draft' | 'scheduled') => {
    const err = validate();
    if (err && status !== 'draft') { alert(err); return; }
    setSaving(true);
    try {
      const url    = mode === 'edit' ? `/api/campaigns/${campaignId}` : '/api/campaigns';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sanitizeForm(form), status }),
      });
      const data = await res.json();
      if (data.id || data.error === undefined) router.push('/campaigns');
      else alert(data.error ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  // Send now — save first, then stream SSE progress from queue route
  const handleSendNow = async () => {
    const err = validate();
    if (err) { alert(err); return; }
    setSending(true);
    setSendError('');
    setSendProgress(null);
    try {
      const url    = mode === 'edit' ? `/api/campaigns/${campaignId}` : '/api/campaigns';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const saveRes = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sanitizeForm(form), status: 'sending' }),
      });
      const campaign = await saveRes.json();
      if (campaign.error) { setSendError(campaign.error); setSending(false); return; }
      const cid = campaign.id ?? campaignId;

      // Read SSE stream — keeps gateway alive for large campaigns
      const sendRes = await fetch('/api/send/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: cid }),
      });
      if (!sendRes.ok || !sendRes.body) {
        const text = await sendRes.text().catch(() => `HTTP ${sendRes.status}`);
        setSendError(text.slice(0, 200));
        setSending(false);
        return;
      }

      const reader = sendRes.body.getReader();
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
            setSendProgress({ sent: data.sent, failed: data.failed, total: data.total, pct: data.pct });
          } else if (ev === 'done') {
            setSendProgress({ sent: data.sent, failed: data.failed, total: data.total, pct: 100 });
            setSent(true);
            setTimeout(() => router.push(`/campaigns/${cid}`), 2000);
          } else if (ev === 'error') {
            setSendError(data.error ?? 'Unknown error');
          }
        }
      }
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const selectedAccount = accounts.find(a => a.id === form.account_id);
  // If last_reset_date < today (UTC), the counter is stale — treat sent_today as 0
  const todayUTC = new Date().toISOString().slice(0, 10);
  const effectiveSentToday = (acc: Account) =>
    (acc.last_reset_date ?? '') < todayUTC ? 0 : acc.sent_today;
  const remainingToday = selectedAccount
    ? selectedAccount.daily_limit - effectiveSentToday(selectedAccount)
    : null;

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/campaigns" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-semibold">
          {mode === 'edit' ? 'Edit Campaign' : 'New Campaign'}
        </h1>
      </div>

      {/* Send success banner */}
      {sent && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Campaign sent! Redirecting…</p>
          </div>
        </div>
      )}

      {/* Live send progress banner */}
      {sendProgress && !sent && (
        <div className="mb-6 border rounded-xl px-5 py-4" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Sending… {sendProgress.sent}/{sendProgress.total}
              {sendProgress.failed > 0 && <span className="text-red-500 ml-2">{sendProgress.failed} failed</span>}
            </span>
            <span className="font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>{sendProgress.pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${sendProgress.pct}%`, background: 'linear-gradient(90deg,#14b8a6,#6366f1)' }} />
          </div>
        </div>
      )}

      {/* Send error banner */}
      {sendError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm">
          <strong>Send failed:</strong> {sendError}
        </div>
      )}

      <div className="space-y-6">
        {/* Campaign Details */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Campaign Details</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input className="input" placeholder="e.g. April Newsletter"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
            <input className="input" placeholder="Your email subject"
              value={form.subject} onChange={e => set('subject', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
              <input className="input" placeholder="Your Name"
                value={form.from_name} onChange={e => set('from_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
              <input className="input" placeholder="you@domain.com"
                value={form.from_email} onChange={e => set('from_email', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To (optional)</label>
            <input className="input" placeholder="replies@domain.com"
              value={form.reply_to} onChange={e => set('reply_to', e.target.value)} />
          </div>
        </div>

        {/* Sending Account */}
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Sending Account</h2>
          {accounts.length === 0 ? (
            <p className="text-sm text-amber-600">
              No email accounts connected.{' '}
              <Link href="/accounts" className="underline">Add one first →</Link>
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {accounts.map(a => {
                  const sentEff   = effectiveSentToday(a);
                  const pct       = a.daily_limit > 0 ? Math.round((sentEff / a.daily_limit) * 100) : 0;
                  const remaining = a.daily_limit - sentEff;
                  return (
                    <label key={a.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.account_id === a.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="account" value={a.id}
                        checked={form.account_id === a.id}
                        onChange={() => set('account_id', a.id)}
                        className="text-teal-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">{a.name}</span>
                          <span className="text-xs text-gray-500">{remaining} left today</span>
                        </div>
                        <p className="text-xs text-gray-400">{a.email}</p>
                        <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-400' : 'bg-teal-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {remainingToday !== null && remainingToday <= 0 && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  ⚠️ This account has reached its daily limit. Choose another account or wait until tomorrow.
                </p>
              )}
            </>
          )}
        </div>

        {/* Recipients */}
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Recipients</h2>
          {lists.length === 0 ? (
            <p className="text-sm text-gray-500">
              No contact lists yet.{' '}
              <Link href="/contacts" className="text-teal-600 underline">Add contacts first →</Link>
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {lists.map(l => (
                  <label key={l.id} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={form.list_ids.includes(l.id)}
                      onChange={() => toggleList(l.id)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm text-gray-700">{l.name}</span>
                    <span className="text-xs text-gray-400">({l.contact_count} contacts)</span>
                  </label>
                ))}
              </div>
              {form.list_ids.length > 0 && (
                <p className="text-xs text-teal-600 font-medium">
                  ✓ {lists.filter(l => form.list_ids.includes(l.id)).reduce((s, l) => s + l.contact_count, 0).toLocaleString()} total recipients selected
                </p>
              )}
            </>
          )}
        </div>

        {/* Email Content */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Email Content</h2>
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Load from Template</label>
              <select className="input" value={form.template_id}
                onChange={e => handleTemplateChange(e.target.value)}>
                <option value="">Choose a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HTML Body</label>
            <textarea className="input font-mono text-xs" rows={10}
              placeholder="<html><body><p>Hello {{first_name}},</p></body></html>"
              value={form.html_body}
              onChange={e => set('html_body', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">
              Use {`{{first_name}}`}, {`{{last_name}}`}, {`{{email}}`} for personalisation
            </p>
          </div>
        </div>

        {/* Schedule */}
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Schedule (optional)</h2>
          <p className="text-xs text-gray-500">Leave empty to send immediately.</p>
          <input type="datetime-local" className="input max-w-xs"
            value={form.scheduled_at}
            onChange={e => set('scheduled_at', e.target.value)} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => handleSave('draft')} disabled={saving || sending}
            className="btn-secondary">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Draft
          </button>

          {form.scheduled_at ? (
            <button onClick={() => handleSave('scheduled')} disabled={saving || sending}
              className="btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Schedule Campaign
            </button>
          ) : (
            <button onClick={handleSendNow} disabled={saving || sending || sent}
              className="btn-primary">
              {sending
                ? <><Loader2 size={14} className="animate-spin" /> Sending...</>
                : sent
                ? <><CheckCircle size={14} /> Sent!</>
                : <><Send size={14} /> Send Now</>
              }
            </button>
          )}

          <Link href="/campaigns" className="text-sm text-gray-400 hover:text-gray-600 ml-2">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
