'use client';
import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle, XCircle, Loader2, ExternalLink, Info, RotateCcw, RefreshCw, Key, Zap, Edit2, X, Save } from 'lucide-react';

type Provider = 'gmail' | 'zoho' | 'outlook' | 'brevo' | 'smtp';

interface Account {
  id: string; name: string; email: string; provider: Provider;
  smtp_host?: string; smtp_port?: number; smtp_user?: string;
  daily_limit: number; sent_today: number; last_reset_date?: string;
  is_active: boolean; created_at: string; has_api_key?: boolean;
}

const PROVIDER_META: Record<Provider, { label: string; badge: string; host: string; port: number; limitDefault: number; color: string }> = {
  brevo:   { label: 'Brevo',          badge: 'badge-blue',   host: 'smtp-relay.brevo.com',  port: 587, limitDefault: 300,  color: '#0B96F5' },
  gmail:   { label: 'Gmail',          badge: 'badge-red',    host: 'smtp.gmail.com',         port: 587, limitDefault: 500,  color: '#EA4335' },
  zoho:    { label: 'Zoho Mail',      badge: 'badge-blue',   host: '',                       port: 587, limitDefault: 200,  color: '#1A73E8' },
  outlook: { label: 'Outlook / 365',  badge: 'badge-blue',   host: 'smtp.office365.com',     port: 587, limitDefault: 300,  color: '#0078D4' },
  smtp:    { label: 'Custom SMTP',    badge: 'badge-gray',   host: '',                       port: 587, limitDefault: 500,  color: '#64748b' },
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
      'For real-time stats (opens/bounces): copy your API key from Account → SMTP & API → API Keys tab',
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
      'SMTP host is auto-detected from your email domain — no manual entry needed',
    ],
  },
  outlook: {
    docsUrl: 'https://account.microsoft.com',
    steps: [
      'Use your Microsoft account email and password',
      'If 2FA is enabled, create an App Password in Security settings',
    ],
  },
  smtp: {
    docsUrl: '',
    steps: [
      'Enter your SMTP host, port, username, and password',
      'Port 587 (STARTTLS) is recommended; 465 uses SSL',
    ],
  },
};

const DEFAULT_FORM = {
  name: '', email: '', provider: 'brevo' as Provider,
  smtp_host: PROVIDER_META.brevo.host,
  smtp_port: PROVIDER_META.brevo.port,
  smtp_user: '',
  smtp_pass: '',
  api_key: '',
  daily_limit: PROVIDER_META.brevo.limitDefault,
  is_active: true,
};

