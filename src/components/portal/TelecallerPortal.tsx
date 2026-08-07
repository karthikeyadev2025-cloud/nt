import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Clock, Calendar, ClipboardList, FileText, CalendarDays,
  CreditCard, Repeat, PhoneCall, UserPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSegments } from '../../lib/useSegments';
import { cachedQuery } from '../../lib/cachedQuery';
import { istDateStr } from '../../lib/dates';
import { cardCls, btnCls, MyLeadsToDoList } from './shared';
import { PortalShell, type PortalTab } from './portal-shell';
import { TelecallerQueue } from './leads-workflow';
import { TasksBoard } from './tasks';
import { AnnouncementsFeed, ShiftSwapBoard } from './features';
import { MyMeetings } from './meetings';
import {
  MyAttendance, MyDocuments, MyRequests, MyProfile,
} from './StaffPortal';

// ─────────────────────────── Telecaller Home — call-queue-first dashboard
function TelecallerHome({ onNavigate }: { onNavigate: (tab: string, openAddLead?: boolean) => void }) {
  const { user, hasPermission } = useAuth();
  type Stats = {
    inQueue: number; callbacksDue: number; calledToday: number;
    todaysMeetings: { id: string; meeting_type_name: string; scheduled_at: string; customer_name: string | null; meet_link: string | null }[];
    attendance?: { check_in_at: string | null; check_out_at: string | null; is_late?: boolean | null; minutes_late?: number | null } | null;
  };
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user) return;
    cachedQuery(`telecaller_home:${user.id}`, async () => {
      const todayStr = istDateStr();
      const startOfDay = `${todayStr}T00:00:00`;
      const [{ count: inQueue }, { count: callbacksDue }, { count: calledToday }, { data: att }] = await Promise.all([
        supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id).not('stage', 'in', '(won,lost)'),
        supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id).not('callback_at', 'is', null)
          .lte('callback_at', new Date(Date.now() + 86400000).toISOString()),
        supabase.from('lead_remarks').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('created_at', startOfDay),
        supabase.from('attendance_records').select('check_in_at, check_out_at, is_late, minutes_late')
          .eq('staff_user_id', user.id).eq('attendance_date', todayStr).maybeSingle(),
      ]);

      let todaysMeetings: Stats['todaysMeetings'] = [];
      try {
        // Call supabase.rpc(...) directly — a detached local reference
        // loses `this` and throws inside the library, which this try/catch
        // was silently swallowing every time (today's-meetings was always
        // empty because of it, not because there were no meetings).
        const dayStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
        const dayEnd = new Date(`${todayStr}T23:59:59+05:30`).toISOString();
        const { data } = await (supabase.rpc('list_meetings' as never, { p_from: dayStart, p_to: dayEnd, p_scope: 'mine' } as never) as unknown as Promise<{ data: Stats['todaysMeetings'] | null }>);
        if (Array.isArray(data)) todaysMeetings = data.slice(0, 3);
      } catch { /* non-fatal */ }

      return {
        inQueue: inQueue || 0, callbacksDue: callbacksDue || 0, calledToday: calledToday || 0,
        todaysMeetings, attendance: att,
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

      {/* Attendance — first thing, same as every portal. */}
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
              <p className="text-stone-700 text-xs">{stats.attendance.check_out_at ? 'Checked out' : 'Still checked in'}</p>
            </div>
            {!stats.attendance.check_out_at && (
              <button className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 text-sm" onClick={() => onNavigate('attendance')}>Check Out</button>
            )}
          </div>
        )}
      </div>

      {/* Call-queue numbers — the thing a telecaller's day revolves around,
          front and center instead of buried among generic self-service tiles. */}
      <div>
        <p className="text-stone-900 text-xs font-extrabold uppercase tracking-wider mb-2">Today's Call Queue</p>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => onNavigate('queue')} className={cardCls + ' text-left hover:border-stone-300'}>
            <p className="text-stone-700 text-xs">In my queue</p>
            <p className="text-2xl font-semibold mt-0.5 text-stone-900">{stats.inQueue}</p>
          </button>
          <button onClick={() => onNavigate('queue')} className={cardCls + ' text-left hover:border-stone-300'}>
            <p className="text-stone-700 text-xs">Callbacks due</p>
            <p className={`text-2xl font-semibold mt-0.5 ${stats.callbacksDue > 0 ? 'text-amber-700' : 'text-stone-900'}`}>{stats.callbacksDue}</p>
          </button>
          <div className={cardCls}>
            <p className="text-stone-700 text-xs">Calls made today</p>
            <p className="text-2xl font-semibold mt-0.5 text-stone-900">{stats.calledToday}</p>
          </div>
        </div>
      </div>

      {/* Auto-tracked to-do — every follow-up, callback, and appointment
          due, across all your leads, without having to go hunt for them
          on the call queue. */}
      <MyLeadsToDoList />

      {/* Today's meetings, if any. */}
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

      {/* Quick actions. */}
      <div className={cardCls + ' space-y-3'}>
        <p className="text-stone-900 text-xs font-extrabold uppercase tracking-wider">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <button onClick={() => onNavigate('queue')} className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold text-xs transition-colors shadow-sm">
            <PhoneCall className="w-4 h-4" /> Call Queue
          </button>
          {hasPermission('create_leads') && (
            <button onClick={() => onNavigate('queue', true)} className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-900 font-bold text-xs transition-colors shadow-sm">
              <UserPlus className="w-4 h-4" /> Add Lead
            </button>
          )}
          <button onClick={() => onNavigate('meetings')} className="flex items-center gap-2 p-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 font-bold text-xs transition-colors shadow-sm">
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
export default function TelecallerPortal() {
  const { user } = useAuth();
  const { segments } = useSegments(true);

  const tabs: PortalTab[] = [
    { id: 'home', label: 'Home', icon: LayoutDashboard, show: true },
    { id: 'queue', label: 'My Call Queue', icon: PhoneCall, show: true },
    { id: 'meetings', label: 'My Meetings', icon: Calendar, show: true },
    { id: 'tasks', label: 'My Tasks', icon: ClipboardList, show: true },
    { id: 'attendance', label: 'My Attendance', icon: Clock, show: true },
    { id: 'requests', label: 'Leaves & Advances', icon: CalendarDays, show: true },
    { id: 'documents', label: 'My Documents', icon: FileText, show: true },
    { id: 'profile', label: 'My Profile', icon: CreditCard, show: true },
    { id: 'swap', label: 'Shift Swap', icon: Repeat, show: true },
  ];

  const [tab, setTab] = useState('home');
  // Home's "+ Add Lead" quick action jumps to the queue tab AND opens the
  // modal there in one tap — a nonce (not a boolean) so tapping it twice
  // in a row, even after closing the modal, re-triggers the open.
  const [addLeadSignal, setAddLeadSignal] = useState(0);
  const mySegNames = user?.segments.includes('all')
    ? 'All Segments'
    : segments.filter(s => user?.segments.includes(s.slug)).map(s => s.name).join(', ') || '—';

  const navigate = useCallback((t: string, openAddLead?: boolean) => {
    if (!tabs.some(x => x.id === t)) return;
    setTab(t);
    if (openAddLead) setAddLeadSignal(s => s + 1);
  }, [tabs]);

  return (
    <PortalShell tabs={tabs} activeTab={tab} onTabChange={setTab} brandLabel="Telecaller Portal" subLabel={mySegNames}>
      {tab === 'home' && <TelecallerHome onNavigate={navigate} />}
      {tab === 'queue' && (
        <>
          <AnnouncementsFeed />
          <TelecallerQueue segments={segments} openAddLeadSignal={addLeadSignal} />
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
