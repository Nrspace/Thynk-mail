'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Send, Users, FileText,
  Mail, BarChart3, Settings, Zap, Search,
  FolderKanban, UserCog, LogOut, ChevronDown, ShieldOff,
} from 'lucide-react';
import ThemeSwitcher from './ThemeSwitcher';

const nav = [
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard'    },
  { href: '/campaigns',     icon: Send,            label: 'Campaigns'    },
  { href: '/contacts',      icon: Users,           label: 'Contacts'     },
  { href: '/suppressions',  icon: ShieldOff,       label: 'Unsubscribe List' },
  { href: '/templates',     icon: FileText,        label: 'Templates'    },
  { href: '/accounts',      icon: Mail,            label: 'Email Accounts' },
  { href: '/reports',       icon: BarChart3,       label: 'Reports'      },
  { href: '/email-status',  icon: Search,          label: 'Email Status' },
];

interface Project { id: string; name: string; slug: string }
interface MeUser { id: string; email: string; name: string; role: 'super_admin' | 'project_admin' | 'project_member' }
interface MeResponse { user: MeUser | null; activeProject: Project | null; projects: Project[] }

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setMe).catch(() => setMe(null));
  }, [pathname]);

  const isSuperAdmin = me?.user?.role === 'super_admin';
  const isProjectAdmin = me?.user?.role === 'project_admin';

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function switchProject(projectId: string) {
    await fetch('/api/projects/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    setSwitcherOpen(false);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <aside
      className="w-60 min-h-screen flex flex-col transition-colors duration-200 flex-shrink-0"
      style={{ backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sidebar-logo-bg)' }}>
          <Zap size={16} style={{ color: 'var(--sidebar-logo-text)' }} />
        </div>
        <span className="font-semibold text-lg tracking-tight" style={{ color: 'var(--sidebar-text)' }}>MailFlow</span>
      </div>

      {/* Active project / switcher */}
      <div className="px-3 pt-3 relative">
        {isSuperAdmin ? (
          <>
            <button
              onClick={() => setSwitcherOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active)' }}
            >
              <span className="truncate">{me?.activeProject?.name ?? 'Select a project'}</span>
              <ChevronDown size={14} />
            </button>
            {switcherOpen && (
              <div
                className="absolute left-3 right-3 mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                style={{ backgroundColor: 'var(--sidebar-bg)', border: '1px solid var(--sidebar-border)' }}
              >
                {(me?.projects ?? []).map(p => (
                  <button
                    key={p.id}
                    onClick={() => switchProject(p.id)}
                    className="w-full text-left px-3 py-2 text-xs"
                    style={{ color: 'var(--sidebar-text)' }}
                  >
                    {p.name}
                  </button>
                ))}
                <Link
                  href="/projects"
                  onClick={() => setSwitcherOpen(false)}
                  className="block px-3 py-2 text-xs font-medium border-t"
                  style={{ color: 'var(--sidebar-muted)', borderColor: 'var(--sidebar-border)' }}
                >
                  Manage projects →
                </Link>
              </div>
            )}
          </>
        ) : me?.activeProject ? (
          <div
            className="px-3 py-2 rounded-lg text-xs font-semibold truncate"
            style={{ backgroundColor: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active)' }}
          >
            {me.activeProject.name}
          </div>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--sidebar-active-bg)' : 'transparent',
                color: active ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)'; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'; } }}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}

        {(isSuperAdmin || isProjectAdmin) && (
          <Link
            href="/users"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: pathname.startsWith('/users') ? 'var(--sidebar-active-bg)' : 'transparent',
              color: pathname.startsWith('/users') ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
            }}
          >
            <UserCog size={16} />
            Users
          </Link>
        )}

        {isSuperAdmin && (
          <Link
            href="/projects"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: pathname.startsWith('/projects') ? 'var(--sidebar-active-bg)' : 'transparent',
              color: pathname.startsWith('/projects') ? 'var(--sidebar-active)' : 'var(--sidebar-muted)',
            }}
          >
            <FolderKanban size={16} />
            Projects
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 space-y-0.5">
        <ThemeSwitcher />
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--sidebar-muted)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-muted)'; }}
        >
          <Settings size={16} />
          Settings
        </Link>

        {me?.user && (
          <div className="px-3 pt-2 mt-1 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="pt-2 pb-1 text-xs font-medium truncate" style={{ color: 'var(--sidebar-text)' }}>
              {me.user.name}
            </div>
            <div className="text-[11px] truncate mb-2" style={{ color: 'var(--sidebar-muted)' }}>
              {me.user.email}
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: 'var(--sidebar-muted)' }}
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
