'use client';
import { useEffect, useState } from 'react';
import { Plus, FolderKanban, Power } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/projects');
    if (res.status === 403) { setForbidden(true); return; }
    const data = await res.json();
    setProjects(Array.isArray(data) ? data : []);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to create project'); return; }
    setName(''); setSlug(''); setShowForm(false);
    load();
  }

  async function toggleActive(p: Project) {
    await fetch(`/api/projects/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    load();
  }

  if (forbidden) {
    return <div className="p-8">Only super admins can manage projects.</div>;
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each project is a fully independent workspace — its own accounts, contacts, templates, campaigns and users.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
          <Plus size={16} /> New Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
              <input className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Thynk Pulse" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug (optional)</label>
              <input className="input" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from name" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create Project'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {projects === null && <p className="text-sm text-gray-500">Loading…</p>}
        {projects?.length === 0 && <p className="text-sm text-gray-500">No projects yet.</p>}
        {projects?.map(p => (
          <div key={p.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100">
                <FolderKanban size={16} className="text-gray-500" />
              </div>
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-gray-500">/{p.slug}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.is_active ? 'Active' : 'Inactive'}
              </span>
              <button className="btn-secondary" onClick={() => toggleActive(p)} title={p.is_active ? 'Deactivate' : 'Activate'}>
                <Power size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
