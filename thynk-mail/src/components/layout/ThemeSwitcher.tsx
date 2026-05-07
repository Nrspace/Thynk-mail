'use client';
import { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme, THEMES } from '@/contexts/ThemeContext';

export default function ThemeSwitcher() {
  const { theme, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full"
        style={{
          color: 'var(--sidebar-muted)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--sidebar-hover)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-text)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-muted)';
        }}
      >
        <Palette size={16} />
        <span>Theme</span>
        <span
          className="ml-auto w-4 h-4 rounded-full border-2 border-white/30 flex-shrink-0"
          style={{ backgroundColor: theme.brandPrimary }}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute bottom-full left-0 mb-2 w-56 rounded-xl shadow-2xl border z-50 overflow-hidden"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
            }}
          >
            <div
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b"
              style={{
                color: 'var(--text-muted)',
                borderColor: 'var(--card-border)',
              }}
            >
              Choose Theme
            </div>
            <div className="p-1.5 space-y-0.5 max-h-72 overflow-y-auto">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setThemeId(t.id); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left"
                  style={{
                    backgroundColor: theme.id === t.id ? `${t.brandPrimary}15` : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                  onMouseEnter={e => {
                    if (theme.id !== t.id)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--table-row-hover)';
                  }}
                  onMouseLeave={e => {
                    if (theme.id !== t.id)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex-shrink-0 border-2"
                    style={{
                      backgroundColor: t.brandPrimary,
                      borderColor: t.sidebarBg,
                      boxShadow: `0 0 0 1px ${t.brandPrimary}50`,
                    }}
                  />
                  <span className="flex-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {t.name}
                  </span>
                  {theme.id === t.id && (
                    <Check size={13} style={{ color: t.brandPrimary }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
