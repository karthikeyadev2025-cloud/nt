import { useEffect, useState } from 'react';
import { FileText, Plus, X, MapPin, Image as ImageIcon, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { inputCls, btnCls, cardCls } from './shared';
import { istDateStr } from '../../lib/dates';
import { ExportPayslipsButton } from './admin-extras';
import { cachedQuery } from '../../lib/cachedQuery';
import { cachedRpc } from '../../lib/cachedRpc';

const DAYS = [{ v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 7, l: 'Sun' }];

// ─────────────────────────── Super Admin: Shifts (grace period + late fine config)
export function ShiftsManager({ segments }: { segments: { slug: string; name: string }[] }) {
  const toast = useToast();
  const [shifts, setShifts] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [assigningFor, setAssigningFor] = useState<any | null>(null);
  const [assignStaffId, setAssignStaffId] = useState('');

  async function load() {
    try {
      const res = await cachedQuery('shifts_manager_data', async () => {
        const [{ data: s }, { data: st }, { data: a }] = await Promise.all([
          supabase.from('shifts').select('*').order('created_at'),
          supabase.from('app_users').select('id, full_name').eq('is_active', true).neq('role', 'super_admin').order('full_name'),
          supabase.from('staff_shifts').select('*').is('effective_to', null),
        ]);
        return { shifts: s || [], staff: st || [], assignments: a || [] };
      });
      if (res) { setShifts(res.shifts); setStaff(res.staff); setAssignments(res.assignments); }
    } catch {
      // ignore
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name || !editing?.start_time || !editing?.end_time) { toast.error('Name, start and end time are required'); return; }
    let error;
    if (editing.id) {
      const { id, ...patch } = editing;
      ({ error } = await supabase.from('shifts').update(patch).eq('id', id));
    } else {
      ({ error } = await supabase.from('shifts').insert(editing));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? 'Shift updated' : 'Shift created');
    setEditing(null); load();
  }

  async function assign() {
    if (!assigningFor || !assignStaffId) return;
    // If closing out the old assignment silently failed, inserting the new
    // one below would leave two rows with effective_to = null for the same
    // staff member — ambiguous "current shift," which breaks late-tracking
    // and payroll auto-fill (both rely on there being exactly one active row).
    const { error: closeErr } = await supabase.from('staff_shifts').update({ effective_to: istDateStr() })
      .eq('staff_user_id', assignStaffId).is('effective_to', null);
    if (closeErr) { toast.error(`Couldn't close previous shift assignment: ${closeErr.message}`); return; }
    const { error } = await supabase.from('staff_shifts').insert({ staff_user_id: assignStaffId, shift_id: assigningFor.id });
    if (error) { toast.error(error.message); return; }
    toast.success('Shift assigned');
    setAssigningFor(null); setAssignStaffId(''); load();
  }

  const assignedCount = (shiftId: string) => assignments.filter(a => a.shift_id === shiftId).length;
  const toggleDay = (d: number) => {
    const cur: number[] = editing.working_days || [];
    setEditing({ ...editing, working_days: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort() });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <p className="text-stone-700 text-sm">Define shift timing, grace period and late-fine rules, then assign staff.</p>
        <button className={btnCls} onClick={() => setEditing({ segment_slug: '', name: '', start_time: '09:30', end_time: '18:30', break_minutes: 60, working_days: [1, 2, 3, 4, 5, 6], grace_minutes: 10, late_fine_type: 'none', late_fine_amount: 0, half_day_after_minutes: 120, is_active: true })}>+ New Shift</button>
      </div>
      <div className="space-y-2">
        {shifts.map(s => (
          <div key={s.id} className={cardCls}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-stone-900 font-medium">{s.name}</p>
                <p className="text-stone-700 text-xs mt-0.5">{s.start_time} – {s.end_time} • grace {s.grace_minutes}min • {assignedCount(s.id)} staff assigned</p>
              </div>
              <div className="flex gap-3">
                <button className="text-teal-700 text-xs" onClick={() => setAssigningFor(s)}>Assign Staff</button>
                <button className="text-teal-700 text-xs" onClick={() => setEditing(s)}>Edit</button>
              </div>
            </div>
          </div>
        ))}
        {shifts.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No shifts defined yet.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">{editing.id ? 'Edit' : 'New'} Shift</h3>
            <input className={inputCls} placeholder="Shift Name *" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <select className={inputCls} value={editing.segment_slug || ''} onChange={e => setEditing({ ...editing, segment_slug: e.target.value || null })}>
              <option value="">Company-wide</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-stone-700 text-xs">Start Time</label><input type="time" className={inputCls} value={editing.start_time} onChange={e => setEditing({ ...editing, start_time: e.target.value })} /></div>
              <div><label className="text-stone-700 text-xs">End Time</label><input type="time" className={inputCls} value={editing.end_time} onChange={e => setEditing({ ...editing, end_time: e.target.value })} /></div>
            </div>
            <div>
              <label className="text-stone-700 text-xs mb-1 block">Working Days</label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(d => (
                  <button key={d.v} onClick={() => toggleDay(d.v)}
                    className={`px-2.5 py-1 rounded-lg text-xs border ${(editing.working_days || []).includes(d.v) ? 'bg-teal-500 text-stone-950 border-teal-500' : 'border-stone-200 text-stone-700'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-stone-700 text-xs">Grace Period (min)</label><input type="number" className={inputCls} value={editing.grace_minutes} onChange={e => setEditing({ ...editing, grace_minutes: Number(e.target.value) })} /></div>
              <div><label className="text-stone-700 text-xs">Break (min)</label><input type="number" className={inputCls} value={editing.break_minutes} onChange={e => setEditing({ ...editing, break_minutes: Number(e.target.value) })} /></div>
            </div>
            <div>
              <label className="text-stone-700 text-xs">Late Fine Policy</label>
              <select className={inputCls} value={editing.late_fine_type} onChange={e => setEditing({ ...editing, late_fine_type: e.target.value })}>
                <option value="none">No fine — just flag as late</option>
                <option value="fixed_per_occurrence">Fixed amount per late day</option>
                <option value="per_minute">Amount per minute late</option>
                <option value="half_day_after_minutes">Count as half-day after N minutes</option>
              </select>
            </div>
            {editing.late_fine_type !== 'none' && editing.late_fine_type !== 'half_day_after_minutes' && (
              <div><label className="text-stone-700 text-xs">Fine Amount (₹)</label><input type="number" className={inputCls} value={editing.late_fine_amount} onChange={e => setEditing({ ...editing, late_fine_amount: Number(e.target.value) })} /></div>
            )}
            {editing.late_fine_type === 'half_day_after_minutes' && (
              <div><label className="text-stone-700 text-xs">Minutes late = half day</label><input type="number" className={inputCls} value={editing.half_day_after_minutes} onChange={e => setEditing({ ...editing, half_day_after_minutes: Number(e.target.value) })} /></div>
            )}
            <button className={btnCls + ' w-full'} onClick={save}>Save Shift</button>
          </div>
        </div>
      )}

      {assigningFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAssigningFor(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">Assign to "{assigningFor.name}"</h3>
            <select className={inputCls} value={assignStaffId} onChange={e => setAssignStaffId(e.target.value)}>
              <option value="">Select staff member</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <button className={btnCls + ' w-full'} onClick={assign}>Assign Shift</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Super Admin/HR: Payslips + payments
export function PayslipManager() {
  const { user } = useAuth();
  const toast = useToast();
  const [staff, setStaff] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [showGen, setShowGen] = useState(false);
  const [genForm, setGenForm] = useState({ staff_user_id: '', period_year: new Date().getFullYear(), period_month: new Date().getMonth() + 1, present_days: 26, absent_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, working_days: 26, late_days: 0, late_fine: 0, other_deductions: 0 });
  const [openSlip, setOpenSlip] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'bank_transfer', reference: '', note: '' });
  const [payments, setPayments] = useState<any[]>([]);

  async function load() {
    try {
      const res = await cachedQuery('payslip_manager_data', async () => {
        const [{ data: s }, { data: p }] = await Promise.all([
          supabase.from('app_users').select('id, full_name, salary_structure').eq('is_active', true).neq('role', 'super_admin').order('full_name'),
          supabase.from('payslips').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }).limit(200),
        ]);
        return { staff: s || [], payslips: p || [] };
      });
      if (res) { setStaff(res.staff); setPayslips(res.payslips); }
    } catch {
      // ignore
    }
  }
  useEffect(() => { load(); }, []);

  async function autoFillFromAttendance() {
    if (!genForm.staff_user_id) { toast.error('Select a staff member first'); return; }
    const y = genForm.period_year, m = genForm.period_month;
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    const periodStart = `${y}-${pad(m)}-01`;
    const periodEnd = `${y}-${pad(m)}-${pad(lastDay)}`;

    // Resolve the staff member's working days (1=Mon..7=Sun) from their current
    // shift. Falls back to Mon–Sat if no shift is assigned. Using this instead
    // of raw calendar days stops weekends from being counted as unpaid absences.
    // Working days come from the shared SQL function so payroll, leave and
    // reports all agree — and so paid holidays aren't counted as absences.
    const { data: wdData } = await supabase.rpc('staff_working_days_in_month', {
      _staff_user_id: genForm.staff_user_id, _year: y, _month: m,
    });
    const workingDaysInMonth = Number(wdData ?? 0);

    const [{ data: records }, { data: leaves }] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('staff_user_id', genForm.staff_user_id)
        .gte('attendance_date', periodStart).lte('attendance_date', periodEnd),
      supabase.from('leave_requests').select('*').eq('staff_user_id', genForm.staff_user_id).eq('status', 'approved')
        .lte('from_date', periodEnd).gte('to_date', periodStart),
    ]);

    const present = (records || []).filter(r => r.check_in_at).length;
    const lateDays = (records || []).filter(r => r.is_late).length;

    // Leave days also come from the shared function, clipped to this period.
    let paidLeave = 0, unpaidLeave = 0;
    for (const l of leaves || []) {
      const from = l.from_date < periodStart ? periodStart : l.from_date;
      const to = l.to_date > periodEnd ? periodEnd : l.to_date;
      const { data: lwd } = await supabase.rpc('leave_working_days', {
        _staff_user_id: genForm.staff_user_id, _from: from, _to: to,
      });
      const workingLeaveDays = Number(lwd ?? 0);
      if (l.leave_type === 'unpaid') unpaidLeave += workingLeaveDays; else paidLeave += workingLeaveDays;
    }
    const absent = Math.max(0, workingDaysInMonth - present - paidLeave - unpaidLeave);

    setGenForm({
      ...genForm, working_days: workingDaysInMonth, present_days: present,
      absent_days: absent, paid_leave_days: paidLeave, unpaid_leave_days: unpaidLeave, late_days: lateDays,
    });
    toast.success('Filled from real attendance records — review before generating');
  }

  async function generate() {
    const person = staff.find(s => s.id === genForm.staff_user_id);
    if (!person) { toast.error('Select a staff member'); return; }
    if (genForm.working_days <= 0) { toast.error('Working days must be greater than 0'); return; }
    const salary = person.salary_structure || {};
    const monthlyBase = (salary.basic || 0) + (salary.hra || 0) + (salary.allowances || 0);
    const dailyRate = genForm.working_days > 0 ? monthlyBase / genForm.working_days : 0;
    const netPay = Math.max(0,
      monthlyBase
      - (dailyRate * genForm.unpaid_leave_days)
      - (dailyRate * genForm.absent_days)
      - (salary.deductions || 0)
      - genForm.late_fine
      - genForm.other_deductions
      + (salary.performance_bonus || 0)
      + (salary.incentives || 0)
    );
    const { error } = await supabase.from('payslips').upsert({
      ...genForm,
      base_salary: monthlyBase,
      performance_bonus: salary.performance_bonus || 0,
      incentives: salary.incentives || 0,
      net_pay: Math.round(netPay),
      generated_by: user?.id,
    }, { onConflict: 'staff_user_id,period_year,period_month' });
    if (error) { toast.error(`Couldn't generate: ${error.message}`); return; }
    toast.success('Payslip generated');
    setShowGen(false);
    load();
  }

  async function openPayments(slip: any) {
    setOpenSlip(slip);
    const { data } = await supabase.from('salary_payments').select('*').eq('payslip_id', slip.id).order('paid_at', { ascending: false });
    if (data) setPayments(data);
    setPayForm({ amount: '', method: 'bank_transfer', reference: '', note: '' });
  }

  async function recordPayment() {
    if (!openSlip || !payForm.amount) { toast.error('Enter an amount'); return; }
    const { error } = await supabase.from('salary_payments').insert({
      payslip_id: openSlip.id, staff_user_id: openSlip.staff_user_id, amount: Number(payForm.amount),
      method: payForm.method, reference: payForm.reference, note: payForm.note, paid_by: user?.id,
    });
    if (error) { toast.error(`Couldn't record payment: ${error.message}`); return; }
    toast.success('Payment recorded');
    const { data } = await supabase.from('payslips').select('*').eq('id', openSlip.id).single();
    if (data) { setOpenSlip(data); openPayments(data); }
    load();
  }

  const staffName = (id: string) => staff.find(s => s.id === id)?.full_name || '—';
  const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <ExportPayslipsButton />
        <button className={btnCls} onClick={() => setShowGen(true)}><Plus className="w-4 h-4 inline mr-1" /> Generate Payslip</button>
      </div>
      <div className="space-y-2">
        {payslips.map(p => (
          <div key={p.id} className={cardCls + ' flex items-center justify-between cursor-pointer hover:border-stone-300'} onClick={() => openPayments(p)}>
            <div>
              <p className="text-stone-900 text-sm font-medium">{staffName(p.staff_user_id)} — {p.period_month}/{p.period_year}</p>
              <p className="text-stone-700 text-xs mt-0.5">Net Pay ₹{Number(p.net_pay).toLocaleString('en-IN')} • Paid ₹{Number(p.amount_paid).toLocaleString('en-IN')}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[p.payment_status]}`}>{p.payment_status}</span>
          </div>
        ))}
        {payslips.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No payslips generated yet.</p>}
      </div>

      {showGen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowGen(false)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">Generate Payslip</h3>
            <select className={inputCls} value={genForm.staff_user_id} onChange={e => setGenForm({ ...genForm, staff_user_id: e.target.value })}>
              <option value="">Select staff *</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-stone-700 text-xs">Month</label><input type="number" min={1} max={12} className={inputCls} value={genForm.period_month} onChange={e => setGenForm({ ...genForm, period_month: Number(e.target.value) })} /></div>
              <div><label className="text-stone-700 text-xs">Year</label><input type="number" className={inputCls} value={genForm.period_year} onChange={e => setGenForm({ ...genForm, period_year: Number(e.target.value) })} /></div>
            </div>
            <button className="w-full py-2 rounded-lg border border-teal-600 text-teal-700 text-sm font-medium" onClick={autoFillFromAttendance}>
              Auto-fill from Attendance & Leave Records
            </button>
            <div className="grid grid-cols-2 gap-3">
              {(['working_days', 'present_days', 'absent_days', 'paid_leave_days', 'unpaid_leave_days', 'late_days'] as const).map(k => (
                <div key={k}><label className="text-stone-700 text-xs capitalize">{k.replace(/_/g, ' ')}</label><input type="number" className={inputCls} value={(genForm as any)[k]} onChange={e => setGenForm({ ...genForm, [k]: Number(e.target.value) })} /></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-stone-700 text-xs">Late Fine (₹)</label><input type="number" className={inputCls} value={genForm.late_fine} onChange={e => setGenForm({ ...genForm, late_fine: Number(e.target.value) })} /></div>
              <div><label className="text-stone-700 text-xs">Other Deductions (₹)</label><input type="number" className={inputCls} value={genForm.other_deductions} onChange={e => setGenForm({ ...genForm, other_deductions: Number(e.target.value) })} /></div>
            </div>
            <p className="text-stone-700 text-xs">Auto-fill pulls real check-ins and approved leaves for the selected month — review before generating. Base pay, performance bonus and incentives come from the staff member's salary structure automatically.</p>
            <button className={btnCls + ' w-full'} onClick={generate}>Generate</button>
          </div>
        </div>
      )}

      {openSlip && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenSlip(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">{staffName(openSlip.staff_user_id)} — {openSlip.period_month}/{openSlip.period_year}</h3>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-stone-700">Net Pay</span><span className="text-stone-900 text-right">₹{Number(openSlip.net_pay).toLocaleString('en-IN')}</span>
              <span className="text-stone-700">Paid So Far</span><span className="text-emerald-700 text-right">₹{Number(openSlip.amount_paid).toLocaleString('en-IN')}</span>
              <span className="text-stone-700">Balance</span><span className="text-amber-700 text-right">₹{Math.max(0, Number(openSlip.net_pay) - Number(openSlip.amount_paid)).toLocaleString('en-IN')}</span>
            </div>
            <div className="border-t border-stone-800 pt-3 space-y-2">
              <p className="text-stone-700 text-sm font-medium">Record a Payment</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" className={inputCls} placeholder="Amount *" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                <select className={inputCls} value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })}>
                  {['cash', 'bank_transfer', 'upi', 'cheque', 'other'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="Reference (optional)" value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} />
              <button className={btnCls + ' w-full'} onClick={recordPayment}>Record Payment</button>
            </div>
            {payments.length > 0 && (
              <div className="border-t border-stone-800 pt-3 space-y-1.5">
                <p className="text-stone-700 text-xs font-medium">Payment History</p>
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className="text-stone-700">{new Date(p.paid_at).toLocaleDateString()} • {p.method.replace('_', ' ')}</span>
                    <span className="text-stone-900">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Employee: My Payslips
export function MyPayslips() {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from('payslips').select('*').eq('staff_user_id', user.id).order('period_year', { ascending: false }).order('period_month', { ascending: false })
      .then(({ data }) => { if (data) setPayslips(data); });
  }, [user]);

  const statusColor: Record<string, string> = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };
  if (payslips.length === 0) return null;

  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold text-sm mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-teal-700" /> My Payslips</h3>
      <div className="space-y-2">
        {payslips.map(p => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span className="text-stone-700">{p.period_month}/{p.period_year} — ₹{Number(p.net_pay).toLocaleString('en-IN')}</span>
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[p.payment_status]}`}>{p.payment_status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Super Admin/HR: Attendance Details Modal
export function AttendanceDetailsModal({ staffUserId, staffName, onClose }: { staffUserId: string; staffName: string; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // selfies is a private bucket (public: false) — getPublicUrl() produces a URL
  // that 403s. Every photo here needs a real signed URL, resolved in bulk once
  // the records load.
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from('attendance_records')
      .select('*')
      .eq('staff_user_id', staffUserId)
      .order('attendance_date', { ascending: false })
      .limit(30)
      .then(async ({ data }) => {
        if (data) {
          setLogs(data);
          const paths = Array.from(new Set(
            data.flatMap(r => [r.check_in_selfie_url, r.check_out_selfie_url]).filter(Boolean)
          )) as string[];
          if (paths.length > 0) {
            const { data: signed } = await supabase.storage.from('selfies').createSignedUrls(paths, 3600);
            if (signed) {
              const map: Record<string, string> = {};
              signed.forEach(s => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
              setPhotoUrls(map);
            }
          }
        }
        setLoading(false);
      });
  }, [staffUserId]);

  const mapLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-stone-900 font-bold text-lg">{staffName}</h2>
            <p className="text-stone-700 text-sm">Detailed Attendance Logs & Photos (Last 30 Days)</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full text-stone-700"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-stone-700 py-10">Loading records...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-stone-700 py-10">No attendance records found for this staff member.</p>
          ) : (
            <div className="space-y-4">
              {logs.map(log => (
                <div key={log.id} className="border border-stone-200 rounded-xl p-4 bg-white shadow-sm flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-stone-900 font-bold">{new Date(log.attendance_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${log.status === 'present' ? 'bg-emerald-100 text-emerald-700' : log.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {log.status.toUpperCase()}
                      </span>
                      {log.is_late && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{log.minutes_late}m late</span>}
                      {log.work_mode && <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full capitalize font-medium">{log.work_mode.replace('_', ' ')}</span>}
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      {/* Check In Info */}
                      <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
                        <p className="text-stone-700 text-xs font-semibold uppercase tracking-wider mb-2">Check In Details</p>
                        {log.check_in_at ? (
                          <div className="space-y-2">
                            <p className="text-stone-900 text-sm font-semibold">{new Date(log.check_in_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                            {log.check_in_lat && log.check_in_lng ? (
                              <a href={mapLink(log.check_in_lat, log.check_in_lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-1 rounded text-xs font-medium border border-teal-100">
                                <MapPin className="w-3.5 h-3.5 text-teal-600" /> View Check-In Location Map
                              </a>
                            ) : (
                              <p className="text-stone-500 text-xs">No location data captured</p>
                            )}
                            {log.check_in_selfie_url ? (
                              photoUrls[log.check_in_selfie_url] ? (
                                <div className="mt-2">
                                  <p className="text-[11px] text-stone-500 mb-1">Check-in Photo:</p>
                                  <button onClick={() => setPreviewImage(photoUrls[log.check_in_selfie_url])} className="block relative group overflow-hidden rounded-lg w-28 h-28 border border-stone-200 shadow-sm">
                                    <img src={photoUrls[log.check_in_selfie_url]} alt="Check in selfie" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <ImageIcon className="w-6 h-6 text-white" />
                                    </div>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-stone-500 text-xs block mt-2">Loading photo…</span>
                              )
                            ) : (
                              <span className="text-stone-500 text-xs block mt-2">No photo uploaded</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-stone-500 text-sm">--</p>
                        )}
                      </div>

                      {/* Check Out Info */}
                      <div className="bg-stone-50 p-3 rounded-lg border border-stone-100">
                        <p className="text-stone-700 text-xs font-semibold uppercase tracking-wider mb-2">Check Out Details</p>
                        {log.check_out_at ? (
                          <div className="space-y-2">
                            <p className="text-stone-900 text-sm font-semibold">{new Date(log.check_out_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                            {log.check_out_lat && log.check_out_lng ? (
                              <a href={mapLink(log.check_out_lat, log.check_out_lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-1 rounded text-xs font-medium border border-teal-100">
                                <MapPin className="w-3.5 h-3.5 text-teal-600" /> View Check-Out Location Map
                              </a>
                            ) : (
                              <p className="text-stone-500 text-xs">No location data captured</p>
                            )}
                            {log.check_out_selfie_url ? (
                              photoUrls[log.check_out_selfie_url] ? (
                                <div className="mt-2">
                                  <p className="text-[11px] text-stone-500 mb-1">Check-out Photo:</p>
                                  <button onClick={() => setPreviewImage(photoUrls[log.check_out_selfie_url])} className="block relative group overflow-hidden rounded-lg w-28 h-28 border border-stone-200 shadow-sm">
                                    <img src={photoUrls[log.check_out_selfie_url]} alt="Check out selfie" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <ImageIcon className="w-6 h-6 text-white" />
                                    </div>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-stone-500 text-xs block mt-2">Loading photo…</span>
                              )
                            ) : (
                              <span className="text-stone-500 text-xs block mt-2">No photo uploaded</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-stone-500 text-sm block mt-2">--</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Full Screen Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
            <X className="w-6 h-6" />
          </button>
          <img src={previewImage} alt="Selfie Preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Super Admin/HR: Attendance summary (RPC-powered, ported from Punchly)
export function AttendanceSummaryTable({ segments }: { segments: { slug: string; name: string }[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [segment, setSegment] = useState('');
  const [days, setDays] = useState(7);
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    cachedRpc(`staff_attendance_summary:${segment}:${days}`, () =>
      supabase.rpc('staff_attendance_summary', { _segment_slug: segment || null, _days: days })
    ).then(res => {
      const data = (res as any)?.data || res;
      if (Array.isArray(data)) setRows(data);
    }).catch(() => {});
  }, [segment, days]);

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-stone-900 font-semibold text-sm">Attendance Summary</h3>
        <div className="flex gap-2">
          <select className={inputCls + ' w-auto'} value={segment} onChange={e => setSegment(e.target.value)}>
            <option value="">All Segments</option>
            {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
          <select className={inputCls + ' w-auto'} value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-stone-700 text-xs text-left border-b border-stone-200 pb-2">
              <th className="pb-2 font-semibold text-stone-700">Staff Member</th>
              <th className="pb-2 font-semibold text-stone-700">Present</th>
              <th className="pb-2 font-semibold text-stone-700">Absent</th>
              <th className="pb-2 font-semibold text-stone-700">On Leave</th>
              <th className="pb-2 font-semibold text-stone-700">Attendance %</th>
              <th className="pb-2 font-semibold text-stone-700 text-right">Detailed Logs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staff_user_id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                <td className="py-3 text-stone-900 font-medium">{r.full_name}</td>
                <td className="py-3 text-emerald-700 font-semibold">{r.days_present}</td>
                <td className="py-3 text-red-700 font-semibold">{r.days_absent}</td>
                <td className="py-3 text-amber-700 font-semibold">{r.days_on_leave}</td>
                <td className="py-3 text-stone-700 font-medium">{r.attendance_pct}%</td>
                <td className="py-3 text-right">
                  <button 
                    onClick={() => setSelectedStaff({ id: r.staff_user_id, name: r.full_name })}
                    className="px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors shadow-sm inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-teal-600" /> View Logs & Photos
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-stone-700 text-sm text-center py-6">No data.</p>}
      </div>
      
      {selectedStaff && (
        <AttendanceDetailsModal 
          staffUserId={selectedStaff.id} 
          staffName={selectedStaff.name} 
          onClose={() => setSelectedStaff(null)} 
        />
      )}
    </div>
  );
}
