'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  Users,
  FileText,
  Mail,
  BarChart3,
  Settings,
  Zap,
} from 'lucide-react';
import ThemeSwitcher from './ThemeSwitcher';

const nav = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/campaigns',  icon: Send,            label: 'Campaigns' },
  { href: '/contacts',   icon: Users,           label: 'Contacts' },
  { href: '/templates',  icon: FileText,        label: 'Templates' },
  { href: '/accounts',   icon: Mail,            label: 'Email Accounts' },
  { href: '/reports',    icon: BarChart3,       label: 'Reports' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-60 min-h-screen flex flex-col transition-colors duration-200"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-5 py-5"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--sidebar-logo-bg)' }}
        >
          <Zap size={16} style={{ color: 'var(--sidebar-logo-text)' }} />
        </div>
        <span
          className="font-semibold text-lg tracking-tight"
          style={{ color: 'var(--sidebar-text)' }}
        >
          MailFlow
        </span>
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
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--sidebar-hover)';
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--sidebar-text)';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--sidebar-muted)';
                }
              }}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 space-y-0.5">
        <ThemeSwitcher />
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--sidebar-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--sidebar-hover)';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--sidebar-text)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--sidebar-muted)';
          }}
        >
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
