'use client';
import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle, XCircle, Loader2, ExternalLink, Info, RotateCcw } from 'lucide-react';

type Provider = 'gmail' | 'zoho' | 'outlook' | 'brevo' | 'smtp';

interface Account {
  id: string; name: string; email: string; provider: Provider;
  smtp_host?: string; smtp_port?: number; smtp_user?: string;
  daily_limit: number; sent_today: number; last_reset_date?: string; is_active: boolean; created_at: string;
}

const PROVIDER_META: Record<Provider, { label: string; badge: string; host: string; port: number; limitDefault: number; color: string }> = {
  brevo:   { label: 'Brevo',          badge: 'badge-blue',   host: 'smtp-relay.brevo.com',  port: 587, limitDefault: 300,  color: '#0B96F5' },
  gmail:   { label: 'Gmail',          badge: 'badge-red',    host: 'smtp.gmail.com',         port: 587, limitDefault: 500,  color: '#EA4335' },
  zoho:    { label: 'Zoho Mail',      badge: 'badge-blue',   host: '',                       port: 587, limitDefault: 200,  color: '#1A73E8' },
  outlook: { label: 'Outlook / 365',  badge: 'badge-blue',   host: 'smtp.office365.com',     port: 587, limitDefault: 300,  color: '#0078D4' },
  smtp:    { label: 'Custom SMTP',    badge: 'badge-gray',   host: '',                        port: 587, limitDefault: 500,  color: '#64748b' },
};

const PROVIDER_TIPS: Record<Provider, { steps: string[]; docsUrl: string; warning?: string }> = {
  brevo: {
    docsUrl: 'https://app.brevo.com/settings/keys/smtp',
    steps: [
      'Sign up free at brevo.com (300 emails/day, no credit card)',
      'Go to Account → SMTP & API → SMTP tab',
      'Click "Generate a new SMTP key" and copy it',
      'Also copy the "Login" value — it looks like abc123@smtp-brevo.com',
      'Paste Login → SMTP Username below, SMTP Key → SMTP Password',
      'Add & verify your sending domain under Senders & IPs → Domains',
    ],
  },
  gmail: {
    docsUrl: 'https://myaccount.google.com/apppasswords',
    warning: 'Use an App Password, NOT your Gmail password. Enable 2-Step Verification first.',
    steps: [
      'Go to Google Account → Security → 2-Step Verification (enable it)',
      'Then go to Security → App Passwords',
      'Select app: Mail, device: Other → name it "MailFlow"',
      'Copy the 16-character password Google gives you',
      'Paste it as the SMTP Password below',
    ],
  },
  zoho: {
    docsUrl: 'https://accounts.zoho.com/home',
    steps: [
      'Go to Zoho Mail → Settings → Security → App Passwords',
      'Click "Generate New Password", name it "MailFlow", copy the 16-char password',
      'SMTP host is auto-detected from your email domain — no manual entry needed:',
      '  • @anything.in  →  smtp.zoho.in  (India DC)',
      '  • @anything.eu  →  smtp.zoho.eu  (EU DC)',
      '  • everything else  →  smtp.zoho.com  (Global DC)',
      'You can also override the host manually in the SMTP Host field if needed',
    ],
  },
  outlook: {
    docsUrl: 'https://account.microsoft.com',
    steps: [
      'Use your Microsoft account email and password',
      'If 2FA is enabled, create an App Password in Security settings',
      'Use smtp.office365.com:587 (or smtp.gmail.com for @gmail.com accounts)',
    ],
  },
  smtp: {
    docsUrl: '',
    steps: [
      'Enter your SMTP host, port, username, and password',
      'Port 587 (STARTTLS) is recommended; 465 uses SSL',
      'Works with any provider: Mailjet, Resend, Postfix, etc.',
    ],
  },
};

