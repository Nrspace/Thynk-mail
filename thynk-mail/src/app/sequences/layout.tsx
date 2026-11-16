import Sidebar from '@/components/layout/Sidebar';
import SequenceTicker from '@/components/sequences/SequenceTicker';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen themed-page">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <SequenceTicker />
    </div>
  );
}
