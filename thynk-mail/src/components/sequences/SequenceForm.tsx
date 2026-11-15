'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Rocket, Loader2, Plus, Trash2, Mail, CheckCircle, AlertCircle, Clock, ArrowDown,
} from 'lucide-react';
import {
  TIMEZONES, MAX_SEQUENCE_STEPS, MIN_SEQUENCE_STEPS,
  computeSchedule, wallInputToUtc, formatInTz,
} from '@/lib/sequence-time';

interface Account     { id: string; name: string; email: string; daily_limit: number; sent_today: number; last_reset_date?: string }
interface ContactList { id: string; name: string; contact_count: number }
interface Template    { id: string; name: string; subject: string; html_body: string }

type Audience = 'all' | 'not_opened' | 'opened' | 'not_clicked' | 'clicked';

interface StepForm {
  subject: string; html_body: string; template_id: string;
  delay_amount: number; delay_unit: 'hours' | 'days'; send_time: string; audience: Audience;
}

export interface SequenceFormInitial {
  name: string; reply_to: string; timezone: string; start_local: string;
  list_ids: string[]; account_ids: string[]; steps: StepForm[];
}

interface Props { mode: 'new' | 'edit'; sequenceId?: string; initial?: SequenceFormInitial }

const blankStep = (over: Partial<StepForm> = {}): StepForm => ({
  subject: '', html_body: '', template_id: '',
  delay_amount: 2, delay_unit: 'days', send_time: '10:00', audience: 'all', ...over,
});

const DEFAULT_STEPS: StepForm[] = [
  blankStep(),
  blankStep({ delay_amount: 2, send_time: '10:00' }),
  blankStep({ delay_amount: 3, send_time: '10:00' }),
];

const AUDIENCE_LABELS: Record<Audience, (n: number) => string> = {
  all:         n => n === 2 ? 'Everyone who received Email 1' : 'Everyone who received Email 1 (still subscribed)',
  not_opened:  n => `Only people who did NOT open Email ${n - 1}`,
  opened:      n => `Only people who opened Email ${n - 1}`,
  not_clicked: n => `Only people who did NOT click a link in Email ${n - 1}`,
  clicked:     n => `Only people who clicked a link in Email ${n - 1}`,
};

