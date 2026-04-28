'use client';
import { useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  RadialBarChart, RadialBar, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

interface Props {
  openRate: number; clickRate: number; bounceRate: number;
  totalSent: number; totalOpened: number; totalClicked: number; totalBounced: number;
}

const DATASETS = [
  { key: 'sent',    label: 'Sent',    color: '#14b8a6' },
  { key: 'opened',  label: 'Opened',  color: '#6366f1' },
  { key: 'clicked', label: 'Clicked', color: '#a855f7' },
  { key: 'bounced', label: 'Bounced', color: '#ef4444' },
] as const;

type DsKey = typeof DATASETS[number]['key'];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl shadow-xl border px-3 py-2 text-xs" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill ?? p.color }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="90%" startAngle={220} endAngle={-40} data={[{ value, fill: color }]}>
            <RadialBar background={{ fill: 'var(--card-border)' }} dataKey="value" cornerRadius={5} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{value}%</span>
        </div>
      </div>
      <p className="text-xs mt-1 themed-muted font-medium">{label}</p>
    </div>
  );
}

export default function DashboardCharts({ openRate, clickRate, bounceRate, totalSent, totalOpened, totalClicked, totalBounced }: Props) {
  const [activeDS, setActiveDS] = useState<Set<DsKey>>(new Set(['sent', 'opened', 'clicked', 'bounced']));

  function toggleDS(key: DsKey) {
    const next = new Set(activeDS);
    next.has(key) ? next.delete(key) : next.add(key);
    setActiveDS(next);
  }

  const funnel = [
    { name: 'Sent',    value: totalSent,    fill: '#14b8a6' },
    { name: 'Opened',  value: totalOpened,  fill: '#6366f1' },
    { name: 'Clicked', value: totalClicked, fill: '#a855f7' },
    { name: 'Bounced', value: totalBounced, fill: '#ef4444' },
  ].filter(d => d.value > 0);

  const barData = [
    { metric: 'Sent',    sent: totalSent,    opened: 0,           clicked: 0,           bounced: 0           },
    { metric: 'Opened',  sent: 0,            opened: totalOpened,  clicked: 0,           bounced: 0           },
    { metric: 'Clicked', sent: 0,            opened: 0,            clicked: totalClicked, bounced: 0           },
    { metric: 'Bounced', sent: 0,            opened: 0,            clicked: 0,           bounced: totalBounced },
  ];

  const combinedBar = [{
    name: 'YTD',
    ...(activeDS.has('sent')    ? { Sent:    totalSent    } : {}),
    ...(activeDS.has('opened')  ? { Opened:  totalOpened  } : {}),
    ...(activeDS.has('clicked') ? { Clicked: totalClicked } : {}),
    ...(activeDS.has('bounced') ? { Bounced: totalBounced } : {}),
  }];

  return (
    <div className="card p-5 h-full">
      <h2 className="font-semibold themed-secondary mb-5">Year-to-Date Performance</h2>
      <div className="grid grid-cols-2 gap-6">
        {/* Gauges */}
        <div>
          <p className="text-xs themed-muted mb-4 font-medium uppercase tracking-wide">Engagement Rates</p>
          <div className="flex justify-around">
            <Gauge value={openRate}   label="Open Rate"   color="#14b8a6" />
            <Gauge value={clickRate}  label="Click Rate"  color="#6366f1" />
            <Gauge value={bounceRate} label="Bounce Rate" color="#ef4444" />
          </div>
        </div>
        {/* Funnel pie */}
        <div>
          <p className="text-xs themed-muted mb-4 font-medium uppercase tracking-wide">Delivery Funnel</p>
          {funnel.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs themed-muted">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={funnel} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={3}>
                  {funnel.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={7} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Dataset toggles + Bar chart */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-xs themed-muted font-medium uppercase tracking-wide">Volume Overview</p>
          <div className="flex flex-wrap gap-1.5">
            {DATASETS.map(d => {
              const on = activeDS.has(d.key);
              return (
                <button
                  key={d.key}
                  onClick={() => toggleDS(d.key)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all"
                  style={{
                    borderColor: on ? d.color : 'var(--input-border)',
                    background:  on ? `${d.color}18` : 'transparent',
                    color:       on ? d.color : 'var(--text-muted)',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? d.color : 'var(--input-border)' }} />
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {totalSent === 0 ? (
          <div className="h-20 flex items-center justify-center text-xs themed-muted">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={combinedBar} margin={{ top: 2, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
              <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip content={<ChartTooltip />} />
              {activeDS.has('sent')    && <Bar dataKey="Sent"    fill="#14b8a6" radius={[3,3,0,0]} />}
              {activeDS.has('opened')  && <Bar dataKey="Opened"  fill="#6366f1" radius={[3,3,0,0]} />}
              {activeDS.has('clicked') && <Bar dataKey="Clicked" fill="#a855f7" radius={[3,3,0,0]} />}
              {activeDS.has('bounced') && <Bar dataKey="Bounced" fill="#ef4444" radius={[3,3,0,0]} />}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
