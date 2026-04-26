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
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <span className="font-semibold text-lg tracking-tight">MailFlow</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
