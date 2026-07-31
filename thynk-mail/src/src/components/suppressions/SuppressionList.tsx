'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, X, Loader2, ShieldOff, Download } from 'lucide-react';

interface Suppression {
  id: string;
  email: string;
  reason: 'bounce' | 'unsubscribe' | 'complaint' | 'manual';
  created_at: string;
}

const REASON_LABEL: Record<Suppression['reason'], string> = {
  unsubscribe: 'Unsubscribed',
  bounce: 'Bounced',
  complaint: 'Complaint',
  manual: 'Manually added',
};

const REASON_BADGE: Record<Suppression['reason'], string> = {
  unsubscribe: 'badge-red',
  bounce: 'badge-orange',
  complaint: 'badge-red',
  manual: 'badge-blue',
};

export default function SuppressionList({
  initialRows, initialTotal, pageSize,
}: { initialRows: Suppression[]; initialTotal: number; pageSize: number }) {
  const [rows, setRows] = useState<Suppression[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Suppression | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (p: number, s: string, r: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (s) params.set('search', s);
      if (r) params.set('reason', r);
      const res = await fetch(`/api/suppressions?${params.toString()}`);
      const d = await res.json();
      setRows(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  // Debounced search/filter reload
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, search, reasonFilter); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, reasonFilter]);

  function goToPage(p: number) {
    setPage(p);
    load(p, search, reasonFilter);
  }

  async function handleAdd() {
    const email = addEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setAddError('Enter a valid email address'); return; }
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/suppressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) { setAddError(d.error || 'Failed to add'); return; }
      setAddOpen(false);
      setAddEmail('');
      load(1, search, reasonFilter);
      setPage(1);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/suppressions/${confirmDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setConfirmDelete(null);
        load(page, search, reasonFilter);
      }
    } finally {
      setDeleting(false);
    }
  }

  function exportCsv() {
    const header = 'email,reason,added_at\n';
    const body = rows.map(r => `${r.email},${r.reason},${r.created_at}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unsubscribe-list.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
            style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
          />
        </div>
        <select
          value={reasonFilter}
          onChange={e => setReasonFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
        >
          <option value="">All reasons</option>
          <option value="unsubscribe">Unsubscribed</option>
          <option value="bounce">Bounced</option>
          <option value="complaint">Complaint</option>
          <option value="manual">Manually added</option>
        </select>
        <div className="flex-1" />
        <button onClick={exportCsv} className="btn-secondary">
          <Download size={14} /> Export
        </button>
        <button onClick={() => setAddOpen(true)} className="btn-primary">
          <Plus size={14} /> Add Manually
        </button>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{total} suppressed email{total === 1 ? '' : 's'}</p>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--table-head-bg)' }}>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Email</th>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Reason</th>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Added</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center">
                <Loader2 size={18} className="animate-spin inline" style={{ color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                <ShieldOff size={22} className="mx-auto mb-2 opacity-40" />
                No suppressed emails {search || reasonFilter ? 'match your filters' : 'yet'}.
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--card-border)' }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{r.email}</td>
                <td className="px-4 py-3">
                  <span className={`${REASON_BADGE[r.reason]} text-xs`}>{REASON_LABEL[r.reason]}</span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setConfirmDelete(r)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 size={12} className="inline mr-1" /> Resubscribe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}
          >
            Previous
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}
          >
            Next
          </button>
        </div>
      )}

      {/* Add manually modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl border p-6" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Add to Unsubscribe List</h2>
              <button onClick={() => { setAddOpen(false); setAddError(''); }} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              This email will be blocked from all future campaigns immediately.
            </p>
            <input
              value={addEmail}
              onChange={e => setAddEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 rounded-lg text-sm border mb-2"
              style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              autoFocus
            />
            {addError && <p className="text-xs text-red-500 mb-2">{addError}</p>}
            <button onClick={handleAdd} disabled={adding} className="btn-primary w-full justify-center mt-2">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add to List
            </button>
          </div>
        </div>
      )}

      {/* Resubscribe confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl border p-6" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>Resubscribe this email?</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              <span className="font-mono">{confirmDelete.email}</span> will be removed from the unsubscribe list and will become eligible for campaigns again.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-primary flex-1 justify-center" style={{ background: '#dc2626' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Resubscribe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
