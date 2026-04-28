'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Search, Mail, CheckCircle, XCircle, Eye, MousePointer,
  Clock, AlertCircle, UserMinus, RefreshCw, Filter, Download, ChevronLeft, ChevronRight,
  ChevronDown, X, Check,
} from 'lucide-react';

interface Contact  { id: string; email: string; first_name?: string; last_name?: string; }
interface Campaign { id: string; name: string; subject: string; }
interface Account  { id: string; name: string; email: string; provider?: string; }
interface LogRow {
  id: string; status: string; message_id?: string;
  sent_at?: string; opened_at?: string; clicked_at?: string; bounced_at?: string;
  error_message?: string; created_at: string;
  contact: Contact | null; campaign: Campaign | null; account: Account | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  queued:       { label: 'Queued',       color: '#64748b', bg: '#f1f5f9', icon: Clock        },
  sent:         { label: 'Sent',         color: '#0d9488', bg: '#f0fdfa', icon: CheckCircle  },
  delivered:    { label: 'Delivered',    color: '#10b981', bg: '#f0fdf4', icon: CheckCircle  },
  opened:       { label: 'Opened',       color: '#6366f1', bg: '#eef2ff', icon: Eye          },
  clicked:      { label: 'Clicked',      color: '#a855f7', bg: '#faf5ff', icon: MousePointer },
  bounced:      { label: 'Bounced',      color: '#ef4444', bg: '#fff1f2', icon: XCircle      },
  failed:       { label: 'Failed',       color: '#f97316', bg: '#fff7ed', icon: AlertCircle  },
  unsubscribed: { label: 'Unsubscribed', color: '#f59e0b', bg: '#fffbeb', icon: UserMinus    },
};

const PROVIDER_COLORS: Record<string, string> = {
  brevo: '#0B96F5', gmail: '#EA4335', zoho: '#1A73E8',
  outlook: '#0078D4', smtp: '#64748b',
};

const ALL_STATUSES = Object.keys(STATUS_META);

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: '#64748b', bg: '#f1f5f9', icon: Clock };
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: m.color, background: m.bg }}>
      <Icon size={11} />
      {m.label}
    </span>
  );
}

function ProviderDot({ provider }: { provider?: string }) {
  const color = provider ? (PROVIDER_COLORS[provider.toLowerCase()] ?? '#64748b') : '#64748b';
  return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />;
}

function fmt(dt?: string) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const PAGE_SIZE = 50;

