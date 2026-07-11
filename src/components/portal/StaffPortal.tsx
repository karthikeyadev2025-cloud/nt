import { useEffect, useState } from 'react';
import { LogOut, Clock, CalendarDays, IndianRupee, Ticket, ClipboardList, Users2, MapPin, FileText, Repeat, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { useSegments } from '../../lib/useSegments';
import { TicketsBoard, HRBoard, inputCls, btnCls, cardCls } from './shared';
import { MyDocumentsList, MySalaryCard } from './documents';
import { NotificationBell, AnnouncementsFeed, ShiftSwapBoard, MyBankDetails, IDCard, MyStatsCard, MyPhotoRequest, MyPromotionHistory } from './features';
import { TelecallerQueue, LeadsWorkspace, ExecutiveFieldVisits } from './leads-workflow';
import { MyPerformanceChart } from './performance';
import { MyPayslips } from './payroll';
import CameraCapture from '../CameraCapture';

// ─────────────────────────── Self-service: attendance
export function MyAttendance() {
  const { user } = useAuth();
  const toast = useToast();
  const [today, setToday] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState<'in' | 'out' | null>(null);
  const [workMode, setWorkMode] = useState<'office' | 'wfh' | 'field_visit'>('office');
  const [pickingMode, setPickingMode] = useState(false);
  const dateStr = new Date().toISOString().slice(0, 10);

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

    // Late detection against the staff's currently assigned shift (if any)
    let is_late = false, minutes_late = 0, shift_id: string | null = null;
    const { data: assignment } = await supabase.from('staff_shifts').select('shift_id, shifts(start_time, grace_minutes)')
      .eq('staff_user_id', user.id).is('effective_to', null).maybeSingle();
    if (assignment?.shifts) {
      shift_id = assignment.shift_id;
      const shift = assignment.shifts as any;
      const [h, m] = shift.start_time.split(':').map(Number);
      const shiftStart = new Date(); shiftStart.setHours(h, m, 0, 0);
      const graceMs = (shift.grace_minutes || 0) * 60000;
      const now = new Date();
      if (now.getTime() > shiftStart.getTime() + graceMs) {
        is_late = true;
        minutes_late = Math.round((now.getTime() - shiftStart.getTime()) / 60000);
      }
    }

    const { error } = await supabase.from('attendance_records').insert({
      staff_user_id: user.id, attendance_date: dateStr,
      check_in_at: new Date().toISOString(), check_in_lat: lat, check_in_lng: lng,
      check_in_selfie_url: selfiePath, status: 'present', work_mode: workMode,
      is_late, minutes_late, shift_id,
    });
    setBusy(false);
    if (error) { toast.error(`Check-in failed: ${error.message}`); return; }
    toast.success(is_late ? `Checked in — ${minutes_late} min late` : 'Checked in');
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
          onCancel={() => showCamera === 'in' ? finishCheckIn(null) : finishCheckOut(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Self-service: leaves + advances
export function MyRequests() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [leaveForm, setLeaveForm] = useState({ from_date: '', to_date: '', leave_type: 'casual', reason: '' });
  const [advForm, setAdvForm] = useState({ amount: '', reason: '' });

  async function load() {
    if (!user) return;
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.from('leave_requests').select('*').eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('salary_advance_requests').select('*').eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (l) setLeaves(l);
    if (a) setAdvances(a);
  }
  useEffect(() => { load(); }, [user]);

  async function requestLeave() {
    if (!user || !leaveForm.from_date || !leaveForm.to_date) return;
    await supabase.from('leave_requests').insert({ ...leaveForm, staff_user_id: user.id });
    setLeaveForm({ from_date: '', to_date: '', leave_type: 'casual', reason: '' });
    load();
  }

  async function requestAdvance() {
    if (!user || !advForm.amount) return;
    await supabase.from('salary_advance_requests').insert({ staff_user_id: user.id, amount: Number(advForm.amount), reason: advForm.reason });
    setAdvForm({ amount: '', reason: '' });
    load();
  }

  const statusColor = (s: string) =>
    s === 'approved' || s === 'paid' ? 'text-emerald-300' : s === 'rejected' ? 'text-red-300' : 'text-amber-300';

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className={cardCls}>
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-sky-400" /> Leave Request</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input type="date" className={inputCls} value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
          <input type="date" className={inputCls} value={leaveForm.to_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
        </div>
        <select className={inputCls + ' mb-2'} value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
          {['casual', 'sick', 'earned', 'unpaid', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={inputCls + ' mb-3'} placeholder="Reason" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
        <button className={btnCls + ' w-full'} onClick={requestLeave}>Submit Leave Request</button>
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
        <button className={btnCls + ' w-full'} onClick={requestAdvance}>Request Advance</button>
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
  );
}

// ─────────────────────────── Portal shell
export default function StaffPortal() {
  const { user, signOut, hasPermission } = useAuth();
  const { segments } = useSegments();

  const tabs = [
    { id: 'attendance', label: 'My Attendance', icon: Clock, show: true },
    { id: 'documents', label: 'My Documents', icon: FileText, show: true },
    { id: 'requests', label: 'Leaves & Advances', icon: CalendarDays, show: true },
    { id: 'profile', label: 'My Profile', icon: CreditCard, show: true },
    { id: 'swap', label: 'Shift Swap', icon: Repeat, show: true },
    { id: 'tickets', label: 'Tickets', icon: Ticket, show: hasPermission('view_tickets') },
    { id: 'leads', label: hasPermission('full_leads_view') ? 'Leads / CRM' : (user?.role === 'marketing_executive' ? 'Field Visits' : 'My Call Queue'), icon: ClipboardList, show: hasPermission('view_leads') },
    { id: 'team', label: 'Team / HR', icon: Users2, show: hasPermission('view_staff') || hasPermission('view_attendance') },
  ].filter(t => t.show);

  const [tab, setTab] = useState(tabs[0]?.id || 'attendance');

  const mySegNames = user?.segments.includes('all')
    ? 'All Segments'
    : segments.filter(s => user?.segments.includes(s.slug)).map(s => s.name).join(', ') || '—';

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-slate-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950 text-sm">N</div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{user?.full_name}</p>
            <p className="text-slate-500 text-[11px]">{user?.role.replace('_', ' ')} • {mySegNames}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={signOut} className="text-slate-500 hover:text-red-400"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto border-b border-slate-900">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${tab === t.id ? 'border-sky-500 text-sky-300 bg-sky-500/10' : 'border-slate-800 text-slate-400'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <main className="p-4 md:p-6 max-w-5xl mx-auto">
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
        {tab === 'profile' && <MyProfile />}
        {tab === 'swap' && <ShiftSwapBoard />}
        {tab === 'tickets' && <TicketsBoard segments={segments} />}
        {tab === 'leads' && (
          hasPermission('full_leads_view')
            ? <LeadsWorkspace segments={segments} />
            : user?.role === 'marketing_executive'
              ? <ExecutiveFieldVisits segments={segments} />
              : <TelecallerQueue />
        )}
        {tab === 'team' && <HRBoard segments={segments} />}
      </main>
    </div>
  );
}
