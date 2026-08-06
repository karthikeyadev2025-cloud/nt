import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LogOut, LayoutDashboard, Clock, CalendarDays, Calendar, IndianRupee, Ticket, ClipboardList, Users2, MapPin, FileText, Repeat, CreditCard, Image as ImageIcon, X, Menu, Key } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database, Tables } from '../../lib/database.types';

type LeaveRequest = Database['public']['Tables']['leave_requests']['Row'];
type SalaryAdvance = Database['public']['Tables']['salary_advance_requests']['Row'];
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { useSegments } from '../../lib/useSegments';
import { istDateStr } from '../../lib/dates';
import { TicketsBoard, HRBoard, inputCls, btnCls, cardCls } from './shared';
import { TasksBoard } from './tasks';
import { MyDocumentsList, MySalaryCard } from './documents';
import { NotificationBell, AnnouncementsFeed, ShiftSwapBoard, MyBankDetails, IDCard, MyStatsCard, MyPhotoRequest, MyPromotionHistory } from './features';
import { MyRegularizations } from './lifecycle';
import { TelecallerQueue, LeadsWorkspace, ExecutiveFieldVisits } from './leads-workflow';
import { MyPerformanceChart } from './performance';
import { MyPayslips } from './payroll';
import { MyMeetings } from './meetings';
import CameraCapture from '../CameraCapture';
import { KiteTailLogo } from '../KiteTailLogo';
import SessionDevices from '../SessionDevices';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { cachedQuery } from '../../lib/cachedQuery';
import { cachedRpc } from '../../lib/cachedRpc';