function AccountMultiSelect({
  accounts,
  selected,
  onChange,
}: {
  accounts: Account[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  function toggleAll() {
    onChange(selected.length === accounts.length ? [] : accounts.map(a => a.id));
  }

  const label = selected.length === 0
    ? 'All connected accounts'
    : selected.length === 1
      ? (accounts.find(a => a.id === selected[0])?.email ?? '1 account')
      : `${selected.length} accounts selected`;

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input w-full flex items-center justify-between gap-2 text-left"
        style={{ color: selected.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Mail size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span className="truncate text-sm">{label}</span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected.length > 0 && (
            <span className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>
              {selected.length}
            </span>
          )}
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl shadow-xl border overflow-hidden" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          <button type="button" onClick={toggleAll} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-b" style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
            <span className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: selected.length === accounts.length ? 'var(--brand-primary)' : 'var(--input-border)', background: selected.length === accounts.length ? 'var(--brand-primary)' : 'transparent' }}>
              {selected.length === accounts.length && <Check size={10} color="white" />}
            </span>
            <span className="font-medium">All accounts</span>
            <span className="ml-auto text-xs">({accounts.length})</span>
          </button>
          <div className="max-h-56 overflow-y-auto">
            {accounts.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm themed-muted">No connected email accounts found</div>
            ) : (
              accounts.map(acc => {
                const checked = selected.includes(acc.id);
                return (
                  <button key={acc.id} type="button" onClick={() => toggle(acc.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:opacity-80" style={{ background: checked ? 'var(--table-head-bg)' : 'transparent' }}>
                    <span className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: checked ? 'var(--brand-primary)' : 'var(--input-border)', background: checked ? 'var(--brand-primary)' : 'transparent' }}>
                      {checked && <Check size={10} color="white" />}
                    </span>
                    <ProviderDot provider={acc.provider} />
                    <div className="min-w-0 text-left">
                      <p className="text-sm themed-heading truncate">{acc.email}</p>
                      {acc.name && acc.name !== acc.email && <p className="text-xs themed-muted truncate">{acc.name}</p>}
                    </div>
                    {acc.provider && <span className="ml-auto text-xs themed-muted capitalize flex-shrink-0">{acc.provider}</span>}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="px-4 py-2 border-t flex justify-end" style={{ borderColor: 'var(--card-border)' }}>
              <button type="button" onClick={() => { onChange([]); setOpen(false); }} className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <X size={11} /> Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmailStatusPage() {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accounts,         setAccounts]         = useState<Account[]>([]);
  const [accountsLoading,  setAccountsLoading]  = useState(true);
  const [statusFilter,     setStatusFilter]     = useState('');
  const [logs,             setLogs]             = useState<LogRow[]>([]);
  const [total,            setTotal]            = useState(0);
  const [page,             setPage]             = useState(1);
  const [loading,          setLoading]          = useState(false);
  const [searched,         setSearched]         = useState(false);
  const [expanded,         setExpanded]         = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(j => { setAccounts(j.data ?? []); setAccountsLoading(false); })
      .catch(() => setAccountsLoading(false));
  }, []);

  const search = useCallback(async (p = 1) => {
    setLoading(true);
    setPage(p);
    const params = new URLSearchParams();
    if (selectedAccounts.length > 0) params.set('account_ids', selectedAccounts.join(','));
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(p));
    const r = await fetch(`/api/email-status?${params}`).then(r => r.json());
    setLogs(r.logs ?? []);
    setTotal(r.total ?? 0);
    setSearched(true);
    setLoading(false);
    setExpanded(null);
  }, [selectedAccounts, statusFilter]);

  function exportCSV() {
    if (!logs.length) return;
    const headers = ['Email','Name','Campaign','Account','Status','Sent At','Opened At','Clicked At','Bounced At','Error'];
    const rows = logs.map(l => [
      l.contact?.email ?? '', `${l.contact?.first_name ?? ''} ${l.contact?.last_name ?? ''}`.trim(),
      l.campaign?.name ?? '', l.account?.email ?? '', l.status,
      l.sent_at ? new Date(l.sent_at).toISOString() : '',
      l.opened_at ? new Date(l.opened_at).toISOString() : '',
      l.clicked_at ? new Date(l.clicked_at).toISOString() : '',
      l.bounced_at ? new Date(l.bounced_at).toISOString() : '',
      l.error_message ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `email-status-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const summary = logs.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="themed-page min-h-screen">
      <div className="px-8 pt-8 pb-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold themed-heading">Email Status Lookup</h1>
          <p className="text-sm mt-1 themed-muted">Browse message delivery status by connected email account</p>
        </div>

        <div className="card p-5 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            {accountsLoading ? (
              <div className="flex-1 input flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <RefreshCw size={14} className="animate-spin" /> Loading accounts…
              </div>
            ) : (
              <AccountMultiSelect accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
            )}
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <select className="input pl-9 w-44 appearance-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <button onClick={() => search(1)} disabled={loading} className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />} Search
            </button>
            {logs.length > 0 && <button onClick={exportCSV} className="btn-secondary px-4"><Download size={15} /> Export CSV</button>}
          </div>

          {selectedAccounts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {selectedAccounts.map(id => {
                const acc = accounts.find(a => a.id === id);
                if (!acc) return null;
                return (
                  <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)', background: 'var(--table-head-bg)' }}>
                    <ProviderDot provider={acc.provider} />
                    {acc.email}
                    <button type="button" onClick={() => setSelectedAccounts(prev => prev.filter(x => x !== id))} className="ml-0.5 opacity-60 hover:opacity-100"><X size={10} /></button>
                  </span>
                );
              })}
              <button type="button" onClick={() => setSelectedAccounts([])} className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: 'var(--input-border)', color: 'var(--text-muted)' }}>Clear all</button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={() => setStatusFilter('')} className="px-3 py-1 rounded-full text-xs font-medium border transition-colors" style={{ borderColor: !statusFilter ? 'var(--brand-primary)' : 'var(--input-border)', background: !statusFilter ? 'var(--brand-primary)' : 'transparent', color: !statusFilter ? 'var(--brand-primary-text)' : 'var(--text-muted)' }}>All</button>
            {ALL_STATUSES.map(s => {
              const m = STATUS_META[s]; const active = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(s === statusFilter ? '' : s)} className="px-3 py-1 rounded-full text-xs font-medium border transition-colors" style={{ borderColor: active ? m.color : 'var(--input-border)', background: active ? m.bg : 'transparent', color: active ? m.color : 'var(--text-muted)' }}>
                  {m.label}{summary[s] ? <span className="ml-1 opacity-70">({summary[s]})</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {!searched && !loading && (
          <div className="card py-20 flex flex-col items-center gap-3 themed-muted">
            <Mail size={40} className="opacity-30" />
            <p className="text-sm">Select email accounts above and press Search</p>
            <p className="text-xs opacity-70">Leave blank to search across all accounts, or select specific ones</p>
          </div>
        )}
        {searched && !loading && logs.length === 0 && (
          <div className="card py-20 flex flex-col items-center gap-3 themed-muted">
            <Search size={36} className="opacity-30" />
            <p className="text-sm font-medium">No messages found</p>
            <p className="text-xs opacity-70">Try selecting different accounts or changing the status filter</p>
          </div>
        )}

        {logs.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-sm themed-muted"><span className="font-semibold themed-heading">{total.toLocaleString()}</span> messages found</span>
              {Object.entries(summary).map(([s, n]) => { const m = STATUS_META[s]; if (!m) return null; return <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ color: m.color, background: m.bg }}>{n} {m.label}</span>; })}
            </div>
            <div className="card overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--table-head-bg)' }}>
                  <tr>{['Recipient','Campaign','Account','Status','Sent At','Opened At','Clicked At',''].map(h => <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-left first:pl-5" style={{ color: 'var(--text-muted)' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <>
                      <tr key={l.id} className="themed-tr cursor-pointer" style={{ borderTop: '1px solid var(--table-divider)' }} onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                        <td className="px-5 py-3">
                          <p className="font-medium themed-heading text-sm">{l.contact?.email ?? '—'}</p>
                          {(l.contact?.first_name || l.contact?.last_name) && <p className="text-xs themed-muted">{[l.contact.first_name, l.contact.last_name].filter(Boolean).join(' ')}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="themed-secondary text-sm max-w-[140px] truncate">{l.campaign?.name ?? '—'}</p>
                          {l.campaign?.subject && <p className="text-xs themed-muted max-w-[140px] truncate">{l.campaign.subject}</p>}
                        </td>
                        <td className="px-4 py-3"><div className="flex items-center gap-1.5"><ProviderDot provider={l.account?.provider} /><p className="themed-secondary text-xs">{l.account?.email ?? '—'}</p></div></td>
                        <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                        <td className="px-4 py-3 text-xs themed-muted whitespace-nowrap">{fmt(l.sent_at)}</td>
                        <td className="px-4 py-3 text-xs themed-muted whitespace-nowrap">{fmt(l.opened_at)}</td>
                        <td className="px-4 py-3 text-xs themed-muted whitespace-nowrap">{fmt(l.clicked_at)}</td>
                        <td className="px-4 py-3 text-xs themed-link">{expanded === l.id ? '▲ less' : '▼ more'}</td>
                      </tr>
                      {expanded === l.id && (
                        <tr key={`${l.id}-detail`} style={{ background: 'var(--table-head-bg)', borderTop: '1px solid var(--table-divider)' }}>
                          <td colSpan={8} className="px-5 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide themed-muted mb-2">Message Timeline</p>
                                <div className="space-y-2">
                                  {[{ label: 'Queued', ts: l.created_at, color: '#64748b', icon: Clock }, { label: 'Sent', ts: l.sent_at, color: '#0d9488', icon: CheckCircle }, { label: 'Opened', ts: l.opened_at, color: '#6366f1', icon: Eye }, { label: 'Clicked', ts: l.clicked_at, color: '#a855f7', icon: MousePointer }, { label: 'Bounced', ts: l.bounced_at, color: '#ef4444', icon: XCircle }].map(ev => ev.ts ? (
                                    <div key={ev.label} className="flex items-center gap-2"><ev.icon size={12} style={{ color: ev.color }} /><span className="text-xs font-medium" style={{ color: ev.color }}>{ev.label}</span><span className="text-xs themed-muted">{fmt(ev.ts)}</span></div>
                                  ) : null)}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide themed-muted mb-2">Current Status</p>
                                <StatusBadge status={l.status} />
                                {l.error_message && <p className="text-xs text-red-500 mt-2 max-w-[200px]">{l.error_message}</p>}
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide themed-muted mb-2">Message ID</p>
                                <p className="text-xs themed-secondary font-mono break-all">{l.message_id ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide themed-muted mb-2">Contact Info</p>
                                <p className="text-xs themed-secondary">{l.contact?.email ?? '—'}</p>
                                <p className="text-xs themed-muted">{[l.contact?.first_name, l.contact?.last_name].filter(Boolean).join(' ') || '—'}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm themed-muted">Page {page} of {totalPages} · {total.toLocaleString()} results</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => search(page - 1)} disabled={page <= 1 || loading} className="btn-secondary px-3 py-1.5 disabled:opacity-40"><ChevronLeft size={14} /></button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => { const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page + i - 3; if (p < 1 || p > totalPages) return null; return <button key={p} onClick={() => search(p)} className="w-8 h-8 rounded-lg text-sm font-medium transition-colors" style={{ background: p === page ? 'var(--brand-primary)' : 'transparent', color: p === page ? 'var(--brand-primary-text)' : 'var(--text-muted)', border: `1px solid ${p === page ? 'var(--brand-primary)' : 'var(--input-border)'}` }}>{p}</button>; })}
                  <button onClick={() => search(page + 1)} disabled={page >= totalPages || loading} className="btn-secondary px-3 py-1.5 disabled:opacity-40"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
