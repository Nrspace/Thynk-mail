'use client';
import { useState, useEffect, useRef } from 'react';
import { Users, Upload, Plus, Search, Trash2, ClipboardPaste, X, CheckCircle, AlertCircle } from 'lucide-react';

interface Contact {
  id: string; email: string; first_name?: string; last_name?: string;
  is_subscribed: boolean; created_at: string;
}
interface ContactList { id: string; name: string; contact_count: number; }
interface ImportResult { imported: number; skipped: number; invalid: number; }

export default function ContactsPage() {
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [lists, setLists]           = useState<ContactList[]>([]);
  const [search, setSearch]         = useState('');
  const [activeList, setActiveList] = useState<string>('all');
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [loading, setLoading]       = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Paste modal
  const [showPaste, setShowPaste]       = useState(false);
  const [pasteText, setPasteText]       = useState('');
  const [pasteListId, setPasteListId]   = useState('');
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Delete list confirm
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [deletingListName, setDeletingListName] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [c, l] = await Promise.all([
      fetch('/api/contacts').then(r => r.json()),
      fetch('/api/contacts/lists').then(r => r.json()),
    ]);
    setContacts(c.data ?? []);
    setLists(l.data ?? []);
    setLoading(false);
  }

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return !q || c.email.toLowerCase().includes(q) ||
      (c.first_name ?? '').toLowerCase().includes(q) ||
      (c.last_name ?? '').toLowerCase().includes(q);
  });

  // ── Parse pasted emails ──
  function parsePasted(text: string): { valid: string[]; invalid: string[] } {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const valid: string[] = [], invalid: string[] = [];
    text.split(/[\n,;|\t]+/)
      .map(e => e.trim().toLowerCase().replace(/^["']|["']$/g, ''))
      .filter(e => e.length > 0)
      .forEach(e => {
        if (seen.has(e)) return;
        seen.add(e);
        re.test(e) ? valid.push(e) : invalid.push(e);
      });
    return { valid, invalid };
  }
  const parsed = parsePasted(pasteText);

  async function handlePasteImport() {
    if (!parsed.valid.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: parsed.valid.map(email => ({ email })),
          list_id: pasteListId || (activeList !== 'all' ? activeList : undefined),
        }),
      });
      const d = await res.json();
      setImportResult({ imported: d.imported ?? 0, skipped: d.skipped ?? 0, invalid: parsed.invalid.length });
      loadData();
    } finally { setImporting(false); }
  }

  function closePaste() {
    setShowPaste(false); setPasteText('');
    setPasteListId(''); setImportResult(null);
  }

  // ── CSV upload ──
  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim().replace(/^"|"$/g, ''); });
      return obj;
    }).filter(r => r.email);
    await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: rows, list_id: activeList !== 'all' ? activeList : undefined }),
    });
    loadData();
  }

  // ── Create list ──
  async function createList() {
    if (!newListName.trim()) return;
    await fetch('/api/contacts/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName }),
    });
    setNewListName(''); setShowNewList(false); loadData();
  }

  // ── Delete list + all its contacts ──
  async function confirmDeleteList() {
    if (!deletingListId) return;
    await fetch(`/api/contacts/lists/${deletingListId}`, { method: 'DELETE' });
    setDeletingListId(null);
    setDeletingListName('');
    if (activeList === deletingListId) setActiveList('all');
    loadData();
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-gray-500 mt-1">{contacts.length} total subscribers</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Import CSV
          </button>
          <button
            className="btn-secondary"
            onClick={() => { setShowPaste(true); setPasteListId(activeList !== 'all' ? activeList : ''); }}
          >
            <ClipboardPaste size={14} /> Paste Emails
          </button>
          <button className="btn-primary" onClick={() => setShowNewList(true)}>
            <Plus size={14} /> New List
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Lists sidebar ── */}
        <div className="w-52 shrink-0 space-y-1">
          <button
            onClick={() => setActiveList('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeList === 'all' ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            All Contacts <span className="text-gray-400 ml-1">({contacts.length})</span>
          </button>

          {lists.map(l => (
            <div key={l.id} className={`group flex items-center rounded-lg transition-colors ${activeList === l.id ? 'bg-teal-50' : 'hover:bg-gray-100'}`}>
              <button
                onClick={() => setActiveList(l.id)}
                className={`flex-1 text-left px-3 py-2 text-sm font-medium truncate ${activeList === l.id ? 'text-teal-700' : 'text-gray-600'}`}
              >
                {l.name}
                <span className="text-gray-400 font-normal ml-1">({l.contact_count})</span>
              </button>
              {/* Delete list button — visible on hover */}
              <button
                onClick={() => { setDeletingListId(l.id); setDeletingListName(l.name); }}
                className="opacity-0 group-hover:opacity-100 pr-2 text-gray-300 hover:text-red-500 transition-all shrink-0"
                title="Delete list"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {showNewList && (
            <div className="pt-2 space-y-2">
              <input className="input text-xs" placeholder="List name" value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createList()} autoFocus />
              <div className="flex gap-1">
                <button onClick={createList} className="btn-primary text-xs py-1 px-2 flex-1">Save</button>
                <button onClick={() => setShowNewList(false)} className="btn-secondary text-xs py-1 px-2">✕</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Contacts table ── */}
        <div className="flex-1 card overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search contacts..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {/* Inline paste button also here for easy access */}
            <button
              className="btn-secondary shrink-0"
              onClick={() => { setShowPaste(true); setPasteListId(activeList !== 'all' ? activeList : ''); }}
            >
              <ClipboardPaste size={14} />
              {activeList !== 'all'
                ? `Paste into "${lists.find(l => l.id === activeList)?.name ?? ''}"`
                : 'Paste Emails'}
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium">No contacts yet</p>
              <p className="text-xs mt-1">Import a CSV or paste email addresses</p>
              <button onClick={() => setShowPaste(true)} className="btn-primary mt-4 inline-flex">
                <ClipboardPaste size={14} /> Paste Emails
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.email}</td>
                    <td className="px-4 py-3 text-gray-600">{c.first_name} {c.last_name}</td>
                    <td className="px-4 py-3">
                      <span className={c.is_subscribed ? 'badge-green' : 'badge-red'}>
                        {c.is_subscribed ? 'Subscribed' : 'Unsubscribed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ══ PASTE EMAILS MODAL ══ */}
      {showPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ClipboardPaste size={18} className="text-teal-600" />
                <h2 className="font-semibold text-gray-900">Paste Email Addresses</h2>
              </div>
              <button onClick={closePaste} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4">
              {!importResult ? (
                <>
                  <p className="text-sm text-gray-500">
                    Paste emails separated by <strong>new lines</strong>, <strong>commas</strong>, or <strong>semicolons</strong>.
                  </p>

                  <textarea
                    className="input font-mono text-xs"
                    rows={8}
                    placeholder={`rahul@example.com\npriya@company.com\njohn@startup.io\n\nor comma separated:\nrahul@example.com, priya@company.com`}
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    autoFocus
                  />

                  {/* Live count */}
                  {pasteText.trim() && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-green-700 font-medium">
                          <CheckCircle size={14} /> {parsed.valid.length} valid
                        </span>
                        {parsed.invalid.length > 0 && (
                          <span className="flex items-center gap-1.5 text-red-500">
                            <AlertCircle size={14} /> {parsed.invalid.length} invalid
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{parsed.valid.length} will be imported</span>
                    </div>
                  )}

                  {/* List selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Add to list <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select className="input" value={pasteListId} onChange={e => setPasteListId(e.target.value)}>
                      <option value="">No list — add to All Contacts only</option>
                      {lists.map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.contact_count} contacts)</option>
                      ))}
                    </select>
                    {pasteListId && (
                      <p className="text-xs text-teal-600 mt-1">
                        ✓ Will be added to &quot;{lists.find(l => l.id === pasteListId)?.name}&quot;
                      </p>
                    )}
                  </div>

                  {/* Invalid warning */}
                  {parsed.invalid.length > 0 && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                      <p className="text-xs font-medium text-amber-700 mb-1">These will be skipped:</p>
                      <p className="text-xs text-amber-600 font-mono">
                        {parsed.invalid.slice(0, 5).join(', ')}{parsed.invalid.length > 5 ? ` +${parsed.invalid.length - 5} more` : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handlePasteImport}
                      disabled={importing || parsed.valid.length === 0}
                      className="btn-primary flex-1 justify-center"
                    >
                      {importing ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Importing...
                        </span>
                      ) : (
                        <><ClipboardPaste size={14} /> Import {parsed.valid.length > 0 ? `${parsed.valid.length} emails` : 'emails'}</>
                      )}
                    </button>
                    <button onClick={closePaste} className="btn-secondary">Cancel</button>
                  </div>
                </>
              ) : (
                /* ── Success screen ── */
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Complete!</h3>
                  <div className="flex justify-center gap-8 mb-4">
                    <div>
                      <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                      <p className="text-xs text-gray-500 mt-1">Imported</p>
                    </div>
                    {importResult.skipped > 0 && (
                      <div>
                        <p className="text-3xl font-bold text-amber-500">{importResult.skipped}</p>
                        <p className="text-xs text-gray-500 mt-1">Duplicates skipped</p>
                      </div>
                    )}
                    {importResult.invalid > 0 && (
                      <div>
                        <p className="text-3xl font-bold text-red-400">{importResult.invalid}</p>
                        <p className="text-xs text-gray-500 mt-1">Invalid skipped</p>
                      </div>
                    )}
                  </div>
                  {pasteListId && (
                    <p className="text-sm text-gray-500 mb-5">
                      Added to <strong>{lists.find(l => l.id === pasteListId)?.name}</strong>
                    </p>
                  )}
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => { setPasteText(''); setImportResult(null); }} className="btn-secondary">
                      Paste More
                    </button>
                    <button onClick={closePaste} className="btn-primary">Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE LIST CONFIRM MODAL ══ */}
      {deletingListId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete &quot;{deletingListName}&quot;?</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete the list and <strong>all contacts in it</strong>.
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeletingListId(null); setDeletingListName(''); }}
                className="btn-secondary flex-1 justify-center"
              >
                Cancel
              </button>
              <button onClick={confirmDeleteList} className="btn-danger flex-1 justify-center">
                <Trash2 size={14} /> Delete List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