type EditForm = typeof DEFAULT_FORM & { id: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; synced: number; message?: string; accounts?: any[] } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [showTip, setShowTip] = useState(true);

  // Edit modal state
  const [editAccount, setEditAccount] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editShowTip, setEditShowTip] = useState(false);

  // Legacy API key modal (kept for backwards compat)
  const [editApiKey, setEditApiKey] = useState<Account | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const r = await fetch('/api/accounts').then(r => r.json());
    setAccounts(r.data ?? []);
  }

  function setField(k: string, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setEditField(k: string, v: unknown) {
    setEditAccount(f => f ? { ...f, [k]: v } : f);
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
      api_key: '',
    }));
  }

  // Open edit modal — pre-fill all known fields
  function openEdit(a: Account) {
    setEditAccount({
      id:          a.id,
      name:        a.name,
      email:       a.email,
      provider:    a.provider,
      smtp_host:   a.smtp_host  ?? PROVIDER_META[a.provider]?.host ?? '',
      smtp_port:   a.smtp_port  ?? PROVIDER_META[a.provider]?.port ?? 587,
      smtp_user:   a.smtp_user  ?? '',
      smtp_pass:   '', // never pre-fill passwords for security
      api_key:     '', // never pre-fill, but user can set new value
      daily_limit: a.daily_limit,
      is_active:   a.is_active,
    });
    setEditShowTip(false);
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

  async function handleEditSave() {
    if (!editAccount) return;
    if (!editAccount.name || !editAccount.email) {
      alert('Name and email address are required.');
      return;
    }
    setEditSaving(true);
    try {
      // Only send smtp_pass if user typed a new one
      const payload: Record<string, unknown> = {
        name:        editAccount.name,
        email:       editAccount.email,
        provider:    editAccount.provider,
        smtp_host:   editAccount.smtp_host,
        smtp_port:   editAccount.smtp_port,
        smtp_user:   editAccount.smtp_user,
        daily_limit: editAccount.daily_limit,
        is_active:   editAccount.is_active,
      };
      if (editAccount.smtp_pass.trim()) {
        payload.smtp_pass = editAccount.smtp_pass;
      }
      if (editAccount.api_key.trim()) {
        payload.api_key = editAccount.api_key;
      }

      const res = await fetch(`/api/accounts/${editAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setEditAccount(null);
      load();
    } finally {
      setEditSaving(false);
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

  async function handleSyncBrevo() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await fetch('/api/sync/brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days_back: 7 }),
      }).then(r => r.json());
      setSyncResult(r);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveApiKey() {
    if (!editApiKey || !apiKeyValue) return;
    setSavingApiKey(true);
    try {
      await fetch(`/api/accounts/${editApiKey.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKeyValue }),
      });
      setEditApiKey(null);
      setApiKeyValue('');
      load();
    } finally {
      setSavingApiKey(false);
    }
  }

  const tip = PROVIDER_TIPS[form.provider];
  const meta = PROVIDER_META[form.provider];
  const needsCustomHost = form.provider === 'smtp';
  const isBrevo = form.provider === 'brevo';
  const brevoAccounts = accounts.filter(a => a.provider === 'brevo');
  const brevoWithKey = brevoAccounts.filter(a => a.has_api_key);

  // Edit modal computed
  const editMeta   = editAccount ? PROVIDER_META[editAccount.provider] : null;
  const editTip    = editAccount ? PROVIDER_TIPS[editAccount.provider] : null;
  const editIsBrevo = editAccount?.provider === 'brevo';
  const editNeedsCustomHost = editAccount?.provider === 'smtp';

  return (
    <div className="p-8">

      {/* ── EDIT ACCOUNT MODAL ─────────────────────────────────────────────── */}
      {editAccount && editMeta && editTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className="w-full max-w-2xl rounded-2xl shadow-2xl border flex flex-col max-h-[90vh]"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: editMeta.color + '18', border: `1px solid ${editMeta.color}30` }}>
                  <Mail size={16} style={{ color: editMeta.color }} />
                </div>
                <div>
                  <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Edit Account</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{editAccount.email}</p>
                </div>
              </div>
              <button onClick={() => setEditAccount(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Provider tabs */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Provider</label>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(PROVIDER_META) as Provider[]).map(p => (
                    <button key={p}
                      onClick={() => {
                        const m = PROVIDER_META[p];
                        setEditAccount(f => f ? {
                          ...f,
                          provider: p,
                          smtp_host: m.host || f.smtp_host,
                          smtp_port: m.port,
                        } : f);
                      }}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                        editAccount.provider === p
                          ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      {PROVIDER_META[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Setup guide toggle */}
              <div>
                <button
                  onClick={() => setEditShowTip(v => !v)}
                  className="text-xs text-teal-600 underline hover:no-underline">
                  {editShowTip ? 'Hide' : 'Show'} setup guide for {editMeta.label}
                </button>
                {editShowTip && (
                  <div className={`rounded-lg p-4 mt-2 text-xs space-y-1.5 ${editIsBrevo ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
                    <p className="font-semibold text-sm mb-2">
                      {editIsBrevo ? '🚀 Brevo setup guide' : `${editMeta.label} setup`}
                    </p>
                    {editTip.steps.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="shrink-0 font-bold opacity-60">{i + 1}.</span>
                        <span>{s}</span>
                      </div>
                    ))}
                    {editTip.warning && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-amber-200">
                        <span>⚠️</span><span className="font-medium">{editTip.warning}</span>
                      </div>
                    )}
                    {editTip.docsUrl && (
                      <a href={editTip.docsUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 underline opacity-70 hover:opacity-100">
                        Open {editMeta.label} dashboard <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Display Name</label>
                  <input className="input" placeholder="e.g. Thynk Success"
                    value={editAccount.name} onChange={e => setEditField('name', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    {editIsBrevo ? '"From" Email Address' : 'Email Address'}
                  </label>
                  <input className="input" type="email"
                    placeholder="you@domain.com"
                    value={editAccount.email} onChange={e => setEditField('email', e.target.value)} />
                </div>
              </div>

              {/* SMTP Username + Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    {editIsBrevo ? 'Brevo SMTP Login' : 'SMTP Username'}
                  </label>
                  <input className="input"
                    placeholder={editIsBrevo ? 'abc123@smtp-brevo.com' : 'usually same as email'}
                    value={editAccount.smtp_user} onChange={e => setEditField('smtp_user', e.target.value)} />
                  {editIsBrevo && (
                    <p className="text-xs text-gray-400 mt-1">Found in Brevo → Account → SMTP & API → SMTP tab → "Login"</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    {editIsBrevo ? 'Brevo SMTP Key' : 'App Password / SMTP Password'}
                  </label>
                  <input className="input" type="password"
                    placeholder="Leave blank to keep existing password"
                    value={editAccount.smtp_pass} onChange={e => setEditField('smtp_pass', e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Leave blank to keep the existing password unchanged</p>
                </div>
              </div>

              {/* Brevo API key */}
              {editIsBrevo && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-blue-600" />
                    <span className="text-xs font-semibold text-blue-800">Brevo API Key — unlock real-time stats</span>
                    <span className="text-xs text-blue-500 ml-auto">Optional but recommended</span>
                  </div>
                  <p className="text-xs text-blue-700">
                    Enables syncing actual delivery, open, click &amp; bounce data back from Brevo.
                    Without this, reports only show sent count.
                  </p>
                  <input className="input text-sm font-mono" type="password"
                    placeholder={`${editAccount.provider === 'brevo' ? 'Leave blank to keep existing key · or paste new xkeysib-... key' : 'xkeysib-...'}`}
                    value={editAccount.api_key} onChange={e => setEditField('api_key', e.target.value)} />
                  <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 underline">
                    Get your API key <ExternalLink size={10} />
                  </a>
                </div>
              )}

              {/* Custom SMTP host/port */}
              {editNeedsCustomHost && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>SMTP Host</label>
                    <input className="input" placeholder="smtp.example.com"
                      value={editAccount.smtp_host} onChange={e => setEditField('smtp_host', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Port</label>
                    <input className="input" type="number"
                      value={editAccount.smtp_port} onChange={e => setEditField('smtp_port', Number(e.target.value))} />
                  </div>
                </div>
              )}

              {/* Host info for non-custom */}
              {!editNeedsCustomHost && editMeta.host && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">
                  <Info size={12} />
                  SMTP host: <span className="font-mono font-medium text-gray-700">{editMeta.host}:{editMeta.port}</span>
                  — configured automatically
                </div>
              )}

              {/* Daily limit + Active toggle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Daily Send Limit</label>
                  <input className="input" type="number" min={1}
                    value={editAccount.daily_limit} onChange={e => setEditField('daily_limit', Number(e.target.value))} />
                  <p className="text-xs text-gray-400 mt-1">Max emails this account can send per day</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Account Status</label>
                  <label className="flex items-center gap-3 mt-2 cursor-pointer">
                    <div
                      onClick={() => setEditField('is_active', !editAccount.is_active)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${editAccount.is_active ? 'bg-teal-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editAccount.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {editAccount.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Inactive accounts are skipped during sending</p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
              <button onClick={handleEditSave} disabled={editSaving} className="btn-primary">
                {editSaving
                  ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                  : <><Save size={14} /> Save Changes</>
                }
              </button>
              <button onClick={() => setEditAccount(null)} className="btn-secondary">Cancel</button>
              {editAccount && (
                <span className="ml-auto text-xs text-gray-400">
                  Passwords left blank will not be changed
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Legacy API Key modal ───────────────────────────────────────────── */}
      {editApiKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl shadow-2xl border p-6 flex flex-col gap-4"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                Add Brevo API Key
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                for <strong>{editApiKey.name}</strong> — enables real-time stats sync (opens, bounces, delivered)
              </p>
            </div>
            <div className="rounded-lg p-3 bg-blue-50 text-blue-700 text-xs space-y-1">
              <p className="font-medium">Where to find it:</p>
              <p>Brevo dashboard → Account → SMTP &amp; API → <strong>API Keys tab</strong> → Create a new API key</p>
              <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline mt-1">
                Open Brevo API Keys <ExternalLink size={10} />
              </a>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                API Key (starts with xkeysib-)
              </label>
              <input
                className="input font-mono text-sm"
                type="password"
                placeholder="xkeysib-..."
                value={apiKeyValue}
                onChange={e => setApiKeyValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveApiKey} disabled={!apiKeyValue || savingApiKey} className="btn-primary">
                {savingApiKey ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                Save API Key
              </button>
              <button onClick={() => { setEditApiKey(null); setApiKeyValue(''); }} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Email Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Connect sending accounts — rotate across multiple for higher volume</p>
        </div>
        <div className="flex items-center gap-2">
          {brevoAccounts.length > 0 && (
            <button
              onClick={handleSyncBrevo}
              disabled={syncing}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title={brevoWithKey.length === 0 ? 'Add a Brevo API key to enable stats sync' : 'Sync opens/bounces from Brevo API'}
            >
              {syncing
                ? <Loader2 size={14} className="animate-spin" />
                : <RefreshCw size={14} />}
              {syncing ? 'Syncing...' : 'Sync Brevo Stats'}
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`mb-6 rounded-xl border p-4 text-sm ${syncResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className="flex items-start gap-2">
            {syncResult.ok ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
            <div className="flex-1">
              {syncResult.ok
                ? <><strong>{syncResult.synced}</strong> send log{syncResult.synced !== 1 ? 's' : ''} updated from Brevo (last 7 days)</>
                : syncResult.message}
              {syncResult.accounts && syncResult.accounts.length > 0 && (
                <div className="mt-2 space-y-1">
                  {syncResult.accounts.map((a: any) => (
                    <div key={a.account} className="text-xs">
                      <strong>{a.account}:</strong> {a.events} events fetched, {a.updated} updated
                      {a.error && <span className="text-red-600 ml-2">— {a.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setSyncResult(null)} className="opacity-50 hover:opacity-80 text-xl leading-none">×</button>
          </div>
        </div>
      )}

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
              Free account: 300 emails/day. Add your Brevo API key to sync real-time open/bounce/delivery stats.
            </p>
          </div>
          <button onClick={() => { setShowForm(true); handleProviderChange('brevo'); }}
            className="btn-primary shrink-0 text-xs">
            Connect Brevo
          </button>
        </div>
      )}

      {/* ── Add account form ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="card p-6 mb-6 max-w-2xl">
          <h2 className="font-semibold mb-5 text-gray-800">Connect New Account</h2>

          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-2">Provider</label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(PROVIDER_META) as Provider[]).map(p => (
                <button key={p} onClick={() => handleProviderChange(p)}
                  className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    form.provider === p
                      ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {PROVIDER_META[p].label}
                </button>
              ))}
            </div>
          </div>

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
                  <p className="text-xs text-gray-400 mt-1">Found in Brevo → Account → SMTP &amp; API → SMTP tab → &quot;Login&quot;</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isBrevo ? 'Brevo SMTP Key' : 'App Password / SMTP Password'}
                </label>
                <input className="input" type="password"
                  placeholder={isBrevo ? 'xsmtpsib-...' : '••••••••••••••••'}
                  value={form.smtp_pass} onChange={e => setField('smtp_pass', e.target.value)} />
              </div>
            </div>

            {isBrevo && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-blue-600" />
                  <span className="text-xs font-semibold text-blue-800">Brevo API Key — unlock real-time stats</span>
                  <span className="text-xs text-blue-500 ml-auto">Optional but recommended</span>
                </div>
                <p className="text-xs text-blue-700">
                  Enables syncing actual delivery, open, click &amp; bounce data back from Brevo.
                  Without this, reports only show sent count.
                </p>
                <input className="input text-sm font-mono" type="password"
                  placeholder="xkeysib-... (from Brevo → Account → SMTP &amp; API → API Keys tab)"
                  value={form.api_key} onChange={e => setField('api_key', e.target.value)} />
                <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 underline">
                  Get your API key <ExternalLink size={10} />
                </a>
              </div>
            )}

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
            </div>

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

      {/* ── Accounts list ─────────────────────────────────────────────────── */}
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
            const provMeta = PROVIDER_META[a.provider] ?? PROVIDER_META.smtp;
            const result = testResults[a.id];
            const todayUTC = new Date().toISOString().slice(0, 10);
            const isStale  = (a.last_reset_date ?? '') < todayUTC;
            const sentToday = isStale ? 0 : a.sent_today;
            const available = a.daily_limit - sentToday;
            const usedPct   = a.daily_limit > 0 ? Math.round((sentToday / a.daily_limit) * 100) : 0;
            return (
              <div key={a.id} className="card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: provMeta.color + '18', border: `1px solid ${provMeta.color}30` }}>
                      <Mail size={16} style={{ color: provMeta.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{a.name}</p>
                        <span className={provMeta.badge}>{provMeta.label}</span>
                        {!a.is_active && <span className="badge-red">Inactive</span>}
                        {a.provider === 'brevo' && (
                          a.has_api_key
                            ? <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                <Zap size={10} /> Stats sync active
                              </span>
                            : <button
                                onClick={() => { setEditApiKey(a); setApiKeyValue(''); }}
                                className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100 transition-colors"
                              >
                                <Key size={10} /> Add API key for stats
                              </button>
                        )}
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
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Daily usage bar */}
                    <div className="hidden md:block w-52">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Daily credits</span>
                        <div className="flex items-center gap-1.5">
                          {isStale && <span className="text-amber-500 font-medium">needs reset</span>}
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

                    {/* Edit button */}
                    <button
                      onClick={() => openEdit(a)}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                      title="Edit account"
                    >
                      <Edit2 size={12} /> Edit
                    </button>

                    <button onClick={() => handleTest(a.id)} disabled={testing === a.id} className="btn-secondary text-xs py-1.5 px-3">
                      {testing === a.id ? <><Loader2 size={12} className="animate-spin" /> Testing...</> : 'Test'}
                    </button>

                    <button onClick={() => handleReset(a.id)} disabled={resetting === a.id}
                      title="Reset today's send counter"
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      {resetting === a.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Reset
                    </button>

                    <button onClick={() => handleDelete(a.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

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
