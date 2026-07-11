import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { cardCls } from './shared';
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
    supabase.from('attendance_records').select('*').eq('staff_user_id', user.id)
      .gte('attendance_date', from.toISOString().slice(0, 10)).order('attendance_date')
      .then(({ data: recs }) => {
        const byDate = new Map((recs || []).map((r: any) => [r.attendance_date, r]));
        const days: { day: string; hours: number }[] = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const rec = byDate.get(key);
          let hours = 0;
          if (rec?.check_in_at && rec?.check_out_at) {
            hours = Math.round(((new Date(rec.check_out_at).getTime() - new Date(rec.check_in_at).getTime()) / 3600000) * 10) / 10;
          }
          days.push({ day: dayLabel(d), hours });
        }
        setData(days);
      });
  }, [user]);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4">Hours Worked — Last 14 Days</h3>
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
    supabase.from('lead_remarks').select('created_at').eq('user_id', user.id).gte('created_at', from.toISOString())
      .then(({ data: recs }) => {
        const counts = new Map<string, number>();
        (recs || []).forEach((r: any) => {
          const key = r.created_at.slice(0, 10);
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        const days: { day: string; calls: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          days.push({ day: dayLabel(d), calls: counts.get(d.toISOString().slice(0, 10)) || 0 });
        }
        setData(days);
      });
  }, [user]);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4">Calls Logged — Last 7 Days</h3>
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
    supabase.from('attendance_records').select('attendance_date').gte('attendance_date', from.toISOString().slice(0, 10))
      .then(({ data: recs }) => {
        const counts = new Map<string, number>();
        (recs || []).forEach((r: any) => counts.set(r.attendance_date, (counts.get(r.attendance_date) || 0) + 1));
        const days: { day: string; present: number }[] = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          days.push({ day: dayLabel(d), present: counts.get(d.toISOString().slice(0, 10)) || 0 });
        }
        setData(days);
      });
  }, []);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4">Company Attendance — Last 14 Days</h3>
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
export function LeadsFunnelChart({ segments }: { segments: Segment[] }) {
  const [data, setData] = useState<{ segment: string; new: number; contacted: number; won: number; color: string }[]>([]);

  useEffect(() => {
    supabase.from('marketing_leads').select('segment_slug, stage').then(({ data: leads }) => {
      if (!leads) return;
      const rows = segments.map(seg => {
        const mine = leads.filter((l: any) => l.segment_slug === seg.slug);
        return {
          segment: seg.name,
          new: mine.filter((l: any) => l.stage === 'new').length,
          contacted: mine.filter((l: any) => ['contacted', 'qualified', 'quoted'].includes(l.stage)).length,
          won: mine.filter((l: any) => l.stage === 'won').length,
          color: seg.color,
        };
      });
      setData(rows);
    });
  }, [segments]);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4">Leads Funnel by Segment</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="segment" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1e293b' }} />
          <Bar dataKey="new" stackId="a" fill="#64748b" radius={[0, 0, 0, 0]} name="New" />
          <Bar dataKey="contacted" stackId="a" fill="#f59e0b" name="In Progress" />
          <Bar dataKey="won" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} name="Won" />
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
    supabase.from('support_tickets').select('status').then(({ data: tickets }) => {
      if (!tickets) return;
      const counts = new Map<string, number>();
      tickets.forEach((t: any) => counts.set(t.status, (counts.get(t.status) || 0) + 1));
      setData(Array.from(counts.entries()).map(([name, value]) => ({ name: name.replace('_', ' '), value })));
    });
  }, []);

  if (data.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4">Ticket Status Breakdown</h3>
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
          <span key={d.name} className="text-xs text-slate-400 capitalize flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors[d.name.replace(' ', '_')] || '#0ea5e9' }} /> {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}