const DEFAULT_FORM = {
  name: '', email: '', provider: 'brevo' as Provider,
  smtp_host: PROVIDER_META.brevo.host,
  smtp_port: PROVIDER_META.brevo.port,
  smtp_user: '',
  smtp_pass: '',
  daily_limit: PROVIDER_META.brevo.limitDefault,
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [showTip, setShowTip] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const r = await fetch('/api/accounts').then(r => r.json());
    setAccounts(r.data ?? []);
  }

  function setField(k: string, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleProviderChange(p: Provider) {
    const meta = PROVIDER_META[p];
    setForm(f => ({
      ...f,
      provider: p,
      smtp_host: meta.host,
      smtp_port: meta.port,
      daily_limit: meta.limitDefault,
      smtp_user: '',
      smtp_pass: '',
    }));
  }

  async function handleAdd() {
    if (!form.name || !form.email || !form.smtp_pass) {
      alert('Name, email address, and SMTP password are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setForm(DEFAULT_FORM);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    load();
  }

  async function handleReset(id: string) {
    setResetting(id);
    const todayUTC = new Date().toISOString().slice(0, 10);
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent_today: 0, last_reset_date: todayUTC }),
    });
    load();
    setResetting(null);
  }

  async function handleTest(id: string) {
    setTesting(id);
    const r = await fetch('/api/accounts/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: id }),
    }).then(r => r.json());
    setTestResults(prev => ({ ...prev, [id]: r }));
    setTesting(null);
  }

  const tip = PROVIDER_TIPS[form.provider];
  const meta = PROVIDER_META[form.provider];
  const needsCustomHost = form.provider === 'smtp';
  const isBrevo = form.provider === 'brevo';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Email Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Connect sending accounts — rotate across multiple for higher volume</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      {/* Brevo recommended banner */}
      {accounts.length === 0 && !showForm && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-white border border-blue-100 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="8" fill="#0B96F5"/>
              <text x="20" y="27" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">B</text>
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-blue-900 text-sm">Start with Brevo — recommended for best inbox delivery</p>
            <p className="text-blue-700 text-xs mt-1">
              Free account gives you 300 emails/day with proper deliverability infrastructure (shared IPs, SPF/DKIM auto-configured).
              Unlike Gmail, Brevo is built for bulk sending so it won&apos;t flag or suspend your account.
            </p>
          </div>
          <button onClick={() => { setShowForm(true); handleProviderChange('brevo'); }}
            className="btn-primary shrink-0 text-xs">
            Connect Brevo
          </button>
        </div>
      )}

      {/* Add account form */}
      {showForm && (
        <div className="card p-6 mb-6 max-w-2xl">
          <h2 className="font-semibold mb-5 text-gray-800">Connect New Account</h2>

          {/* Provider selector */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-2">Provider</label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(PROVIDER_META) as Provider[]).map(p => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    form.provider === p
                      ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {PROVIDER_META[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Setup guide */}
          {showTip && (
            <div className={`rounded-lg p-4 mb-5 text-xs space-y-1.5 relative ${isBrevo ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
              <button onClick={() => setShowTip(false)} className="absolute top-2 right-3 opacity-40 hover:opacity-80 text-lg leading-none">×</button>
              <p className="font-semibold text-sm mb-2">
                {isBrevo ? '🚀 Brevo setup (2 minutes)' : `${meta.label} setup`}
              </p>
              {tip.steps.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 font-bold opacity-60">{i + 1}.</span>
                  <span>{s}</span>
                </div>
              ))}
              {tip.warning && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-amber-200">
                  <span>⚠️</span><span className="font-medium">{tip.warning}</span>
                </div>
              )}
              {tip.docsUrl && (
                <a href={tip.docsUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 underline opacity-70 hover:opacity-100">
                  Open {meta.label} dashboard <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                <input className="input" placeholder={isBrevo ? 'e.g. Brevo Marketing' : 'e.g. Gmail Main'}
                  value={form.name} onChange={e => setField('name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isBrevo ? 'Your "From" Email Address' : 'Email Address'}
                </label>
                <input className="input" type="email"
                  placeholder={isBrevo ? 'hello@yourdomain.com' : 'you@gmail.com'}
                  value={form.email} onChange={e => setField('email', e.target.value)} />
                {isBrevo && (
                  <p className="text-xs text-gray-400 mt-1">The address recipients see — must be verified in Brevo</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isBrevo ? 'Brevo SMTP Login' : 'SMTP Username'}
                </label>
                <input className="input"
                  placeholder={isBrevo ? 'abc123@smtp-brevo.com' : 'usually same as email'}
                  value={form.smtp_user} onChange={e => setField('smtp_user', e.target.value)} />
                {isBrevo && (
                  <p className="text-xs text-gray-400 mt-1">
                    Found in Brevo → Account → SMTP & API → SMTP tab → &quot;Login&quot;
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isBrevo ? 'Brevo SMTP Key' : 'App Password / SMTP Password'}
                </label>
                <input className="input" type="password"
                  placeholder={isBrevo ? 'xsmtpsib-...' : '••••••••••••••••'}
                  value={form.smtp_pass} onChange={e => setField('smtp_pass', e.target.value)} />
                {isBrevo && (
                  <p className="text-xs text-gray-400 mt-1">
                    Generate under SMTP & API → SMTP Keys (NOT the API key)
                  </p>
                )}
              </div>
            </div>

            {needsCustomHost && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Host</label>
                  <input className="input" placeholder="smtp.example.com"
                    value={form.smtp_host} onChange={e => setField('smtp_host', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
                  <input className="input" type="number"
                    value={form.smtp_port} onChange={e => setField('smtp_port', Number(e.target.value))} />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Daily Send Limit</label>
              <input className="input w-40" type="number" min={1}
                value={form.daily_limit} onChange={e => setField('daily_limit', Number(e.target.value))} />
              <p className="text-xs text-gray-400 mt-1">
                {isBrevo
                  ? 'Brevo free plan: 300/day. Paid plans go much higher.'
                  : 'Set below your provider\'s actual limit to stay safe.'}
              </p>
            </div>

            {/* Brevo: SMTP host shown read-only */}
            {!needsCustomHost && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">
                <Info size={12} />
                SMTP host: <span className="font-mono font-medium text-gray-700">{meta.host}:{meta.port}</span>
                — configured automatically
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={handleAdd} disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {saving ? 'Connecting...' : `Connect ${meta.label}`}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Accounts list */}
      {accounts.length === 0 && !showForm ? (
        <div className="card py-20 text-center text-gray-400">
          <Mail size={36} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium">No accounts connected yet</p>
          <p className="text-sm mt-1">Add Brevo, Gmail, Zoho, Outlook, or a custom SMTP server</p>
          <button className="btn-primary mt-5 inline-flex" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Add Account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(a => {
            const pct = a.daily_limit > 0 ? Math.round((a.sent_today / a.daily_limit) * 100) : 0;
            const provMeta = PROVIDER_META[a.provider] ?? PROVIDER_META.smtp;
            const result = testResults[a.id];
            return (
              <div key={a.id} className="card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Provider colour dot */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: provMeta.color + '18', border: `1px solid ${provMeta.color}30` }}>
                      <Mail size={16} style={{ color: provMeta.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{a.name}</p>
                        <span className={provMeta.badge}>{provMeta.label}</span>
                        {!a.is_active && <span className="badge-red">Inactive</span>}
                        {/* Show test result inline */}
                        {result?.ok === true && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle size={12} /> Connected
                          </span>
                        )}
                        {result?.ok === false && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium" title={result.error}>
                            <XCircle size={12} /> Failed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{a.email}</p>
                      {result?.ok === false && result.error && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-sm truncate">{result.error}</p>
                      )}
                      {result?.ok === false && result.error?.toLowerCase().includes('auth') && a.provider === 'zoho' && (
                        <p className="text-xs text-amber-600 mt-1 max-w-sm">
                          💡 Zoho tip: use an <strong>App Password</strong> (Settings → Security → App Passwords), not your account password. SMTP host is auto-detected from your email domain (.in → zoho.in, .eu → zoho.eu, else zoho.com). You can override it in the SMTP Host field.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    {/* Daily usage bar */}
                    {(() => {
                      const todayUTC = new Date().toISOString().slice(0, 10);
                      const isStale  = (a.last_reset_date ?? '') < todayUTC;
                      const sentToday = isStale ? 0 : a.sent_today;
                      const available = a.daily_limit - sentToday;
                      const usedPct   = a.daily_limit > 0 ? Math.round((sentToday / a.daily_limit) * 100) : 0;
                      return (
                        <div className="hidden md:block w-52">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">Daily credits</span>
                            <div className="flex items-center gap-1.5">
                              {isStale && (
                                <span className="text-amber-500 font-medium">needs reset</span>
                              )}
                              <span className="tabular-nums font-semibold" style={{ color: usedPct > 80 ? '#ef4444' : usedPct > 50 ? '#f59e0b' : '#10b981' }}>
                                {available.toLocaleString()} / {a.daily_limit.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-400' : 'bg-teal-500'}`}
                              style={{ width: `${Math.min(usedPct, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs mt-0.5 text-gray-400">
                            <span>{sentToday.toLocaleString()} used</span>
                            <span>{available.toLocaleString()} available</span>
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      onClick={() => handleTest(a.id)}
                      disabled={testing === a.id}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      {testing === a.id
                        ? <><Loader2 size={12} className="animate-spin" /> Testing...</>
                        : 'Test'}
                    </button>

                    <button
                      onClick={() => handleReset(a.id)}
                      disabled={resetting === a.id}
                      title="Reset today's send counter (use when your provider's daily limit has refreshed)"
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      {resetting === a.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <RotateCcw size={12} />}
                      Reset
                    </button>

                    <button onClick={() => handleDelete(a.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Volume summary */}
          {accounts.length > 1 && (
            <div className="card p-4 bg-teal-50 border-teal-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-teal-700 font-medium">Combined daily capacity</span>
                <span className="font-semibold text-teal-800 tabular-nums">
                  {accounts.filter(a => a.is_active).reduce((s, a) => s + a.daily_limit, 0).toLocaleString()} emails/day
                  {' '}·{' '}
                  {(accounts.filter(a => a.is_active).reduce((s, a) => s + a.daily_limit, 0) * 30).toLocaleString()} emails/month
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
