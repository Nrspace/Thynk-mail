'use client';
import { useState, useEffect, useRef } from 'react';
import { Users, Upload, Plus, Search, Trash2 } from 'lucide-react';

interface Contact {
  id: string; email: string; first_name?: string; last_name?: string;
  is_subscribed: boolean; created_at: string;
}
interface ContactList { id: string; name: string; contact_count: number; }

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [search, setSearch] = useState('');
  const [activeList, setActiveList] = useState<string>('all');
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function createList() {
    if (!newListName.trim()) return;
    await fetch('/api/contacts/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName }),
    });
    setNewListName(''); setShowNewList(false); loadData();
  }

  return (
    <div className="p-8">
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
          <button className="btn-primary" onClick={() => setShowNewList(true)}>
            <Plus size={14} /> New List
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Lists sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            onClick={() => setActiveList('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeList === 'all' ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            All Contacts <span className="text-gray-400 ml-1">({contacts.length})</span>
          </button>
          {lists.map(l => (
            <button
              key={l.id}
              onClick={() => setActiveList(l.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeList === l.id ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {l.name} <span className="text-gray-400 ml-1">({l.contact_count})</span>
            </button>
          ))}

          {showNewList && (
            <div className="pt-2 space-y-2">
              <input className="input text-xs" placeholder="List name" value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createList()} />
              <div className="flex gap-1">
                <button onClick={createList} className="btn-primary text-xs py-1 px-2 flex-1">Save</button>
                <button onClick={() => setShowNewList(false)} className="btn-secondary text-xs py-1 px-2">✕</button>
              </div>
            </div>
          )}
        </div>

        {/* Contacts table */}
        <div className="flex-1 card overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search contacts..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm">No contacts yet — import a CSV to get started</p>
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
    </div>
  );
}
