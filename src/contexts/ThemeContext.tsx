'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export interface Theme {
  id: string;
  name: string;
  // Sidebar
  sidebarBg: string;
  sidebarText: string;
  sidebarMuted: string;
  sidebarActive: string;
  sidebarActiveBg: string;
  sidebarHover: string;
  sidebarBorder: string;
  sidebarLogoBg: string;
  sidebarLogoText: string;
  // Main surface
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Brand/Primary accent
  brandPrimary: string;
  brandPrimaryHover: string;
  brandPrimaryText: string;
  // Inputs
  inputBorder: string;
  inputFocus: string;
  // Table
  tableHeadBg: string;
  tableRowHover: string;
  tableDivider: string;
  // Links
  linkColor: string;
}

export const THEMES: Theme[] = [
  {
    id: 'default',
    name: '🌊 Ocean Teal',
    sidebarBg: '#111827',
    sidebarText: '#ffffff',
    sidebarMuted: '#9ca3af',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#0d9488',
    sidebarHover: '#1f2937',
    sidebarBorder: '#1f2937',
    sidebarLogoBg: '#14b8a6',
    sidebarLogoText: '#ffffff',
    pageBg: '#f8fafc',
    cardBg: '#ffffff',
    cardBorder: '#f1f5f9',
    textPrimary: '#0f172a',
    textSecondary: '#1e293b',
    textMuted: '#64748b',
    brandPrimary: '#0d9488',
    brandPrimaryHover: '#0f766e',
    brandPrimaryText: '#ffffff',
    inputBorder: '#e2e8f0',
    inputFocus: '#14b8a6',
    tableHeadBg: '#f8fafc',
    tableRowHover: '#f8fafc',
    tableDivider: '#f1f5f9',
    linkColor: '#0d9488',
  },
  {
    id: 'violet',
    name: '💜 Royal Violet',
    sidebarBg: '#1e1b4b',
    sidebarText: '#ffffff',
    sidebarMuted: '#a5b4fc',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#7c3aed',
    sidebarHover: '#2e2a6b',
    sidebarBorder: '#2e2a6b',
    sidebarLogoBg: '#7c3aed',
    sidebarLogoText: '#ffffff',
    pageBg: '#f5f3ff',
    cardBg: '#ffffff',
    cardBorder: '#ede9fe',
    textPrimary: '#1e1b4b',
    textSecondary: '#2e1065',
    textMuted: '#6d28d9',
    brandPrimary: '#7c3aed',
    brandPrimaryHover: '#6d28d9',
    brandPrimaryText: '#ffffff',
    inputBorder: '#ddd6fe',
    inputFocus: '#7c3aed',
    tableHeadBg: '#f5f3ff',
    tableRowHover: '#faf5ff',
    tableDivider: '#ede9fe',
    linkColor: '#7c3aed',
  },
  {
    id: 'rose',
    name: '🌹 Crimson Rose',
    sidebarBg: '#1c0a14',
    sidebarText: '#ffffff',
    sidebarMuted: '#fca5a5',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#e11d48',
    sidebarHover: '#2d1022',
    sidebarBorder: '#2d1022',
    sidebarLogoBg: '#e11d48',
    sidebarLogoText: '#ffffff',
    pageBg: '#fff1f2',
    cardBg: '#ffffff',
    cardBorder: '#ffe4e6',
    textPrimary: '#1c0a14',
    textSecondary: '#4c0519',
    textMuted: '#be123c',
    brandPrimary: '#e11d48',
    brandPrimaryHover: '#be123c',
    brandPrimaryText: '#ffffff',
    inputBorder: '#fecdd3',
    inputFocus: '#e11d48',
    tableHeadBg: '#fff1f2',
    tableRowHover: '#fff1f2',
    tableDivider: '#ffe4e6',
    linkColor: '#e11d48',
  },
  {
    id: 'slate',
    name: '🌑 Midnight Slate',
    sidebarBg: '#020617',
    sidebarText: '#ffffff',
    sidebarMuted: '#94a3b8',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#3b82f6',
    sidebarHover: '#0f172a',
    sidebarBorder: '#0f172a',
    sidebarLogoBg: '#3b82f6',
    sidebarLogoText: '#ffffff',
    pageBg: '#f1f5f9',
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#1e293b',
    textMuted: '#475569',
    brandPrimary: '#3b82f6',
    brandPrimaryHover: '#2563eb',
    brandPrimaryText: '#ffffff',
    inputBorder: '#cbd5e1',
    inputFocus: '#3b82f6',
    tableHeadBg: '#f8fafc',
    tableRowHover: '#f8fafc',
    tableDivider: '#e2e8f0',
    linkColor: '#3b82f6',
  },
  {
    id: 'forest',
    name: '🌿 Deep Forest',
    sidebarBg: '#052e16',
    sidebarText: '#ffffff',
    sidebarMuted: '#86efac',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#16a34a',
    sidebarHover: '#14532d',
    sidebarBorder: '#14532d',
    sidebarLogoBg: '#16a34a',
    sidebarLogoText: '#ffffff',
    pageBg: '#f0fdf4',
    cardBg: '#ffffff',
    cardBorder: '#dcfce7',
    textPrimary: '#052e16',
    textSecondary: '#14532d',
    textMuted: '#15803d',
    brandPrimary: '#16a34a',
    brandPrimaryHover: '#15803d',
    brandPrimaryText: '#ffffff',
    inputBorder: '#bbf7d0',
    inputFocus: '#16a34a',
    tableHeadBg: '#f0fdf4',
    tableRowHover: '#f0fdf4',
    tableDivider: '#dcfce7',
    linkColor: '#16a34a',
  },
  {
    id: 'amber',
    name: '🔥 Sunset Amber',
    sidebarBg: '#1c0a00',
    sidebarText: '#ffffff',
    sidebarMuted: '#fcd34d',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#d97706',
    sidebarHover: '#2d1500',
    sidebarBorder: '#2d1500',
    sidebarLogoBg: '#d97706',
    sidebarLogoText: '#ffffff',
    pageBg: '#fffbeb',
    cardBg: '#ffffff',
    cardBorder: '#fef3c7',
    textPrimary: '#1c0a00',
    textSecondary: '#451a03',
    textMuted: '#b45309',
    brandPrimary: '#d97706',
    brandPrimaryHover: '#b45309',
    brandPrimaryText: '#ffffff',
    inputBorder: '#fde68a',
    inputFocus: '#d97706',
    tableHeadBg: '#fffbeb',
    tableRowHover: '#fffbeb',
    tableDivider: '#fef3c7',
    linkColor: '#d97706',
  },
  {
    id: 'indigo',
    name: '🔷 Sky Indigo',
    sidebarBg: '#0c1445',
    sidebarText: '#ffffff',
    sidebarMuted: '#93c5fd',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#4f46e5',
    sidebarHover: '#1a2260',
    sidebarBorder: '#1a2260',
    sidebarLogoBg: '#4f46e5',
    sidebarLogoText: '#ffffff',
    pageBg: '#eef2ff',
    cardBg: '#ffffff',
    cardBorder: '#e0e7ff',
    textPrimary: '#1e1b4b',
    textSecondary: '#312e81',
    textMuted: '#4338ca',
    brandPrimary: '#4f46e5',
    brandPrimaryHover: '#4338ca',
    brandPrimaryText: '#ffffff',
    inputBorder: '#c7d2fe',
    inputFocus: '#4f46e5',
    tableHeadBg: '#eef2ff',
    tableRowHover: '#eef2ff',
    tableDivider: '#e0e7ff',
    linkColor: '#4f46e5',
  },
  {
    id: 'dark',
    name: '🖤 Pure Dark',
    sidebarBg: '#000000',
    sidebarText: '#ffffff',
    sidebarMuted: '#6b7280',
    sidebarActive: '#ffffff',
    sidebarActiveBg: '#374151',
    sidebarHover: '#111111',
    sidebarBorder: '#1f2937',
    sidebarLogoBg: '#374151',
    sidebarLogoText: '#ffffff',
    pageBg: '#111827',
    cardBg: '#1f2937',
    cardBorder: '#374151',
    textPrimary: '#f9fafb',
    textSecondary: '#e5e7eb',
    textMuted: '#9ca3af',
    brandPrimary: '#6b7280',
    brandPrimaryHover: '#4b5563',
    brandPrimaryText: '#ffffff',
    inputBorder: '#374151',
    inputFocus: '#6b7280',
    tableHeadBg: '#374151',
    tableRowHover: '#374151',
    tableDivider: '#374151',
    linkColor: '#d1d5db',
  },
];