export default function SequenceForm({ mode, sequenceId, initial }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<'' | 'draft' | 'launch'>('');
  const [error, setError] = useState('');
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [lists, setLists]         = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting]     = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [form, setForm] = useState<SequenceFormInitial>(initial ?? {
    name: '', reply_to: '', timezone: 'Asia/Kolkata', start_local: '',
    list_ids: [], account_ids: [], steps: DEFAULT_STEPS,
  });

  useEffect(() => {
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.data ?? []));
    fetch('/api/contacts/lists').then(r => r.json()).then(d => setLists(d.data ?? []));
    fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.data ?? []));
  }, []);

  const setField = <K extends keyof SequenceFormInitial>(k: K, v: SequenceFormInitial[K]) => setForm(f => ({ ...f, [k]: v }));
  const setStep = (i: number, patch: Partial<StepForm>) =>
    setForm(f => ({ ...f, steps: f.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s) }));
  const addStep = () => setForm(f => f.steps.length >= MAX_SEQUENCE_STEPS ? f : ({ ...f, steps: [...f.steps, blankStep({ delay_amount: 3 })] }));
  const removeStep = (i: number) => setForm(f => f.steps.length <= MIN_SEQUENCE_STEPS ? f : ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));
  const toggle = (key: 'list_ids' | 'account_ids', id: string) =>
    setForm(f => ({ ...f, [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id] }));

  const applyTemplate = (i: number, id: string) => {
    const t = templates.find(t => t.id === id);
    setStep(i, t ? { template_id: id, subject: t.subject, html_body: t.html_body } : { template_id: id });
  };

  // Live preview of when each email will go out.
  const startDate = form.start_local ? wallInputToUtc(form.start_local, form.timezone) : null;
  const previewBase = startDate ?? new Date();
  const schedule = useMemo(
    () => computeSchedule(previewBase, form.steps, form.timezone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.steps, form.timezone, form.start_local]
  );

  const todayUTC = new Date().toISOString().slice(0, 10);
  const remaining = (a: Account) => a.daily_limit - ((a.last_reset_date ?? '') < todayUTC ? 0 : a.sent_today);
  const totalRecipients = lists.filter(l => form.list_ids.includes(l.id)).reduce((s, l) => s + l.contact_count, 0);

  function validateForLaunch(): string {
    if (!form.name.trim()) return 'Sequence name is required';
    if (!form.account_ids.length) return 'Select at least one sending account';
    if (!form.list_ids.length) return 'Select at least one recipient list';
    for (let i = 0; i < form.steps.length; i++) {
      if (!form.steps[i].subject.trim()) return `Email ${i + 1}: subject line is required`;
      if (!form.steps[i].html_body.trim()) return `Email ${i + 1}: email body is empty`;
    }
    return '';
  }

  async function save(launch: boolean) {
    setError('');
    if (!form.name.trim()) { setError('Sequence name is required'); return; }
    if (launch) {
      const err = validateForLaunch();
      if (err) { setError(err); return; }
      if (!confirm(
        `Launch "${form.name}"?\n\nEmail 1 goes out ${startDate && startDate > new Date() ? `on ${formatInTz(startDate, form.timezone)}` : 'immediately'}, ` +
        `and the remaining ${form.steps.length - 1} emails are sent automatically on the schedule shown.`
      )) return;
    }
    setSaving(launch ? 'launch' : 'draft');
    try {
      const res = await fetch(mode === 'edit' ? `/api/sequences/${sequenceId}` : '/api/sequences', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const saved = await res.json();
      if (!res.ok) { setError(saved.error ?? 'Failed to save'); return; }
      const id: string = saved.id ?? sequenceId;

      if (launch) {
        const lr = await fetch(`/api/sequences/${id}/action`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'launch' }),
        });
        const launched = await lr.json();
        if (!lr.ok) {
          // The draft is saved — take them to it so nothing typed is lost.
          alert(`Saved as draft, but launch failed: ${launched.error ?? 'unknown error'}`);
          router.push(`/sequences/${id}`); router.refresh(); return;
        }
        // Kick the first email off right away (best effort — the cron also picks it up within a minute).
        if (launched.startsNow && launched.firstCampaignId) {
          fetch('/api/send/queue', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: launched.firstCampaignId }),
          }).catch(() => null);
        }
      }
      router.push(`/sequences/${id}`);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(''); }
  }

  async function sendTest(i: number) {
    const email = testEmail.trim();
    const s = form.steps[i];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setTestResult({ ok: false, message: 'Enter a valid test email address first' }); return; }
    if (!form.account_ids.length) { setTestResult({ ok: false, message: 'Select a sending account first' }); return; }
    if (!s.subject.trim() || !s.html_body.trim()) { setTestResult({ ok: false, message: `Email ${i + 1} needs a subject and body first` }); return; }
    setTesting(i); setTestResult(null);
    try {
      const account = accounts.find(a => a.id === form.account_ids[0]);
      const html = s.html_body
        .replace(/\{\{first_name\}\}/g, 'Test').replace(/\{\{last_name\}\}/g, 'User').replace(/\{\{email\}\}/g, email);
      const res = await fetch('/api/send/now', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: form.account_ids[0], to: email, subject: `[TEST ${i + 1}/${form.steps.length}] ${s.subject}`, html, from_name: account?.name, from_email: account?.email }),
      });
      const data = await res.json();
      setTestResult(data.success ? { ok: true, message: `Test of Email ${i + 1} sent to ${email}` } : { ok: false, message: data.error ?? 'Failed to send test' });
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Failed to send test' });
    } finally { setTesting(null); }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/sequences" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-semibold">{mode === 'edit' ? 'Edit Sequence' : 'New Sequence'}</h1>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Details */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Sequence Details</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sequence Name</label>
            <input className="input" placeholder="e.g. School Admission Follow-up" value={form.name} onChange={e => setField('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To Email</label>
            <input className="input" placeholder="replies@yourdomain.com" value={form.reply_to} onChange={e => setField('reply_to', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">From name &amp; email are taken from the sending account, same as campaigns.</p>
          </div>
        </div>

        {/* Accounts */}
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Sending Accounts</h2>
          {accounts.length === 0 ? (
            <p className="text-sm text-amber-600">No email accounts connected. <Link href="/accounts" className="underline">Add one first →</Link></p>
          ) : (
            <>
              <p className="text-xs text-gray-400">Emails rotate across the selected accounts, respecting each account&apos;s daily limit — if a step hits the limit it continues automatically the next day.</p>
              <div className="space-y-2">
                {accounts.map(a => (
                  <label key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.account_ids.includes(a.id) ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={form.account_ids.includes(a.id)} onChange={() => toggle('account_ids', a.id)} className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{a.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{a.email}</span>
                    </div>
                    <span className="text-xs text-gray-500">{Math.max(0, remaining(a)).toLocaleString()} left today</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recipients */}
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Recipients</h2>
          {lists.length === 0 ? (
            <p className="text-sm text-gray-500">No contact lists yet. <Link href="/contacts" className="text-teal-600 underline">Add contacts first →</Link></p>
          ) : (
            <>
              <div className="space-y-2">
                {lists.map(l => (
                  <label key={l.id} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.list_ids.includes(l.id)} onChange={() => toggle('list_ids', l.id)} className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm text-gray-700">{l.name}</span>
                    <span className="text-xs text-gray-400">({l.contact_count} contacts)</span>
                  </label>
                ))}
              </div>
              {form.list_ids.length > 0 && <p className="text-xs text-teal-600 font-medium">✓ {totalRecipients.toLocaleString()} contacts will enter this sequence</p>}
              <p className="text-xs text-gray-400">The recipient list is fixed when you launch. Anyone who unsubscribes or bounces is skipped from that point on.</p>
            </>
          )}
        </div>

        {/* Timing */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Timing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select className="input" value={form.timezone} onChange={e => setField('timezone', e.target.value)}>
                {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">All send times below are in this timezone.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email 1 goes out</label>
              <input type="datetime-local" className="input" value={form.start_local} onChange={e => setField('start_local', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Leave empty to start as soon as you launch.</p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Emails in this sequence ({form.steps.length})</h2>
            <span className="text-xs text-gray-400">{MIN_SEQUENCE_STEPS}–{MAX_SEQUENCE_STEPS} emails</span>
          </div>

          <div className="card p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Test email address</label>
            <input type="email" className="input" placeholder="you@example.com — used by each email's “Send test” button" value={testEmail}
              onChange={e => { setTestEmail(e.target.value); setTestResult(null); }} />
            {testResult && (
              <p className={`text-xs mt-2 flex items-center gap-1.5 ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {testResult.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />} {testResult.message}
              </p>
            )}
          </div>

          {form.steps.map((s, i) => {
            const n = i + 1;
            return (
              <div key={i}>
                {i > 0 && (
                  <div className="flex items-center gap-3 py-3 pl-6 text-sm text-gray-600 flex-wrap">
                    <ArrowDown size={16} className="text-teal-500" />
                    <span>Wait</span>
                    <input type="number" min={1} max={365} className="input !w-20" value={s.delay_amount}
                      onChange={e => setStep(i, { delay_amount: Math.max(1, parseInt(e.target.value) || 1) })} />
                    <select className="input !w-28" value={s.delay_unit} onChange={e => setStep(i, { delay_unit: e.target.value as 'hours' | 'days' })}>
                      <option value="days">day(s)</option>
                      <option value="hours">hour(s)</option>
                    </select>
                    {s.delay_unit === 'days' && (
                      <>
                        <span>then send at</span>
                        <input type="time" className="input !w-32" value={s.send_time} onChange={e => setStep(i, { send_time: e.target.value })} />
                      </>
                    )}
                    <span className="text-gray-400">after Email {n - 1}</span>
                  </div>
                )}

                <div className="card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center justify-center">{n}</span>
                      <h3 className="font-semibold text-gray-800">Email {n}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-teal-700 bg-teal-50 px-2 py-1 rounded-full flex items-center gap-1">
                        <Clock size={11} /> {formatInTz(schedule[i], form.timezone)}{!startDate && i === 0 ? ' (on launch)' : ''}
                      </span>
                      {form.steps.length > MIN_SEQUENCE_STEPS && (
                        <button type="button" onClick={() => removeStep(i)} className="text-gray-400 hover:text-red-500" title="Remove this email"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </div>

                  {i > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Who receives this email</label>
                      <select className="input" value={s.audience} onChange={e => setStep(i, { audience: e.target.value as Audience })}>
                        {(Object.keys(AUDIENCE_LABELS) as Audience[]).map(a => <option key={a} value={a}>{AUDIENCE_LABELS[a](n)}</option>)}
                      </select>
                      {s.audience !== 'all' && (
                        <p className="text-xs text-gray-400 mt-1">Opens are tracked with an invisible pixel, so some privacy-protecting mail apps may count as “opened” automatically. Clicks are more reliable.</p>
                      )}
                    </div>
                  )}

                  {templates.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Load from template</label>
                      <select className="input" value={s.template_id} onChange={e => applyTemplate(i, e.target.value)}>
                        <option value="">Choose a template...</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject line</label>
                    <input className="input" placeholder="Your email subject" value={s.subject} onChange={e => setStep(i, { subject: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HTML body</label>
                    <textarea className="input font-mono text-xs" rows={8} placeholder="<html><body><p>Hello {{first_name}},</p></body></html>"
                      value={s.html_body} onChange={e => setStep(i, { html_body: e.target.value })} />
                    <p className="text-xs text-gray-400 mt-1">Use {`{{first_name}}`}, {`{{last_name}}`}, {`{{email}}`} for personalisation. Tracking and the unsubscribe link are added automatically.</p>
                  </div>
                  <button type="button" onClick={() => sendTest(i)} disabled={testing !== null} className="btn-secondary">
                    {testing === i ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    {testing === i ? 'Sending...' : `Send test of Email ${n}`}
                  </button>
                </div>
              </div>
            );
          })}

          {form.steps.length < MAX_SEQUENCE_STEPS && (
            <button type="button" onClick={addStep} className="btn-secondary mt-4"><Plus size={14} /> Add email</button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap pb-8">
          <button onClick={() => save(false)} disabled={!!saving} className="btn-secondary">
            {saving === 'draft' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
          </button>
          <button onClick={() => save(true)} disabled={!!saving} className="btn-primary">
            {saving === 'launch' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Save &amp; Launch
          </button>
          <Link href="/sequences" className="text-sm text-gray-400 hover:text-gray-600 ml-2">Cancel</Link>
        </div>
      </div>
    </div>
  );
}
