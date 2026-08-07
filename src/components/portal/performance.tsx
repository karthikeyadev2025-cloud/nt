import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { cachedQuery } from '../../lib/cachedQuery';
import { cardCls } from './shared';
import { istDateStr } from '../../lib/dates';
import type { Segment } from '../../lib/database.types';


const AXIS_COLOR = '#64748b';
const GRID_COLOR = '#1e293b';
const TOOLTIP_STYLE = { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

function dayLabel(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─────────────────────────── Employee: hours worked per day (last 14 days)
export function MyPerformanceChart() {
  const { user } = useAuth();
  const [data, setData] = useState<{ day: string; hours: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const from = new Date(); from.setDate(from.getDate() - 13);
    cachedQuery(`my_perf_chart:${user.id}`, async () => {
      const { data: recs, error } = await supabase.from('attendance_records').select('*').eq('staff_user_id', user.id)
        .gte('attendance_date', istDateStr(from)).order('attendance_date');
      if (error) throw error;
      return recs || [];
    }).then(recs => {
      const byDate = new Map((recs || []).map(r => [r.attendance_date, r]));
      const days: { day: string; hours: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = istDateStr(d);
        const rec = byDate.get(key);
        let hours = 0;
        if (rec?.check_in_at && rec?.check_out_at) {
          hours = Math.round(((new Date(rec.check_out_at ?? '').getTime() - new Date(rec.check_in_at ?? '').getTime()) / 3600000) * 10) / 10;
        }
        days.push({ day: dayLabel(d), hours });
      }
      setData(days);
    }).catch(() => {});
  }, [user]);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold text-sm mb-4">Hours Worked — Last 14 Days</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="day" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} interval={1} />
          <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1e293b' }} />
          <Bar dataKey="hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────── Telecaller: calls made per day (last 7 days)
export function MyCallsChart() {
  const { user } = useAuth();
  const [data, setData] = useState<{ day: string; calls: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const from = new Date(); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
    cachedQuery(`my_calls_chart:${user.id}`, async () => {
      const { data: recs, error } = await supabase.from('lead_remarks').select('created_at').eq('user_id', user.id).gte('created_at', from.toISOString());
      if (error) throw error;
      return recs || [];
    }).then(recs => {
      const counts = new Map<string, number>();
      (recs || []).forEach(r => {
        if (!r.created_at) return;
        const key = r.created_at.slice(0, 10);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const days: { day: string; calls: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push({ day: dayLabel(d), calls: counts.get(istDateStr(d)) || 0 });
      }
      setData(days);
    }).catch(() => {});
  }, [user]);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold text-sm mb-4">Calls Logged — Last 7 Days</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="day" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1e293b' }} />
          <Bar dataKey="calls" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────── Super Admin: company-wide attendance trend (last 14 days)
export function AttendanceTrendChart() {
  const [data, setData] = useState<{ day: string; present: number }[]>([]);

  useEffect(() => {
    const from = new Date(); from.setDate(from.getDate() - 13);
    cachedQuery('attendance_trend_chart_14d', async () => {
      const { data: recs, error } = await supabase.from('attendance_records').select('attendance_date').gte('attendance_date', istDateStr(from));
      if (error) throw error;
      return recs || [];
    }).then(recs => {
      const counts = new Map<string, number>();
      (recs || []).forEach(r => counts.set(r.attendance_date, (counts.get(r.attendance_date) || 0) + 1));
      const days: { day: string; present: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push({ day: dayLabel(d), present: counts.get(istDateStr(d)) || 0 });
      }
      setData(days);
    }).catch(() => {});
  }, []);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold text-sm mb-4">Company Attendance — Last 14 Days</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="day" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} interval={1} />
          <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="present" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: '#0ea5e9' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────── Super Admin: leads funnel by segment
export function LeadsFunnelChart({ segments, onSegmentClick }: { segments: Segment[]; onSegmentClick?: (segmentSlug: string) => void }) {
  const [data, setData] = useState<{ segment: string; slug: string; new: number; contacted: number; won: number; color: string }[]>([]);

  useEffect(() => {
    cachedQuery('leads_funnel_chart_data', async () => {
      const { data: leads, error } = await supabase.from('marketing_leads').select('segment_slug, stage');
      if (error) throw error;
      return leads || [];
    }).then(leads => {
      if (!leads) return;
      const rows = segments.map(seg => {
        const mine = leads.filter(l => l.segment_slug === seg.slug);
        return {
          segment: seg.name,
          slug: seg.slug,
          new: mine.filter(l => l.stage === 'new').length,
          contacted: mine.filter(l => ['contacted', 'qualified', 'quoted'].includes(l.stage)).length,
          won: mine.filter(l => l.stage === 'won').length,
          color: seg.color,
        };
      });
      setData(rows as never);
    }).catch(() => {});
  }, [segments]);

  if (data.length === 0) return null;
  const barClick = (item: { payload?: { slug?: string } }) => { if (item?.payload?.slug) onSegmentClick?.(item.payload.slug); };
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold text-sm mb-4">Leads Funnel by Segment</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="segment" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1e293b' }} />
          <Bar dataKey="new" stackId="a" fill="#64748b" radius={[0, 0, 0, 0]} name="New" onClick={barClick} cursor={onSegmentClick ? 'pointer' : undefined} />
          <Bar dataKey="contacted" stackId="a" fill="#f59e0b" name="In Progress" onClick={barClick} cursor={onSegmentClick ? 'pointer' : undefined} />
          <Bar dataKey="won" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} name="Won" onClick={barClick} cursor={onSegmentClick ? 'pointer' : undefined} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────── Super Admin: ticket status split (pie)
export function TicketStatusChart() {
  const [data, setData] = useState<{ name: string; value: number }[]>([]);
  const colors: Record<string, string> = { open: '#0ea5e9', in_progress: '#f59e0b', waiting_customer: '#a855f7', resolved: '#10b981', closed: '#64748b' };

  useEffect(() => {
    cachedQuery('ticket_status_chart_data', async () => {
      const { data: tickets, error } = await supabase.from('support_tickets').select('status');
      if (error) throw error;
      return tickets || [];
    }).then(tickets => {
      if (!tickets) return;
      const counts = new Map<string, number>();
      tickets.forEach(t => counts.set(t.status, (counts.get(t.status) || 0) + 1));
      setData(Array.from(counts.entries()).map(([name, value]) => ({ name: name.replace('_', ' '), value })));
    }).catch(() => {});
  }, []);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold text-sm mb-4">Ticket Status Breakdown</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
            {data.map((entry, i) => <Cell key={i} fill={colors[entry.name.replace(' ', '_')] || '#0ea5e9'} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {data.map(d => (
          <span key={d.name} className="text-xs text-stone-700 capitalize flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors[d.name.replace(' ', '_')] || '#0ea5e9' }} /> {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Sourcing Funnel — "who sourced the most won deals?"
// Uses the sourcing_funnel_report RPC added in migration 20260805000002.
// Table (not chart) because ranked leaderboards read better this way — the
// eye scans names + numbers instantly, and each row has 4 dimensions
// (sourced / contacted / won / rate) which a bar chart would compress.
type FunnelRow = {
  sourcer_id: string;
  sourcer_name: string;
  sourcer_role: string;
  total_leads: number;
  contacted_leads: number;
  won_leads: number;
  lost_leads: number;
  in_progress_leads: number;
  win_rate_pct: number | null;
};

export function SourcingFunnelWidget({ segments }: { segments: Segment[] }) {
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'30d' | '90d' | 'all'>('30d');
  const [segment, setSegment] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    const from = new Date(range === 'all' ? '2020-01-01' : now);
    if (range === '30d') from.setDate(now.getDate() - 30);
    if (range === '90d') from.setDate(now.getDate() - 90);
    const to = new Date(now); to.setDate(now.getDate() + 1);

    cachedQuery(`sourcing_funnel:${range}:${segment}`, async () => {
      // Not in database.types.ts yet — narrow at call boundary. Call
      // supabase.rpc(...) directly rather than extracting it to a local
      // variable first — detaching it loses `this` and throws inside the
      // library (this.rest.rpc(...)).
      const { data, error } = await (supabase.rpc('sourcing_funnel_report' as never, {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_segment_slug: segment || null,
      } as never) as unknown as Promise<{ data: FunnelRow[] | null; error: { message: string } | null }>);
      if (error) throw error;
      return data || [];
    })
      .then(data => { if (data) setRows(data); })
      .catch(() => { /* permission-gated; silent on lack of access */ })
      .finally(() => setLoading(false));
  }, [range, segment]);

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-stone-900 font-semibold text-sm">Sourcing Funnel</h3>
          <p className="text-stone-500 text-[11px]">Who's bringing in the deals</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={range} onChange={e => setRange(e.target.value as typeof range)}
            className="text-xs px-2 py-1 rounded-lg border border-stone-200 bg-white text-stone-700 font-semibold">
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <select value={segment} onChange={e => setSegment(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg border border-stone-200 bg-white text-stone-700 font-semibold">
            <option value="">All segments</option>
            {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-stone-500 text-xs">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-stone-500 text-sm">No sourced leads in this range yet.</p>
          <p className="text-stone-400 text-xs mt-1">Add "Who sourced this lead" when creating leads to build this report.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 6).map((r, i) => (
            <div key={r.sourcer_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-stone-50 border border-stone-100">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-700'}`}>
                {r.sourcer_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-900 text-sm font-medium truncate">{r.sourcer_name}</p>
                <p className="text-stone-500 text-xs">{r.total_leads} sourced • {r.won_leads} won</p>
              </div>
              <p className={`text-sm font-bold shrink-0 ${
                r.win_rate_pct === null ? 'text-stone-400' : r.win_rate_pct >= 40 ? 'text-emerald-700' : r.win_rate_pct >= 20 ? 'text-amber-700' : 'text-red-700'
              }`}>
                {r.win_rate_pct === null ? '—' : `${r.win_rate_pct}%`}
              </p>
            </div>
          ))}
          <p className="text-stone-400 text-[10px] pt-1 italic">Win rate excludes in-progress leads. — means no decided leads yet.</p>
        </div>
      )}
    </div>
  );
}