const ThemeContext = createContext<{
  theme: Theme;
  setThemeId: (id: string) => void;
}>({
  theme: THEMES[0],
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>('default');

  useEffect(() => {
    const saved = localStorage.getItem('thynk-theme');
    if (saved) setThemeIdState(saved);
  }, []);

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-bg', theme.sidebarBg);
    root.style.setProperty('--sidebar-text', theme.sidebarText);
    root.style.setProperty('--sidebar-muted', theme.sidebarMuted);
    root.style.setProperty('--sidebar-active', theme.sidebarActive);
    root.style.setProperty('--sidebar-active-bg', theme.sidebarActiveBg);
    root.style.setProperty('--sidebar-hover', theme.sidebarHover);
    root.style.setProperty('--sidebar-border', theme.sidebarBorder);
    root.style.setProperty('--sidebar-logo-bg', theme.sidebarLogoBg);
    root.style.setProperty('--sidebar-logo-text', theme.sidebarLogoText);
    root.style.setProperty('--page-bg', theme.pageBg);
    root.style.setProperty('--card-bg', theme.cardBg);
    root.style.setProperty('--card-border', theme.cardBorder);
    root.style.setProperty('--text-primary', theme.textPrimary);
    root.style.setProperty('--text-secondary', theme.textSecondary);
    root.style.setProperty('--text-muted', theme.textMuted);
    root.style.setProperty('--brand-primary', theme.brandPrimary);
    root.style.setProperty('--brand-primary-hover', theme.brandPrimaryHover);
    root.style.setProperty('--brand-primary-text', theme.brandPrimaryText);
    root.style.setProperty('--input-border', theme.inputBorder);
    root.style.setProperty('--input-focus', theme.inputFocus);
    root.style.setProperty('--table-head-bg', theme.tableHeadBg);
    root.style.setProperty('--table-row-hover', theme.tableRowHover);
    root.style.setProperty('--table-divider', theme.tableDivider);
    root.style.setProperty('--link-color', theme.linkColor);
  }, [theme]);

  function setThemeId(id: string) {
    setThemeIdState(id);
    localStorage.setItem('thynk-theme', id);
  }

  return (
    <ThemeContext.Provider value={{ theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
