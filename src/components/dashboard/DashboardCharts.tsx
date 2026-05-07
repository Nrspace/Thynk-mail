'use client';
import { useState } from 'react';
import {
  ComposedChart, AreaChart, Area, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

interface Props {
  openRate: number;
  clickRate: number;
  bounceRate: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
}

const RADIAN = Math.PI / 180;

function GaugeDial({ value, max = 100, color, label, sub }: {
  value: number; max?: number; color: string; label: string; sub: string;
}) {
  const pct   = Math.min(value / max, 1);
  const angle = -210 + pct * 240;           // sweep from -210° to +30°
  const r     = 54;
  const cx    = 70; const cy = 70;
  const startA = -210 * RADIAN;
  const endA   = (angle) * RADIAN;
  const x1 = cx + r * Math.cos(startA); const y1 = cy + r * Math.sin(startA);
  const x2 = cx + r * Math.cos(endA);   const y2 = cy + r * Math.sin(endA);
  const large = pct > (240 / 360) ? 1 : 0;

  // needle
  const needleA = endA;
  const nx = cx + (r - 10) * Math.cos(needleA);
  const ny = cy + (r - 10) * Math.sin(needleA);

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="90" viewBox="0 0 140 90">
        {/* track */}
        <path d={`M ${cx + r * Math.cos(-210 * RADIAN)} ${cy + r * Math.sin(-210 * RADIAN)} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(30 * RADIAN)} ${cy + r * Math.sin(30 * RADIAN)}`}
          fill="none" stroke="var(--card-border)" strokeWidth="9" strokeLinecap="round" />
        {/* value arc */}
        {pct > 0 && (
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />
        )}
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={color} />
        {/* value text */}
        <text x={cx} y={cy - 16} textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>{value}%</text>
      </svg>
      <p className="text-xs font-semibold -mt-2" style={{ color: 'var(--text-primary)' }}>{label}</p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl shadow-2xl border px-4 py-3 text-xs min-w-[140px]"
      style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      {label && <p className="font-bold mb-2 text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? p.stroke ?? p.fill }} />
            <span style={{ color: 'var(--text-muted)' }}>{p.name}</span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardCharts({ openRate, clickRate, bounceRate, totalSent, totalOpened, totalClicked, totalBounced }: Props) {
  const [activeView, setActiveView] = useState<'funnel' | 'rates'>('funnel');

  // Funnel data
  const funnelData = [
    { name: 'Sent',    value: totalSent,    fill: '#14b8a6' },
    { name: 'Opened',  value: totalOpened,  fill: '#6366f1' },
    { name: 'Clicked', value: totalClicked, fill: '#a855f7' },
    { name: 'Bounced', value: totalBounced, fill: '#ef4444' },
  ];

  // Rate comparison for bar chart
  const rateData = [
    { name: 'Open Rate',   value: openRate,   fill: '#14b8a6', benchmark: 35 },
    { name: 'Click Rate',  value: clickRate,  fill: '#6366f1', benchmark: 5  },
    { name: 'Bounce Rate', value: bounceRate, fill: '#ef4444', benchmark: 2  },
  ];

  // Delivery donut
  const delivered = totalSent - totalBounced;
  const donutData = [
    { name: 'Delivered', value: delivered,    fill: '#14b8a6' },
    { name: 'Bounced',   value: totalBounced, fill: '#ef4444' },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-semibold themed-secondary">Year-to-Date Performance</h2>
          <p className="text-xs themed-muted mt-0.5">Live totals from send logs</p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--card-border)' }}>
          {(['funnel', 'rates'] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-all capitalize"
              style={{
                background: activeView === v ? 'var(--card-bg)' : 'transparent',
                color: activeView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: activeView === v ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
              }}>
              {v === 'funnel' ? 'Delivery Funnel' : 'Rate Benchmarks'}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'funnel' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Gauge dials */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-4 themed-muted">Engagement Rates</p>
            <div className="flex justify-around">
              <GaugeDial value={openRate}   color="#14b8a6" label="Open Rate"   sub="target ≥35%" />
              <GaugeDial value={clickRate}  color="#6366f1" label="Click Rate"  sub="target ≥5%"  />
              <GaugeDial value={bounceRate} color="#ef4444" label="Bounce Rate" sub="keep <2%"    max={10} />
            </div>
          </div>

          {/* Delivery donut */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-2 themed-muted">Delivery Split</p>
            {totalSent === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm themed-muted">No data yet</div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <PieChart width={140} height={140}>
                    <Pie data={donutData} cx={65} cy={65} innerRadius={44} outerRadius={64}
                      paddingAngle={2} dataKey="value" stroke="none">
                      {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold" style={{ color: '#14b8a6' }}>
                      {totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0}%
                    </span>
                    <span className="text-xs themed-muted">delivered</span>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  {donutData.concat([
                    { name: 'Opened',  value: totalOpened,  fill: '#6366f1' },
                    { name: 'Clicked', value: totalClicked, fill: '#a855f7' },
                  ]).map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.fill }} />
                      <span className="themed-muted w-16">{d.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {d.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-3 themed-muted">
            Your rates vs industry benchmark
          </p>
          {totalSent === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm themed-muted">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={rateData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={78} />
                <Tooltip content={<CustomTooltip />} formatter={(v: any) => [`${v}%`]} />
                <Bar dataKey="value" name="Your rate" radius={[0,4,4,0]} maxBarSize={22}>
                  {rateData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
                {rateData.map((d, i) => (
                  <ReferenceLine key={i} x={d.benchmark} stroke={d.fill} strokeDasharray="5 3"
                    strokeOpacity={0.5}
                    label={{ value: `${d.benchmark}%`, position: 'top', fontSize: 9, fill: d.fill }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs themed-muted mt-2 text-right">Dashed line = industry benchmark</p>
        </div>
      )}
    </div>
  );
}
