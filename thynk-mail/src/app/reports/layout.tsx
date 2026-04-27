import Sidebar from '@/components/layout/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto" style={{ background: 'var(--page-bg)' }}>
        {children}
      </main>
    </div>
  );
}