// ─────────────────────────── Self-service: attendance
// ─────────────────────────── Role-aware Home
export function MyHome({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { user, hasPermission } = useAuth();
  type Appointment = { id: string; customer_name: string; phone: string; appointment_at: string | null; appointment_note: string | null };
  type TodayMeeting = { id: string; meeting_type_name: string; scheduled_at: string; customer_name: string | null; meet_link: string | null };
  type HomeStats = {
    attendance?: Tables<'attendance_records'> | null;
    pendingLeaves?: number;
    myLeads?: number;
    callsToday?: number;
    appointments?: Appointment[];
    callbacksDue?: number;
    openTickets?: number;
    myTickets?: number;
    todaysMeetings?: TodayMeeting[];
    teamPulse?: { openLeads: number; overdueLeads: number; pendingApprovals: number; ticketsOpen: number };
  };
  const [stats, setStats] = useState<HomeStats>({});
  const [loading, setLoading] = useState(true);

  const role = user?.role;
  const isCaller = role === 'telecaller';
  const isExec = role === 'marketing_executive';
  const isSupport = hasPermission('view_tickets');
  const isManagerish = hasPermission('manage_leads') || hasPermission('view_staff') || hasPermission('manage_staff');

  useEffect(() => {
    if (!user) return;
    const cacheKey = `staff_home:${user.id}`;
    cachedQuery(cacheKey, async () => {
      const todayStr = istDateStr();
      const startOfDay = `${todayStr}T00:00:00`;
      const s: HomeStats = {};

      const [{ data: att }, { count: pendingLeaves }] = await Promise.all([
        supabase.from('attendance_records').select('*')
          .eq('staff_user_id', user.id).eq('attendance_date', todayStr).maybeSingle(),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true })
          .eq('staff_user_id', user.id).eq('status', 'pending'),
      ]);
      s.attendance = att;
      s.pendingLeaves = pendingLeaves || 0;

      // Today's meetings — organizer or attendee, scheduled, within today (IST).
      // Surfaces the new meetings feature right where people actually look
      // first thing in the morning, instead of leaving it buried in its own tab.
      try {
        const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) =>
          Promise<{ data: TodayMeeting[] | null; error: unknown }>;
        const dayStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
        const dayEnd = new Date(`${todayStr}T23:59:59+05:30`).toISOString();
        const { data: meetings } = await rpc('list_meetings', { p_from: dayStart, p_to: dayEnd, p_scope: 'mine' });
        if (Array.isArray(meetings)) {
          s.todaysMeetings = meetings
            .filter((m) => (m as { status?: string }).status === 'scheduled')
            .slice(0, 5);
        }
      } catch { /* meetings RPC may not be reachable for this role — non-fatal */ }

      if (isCaller || isExec) {
        const [{ count: myLeads }, { count: callsToday }, { data: appts }] = await Promise.all([
          supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
            .eq('assigned_to', user.id).not('stage', 'in', '(won,lost)'),
          supabase.from('lead_remarks').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).gte('created_at', startOfDay),
          supabase.from('marketing_leads').select('id,customer_name,phone,appointment_at,appointment_note')
            .eq('assigned_to', user.id).not('appointment_at', 'is', null)
            .gte('appointment_at', new Date().toISOString())
            .order('appointment_at').limit(5),
        ]);
        s.myLeads = myLeads || 0;
        s.callsToday = callsToday || 0;
        s.appointments = appts || [];

        const { count: callbacks } = await supabase.from('marketing_leads')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id).not('callback_at', 'is', null)
          .lte('callback_at', new Date(Date.now() + 86400000).toISOString());
        s.callbacksDue = callbacks || 0;
      }

      if (isSupport) {
        const [{ count: openT }, { count: mineT }] = await Promise.all([
          supabase.from('support_tickets').select('id', { count: 'exact', head: true })
            .in('status', ['open', 'in_progress']),
          supabase.from('support_tickets').select('id', { count: 'exact', head: true })
            .eq('assigned_to', user.id).in('status', ['open', 'in_progress']),
        ]);
        s.openTickets = openT || 0;
        s.myTickets = mineT || 0;
      }

      // Team Pulse — a manager/HR-focused snapshot so their home screen
      // leads with "what needs my attention across the team" rather than
      // the same self-service tiles a telecaller sees. Kept lightweight
      // (counts only, no row fetches) so it doesn't slow Home down.
      if (isManagerish) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const [{ count: openLeads }, { count: overdueLeads }, { count: pendingApprovals }, { count: ticketsOpen }] = await Promise.all([
          supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
            .not('stage', 'in', '(won,lost)'),
          supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
            .not('stage', 'in', '(won,lost)').lt('updated_at', sevenDaysAgo),
          supabase.from('leave_requests').select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase.from('support_tickets').select('id', { count: 'exact', head: true })
            .in('status', ['open', 'in_progress']),
        ]);
        s.teamPulse = {
          openLeads: openLeads || 0, overdueLeads: overdueLeads || 0,
          pendingApprovals: pendingApprovals || 0, ticketsOpen: ticketsOpen || 0,
        };
      }

      return s;
    }).then(s => {
      if (s) setStats(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <p className="text-stone-700 text-sm py-8 text-center">Loading…</p>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || '').split(' ')[0];

  const Tile = ({ label, value, tone = 'text-white', onClick }: { label: string; value: ReactNode; tone?: string; onClick?: () => void }) => (
    <button onClick={onClick} disabled={!onClick}
      className={`${cardCls} text-left ${onClick ? 'hover:border-stone-300 cursor-pointer' : ''}`}>
      <p className="text-stone-700 text-xs">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${tone}`}>{value}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-stone-900 text-lg font-semibold">{greeting}{firstName ? `, ${firstName}` : ''}</h2>
        <p className="text-stone-700 text-sm">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          {user?.designation ? ` • ${user.designation}` : ''}
        </p>
      </div>

      {/* Attendance status — the one thing everyone needs first. */}
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
              <p className="text-stone-700 text-xs capitalize">
                {(stats.attendance.work_mode || 'office').replace('_', ' ')}
                {stats.attendance.check_out_at ? ' • checked out' : ''}
              </p>
            </div>
            {!stats.attendance.check_out_at && (
              <button className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 text-sm"
                onClick={() => onNavigate('attendance')}>Check Out</button>
            )}
          </div>
        )}
      </div>

      {/* Interactive Quick Shortcuts & Actions */}
      <div className={cardCls + ' space-y-3'}>
        <p className="text-stone-900 text-xs font-extrabold uppercase tracking-wider">Quick Actions & Shortcuts</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {hasPermission('view_leads') && (
            <button onClick={() => onNavigate('leads')} className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-900 font-bold text-xs transition-colors shadow-sm">
              <span className="text-base">➕</span> + Add Lead
            </button>
          )}
          {isExec && (
            <button onClick={() => onNavigate('leads')} className="flex items-center gap-2 p-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 font-bold text-xs transition-colors shadow-sm">
              <span className="text-base">📍</span> Log Field Visit
            </button>
          )}
          {isCaller && (
            <button onClick={() => onNavigate('leads')} className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold text-xs transition-colors shadow-sm">
              <span className="text-base">📞</span> Call Queue
            </button>
          )}
          {isSupport && (
            <button onClick={() => onNavigate('tickets')} className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs transition-colors shadow-sm">
              <span className="text-base">🎫</span> View Tickets
            </button>
          )}
          <button onClick={() => onNavigate('attendance')} className="flex items-center gap-2 p-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition-colors">
            <span className="text-base">⏱</span> Attendance
          </button>
          <button onClick={() => onNavigate('requests')} className="flex items-center gap-2 p-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition-colors">
            <span className="text-base">🌴</span> Request Leave
          </button>
          <button onClick={() => onNavigate('requests')} className="flex items-center gap-2 p-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition-colors">
            <span className="text-base">💰</span> Apply Advance
          </button>
          <button onClick={() => onNavigate('documents')} className="flex items-center gap-2 p-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition-colors">
            <span className="text-base">📄</span> My Documents
          </button>
        </div>
      </div>

      {/* Role-specific tiles */}
      {(isCaller || isExec) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label={isExec ? 'My leads' : 'In my queue'} value={stats.myLeads} onClick={() => onNavigate('leads')} />
          <Tile label={isExec ? 'Visits logged today' : 'Calls logged today'} value={stats.callsToday} />
          <Tile label="Callbacks due" value={stats.callbacksDue}
            tone={(stats.callbacksDue ?? 0) > 0 ? 'text-amber-700' : 'text-white'} onClick={() => onNavigate('leads')} />
          <Tile label="Upcoming appointments" value={(stats.appointments || []).length}
            tone={(stats.appointments || []).length > 0 ? 'text-teal-700' : 'text-white'} onClick={() => onNavigate('leads')} />
        </div>
      )}

      {isSupport && (
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Assigned to me" value={stats.myTickets}
            tone={(stats.myTickets ?? 0) > 0 ? 'text-teal-700' : 'text-white'} onClick={() => onNavigate('tickets')} />
          <Tile label="Open in my segment" value={stats.openTickets} onClick={() => onNavigate('tickets')} />
        </div>
      )}

      {/* Next appointments — the thing a field executive most needs to see. */}
      {(isCaller || isExec) && (stats.appointments || []).length > 0 && (
        <div className={cardCls}>
          <h3 className="text-stone-900 text-sm font-semibold mb-3">Next appointments</h3>
          <div className="space-y-2">
            {(stats.appointments || []).map(a => (
              <div key={a.id} className="flex items-start justify-between gap-3 border-b border-stone-900 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-stone-900 text-sm">{a.customer_name}</p>
                  <p className="text-stone-700 text-xs">{a.phone}{a.appointment_note ? ` • ${a.appointment_note}` : ''}</p>
                </div>
                <p className="text-teal-700 text-xs whitespace-nowrap">
                  {new Date(a.appointment_at ?? '').toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's meetings — surfaces the meetings feature on the screen
          everyone actually opens first, instead of leaving it buried in
          its own tab where people forget to check it. */}
      {(stats.todaysMeetings || []).length > 0 && (
        <div className={cardCls}>
          <h3 className="text-stone-900 text-sm font-semibold mb-3 flex items-center justify-between">
            <span>Today's meetings</span>
            <button onClick={() => onNavigate('meetings')} className="text-teal-700 text-xs font-medium">View all →</button>
          </h3>
          <div className="space-y-2">
            {(stats.todaysMeetings || []).map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-stone-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-stone-900 text-sm font-medium truncate">{m.meeting_type_name}</p>
                  <p className="text-stone-700 text-xs truncate">{m.customer_name || 'Internal'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-teal-700 text-xs whitespace-nowrap">
                    {new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                  {m.meet_link && (
                    <a href={m.meet_link} target="_blank" rel="noreferrer"
                      className="px-2 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-semibold hover:bg-teal-700">
                      Join
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Pulse — manager/HR-focused "what needs my attention across
          the team" glance. This is what makes a manager's Home feel
          purpose-built rather than a copy of a telecaller's screen with
          extra tabs unlocked. */}
      {stats.teamPulse && (
        <div className={cardCls}>
          <h3 className="text-stone-900 text-sm font-semibold mb-3">Team pulse</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onNavigate('leads')} className="text-left hover:bg-stone-50 rounded-lg p-2 -m-2">
              <p className="text-stone-700 text-xs">Open leads</p>
              <p className="text-stone-900 text-xl font-semibold">{stats.teamPulse.openLeads}</p>
            </button>
            <button onClick={() => onNavigate('leads')} className="text-left hover:bg-stone-50 rounded-lg p-2 -m-2">
              <p className="text-stone-700 text-xs">Stale 7+ days</p>
              <p className={`text-xl font-semibold ${stats.teamPulse.overdueLeads > 0 ? 'text-amber-700' : 'text-stone-900'}`}>{stats.teamPulse.overdueLeads}</p>
            </button>
            <button onClick={() => onNavigate('requests')} className="text-left hover:bg-stone-50 rounded-lg p-2 -m-2">
              <p className="text-stone-700 text-xs">Pending approvals</p>
              <p className={`text-xl font-semibold ${stats.teamPulse.pendingApprovals > 0 ? 'text-amber-700' : 'text-stone-900'}`}>{stats.teamPulse.pendingApprovals}</p>
            </button>
            <button onClick={() => onNavigate('tickets')} className="text-left hover:bg-stone-50 rounded-lg p-2 -m-2">
              <p className="text-stone-700 text-xs">Open tickets</p>
              <p className="text-stone-900 text-xl font-semibold">{stats.teamPulse.ticketsOpen}</p>
            </button>
          </div>
        </div>
      )}

      {(stats.pendingLeaves ?? 0) > 0 && (
        <button className={cardCls + ' w-full text-left hover:border-stone-300'} onClick={() => onNavigate('requests')}>
          <p className="text-amber-700 text-sm">
            {stats.pendingLeaves} request{(stats.pendingLeaves ?? 0) > 1 ? 's' : ''} awaiting approval
          </p>
        </button>
      )}

      <MyPerformanceChart />
    </div>
  );
}

export function MyAttendance() {
  const { user } = useAuth();
  const toast = useToast();
  const [today, setToday] = useState<Tables<'attendance_records'> | null>(null);
  const [history, setHistory] = useState<Tables<'attendance_records'>[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState<'in' | 'out' | null>(null);
  const [workMode, setWorkMode] = useState<'office' | 'wfh' | 'field_visit'>('office');
  const [pickingMode, setPickingMode] = useState(false);
  const dateStr = istDateStr();

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await cachedQuery(`my_attendance:${user.id}:${dateStr}`, async () => {
        const [{ data: t }, { data: h }] = await Promise.all([
          supabase.from('attendance_records').select('*').eq('staff_user_id', user.id).eq('attendance_date', dateStr).maybeSingle(),
          supabase.from('attendance_records').select('*').eq('staff_user_id', user.id).order('attendance_date', { ascending: false }).limit(14),
        ]);
        return { today: t || null, history: h || [] };
      });
      if (res) { setToday(res.today); setHistory(res.history); }
    } catch {
      // ignore
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  function getPosition(): Promise<{ lat: number | null; lng: number | null }> {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  async function uploadSelfie(dataUrl: string): Promise<string | null> {
    if (!user) return null;
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${user.id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('selfies').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) { toast.error(`Photo upload failed: ${error.message}`); return null; }
    return path;
  }

  async function finishCheckIn(photoDataUrl: string | null) {
    if (!user) return;
    setBusy(true); setShowCamera(null);
    const [{ lat, lng }, selfiePath] = await Promise.all([
      getPosition(),
      photoDataUrl ? uploadSelfie(photoDataUrl) : Promise.resolve(null),
    ]);

    // Late detection is computed server-side by a BEFORE INSERT trigger against
    // the assigned shift, so a tampered device clock can't defeat it. We just
    // record the check-in and read back the authoritative is_late result.
    //
    // Uses upsert + ignoreDuplicates instead of insert: a double-tap, a slow
    // network retry, or two tabs both racing to check in used to throw a raw
    // "duplicate key value violates unique constraint" error straight at the
    // user. Now a repeat attempt is a safe no-op — it never overwrites the
    // real first check-in time — and we show a calm "already checked in"
    // message instead of a database error.
    const { data: inserted, error } = await supabase.from('attendance_records')
      .upsert({
        staff_user_id: user.id, attendance_date: dateStr,
        check_in_at: new Date().toISOString(), check_in_lat: lat, check_in_lng: lng,
        check_in_selfie_url: selfiePath, status: 'present', work_mode: workMode,
      }, { onConflict: 'staff_user_id,attendance_date', ignoreDuplicates: true })
      .select('is_late, minutes_late').maybeSingle();
    setBusy(false);
    if (error) { toast.error(`Check-in failed: ${error.message}`); return; }
    if (!inserted) {
      // ignoreDuplicates means the row already existed — no new row was
      // returned. That's not a failure; someone just already checked in today.
      toast.info("You're already checked in today.");
      load();
      return;
    }
    toast.success(inserted.is_late ? `Checked in — ${inserted.minutes_late} min late` : 'Checked in');
    load();
  }

  async function finishCheckOut(photoDataUrl: string | null) {
    if (!user || !today) return;
    setBusy(true); setShowCamera(null);
    const [{ lat, lng }, selfiePath] = await Promise.all([
      getPosition(),
      photoDataUrl ? uploadSelfie(photoDataUrl) : Promise.resolve(null),
    ]);
    const { error } = await supabase.from('attendance_records').update({
      check_out_at: new Date().toISOString(), check_out_lat: lat, check_out_lng: lng,
      check_out_selfie_url: selfiePath,
    } as never).eq('id', today.id);
    setBusy(false);
    if (error) { toast.error(`Check-out failed: ${error.message}`); return; }
    toast.success('Checked out');
    load();
  }

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  async function viewSelfie(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage.from('selfies').createSignedUrl(path, 300);
    if (error || !data) { toast.error("Couldn't load photo"); return; }
    setPreviewImage(data.signedUrl);
  }

  return (
    <div className="space-y-5">
      <MyStatsCard />
      <MyPerformanceChart />
      <div className={cardCls + ' text-center py-8'}>
        <Clock className="w-8 h-8 text-teal-700 mx-auto mb-2" />
        <p className="text-stone-700 text-sm mb-4">{new Date().toDateString()}</p>
        {!today ? (
          <button className={btnCls} disabled={busy} onClick={() => setPickingMode(true)}>
            <MapPin className="w-4 h-4 inline mr-1" /> Check In
          </button>
        ) : !today.check_out_at ? (
          <div>
            <p className="text-emerald-700 text-sm mb-1 font-semibold">Checked in at {new Date(today.check_in_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
            <p className="text-stone-700 text-xs mb-3 capitalize">
              {(today.work_mode || 'office').replace('_', ' ')}
              {today.is_late && <span className="text-amber-700 ml-2 font-medium">Late by {today.minutes_late} min</span>}
            </p>
            <button className={btnCls} disabled={busy} onClick={() => setShowCamera('out')}>Check Out</button>
          </div>
        ) : (
          <p className="text-stone-700 text-sm font-medium">
            Done for today — In {new Date(today.check_in_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })} • Out {new Date(today.check_out_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </p>
        )}
      </div>

      <div className={cardCls + ' space-y-4'}>
        <div>
          <h3 className="text-stone-900 font-bold text-sm">Attendance History (Last 14 days)</h3>
          <p className="text-stone-500 text-xs">View your check-in/out times, photos, and map locations</p>
        </div>

        <div className="space-y-3">
          {history.map(r => (
            <div key={r.id} className="border border-stone-200 rounded-xl p-3 bg-white space-y-2">
              <div className="flex items-center justify-between text-xs border-b border-stone-100 pb-2">
                <span className="text-stone-900 font-bold">
                  {new Date(r.attendance_date ?? '').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${r.status === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {(r.status || 'present').toUpperCase()}
                  </span>
                  {r.is_late && <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">{r.minutes_late}m late</span>}
                  {r.work_mode && <span className="text-stone-600 capitalize bg-stone-100 px-2 py-0.5 rounded font-medium">{r.work_mode.replace('_', ' ')}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Check In */}
                <div className="bg-stone-50 p-2 rounded-lg border border-stone-100 flex items-center justify-between">
                  <div>
                    <span className="text-stone-500 font-medium block text-[11px]">Check In</span>
                    <span className="text-stone-900 font-semibold">
                      {r.check_in_at ? new Date(r.check_in_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {r.check_in_lat && r.check_in_lng && (
                      <a href={`https://maps.google.com/?q=${r.check_in_lat},${r.check_in_lng}`} target="_blank" rel="noreferrer" className="text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-1 rounded font-medium border border-teal-100 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-600" /> Map
                      </a>
                    )}
                    {r.check_in_selfie_url && (
                      <button onClick={() => viewSelfie(r.check_in_selfie_url)} className="text-teal-700 hover:text-teal-900 bg-white px-2 py-1 rounded font-medium border border-stone-200 inline-flex items-center gap-1">
                        <ImageIcon className="w-3 h-3 text-teal-600" /> Photo 📷
                      </button>
                    )}
                  </div>
                </div>

                {/* Check Out */}
                <div className="bg-stone-50 p-2 rounded-lg border border-stone-100 flex items-center justify-between">
                  <div>
                    <span className="text-stone-500 font-medium block text-[11px]">Check Out</span>
                    <span className="text-stone-900 font-semibold">
                      {r.check_out_at ? new Date(r.check_out_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {r.check_out_lat && r.check_out_lng && (
                      <a href={`https://maps.google.com/?q=${r.check_out_lat},${r.check_out_lng}`} target="_blank" rel="noreferrer" className="text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-1 rounded font-medium border border-teal-100 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-600" /> Map
                      </a>
                    )}
                    {r.check_out_selfie_url && (
                      <button onClick={() => viewSelfie(r.check_out_selfie_url)} className="text-teal-700 hover:text-teal-900 bg-white px-2 py-1 rounded font-medium border border-stone-200 inline-flex items-center gap-1">
                        <ImageIcon className="w-3 h-3 text-teal-600" /> Photo 📷
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
            <X className="w-6 h-6" />
          </button>
          <img src={previewImage} alt="Selfie Preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {pickingMode && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPickingMode(false)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-xs w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold text-sm mb-4">Where are you checking in from?</h3>
            <div className="space-y-2">
              {([
                { v: 'office' as const, label: 'Office' },
                { v: 'wfh' as const, label: 'Work From Home' },
                { v: 'field_visit' as const, label: 'Field Visit' },
              ]).map(m => (
                <button key={m.v} onClick={() => { setWorkMode(m.v); setPickingMode(false); setShowCamera('in'); }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-stone-200 text-stone-900 text-sm hover:border-teal-500 transition-colors">
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <CameraCapture
          title={showCamera === 'in' ? 'Check-In Selfie' : 'Check-Out Selfie'}
          onCapture={dataUrl => showCamera === 'in' ? finishCheckIn(dataUrl) : finishCheckOut(dataUrl)}
          onSkip={() => showCamera === 'in' ? finishCheckIn(null) : finishCheckOut(null)}
          onCancel={() => setShowCamera(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Self-service: leaves + advances
export function MyRequests() {
  const { user } = useAuth();
  const toast = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [leaveForm, setLeaveForm] = useState({ from_date: '', to_date: '', leave_type: 'casual', reason: '' });
  const [advForm, setAdvForm] = useState({ amount: '', reason: '' });
  const [busyLeave, setBusyLeave] = useState(false);
  const [busyAdv, setBusyAdv] = useState(false);
  type LeaveBalance = { leave_type: string; entitled: number; used: number; remaining: number; is_unlimited?: boolean; pending?: number };
  const [balances, setBalances] = useState<LeaveBalance[]>([]);

  async function loadBalances() {
    if (!user) return;
    try {
      const data = await cachedRpc(`get_leave_balances:${user.id}`, () => supabase.rpc('get_leave_balances', { _staff_user_id: user.id }));
      const list = (data as { data?: LeaveBalance[] } | LeaveBalance[])
        && Array.isArray(data) ? data as LeaveBalance[] : (data as { data?: LeaveBalance[] })?.data;
      if (Array.isArray(list)) setBalances(list as LeaveBalance[]);
    } catch {
      // ignore
    }
  }

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await cachedQuery(`my_requests:${user.id}`, async () => {
        const [{ data: l }, { data: a }] = await Promise.all([
          supabase.from('leave_requests').select('*').eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20),
          supabase.from('salary_advance_requests').select('*').eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20),
        ]);
        return { leaves: l || [], advances: a || [] };
      });
      if (res) { setLeaves(res.leaves); setAdvances(res.advances); }
      loadBalances();
    } catch {
      // ignore
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  async function requestLeave() {
    if (!user) return;
    if (!leaveForm.from_date || !leaveForm.to_date) { toast.error('Pick both start and end dates'); return; }
    if (leaveForm.to_date < leaveForm.from_date) { toast.error('End date can\u2019t be before start date'); return; }
    setBusyLeave(true);
    const { error } = await supabase.from('leave_requests').insert({ ...leaveForm, staff_user_id: user.id } as never);
    setBusyLeave(false);
    if (error) { toast.error(`Couldn't submit leave: ${error.message}`); return; }
    toast.success('Leave request submitted');
    setLeaveForm({ from_date: '', to_date: '', leave_type: 'casual', reason: '' });
    load();
  }

  async function requestAdvance() {
    if (!user) return;
    const amount = Number(advForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setBusyAdv(true);
    const { error } = await supabase.from('salary_advance_requests').insert({ staff_user_id: user.id, amount, reason: advForm.reason } as never);
    setBusyAdv(false);
    if (error) { toast.error(`Couldn't submit request: ${error.message}`); return; }
    toast.success('Advance request submitted');
    setAdvForm({ amount: '', reason: '' });
    load();
  }

  const statusColor = (s: string) =>
    s === 'approved' || s === 'paid' ? 'text-emerald-700' : s === 'rejected' ? 'text-red-700' : 'text-amber-700';

  return (
    <div className="space-y-6">
      {balances.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-stone-900 font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-teal-700" /> Leave Balance <span className="text-stone-700 text-xs font-normal">this year</span></h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {balances.map(b => (
              <div key={b.leave_type} className="rounded-xl bg-white border border-stone-800 px-3 py-2.5">
                <p className="text-stone-700 text-xs capitalize">{b.leave_type}</p>
                {b.is_unlimited ? (
                  <p className="text-teal-700 text-lg font-semibold leading-tight">—</p>
                ) : (
                  <p className={`text-lg font-semibold leading-tight ${Number(b.remaining) <= 0 ? 'text-red-700' : 'text-stone-900'}`}>
                    {Number(b.remaining)}<span className="text-stone-700 text-xs font-normal"> / {Number(b.entitled)}</span>
                  </p>
                )}
                <p className="text-stone-700 text-[10px] mt-0.5">
                  {b.is_unlimited ? 'unlimited' : `${Number(b.used)} used`}{Number(b.pending) > 0 ? ` • ${Number(b.pending)} pending` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    <div className="grid md:grid-cols-2 gap-6">
      <div className={cardCls}>
        <h3 className="text-stone-900 font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-teal-700" /> Leave Request</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input type="date" className={inputCls} value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
          <input type="date" className={inputCls} value={leaveForm.to_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
        </div>
        <select className={inputCls + ' mb-2'} value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
          {['casual', 'sick', 'earned', 'unpaid', 'other'].map(t => {
            const b = balances.find(x => x.leave_type === t);
            const suffix = !b ? '' : b.is_unlimited ? ' (unpaid)' : ` (${Number(b.remaining)} left)`;
            return <option key={t} value={t}>{t}{suffix}</option>;
          })}
        </select>
        <input className={inputCls + ' mb-3'} placeholder="Reason" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
        <button className={btnCls + ' w-full'} disabled={busyLeave} onClick={requestLeave}>{busyLeave ? 'Submitting…' : 'Submit Leave Request'}</button>
        <div className="mt-4 space-y-1.5">
          {leaves.map(l => (
            <div key={l.id} className="flex justify-between text-xs">
              <span className="text-stone-700">{l.from_date} → {l.to_date} ({l.leave_type})</span>
              <span className={statusColor(l.status)}>{l.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={cardCls}>
        <h3 className="text-stone-900 font-semibold mb-3 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-teal-700" /> Salary Advance</h3>
        <input type="number" className={inputCls + ' mb-2'} placeholder="Amount (₹)" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} />
        <input className={inputCls + ' mb-3'} placeholder="Reason" value={advForm.reason} onChange={e => setAdvForm({ ...advForm, reason: e.target.value })} />
        <button className={btnCls + ' w-full'} disabled={busyAdv} onClick={requestAdvance}>{busyAdv ? 'Submitting…' : 'Request Advance'}</button>
        <div className="mt-4 space-y-1.5">
          {advances.map(a => (
            <div key={a.id} className="flex justify-between text-xs">
              <span className="text-stone-700">₹{Number(a.amount).toLocaleString('en-IN')} • {new Date(a.created_at ?? '').toLocaleDateString()}</span>
              <span className={statusColor(a.status)}>{a.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="mt-6">
      <MyRegularizations />
    </div>
    </div>
  );
}

// ─────────────────────────── My Documents + Salary
export function MyDocuments() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-6">
      <MySalaryCard salary={user?.salary_structure} />
      <MyPayslips />
      <div>
        <h3 className="text-stone-900 font-semibold mb-3 text-sm">My Documents</h3>
        <MyDocumentsList staffUserId={user.id} employeeName={user.full_name} />
      </div>
    </div>
  );
}

// ─────────────────────────── My Profile: ID card + bank details
export function MyProfile() {
  const [showModal, setShowModal] = useState(false);
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors">
          <Key className="w-4 h-4 text-orange-700" /> Change My Password
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <IDCard />
          <MyPhotoRequest />
        </div>
        <div className="space-y-6">
          <MyBankDetails />
          <MyPromotionHistory />
        </div>
      </div>
      {user?.role === 'super_admin' && <SessionDevices />}
      {showModal && <ChangePasswordModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ─────────────────────────── Portal shell
export default function StaffPortal() {
  const { user, signOut, hasPermission } = useAuth();
  const { segments } = useSegments(true);

  // Role-specific primary tab — the thing this person does all day — comes
  // right after Home. Self-service tabs (attendance, documents, leaves,
  // profile, swap) are secondary for everyone and always come after.
  // This mirrors the Aadya pattern: a telecaller's portal leads with their
  // call queue, a manager's leads with Team, not a one-size-fits-all list.
  const isFieldRole = user?.role === 'telecaller' || user?.role === 'marketing_executive';
  const isTeamRole = hasPermission('view_staff') || hasPermission('manage_staff');
  const isTicketRole = hasPermission('view_tickets') && !isFieldRole;

  const primaryTabs = [
    { id: 'meetings', label: 'My Meetings', icon: Calendar, show: true },
    { id: 'leads', label: hasPermission('full_leads_view') ? 'Leads / CRM' : (user?.role === 'marketing_executive' ? 'Field Visits' : 'My Call Queue'), icon: ClipboardList, show: hasPermission('view_leads') && isFieldRole },
    { id: 'team', label: 'Team / HR', icon: Users2, show: isTeamRole },
    { id: 'tickets', label: 'Tickets', icon: Ticket, show: isTicketRole },
    { id: 'tasks', label: 'My Tasks', icon: ClipboardList, show: true },
  ].filter(t => t.show);

  const secondaryTabs = [
    { id: 'attendance', label: 'My Attendance', icon: Clock, show: true },
    { id: 'documents', label: 'My Documents', icon: FileText, show: true },
    { id: 'requests', label: 'Leaves & Advances', icon: CalendarDays, show: true },
    { id: 'profile', label: 'My Profile', icon: CreditCard, show: true },
    { id: 'swap', label: 'Shift Swap', icon: Repeat, show: true },
    // Catch-all: leads/tickets/team for roles not already covered above
    // (e.g. a support agent who ALSO has view_leads but isn't a field role).
    { id: 'leads', label: hasPermission('full_leads_view') ? 'Leads / CRM' : 'My Call Queue', icon: ClipboardList, show: hasPermission('view_leads') && !isFieldRole },
    { id: 'tickets', label: 'Tickets', icon: Ticket, show: hasPermission('view_tickets') && isFieldRole },
    { id: 'team', label: 'Team / HR', icon: Users2, show: hasPermission('view_attendance') && !isTeamRole },
  ].filter(t => t.show);

  const tabs = [
    { id: 'home', label: 'Home', icon: LayoutDashboard, show: true },
    ...primaryTabs,
    ...secondaryTabs,
  ];

  const [tab, setTab] = useState(tabs[0]?.id || 'home');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const mySegNames = user?.segments.includes('all')
    ? 'All Segments'
    : segments.filter(s => user?.segments.includes(s.slug)).map(s => s.name).join(', ') || '—';

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row text-stone-900">
      {/* ── Desktop Collapsible Sidebar Navigation (Classic Light Theme) ── */}
      <aside className={`hidden md:flex flex-col border-r border-stone-200 bg-white backdrop-blur sticky top-0 h-screen transition-all duration-300 z-40 shadow-sm ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <KiteTailLogo className="w-8 h-8 shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-stone-900 font-bold text-sm tracking-tight truncate">Nikki Suite</p>
                <p className="text-stone-700 text-[11px] font-mono truncate">Enterprise Portal</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-stone-700 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-orange-50 border border-orange-200 text-orange-800 shadow-sm font-semibold'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-transparent'
                }`}
                title={collapsed ? t.label : undefined}
              >
                <t.icon className={`w-5 h-5 shrink-0 ${active ? 'text-orange-700' : 'text-stone-700'}`} />
                {!collapsed && <span className="truncate">{t.label}</span>}
              </button>
            );
          })}
        </div>

        {/* User Card at bottom of sidebar */}
        <div className="p-3 border-t border-stone-200">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-stone-50 border border-stone-200">
            <div className="w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 text-orange-800 font-bold flex items-center justify-center text-xs shrink-0">
              {user?.full_name?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-stone-900 text-xs font-semibold truncate">{user?.full_name}</p>
                <p className="text-stone-700 text-[10px] capitalize truncate">{user?.role?.replace('_', ' ')}</p>
              </div>
            )}
            <button onClick={signOut} className="text-stone-700 hover:text-red-700 p-1" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-stone-200 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-30 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-1 -ml-1 text-stone-700 shrink-0"><Menu className="w-6 h-6" /></button>
            <div className="md:hidden shrink-0">
              <KiteTailLogo className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-stone-900 font-bold text-base md:text-lg tracking-tight truncate">
                {tabs.find(t => t.id === tab)?.label || 'Portal'}
              </h1>
              <p className="text-stone-700 text-xs hidden sm:block truncate">{mySegNames}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell onNavigate={(t) => { if (tabs.some(x => x.id === t)) setTab(t); }} />
            <button onClick={signOut} className="md:hidden text-stone-700 hover:text-red-700"><LogOut className="w-5 h-5" /></button>
          </div>
        </header>

        {/* Mobile nav drawer — a horizontal-scroll strip doesn't scale once a
            role has more than a handful of tabs (manager/HR can see 9+), so
            every role gets the same grouped, fully-visible drawer on mobile
            that the admin console already uses, instead of tabs sliding off
            the edge of a narrow screen. */}
        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-stone-900/50" onClick={() => setMobileNavOpen(false)} />
            <div className="relative w-72 max-w-[85vw] bg-white h-full overflow-y-auto p-4 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <KiteTailLogo className="w-8 h-8 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-stone-900 font-bold text-sm tracking-tight truncate">Nikki Suite</p>
                    <p className="text-stone-700 text-[11px] font-mono truncate">Enterprise Portal</p>
                  </div>
                </div>
                <button onClick={() => setMobileNavOpen(false)} className="p-1 text-stone-700 shrink-0"><X className="w-5 h-5" /></button>
              </div>
              <nav className="flex-1 space-y-1">
                {tabs.map(t => {
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setTab(t.id); setMobileNavOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'bg-orange-50 border border-orange-200 text-orange-800 shadow-sm font-semibold'
                          : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-transparent'
                      }`}
                    >
                      <t.icon className={`w-5 h-5 shrink-0 ${active ? 'text-orange-700' : 'text-stone-700'}`} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </nav>
              <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-stone-700 hover:text-red-700 text-sm font-semibold border-t border-stone-200 pt-3">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        )}

        <main className="p-4 md:p-6 max-w-6xl w-full mx-auto flex-1">
          {tab === 'attendance' && (
            <div className={cardCls + ' mb-5'}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-stone-900 font-semibold">Welcome back, {user?.full_name?.split(' ')[0]}</p>
                  <p className="text-stone-700 text-xs mt-0.5">
                    {user?.designation || user?.role} • {mySegNames} {user?.staff_code && `• ${user.staff_code}`}
                  </p>
                </div>
                <div className="text-right text-xs text-stone-700">
                  {user?.joining_date && <p>Joined {new Date(user.joining_date ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  {user?.reporting_time && <p className="mt-0.5">{user.reporting_time}</p>}
                </div>
              </div>
            </div>
          )}
          {tab === 'attendance' && <AnnouncementsFeed />}
          {tab === 'attendance' && <MyAttendance />}
          {tab === 'documents' && <MyDocuments />}
          {tab === 'meetings' && <MyMeetings />}
          {tab === 'requests' && <MyRequests />}
          {tab === 'home' && <MyHome onNavigate={(t) => { if (tabs.some(x => x.id === t)) setTab(t); }} />}
          {tab === 'tasks' && <TasksBoard segments={segments} mineOnly />}
          {tab === 'profile' && <MyProfile />}
          {tab === 'swap' && <ShiftSwapBoard />}
          {tab === 'tickets' && <TicketsBoard segments={segments} />}
          {tab === 'leads' && (
            hasPermission('full_leads_view')
              ? <LeadsWorkspace segments={segments} />
              : user?.role === 'marketing_executive'
                ? <ExecutiveFieldVisits segments={segments} />
                : <TelecallerQueue segments={segments} />
          )}
          {tab === 'team' && <HRBoard segments={segments} />}
        </main>
      </div>
    </div>
  );
}
