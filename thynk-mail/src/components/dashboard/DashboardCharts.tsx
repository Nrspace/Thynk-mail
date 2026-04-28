'use client';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  RadialBarChart, RadialBar,
} from 'recharts';

interface Props {
  openRate: number; clickRate: number; bounceRate: number;
  totalSent: number; totalOpened: number; totalClicked: number; totalBounced: number;
}

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
  const funnel = [
    { name: 'Sent',    value: totalSent,    fill: '#14b8a6' },
    { name: 'Opened',  value: totalOpened,  fill: '#6366f1' },
    { name: 'Clicked', value: totalClicked, fill: '#a855f7' },
    { name: 'Bounced', value: totalBounced, fill: '#ef4444' },
  ].filter(d => d.value > 0);

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

      {/* Progress bars */}
      <div className="mt-5 space-y-3">
        {[
          { label: 'Sent',    val: totalSent,    color: '#14b8a6' },
          { label: 'Opened',  val: totalOpened,  color: '#6366f1' },
          { label: 'Clicked', val: totalClicked, color: '#a855f7' },
          { label: 'Bounced', val: totalBounced, color: '#ef4444' },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="text-xs w-14 themed-muted">{row.label}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${totalSent > 0 ? Math.min(100, (row.val / totalSent) * 100) : 0}%`,
                background: row.color,
              }} />
            </div>
            <span className="text-xs font-semibold tabular-nums w-12 text-right" style={{ color: row.color }}>
              {row.val.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
