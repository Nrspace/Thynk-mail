'use client';
import { useEffect, useState } from 'react';
import { Plus, UserCog, Power, ShieldCheck } from 'lucide-react';

interface AppUser {
  id: string;
  project_id: string | null;
  name: string;
  email: string;
  role: 'super_admin' | 'project_admin' | 'project_member';
  is_active: boolean;
  created_at: string;
}

const ROLE_LABEL: Record<AppUser['role'], string> = {
  super_admin: 'Super Admin',
  project_admin: 'Project Admin',
  project_member: 'Project Member',
};

export default function UsersPage() {
  const [me, setMe] = useState<{ role: AppUser['role'] } | null>(null);
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'project_member' as AppUser['role'] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const meRes = await fetch('/api/auth/me');
    const meData = await meRes.json();
    setMe(meData.user);

    const res = await fetch('/api/users');
    if (res.status === 403) { setForbidden(true); return; }
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to create user'); return; }
    setForm({ name: '', email: '', password: '', role: 'project_member' });
    setShowForm(false);
    load();
  }

  async function toggleActive(u: AppUser) {
    if (u.is_active) {
      await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    } else {
      await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
    }
    load();
  }

  if (forbidden) {
    return <div className="p-8">You don&apos;t have permission to manage users.</div>;
  }

  const availableRoles: AppUser['role'][] =
    me?.role === 'super_admin' ? ['super_admin', 'project_admin', 'project_member'] : ['project_admin', 'project_member'];

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {me?.role === 'super_admin'
              ? 'Manage users across all projects, or filter to the active project.'
              : 'Manage the users in your project.'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
          <Plus size={16} /> New User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" className="input" required minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppUser['role'] }))}>
                {availableRoles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create User'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {users === null && <p className="text-sm text-gray-500">Loading…</p>}
        {users?.length === 0 && <p className="text-sm text-gray-500">No users yet.</p>}
        {users?.map(u => (
          <div key={u.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100">
                {u.role === 'super_admin' ? <ShieldCheck size={16} className="text-gray-500" /> : <UserCog size={16} className="text-gray-500" />}
              </div>
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-gray-500">{u.email} · {ROLE_LABEL[u.role]}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {u.is_active ? 'Active' : 'Inactive'}
              </span>
              <button className="btn-secondary" onClick={() => toggleActive(u)} title={u.is_active ? 'Deactivate' : 'Activate'}>
                <Power size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
