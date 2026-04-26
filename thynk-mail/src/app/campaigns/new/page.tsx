'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Save } from 'lucide-react';
import Link from 'next/link';

interface Account { id: string; name: string; email: string; }
interface ContactList { id: string; name: string; contact_count: number; }
interface Template { id: string; name: string; subject: string; html_body: string; }

export default function NewCampaignPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [form, setForm] = useState({
    name: '', subject: '', from_name: '', from_email: '',
    reply_to: '', html_body: '', account_id: '', list_ids: [] as string[],
    template_id: '', scheduled_at: '',
  });

  useEffect(() => {
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.data ?? []));
    fetch('/api/contacts/lists').then(r => r.json()).then(d => setLists(d.data ?? []));
    fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.data ?? []));
  }, []);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleTemplateChange = (id: string) => {
    const t = templates.find(t => t.id === id);
    if (t) { set('template_id', id); set('subject', t.subject); set('html_body', t.html_body); }
    else set('template_id', id);
  };

  const toggleList = (id: string) => {
    setForm(f => ({
      ...f,
      list_ids: f.list_ids.includes(id) ? f.list_ids.filter(x => x !== id) : [...f.list_ids, id],
    }));
  };

  const handleSave = async (status: 'draft' | 'scheduled' | 'sending') => {
    setSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status }),
      });
      const data = await res.json();
      if (data.id) router.push(`/campaigns/${data.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/campaigns" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-semibold">New Campaign</h1>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Campaign Details</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input className="input" placeholder="e.g. April Newsletter" value={form.name}
              onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
            <input className="input" placeholder="Your email subject" value={form.subject}
              onChange={e => set('subject', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
              <input className="input" placeholder="Your Name" value={form.from_name}
                onChange={e => set('from_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
              <input className="input" placeholder="you@domain.com" value={form.from_email}
                onChange={e => set('from_email', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To (optional)</label>
            <input className="input" placeholder="replies@domain.com" value={form.reply_to}
              onChange={e => set('reply_to', e.target.value)} />
          </div>
        </div>

        {/* Sending Account */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Sending Account</h2>
          <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
            <option value="">Select an email account...</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
          {accounts.length === 0 && (
            <p className="text-sm text-amber-600">
              No email accounts connected.{' '}
              <Link href="/accounts" className="underline">Add one first</Link>
            </p>
          )}
        </div>

        {/* Recipients */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Recipients</h2>
          {lists.length === 0 ? (
            <p className="text-sm text-gray-500">
              No contact lists yet.{' '}
              <Link href="/contacts" className="text-teal-600 underline">Add contacts first</Link>
            </p>
          ) : (
            <div className="space-y-2">
              {lists.map(l => (
                <label key={l.id} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.list_ids.includes(l.id)}
                    onChange={() => toggleList(l.id)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  <span className="text-sm text-gray-700">{l.name}</span>
                  <span className="text-xs text-gray-400">({l.contact_count} contacts)</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Template / Content */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Email Content</h2>
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Load from Template</label>
              <select className="input" value={form.template_id} onChange={e => handleTemplateChange(e.target.value)}>
                <option value="">Choose a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HTML Body</label>
            <textarea
              className="input font-mono text-xs"
              rows={10}
              placeholder="<html><body><p>Hello {{first_name}},</p></body></html>"
              value={form.html_body}
              onChange={e => set('html_body', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Use {`{{first_name}}`}, {`{{last_name}}`}, {`{{email}}`} for personalization
            </p>
          </div>
        </div>

        {/* Schedule */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Schedule (optional)</h2>
          <input type="datetime-local" className="input" value={form.scheduled_at}
            onChange={e => set('scheduled_at', e.target.value)} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button onClick={() => handleSave('draft')} disabled={saving} className="btn-secondary">
            <Save size={14} /> Save Draft
          </button>
          {form.scheduled_at ? (
            <button onClick={() => handleSave('scheduled')} disabled={saving} className="btn-primary">
              <Send size={14} /> Schedule Campaign
            </button>
          ) : (
            <button onClick={() => handleSave('sending')} disabled={saving} className="btn-primary">
              <Send size={14} /> Send Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
