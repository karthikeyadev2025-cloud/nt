import { useEffect, useState } from 'react';
import { LogOut, LayoutDashboard, Clock, CalendarDays, IndianRupee, Ticket, ClipboardList, Users2, MapPin, FileText, Repeat, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
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
import CameraCapture from '../CameraCapture';
import { KiteTailLogo } from '../KiteTailLogo';
import SessionDevices from '../SessionDevices';

// ─────────────────────────── Self-service: attendance
// ─────────────────────────── Role-aware Home
// Every role lands here. The cards shown are chosen by what that person's job
// actually is, so a telecaller sees today's calls and a field executive sees
// today's appointments — instead of everyone getting the same attendance page.
export function MyHome({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const role = user?.role;
  const isCaller = role === 'telecaller';
  const isExec = role === 'marketing_executive';
  const isSupport = hasPermission('view_tickets');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const todayStr = istDateStr();
      const startOfDay = `${todayStr}T00:00:00`;
      const s: any = {};

      // Everyone: today's attendance + pending requests.
      const [{ data: att }, { count: pendingLeaves }] = await Promise.all([
        supabase.from('attendance_records').select('*')
          .eq('staff_user_id', user.id).eq('attendance_date', todayStr).maybeSingle(),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true })
          .eq('staff_user_id', user.id).eq('status', 'pending'),
      ]);
      s.attendance = att;
      s.pendingLeaves = pendingLeaves || 0;

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

      setStats(s);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <p className="text-slate-500 text-sm py-8 text-center">Loading…</p>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.full_name || '').split(' ')[0];

  const Tile = ({ label, value, tone = 'text-white', onClick }: any) => (
    <button onClick={onClick} disabled={!onClick}
      className={`${cardCls} text-left ${onClick ? 'hover:border-slate-600 cursor-pointer' : ''}`}>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${tone}`}>{value}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white text-lg font-semibold">{greeting}{firstName ? `, ${firstName}` : ''}</h2>
        <p className="text-slate-500 text-sm">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          {user?.designation ? ` • ${user.designation}` : ''}
        </p>
      </div>

      {/* Attendance status — the one thing everyone needs first. */}
      <div className={cardCls}>
        {!stats.attendance ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-white text-sm font-medium">Not checked in yet</p>
              <p className="text-slate-500 text-xs">Start your day from My Attendance.</p>
            </div>
            <button className={btnCls} onClick={() => onNavigate('attendance')}>Check In</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-emerald-300 text-sm font-medium">
                Checked in at {new Date(stats.attendance.check_in_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                {stats.attendance.is_late ? ` • ${stats.attendance.minutes_late} min late` : ''}
              </p>
              <p className="text-slate-500 text-xs capitalize">
                {(stats.attendance.work_mode || 'office').replace('_', ' ')}
                {stats.attendance.check_out_at ? ' • checked out' : ''}
              </p>
            </div>
            {!stats.attendance.check_out_at && (
              <button className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-sm"
                onClick={() => onNavigate('attendance')}>Check Out</button>
            )}
          </div>
        )}
      </div>

      {/* Role-specific tiles */}
      {(isCaller || isExec) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label={isExec ? 'My leads' : 'In my queue'} value={stats.myLeads} onClick={() => onNavigate('leads')} />
          <Tile label={isExec ? 'Visits logged today' : 'Calls logged today'} value={stats.callsToday} />
          <Tile label="Callbacks due" value={stats.callbacksDue}
            tone={stats.callbacksDue > 0 ? 'text-amber-400' : 'text-white'} onClick={() => onNavigate('leads')} />
          <Tile label="Upcoming appointments" value={stats.appointments.length}
            tone={stats.appointments.length > 0 ? 'text-sky-300' : 'text-white'} onClick={() => onNavigate('leads')} />
        </div>
      )}

      {isSupport && (
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Assigned to me" value={stats.myTickets}
            tone={stats.myTickets > 0 ? 'text-sky-300' : 'text-white'} onClick={() => onNavigate('tickets')} />
          <Tile label="Open in my segment" value={stats.openTickets} onClick={() => onNavigate('tickets')} />
        </div>
      )}

      {/* Next appointments — the thing a field executive most needs to see. */}
      {(isCaller || isExec) && stats.appointments.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-white text-sm font-semibold mb-3">Next appointments</h3>
          <div className="space-y-2">
            {stats.appointments.map((a: any) => (
              <div key={a.id} className="flex items-start justify-between gap-3 border-b border-slate-900 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-white text-sm">{a.customer_name}</p>
                  <p className="text-slate-500 text-xs">{a.phone}{a.appointment_note ? ` • ${a.appointment_note}` : ''}</p>
                </div>
                <p className="text-sky-300 text-xs whitespace-nowrap">
                  {new Date(a.appointment_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.pendingLeaves > 0 && (
        <button className={cardCls + ' w-full text-left hover:border-slate-600'} onClick={() => onNavigate('requests')}>
          <p className="text-amber-400 text-sm">
            {stats.pendingLeaves} request{stats.pendingLeaves > 1 ? 's' : ''} awaiting approval
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
  const [today, setToday] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState<'in' | 'out' | null>(null);
  const [workMode, setWorkMode] = useState<'office' | 'wfh' | 'field_visit'>('office');
  const [pickingMode, setPickingMode] = useState(false);
  const dateStr = istDateStr();

  async function load() {
    if (!user) return;
    const [{ data: t }, { data: h }] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('staff_user_id', user.id).eq('attendance_date', dateStr).maybeSingle(),
      supabase.from('attendance_records').select('*').eq('staff_user_id', user.id).order('attendance_date', { ascending: false }).limit(14),
    ]);
    setToday(t);
    if (h) setHistory(h);
  }
  useEffect(() => { load(); }, [user]);

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
    const { data: inserted, error } = await supabase.from('attendance_records').insert({
      staff_user_id: user.id, attendance_date: dateStr,
      check_in_at: new Date().toISOString(), check_in_lat: lat, check_in_lng: lng,
      check_in_selfie_url: selfiePath, status: 'present', work_mode: workMode,
    }).select('is_late, minutes_late').maybeSingle();
    setBusy(false);
    if (error) { toast.error(`Check-in failed: ${error.message}`); return; }
    toast.success(inserted?.is_late ? `Checked in — ${inserted.minutes_late} min late` : 'Checked in');
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
    }).eq('id', today.id);
    setBusy(false);
    if (error) { toast.error(`Check-out failed: ${error.message}`); return; }
    toast.success('Checked out');
    load();
  }

  return (
    <div className="space-y-5">
      <MyStatsCard />
      <MyPerformanceChart />
      <div className={cardCls + ' text-center py-8'}>
        <Clock className="w-8 h-8 text-sky-400 mx-auto mb-2" />
        <p className="text-slate-400 text-sm mb-4">{new Date().toDateString()}</p>
        {!today ? (
          <button className={btnCls} disabled={busy} onClick={() => setPickingMode(true)}>
            <MapPin className="w-4 h-4 inline mr-1" /> Check In
          </button>
        ) : !today.check_out_at ? (
          <div>
            <p className="text-emerald-300 text-sm mb-1">Checked in at {new Date(today.check_in_at).toLocaleTimeString()}</p>
            <p className="text-slate-500 text-xs mb-3 capitalize">
              {(today.work_mode || 'office').replace('_', ' ')}
              {today.is_late && <span className="text-amber-400 ml-2">Late by {today.minutes_late} min</span>}
            </p>
            <button className={btnCls} disabled={busy} onClick={() => setShowCamera('out')}>Check Out</button>
          </div>
        ) : (
          <p className="text-slate-300 text-sm">
            Done for today — In {new Date(today.check_in_at).toLocaleTimeString()} • Out {new Date(today.check_out_at).toLocaleTimeString()}
          </p>
        )}
      </div>
      <div className={cardCls}>
        <h3 className="text-white font-semibold mb-3 text-sm">Last 14 days</h3>
        <div className="space-y-1.5">
          {history.map(r => (
            <div key={r.id} className="flex justify-between text-xs">
              <span className="text-slate-400">{r.attendance_date}</span>
              <span className="text-slate-300">
                {r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString() : '—'} → {r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString() : '—'}
                {r.work_mode && r.work_mode !== 'office' && <span className="ml-2 text-amber-400 capitalize">{r.work_mode.replace('_', ' ')}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {pickingMode && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPickingMode(false)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-xs w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-sm mb-4">Where are you checking in from?</h3>
            <div className="space-y-2">
              {[
                { v: 'office', label: 'Office' },
                { v: 'wfh', label: 'Work From Home' },
                { v: 'field_visit', label: 'Field Visit' },
              ].map(m => (
                <button key={m.v} onClick={() => { setWorkMode(m.v as any); setPickingMode(false); setShowCamera('in'); }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-700 text-white text-sm hover:border-sky-500 transition-colors">
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
  const [leaves, setLeaves] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [leaveForm, setLeaveForm] = useState({ from_date: '', to_date: '', leave_type: 'casual', reason: '' });
  const [advForm, setAdvForm] = useState({ amount: '', reason: '' });
  const [busyLeave, setBusyLeave] = useState(false);
  const [busyAdv, setBusyAdv] = useState(false);
  const [balances, setBalances] = useState<any[]>([]);

  async function loadBalances() {
    if (!user) return;
    const { data } = await supabase.rpc('get_leave_balances', { _staff_user_id: user.id });
    if (data) setBalances(data);
  }

  async function load() {
    if (!user) return;
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.from('leave_requests').select('*').eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('salary_advance_requests').select('*').eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (l) setLeaves(l);
    if (a) setAdvances(a);
    loadBalances();
  }
  useEffect(() => { load(); }, [user]);

  async function requestLeave() {
    if (!user) return;
    if (!leaveForm.from_date || !leaveForm.to_date) { toast.error('Pick both start and end dates'); return; }
    if (leaveForm.to_date < leaveForm.from_date) { toast.error('End date can\u2019t be before start date'); return; }
    setBusyLeave(true);
    const { error } = await supabase.from('leave_requests').insert({ ...leaveForm, staff_user_id: user.id });
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
    const { error } = await supabase.from('salary_advance_requests').insert({ staff_user_id: user.id, amount, reason: advForm.reason });
    setBusyAdv(false);
    if (error) { toast.error(`Couldn't submit request: ${error.message}`); return; }
    toast.success('Advance request submitted');
    setAdvForm({ amount: '', reason: '' });
    load();
  }

  const statusColor = (s: string) =>
    s === 'approved' || s === 'paid' ? 'text-emerald-300' : s === 'rejected' ? 'text-red-300' : 'text-amber-300';

  return (
    <div className="space-y-6">
      {balances.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-sky-400" /> Leave Balance <span className="text-slate-500 text-xs font-normal">this year</span></h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {balances.map((b: any) => (
              <div key={b.leave_type} className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5">
                <p className="text-slate-400 text-xs capitalize">{b.leave_type}</p>
                {b.is_unlimited ? (
                  <p className="text-sky-300 text-lg font-semibold leading-tight">—</p>
                ) : (
                  <p className={`text-lg font-semibold leading-tight ${Number(b.remaining) <= 0 ? 'text-red-400' : 'text-white'}`}>
                    {Number(b.remaining)}<span className="text-slate-600 text-xs font-normal"> / {Number(b.entitled)}</span>
                  </p>
                )}
                <p className="text-slate-600 text-[10px] mt-0.5">
                  {b.is_unlimited ? 'unlimited' : `${Number(b.used)} used`}{Number(b.pending) > 0 ? ` • ${Number(b.pending)} pending` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    <div className="grid md:grid-cols-2 gap-6">
      <div className={cardCls}>
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-sky-400" /> Leave Request</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input type="date" className={inputCls} value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
          <input type="date" className={inputCls} value={leaveForm.to_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
        </div>
        <select className={inputCls + ' mb-2'} value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
          {['casual', 'sick', 'earned', 'unpaid', 'other'].map(t => {
            const b = balances.find((x: any) => x.leave_type === t);
            const suffix = !b ? '' : b.is_unlimited ? ' (unpaid)' : ` (${Number(b.remaining)} left)`;
            return <option key={t} value={t}>{t}{suffix}</option>;
          })}
        </select>
        <input className={inputCls + ' mb-3'} placeholder="Reason" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
        <button className={btnCls + ' w-full'} disabled={busyLeave} onClick={requestLeave}>{busyLeave ? 'Submitting…' : 'Submit Leave Request'}</button>
        <div className="mt-4 space-y-1.5">
          {leaves.map(l => (
            <div key={l.id} className="flex justify-between text-xs">
              <span className="text-slate-400">{l.from_date} → {l.to_date} ({l.leave_type})</span>
              <span className={statusColor(l.status)}>{l.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={cardCls}>
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-sky-400" /> Salary Advance</h3>
        <input type="number" className={inputCls + ' mb-2'} placeholder="Amount (₹)" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} />
        <input className={inputCls + ' mb-3'} placeholder="Reason" value={advForm.reason} onChange={e => setAdvForm({ ...advForm, reason: e.target.value })} />
        <button className={btnCls + ' w-full'} disabled={busyAdv} onClick={requestAdvance}>{busyAdv ? 'Submitting…' : 'Request Advance'}</button>
        <div className="mt-4 space-y-1.5">
          {advances.map(a => (
            <div key={a.id} className="flex justify-between text-xs">
              <span className="text-slate-400">₹{Number(a.amount).toLocaleString('en-IN')} • {new Date(a.created_at).toLocaleDateString()}</span>
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
      <MySalaryCard salary={(user as any).salary_structure} />
      <MyPayslips />
      <div>
        <h3 className="text-white font-semibold mb-3 text-sm">My Documents</h3>
        <MyDocumentsList staffUserId={user.id} employeeName={user.full_name} />
      </div>
    </div>
  );
}

// ─────────────────────────── My Profile: ID card + bank details
export function MyProfile() {
  return (
    <div className="space-y-6">
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
      <SessionDevices />
    </div>
  );
}

// ─────────────────────────── Portal shell
export default function StaffPortal() {
  const { user, signOut, hasPermission } = useAuth();
  const { segments } = useSegments(true);

  const tabs = [
    { id: 'home', label: 'Home', icon: LayoutDashboard, show: true },
    { id: 'attendance', label: 'My Attendance', icon: Clock, show: true },
    { id: 'tasks', label: 'My Tasks', icon: ClipboardList, show: true },
    { id: 'documents', label: 'My Documents', icon: FileText, show: true },
    { id: 'requests', label: 'Leaves & Advances', icon: CalendarDays, show: true },
    { id: 'profile', label: 'My Profile', icon: CreditCard, show: true },
    { id: 'swap', label: 'Shift Swap', icon: Repeat, show: true },
    { id: 'tickets', label: 'Tickets', icon: Ticket, show: hasPermission('view_tickets') },
    { id: 'leads', label: hasPermission('full_leads_view') ? 'Leads / CRM' : (user?.role === 'marketing_executive' ? 'Field Visits' : 'My Call Queue'), icon: ClipboardList, show: hasPermission('view_leads') },
    { id: 'team', label: 'Team / HR', icon: Users2, show: hasPermission('view_staff') || hasPermission('view_attendance') },
  ].filter(t => t.show);

  const [tab, setTab] = useState(tabs[0]?.id || 'home');
  const [collapsed, setCollapsed] = useState(false);

  const mySegNames = user?.segments.includes('all')
    ? 'All Segments'
    : segments.filter(s => user?.segments.includes(s.slug)).map(s => s.name).join(', ') || '—';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900">
      {/* ── Desktop Collapsible Sidebar Navigation (Classic Light Theme) ── */}
      <aside className={`hidden md:flex flex-col border-r border-slate-200 bg-white backdrop-blur sticky top-0 h-screen transition-all duration-300 z-40 shadow-sm ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <KiteTailLogo className="w-8 h-8 shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-slate-900 font-bold text-sm tracking-tight truncate">Nikki Suite</p>
                <p className="text-slate-500 text-[11px] font-mono truncate">Enterprise Portal</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
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
                    ? 'bg-blue-50 border border-blue-200 text-blue-800 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
                title={collapsed ? t.label : undefined}
              >
                <t.icon className={`w-5 h-5 shrink-0 ${active ? 'text-blue-700' : 'text-slate-400'}`} />
                {!collapsed && <span className="truncate">{t.label}</span>}
              </button>
            );
          })}
        </div>

        {/* User Card at bottom of sidebar */}
        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 text-blue-800 font-bold flex items-center justify-center text-xs shrink-0">
              {user?.full_name?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-slate-900 text-xs font-semibold truncate">{user?.full_name}</p>
                <p className="text-slate-500 text-[10px] capitalize truncate">{user?.role?.replace('_', ' ')}</p>
              </div>
            )}
            <button onClick={signOut} className="text-slate-400 hover:text-red-600 p-1" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-30 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <KiteTailLogo className="w-8 h-8 shrink-0" />
            </div>
            <div>
              <h1 className="text-slate-900 font-bold text-base md:text-lg tracking-tight">
                {tabs.find(t => t.id === tab)?.label || 'Portal'}
              </h1>
              <p className="text-slate-500 text-xs hidden sm:block">{mySegNames}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell onNavigate={(t) => { if (tabs.some(x => x.id === t)) setTab(t); }} />
            <button onClick={signOut} className="md:hidden text-slate-400 hover:text-red-600"><LogOut className="w-5 h-5" /></button>
          </div>
        </header>

        {/* Mobile Horizontal Tabs */}
        <div className="md:hidden px-4 py-2.5 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${tab === t.id ? 'border-blue-600 text-white bg-blue-700 shadow-sm' : 'border-slate-200 text-slate-700 bg-slate-50'}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <main className="p-4 md:p-6 max-w-6xl w-full mx-auto flex-1">
          {tab === 'attendance' && (
            <div className={cardCls + ' mb-5'}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-white font-semibold">Welcome back, {user?.full_name?.split(' ')[0]}</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {user?.designation || user?.role} • {mySegNames} {(user as any)?.staff_code && `• ${(user as any).staff_code}`}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {user?.joining_date && <p>Joined {new Date(user.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  {(user as any)?.reporting_time && <p className="mt-0.5">{(user as any).reporting_time}</p>}
                </div>
              </div>
            </div>
          )}
          {tab === 'attendance' && <AnnouncementsFeed />}
          {tab === 'attendance' && <MyAttendance />}
          {tab === 'documents' && <MyDocuments />}
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
