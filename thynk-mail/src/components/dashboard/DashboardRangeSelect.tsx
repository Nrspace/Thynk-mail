'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';

export const RANGE_OPTIONS = [
  { label: 'Last 7 Days',    value: '7'      },
  { label: 'Today',          value: 'today'  },
  { label: 'This Week',      value: 'week'   },
  { label: '15 Days',        value: '15'     },
  { label: '30 Days',        value: '30'     },
  { label: '90 Days',        value: '90'     },
  { label: '180 Days',       value: '180'    },
  { label: 'Current Year',   value: 'year'   },
  { label: 'Custom Period',  value: 'custom' },
];

export default function DashboardRangeSelect({ currentRange }: { currentRange: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? '');
  const [toDate, setToDate]     = useState(searchParams.get('to') ?? '');

  const navigate = (range: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    params.set('range', range);
    if (range === 'custom') {
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="relative">
        <select
          className="input w-44 appearance-none pr-8 cursor-pointer"
          value={currentRange}
          onChange={e => navigate(e.target.value, fromDate, toDate)}
        >
          {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-muted)' }} />
      </div>

      {currentRange === 'custom' && (
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="date"
            className="input text-sm w-36"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
          />
          <span className="text-xs themed-muted">to</span>
          <input
            type="date"
            className="input text-sm w-36"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
          />
          <button
            onClick={() => navigate('custom', fromDate, toDate)}
            disabled={!fromDate}
            className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
