'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Save, Loader2, CheckCircle, Plus, X } from 'lucide-react';
import Link from 'next/link';

interface Account    { id: string; name: string; email: string; daily_limit: number; sent_today: number; last_reset_date?: string; }
interface ContactList { id: string; name: string; contact_count: number; }
interface Template   { id: string; name: string; subject: string; html_body: string; }

interface CampaignFormData {
  name: string; subject: string; from_name: string; from_email: string;
  reply_to: string; html_body: string;
  // Multi-account: array of account ids
  account_ids: string[];
  list_ids: string[]; template_id: string; scheduled_at: string;
}

interface Props {
  mode: 'new' | 'edit';
  campaignId?: string;
  initial?: Partial<CampaignFormData & { account_id?: string }>;
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

  // Normalise initial: support old single account_id for backwards compat
  const normaliseInitial = (init?: Partial<CampaignFormData & { account_id?: string }>): Partial<CampaignFormData> => {
    if (!init) return {};
    const { account_id, ...rest } = init as any;
    return {
      ...rest,
      account_ids: init.account_ids?.length
        ? init.account_ids
        : account_id ? [account_id] : [],
    };
  };

  const [form, setForm] = useState<CampaignFormData>({
    name: '', subject: '', from_name: '', from_email: '',
    reply_to: '', html_body: '', account_ids: [],
    list_ids: [], template_id: '', scheduled_at: '',
    ...normaliseInitial(initial),
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

  const toggleAccount = (id: string) =>
    setForm(f => ({
      ...f,
      account_ids: f.account_ids.includes(id)
        ? f.account_ids.filter(x => x !== id)
        : [...f.account_ids, id],
    }));

  const todayUTC = new Date().toISOString().slice(0, 10);
  const effectiveSentToday = (acc: Account) =>
    (acc.last_reset_date ?? '') < todayUTC ? 0 : acc.sent_today;

  // Total capacity across selected accounts
  const selectedAccounts = accounts.filter(a => form.account_ids.includes(a.id));
  const totalCapacity = selectedAccounts.reduce((sum, a) => sum + (a.daily_limit - effectiveSentToday(a)), 0);
  const totalLimit    = selectedAccounts.reduce((sum, a) => sum + a.daily_limit, 0);

  function validate(): string {
    if (!form.name.trim())            return 'Campaign name is required';
    if (!form.subject.trim())         return 'Subject line is required';
    if (form.account_ids.length === 0) return 'Please select at least one sending account';
    if (form.list_ids.length === 0)   return 'Please select at least one recipient list';
    if (!form.html_body.trim())       return 'Email body cannot be empty';
    return '';
  }

  function sanitizeForm(f: CampaignFormData) {
    let scheduled_at: string | null = null;
    if (f.scheduled_at) {
      try { scheduled_at = new Date(f.scheduled_at).toISOString(); } catch { scheduled_at = null; }
    }
    return {
      ...f,
      scheduled_at,
      reply_to:    f.reply_to    || null,
      template_id: f.template_id || null,
      // Keep account_id as first selected for backwards compat; account_ids has the full list
      account_id:  f.account_ids[0] || null,
    };
  }

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
      if (data.id || data.error === undefined) {
        router.refresh();
        router.push('/campaigns');
      } else alert(data.error ?? 'Failed to save');
    } finally { setSaving(false); }
  };

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

      // Redirect immediately to campaigns list so user can see it running
      router.push('/campaigns');
      router.refresh();

      // Fire queue in background (don't block UI)
      fetch('/api/send/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: cid }),
      }).catch(() => null);

      setSent(true);
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Failed to send');
      setSending(false);
    }
  };

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
            <p className="font-semibold text-green-800">Campaign queued! Redirecting to campaigns…</p>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To Email</label>
            <input className="input" placeholder="replies@yourdomain.com — all replies will go here"
              value={form.reply_to} onChange={e => set('reply_to', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">All email replies will be sent to this address. From name &amp; email are taken from each sending account.</p>
          </div>
        </div>

        {/* Sending Accounts — Multi-select */}
        <div className="card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Sending Accounts</h2>
            {form.account_ids.length > 0 && (
              <span className="text-xs text-teal-600 font-medium bg-teal-50 px-2 py-0.5 rounded-full">
                {form.account_ids.length} selected · {totalCapacity.toLocaleString()} emails remaining today
              </span>
            )}
          </div>

          {accounts.length === 0 ? (
            <p className="text-sm text-amber-600">
              No email accounts connected.{' '}
              <Link href="/accounts" className="underline">Add one first →</Link>
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                Select one or more accounts. Emails will rotate across accounts respecting each account's daily limit.
              </p>
              <div className="space-y-2">
                {accounts.map(a => {
                  const sentEff   = effectiveSentToday(a);
                  const pct       = a.daily_limit > 0 ? Math.round((sentEff / a.daily_limit) * 100) : 0;
                  const remaining = a.daily_limit - sentEff;
                  const selected  = form.account_ids.includes(a.id);
                  const exhausted = remaining <= 0;
                  return (
                    <label key={a.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                        ${selected    ? 'border-teal-500 bg-teal-50'
                        : exhausted  ? 'border-gray-100 bg-gray-50 opacity-60'
                        : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox"
                        checked={selected}
                        onChange={() => toggleAccount(a.id)}
                        disabled={exhausted && !selected}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">{a.name}</span>
                          <span className={`text-xs font-medium ${exhausted ? 'text-red-500' : 'text-gray-500'}`}>
                            {exhausted ? '⚠️ Limit reached' : `${remaining.toLocaleString()} left today`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{a.email}</p>
                        <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-400' : 'bg-teal-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Daily limit: {a.daily_limit.toLocaleString()} · Sent today: {sentEff.toLocaleString()}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Multi-account rotation info */}
              {form.account_ids.length > 1 && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
                  <p className="font-semibold">🔄 Round-robin rotation enabled</p>
                  <p>Emails will cycle through your {form.account_ids.length} selected accounts. When an account hits its daily limit, it's automatically skipped and the next one is used.</p>
                  <p className="font-medium">Combined capacity today: {totalCapacity.toLocaleString()} emails</p>
                </div>
              )}

              {form.account_ids.length > 0 && totalCapacity <= 0 && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  ⚠️ All selected accounts have reached their daily limits. Choose more accounts or wait until tomorrow.
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
          <p className="text-xs text-gray-500">
            Leave empty to send immediately. Scheduled campaigns auto-fire within 5 minutes of the selected time.
          </p>
          <div>
            <input type="datetime-local" className="input max-w-xs"
              value={form.scheduled_at}
              onChange={e => set('scheduled_at', e.target.value)} />
            {form.scheduled_at && (
              <p className="text-xs text-teal-600 mt-1.5 font-medium">
                ⏰ Will send at {new Date(form.scheduled_at).toLocaleString()} (your local time ·{' '}
                {Intl.DateTimeFormat().resolvedOptions().timeZone})
              </p>
            )}
          </div>
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
                ? <><Loader2 size={14} className="animate-spin" /> Queuing...</>
                : sent
                ? <><CheckCircle size={14} /> Queued!</>
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
