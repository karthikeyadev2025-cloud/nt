import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Clock, Calendar, ClipboardList, FileText, CalendarDays,
  CreditCard, Repeat, MapPin,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSegments } from '../../lib/useSegments';
import { cachedQuery } from '../../lib/cachedQuery';
import { istDateStr } from '../../lib/dates';
import { cardCls, btnCls, MyLeadsToDoList } from './shared';
import { PortalShell, type PortalTab } from './portal-shell';
import { ExecutiveFieldVisits } from './leads-workflow';
import { TasksBoard } from './tasks';
import { AnnouncementsFeed, ShiftSwapBoard } from './features';
import { MyMeetings } from './meetings';
import {
  MyAttendance, MyDocuments, MyRequests, MyProfile,
} from './StaffPortal';

// ─────────────────────────── Marketing Executive Home — field-visit-first
function ExecutiveHome({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { user } = useAuth();
  type Appointment = { id: string; customer_name: string; phone: string; appointment_at: string | null; appointment_note: string | null };
  type Stats = {
    myLeads: number; visitsToday: number;
    appointments: Appointment[];
    todaysMeetings: { id: string; meeting_type_name: string; scheduled_at: string; customer_name: string | null }[];
    attendance?: { check_in_at: string | null; check_out_at: string | null; is_late?: boolean | null; minutes_late?: number | null; work_mode?: string | null } | null;
  };
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user) return;
    cachedQuery(`exec_home:${user.id}`, async () => {
      const todayStr = istDateStr();
      const startOfDay = `${todayStr}T00:00:00`;
      const [{ count: myLeads }, { count: visitsToday }, { data: appts }, { data: att }] = await Promise.all([
        supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id).not('stage', 'in', '(won,lost)'),
        supabase.from('lead_remarks').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('created_at', startOfDay),
        supabase.from('marketing_leads').select('id,customer_name,phone,appointment_at,appointment_note')
          .eq('assigned_to', user.id).not('appointment_at', 'is', null)
          .gte('appointment_at', new Date().toISOString())
          .order('appointment_at').limit(5),
        supabase.from('attendance_records').select('check_in_at, check_out_at, is_late, minutes_late, work_mode')
          .eq('staff_user_id', user.id).eq('attendance_date', todayStr).maybeSingle(),
      ]);

      let todaysMeetings: Stats['todaysMeetings'] = [];
      try {
        // Call supabase.rpc(...) directly — a detached local reference
        // loses `this` and throws inside the library, which this try/catch
        // was silently swallowing every time.
        const dayStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
        const dayEnd = new Date(`${todayStr}T23:59:59+05:30`).toISOString();
        const { data } = await (supabase.rpc('list_meetings' as never, { p_from: dayStart, p_to: dayEnd, p_scope: 'mine' } as never) as unknown as Promise<{ data: Stats['todaysMeetings'] | null }>);
        if (Array.isArray(data)) todaysMeetings = data.slice(0, 3);
      } catch { /* non-fatal */ }

      return {
        myLeads: myLeads || 0, visitsToday: visitsToday || 0,
        appointments: appts || [], todaysMeetings, attendance: att,
      };
    }).then(s => { if (s) setStats(s); }).catch(() => {});
  }, [user]);

  if (!stats) return <p className="text-stone-700 text-sm py-8 text-center">Loading…</p>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || '').split(' ')[0];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-stone-900 text-lg font-semibold">{greeting}{firstName ? `, ${firstName}` : ''}</h2>
        <p className="text-stone-700 text-sm">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className={cardCls}>
        {!stats.attendance ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-stone-900 text-sm font-medium">Not checked in yet</p>
              <p className="text-stone-700 text-xs">Start your day from My Attendance.</p>
            </div>
            <button className={btnCls} onClick={() => onNavigate('attendance')}>Check In</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-emerald-700 text-sm font-medium">
                Checked in at {new Date(stats.attendance.check_in_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                {stats.attendance.is_late ? ` • ${stats.attendance.minutes_late} min late` : ''}
              </p>
              <p className="text-stone-700 text-xs capitalize">{(stats.attendance.work_mode || 'field').replace('_', ' ')}{stats.attendance.check_out_at ? ' • checked out' : ''}</p>
            </div>
            {!stats.attendance.check_out_at && (
              <button className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 text-sm" onClick={() => onNavigate('attendance')}>Check Out</button>
            )}
          </div>
        )}
      </div>

      {/* Auto-tracked to-do — every follow-up, callback, and appointment
          due, across all your field leads. */}
      <MyLeadsToDoList />

      {/* Field numbers — visits and pipeline, the actual job. */}
      <div>
        <p className="text-stone-900 text-xs font-extrabold uppercase tracking-wider mb-2">Today's Field Work</p>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => onNavigate('visits')} className={cardCls + ' text-left hover:border-stone-300'}>
            <p className="text-stone-700 text-xs">My leads</p>
            <p className="text-2xl font-semibold mt-0.5 text-stone-900">{stats.myLeads}</p>
          </button>
          <div className={cardCls}>
            <p className="text-stone-700 text-xs">Visits logged today</p>
            <p className="text-2xl font-semibold mt-0.5 text-stone-900">{stats.visitsToday}</p>
          </div>
          <button onClick={() => onNavigate('visits')} className={cardCls + ' text-left hover:border-stone-300'}>
            <p className="text-stone-700 text-xs">Upcoming appointments</p>
            <p className={`text-2xl font-semibold mt-0.5 ${stats.appointments.length > 0 ? 'text-teal-700' : 'text-stone-900'}`}>{stats.appointments.length}</p>
          </button>
        </div>
      </div>

      {/* Next appointments — the thing a field executive most needs to see. */}
      {stats.appointments.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-stone-900 text-sm font-semibold mb-3">Next appointments</h3>
          <div className="space-y-2">
            {stats.appointments.map(a => (
              <div key={a.id} className="flex items-start justify-between gap-3 border-b border-stone-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-stone-900 text-sm">{a.customer_name}</p>
                  <p className="text-stone-700 text-xs">{a.phone}{a.appointment_note ? ` • ${a.appointment_note}` : ''}</p>
                </div>
                <p className="text-teal-700 text-xs whitespace-nowrap shrink-0">
                  {new Date(a.appointment_at ?? '').toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.todaysMeetings.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-stone-900 text-sm font-semibold mb-3 flex items-center justify-between">
            <span>Today's meetings</span>
            <button onClick={() => onNavigate('meetings')} className="text-teal-700 text-xs font-medium">View all →</button>
          </h3>
          <div className="space-y-2">
            {stats.todaysMeetings.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-stone-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-stone-900 text-sm font-medium truncate">{m.meeting_type_name}</p>
                  <p className="text-stone-700 text-xs truncate">{m.customer_name || 'Internal'}</p>
                </div>
                <p className="text-teal-700 text-xs whitespace-nowrap shrink-0">
                  {new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={cardCls + ' space-y-3'}>
        <p className="text-stone-900 text-xs font-extrabold uppercase tracking-wider">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <button onClick={() => onNavigate('visits')} className="flex items-center gap-2 p-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 font-bold text-xs transition-colors shadow-sm">
            <MapPin className="w-4 h-4" /> Log Field Visit
          </button>
          <button onClick={() => onNavigate('meetings')} className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold text-xs transition-colors shadow-sm">
            <Calendar className="w-4 h-4" /> Schedule Meeting
          </button>
          <button onClick={() => onNavigate('requests')} className="flex items-center gap-2 p-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition-colors">
            <CalendarDays className="w-4 h-4" /> Request Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Shell wiring
export default function MarketingExecutivePortal() {
  const { user } = useAuth();
  const { segments } = useSegments(true);

  const tabs: PortalTab[] = [
    { id: 'home', label: 'Home', icon: LayoutDashboard, show: true },
    { id: 'visits', label: 'Field Visits', icon: MapPin, show: true },
    { id: 'meetings', label: 'My Meetings', icon: Calendar, show: true },
    { id: 'tasks', label: 'My Tasks', icon: ClipboardList, show: true },
    { id: 'attendance', label: 'My Attendance', icon: Clock, show: true },
    { id: 'requests', label: 'Leaves & Advances', icon: CalendarDays, show: true },
    { id: 'documents', label: 'My Documents', icon: FileText, show: true },
    { id: 'profile', label: 'My Profile', icon: CreditCard, show: true },
    { id: 'swap', label: 'Shift Swap', icon: Repeat, show: true },
  ];

  const [tab, setTab] = useState('home');
  const mySegNames = user?.segments.includes('all')
    ? 'All Segments'
    : segments.filter(s => user?.segments.includes(s.slug)).map(s => s.name).join(', ') || '—';

  const navigate = useCallback((t: string) => { if (tabs.some(x => x.id === t)) setTab(t); }, [tabs]);

  return (
    <PortalShell tabs={tabs} activeTab={tab} onTabChange={setTab} brandLabel="Field Portal" subLabel={mySegNames}>
      {tab === 'home' && <ExecutiveHome onNavigate={navigate} />}
      {tab === 'visits' && (
        <>
          <AnnouncementsFeed />
          <ExecutiveFieldVisits segments={segments} />
        </>
      )}
      {tab === 'meetings' && <MyMeetings />}
      {tab === 'tasks' && <TasksBoard segments={segments} mineOnly />}
      {tab === 'attendance' && <MyAttendance />}
      {tab === 'requests' && <MyRequests />}
      {tab === 'documents' && <MyDocuments />}
      {tab === 'profile' && <MyProfile />}
      {tab === 'swap' && <ShiftSwapBoard />}
    </PortalShell>
  );
}
