import { useEffect, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { inputCls, btnCls, cardCls } from './shared';

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
    const [{ data: s }, { data: st }, { data: a }] = await Promise.all([
      supabase.from('shifts').select('*').order('created_at'),
      supabase.from('app_users').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('staff_shifts').select('*').is('effective_to', null),
    ]);
    if (s) setShifts(s);
    if (st) setStaff(st);
    if (a) setAssignments(a);
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
    await supabase.from('staff_shifts').update({ effective_to: new Date().toISOString().slice(0, 10) })
      .eq('staff_user_id', assignStaffId).is('effective_to', null);
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
        <p className="text-slate-400 text-sm">Define shift timing, grace period and late-fine rules, then assign staff.</p>
        <button className={btnCls} onClick={() => setEditing({ segment_slug: '', name: '', start_time: '09:30', end_time: '18:30', break_minutes: 60, working_days: [1, 2, 3, 4, 5, 6], grace_minutes: 10, late_fine_type: 'none', late_fine_amount: 0, half_day_after_minutes: 120, is_active: true })}>+ New Shift</button>
      </div>
      <div className="space-y-2">
        {shifts.map(s => (
          <div key={s.id} className={cardCls}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{s.name}</p>
                <p className="text-slate-500 text-xs mt-0.5">{s.start_time} – {s.end_time} • grace {s.grace_minutes}min • {assignedCount(s.id)} staff assigned</p>
              </div>
              <div className="flex gap-3">
                <button className="text-sky-400 text-xs" onClick={() => setAssigningFor(s)}>Assign Staff</button>
                <button className="text-sky-400 text-xs" onClick={() => setEditing(s)}>Edit</button>
              </div>
            </div>
          </div>
        ))}
        {shifts.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No shifts defined yet.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{editing.id ? 'Edit' : 'New'} Shift</h3>
            <input className={inputCls} placeholder="Shift Name *" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <select className={inputCls} value={editing.segment_slug || ''} onChange={e => setEditing({ ...editing, segment_slug: e.target.value || null })}>
              <option value="">Company-wide</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-slate-500 text-xs">Start Time</label><input type="time" className={inputCls} value={editing.start_time} onChange={e => setEditing({ ...editing, start_time: e.target.value })} /></div>
              <div><label className="text-slate-500 text-xs">End Time</label><input type="time" className={inputCls} value={editing.end_time} onChange={e => setEditing({ ...editing, end_time: e.target.value })} /></div>
            </div>
            <div>
              <label className="text-slate-500 text-xs mb-1 block">Working Days</label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(d => (
                  <button key={d.v} onClick={() => toggleDay(d.v)}
                    className={`px-2.5 py-1 rounded-lg text-xs border ${(editing.working_days || []).includes(d.v) ? 'bg-sky-500 text-slate-950 border-sky-500' : 'border-slate-700 text-slate-400'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-slate-500 text-xs">Grace Period (min)</label><input type="number" className={inputCls} value={editing.grace_minutes} onChange={e => setEditing({ ...editing, grace_minutes: Number(e.target.value) })} /></div>
              <div><label className="text-slate-500 text-xs">Break (min)</label><input type="number" className={inputCls} value={editing.break_minutes} onChange={e => setEditing({ ...editing, break_minutes: Number(e.target.value) })} /></div>
            </div>
            <div>
              <label className="text-slate-500 text-xs">Late Fine Policy</label>
              <select className={inputCls} value={editing.late_fine_type} onChange={e => setEditing({ ...editing, late_fine_type: e.target.value })}>
                <option value="none">No fine — just flag as late</option>
                <option value="fixed_per_occurrence">Fixed amount per late day</option>
                <option value="per_minute">Amount per minute late</option>
                <option value="half_day_after_minutes">Count as half-day after N minutes</option>
              </select>
            </div>
            {editing.late_fine_type !== 'none' && editing.late_fine_type !== 'half_day_after_minutes' && (
              <div><label className="text-slate-500 text-xs">Fine Amount (₹)</label><input type="number" className={inputCls} value={editing.late_fine_amount} onChange={e => setEditing({ ...editing, late_fine_amount: Number(e.target.value) })} /></div>
            )}
            {editing.late_fine_type === 'half_day_after_minutes' && (
              <div><label className="text-slate-500 text-xs">Minutes late = half day</label><input type="number" className={inputCls} value={editing.half_day_after_minutes} onChange={e => setEditing({ ...editing, half_day_after_minutes: Number(e.target.value) })} /></div>
            )}
            <button className={btnCls + ' w-full'} onClick={save}>Save Shift</button>
          </div>
        </div>
      )}

      {assigningFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAssigningFor(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">Assign to "{assigningFor.name}"</h3>
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
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('app_users').select('id, full_name, salary_structure').eq('is_active', true).order('full_name'),
      supabase.from('payslips').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }).limit(200),
    ]);
    if (s) setStaff(s);
    if (p) setPayslips(p);
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    const person = staff.find(s => s.id === genForm.staff_user_id);
    if (!person) { toast.error('Select a staff member'); return; }
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
  const statusColor: Record<string, string> = { unpaid: 'bg-red-500/20 text-red-300', partial: 'bg-amber-500/20 text-amber-300', paid: 'bg-emerald-500/20 text-emerald-300' };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button className={btnCls} onClick={() => setShowGen(true)}><Plus className="w-4 h-4 inline mr-1" /> Generate Payslip</button>
      </div>
      <div className="space-y-2">
        {payslips.map(p => (
          <div key={p.id} className={cardCls + ' flex items-center justify-between cursor-pointer hover:border-slate-600'} onClick={() => openPayments(p)}>
            <div>
              <p className="text-white text-sm font-medium">{staffName(p.staff_user_id)} — {p.period_month}/{p.period_year}</p>
              <p className="text-slate-500 text-xs mt-0.5">Net Pay ₹{Number(p.net_pay).toLocaleString('en-IN')} • Paid ₹{Number(p.amount_paid).toLocaleString('en-IN')}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[p.payment_status]}`}>{p.payment_status}</span>
          </div>
        ))}
        {payslips.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No payslips generated yet.</p>}
      </div>

      {showGen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowGen(false)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">Generate Payslip</h3>
            <select className={inputCls} value={genForm.staff_user_id} onChange={e => setGenForm({ ...genForm, staff_user_id: e.target.value })}>
              <option value="">Select staff *</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-slate-500 text-xs">Month</label><input type="number" min={1} max={12} className={inputCls} value={genForm.period_month} onChange={e => setGenForm({ ...genForm, period_month: Number(e.target.value) })} /></div>
              <div><label className="text-slate-500 text-xs">Year</label><input type="number" className={inputCls} value={genForm.period_year} onChange={e => setGenForm({ ...genForm, period_year: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['working_days', 'present_days', 'absent_days', 'paid_leave_days', 'unpaid_leave_days', 'late_days'] as const).map(k => (
                <div key={k}><label className="text-slate-500 text-xs capitalize">{k.replace(/_/g, ' ')}</label><input type="number" className={inputCls} value={(genForm as any)[k]} onChange={e => setGenForm({ ...genForm, [k]: Number(e.target.value) })} /></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-slate-500 text-xs">Late Fine (₹)</label><input type="number" className={inputCls} value={genForm.late_fine} onChange={e => setGenForm({ ...genForm, late_fine: Number(e.target.value) })} /></div>
              <div><label className="text-slate-500 text-xs">Other Deductions (₹)</label><input type="number" className={inputCls} value={genForm.other_deductions} onChange={e => setGenForm({ ...genForm, other_deductions: Number(e.target.value) })} /></div>
            </div>
            <p className="text-slate-500 text-xs">Base pay, performance bonus and incentives are pulled automatically from the staff member's salary structure.</p>
            <button className={btnCls + ' w-full'} onClick={generate}>Generate</button>
          </div>
        </div>
      )}

      {openSlip && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenSlip(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{staffName(openSlip.staff_user_id)} — {openSlip.period_month}/{openSlip.period_year}</h3>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-slate-400">Net Pay</span><span className="text-white text-right">₹{Number(openSlip.net_pay).toLocaleString('en-IN')}</span>
              <span className="text-slate-400">Paid So Far</span><span className="text-emerald-400 text-right">₹{Number(openSlip.amount_paid).toLocaleString('en-IN')}</span>
              <span className="text-slate-400">Balance</span><span className="text-amber-400 text-right">₹{Math.max(0, Number(openSlip.net_pay) - Number(openSlip.amount_paid)).toLocaleString('en-IN')}</span>
            </div>
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <p className="text-slate-300 text-sm font-medium">Record a Payment</p>
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
              <div className="border-t border-slate-800 pt-3 space-y-1.5">
                <p className="text-slate-400 text-xs font-medium">Payment History</p>
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className="text-slate-400">{new Date(p.paid_at).toLocaleDateString()} • {p.method.replace('_', ' ')}</span>
                    <span className="text-white">₹{Number(p.amount).toLocaleString('en-IN')}</span>
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

  const statusColor: Record<string, string> = { unpaid: 'bg-red-500/20 text-red-300', partial: 'bg-amber-500/20 text-amber-300', paid: 'bg-emerald-500/20 text-emerald-300' };
  if (payslips.length === 0) return null;

  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-sky-400" /> My Payslips</h3>
      <div className="space-y-2">
        {payslips.map(p => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{p.period_month}/{p.period_year} — ₹{Number(p.net_pay).toLocaleString('en-IN')}</span>
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor[p.payment_status]}`}>{p.payment_status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Super Admin/HR: Attendance summary (RPC-powered, ported from Punchly)
export function AttendanceSummaryTable({ segments }: { segments: { slug: string; name: string }[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [segment, setSegment] = useState('');
  const [days, setDays] = useState(7);

  useEffect(() => {
    supabase.rpc('staff_attendance_summary', { _segment_slug: segment || null, _days: days })
      .then(({ data, error }) => { if (!error && data) setRows(data); });
  }, [segment, days]);

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-white font-semibold text-sm">Attendance Summary</h3>
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
            <tr className="text-slate-500 text-xs text-left border-b border-slate-800">
              <th className="pb-2 font-normal">Staff</th>
              <th className="pb-2 font-normal">Present</th>
              <th className="pb-2 font-normal">Absent</th>
              <th className="pb-2 font-normal">On Leave</th>
              <th className="pb-2 font-normal">Attendance %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staff_user_id} className="border-b border-slate-900">
                <td className="py-2 text-white">{r.full_name}</td>
                <td className="py-2 text-emerald-400">{r.days_present}</td>
                <td className="py-2 text-red-400">{r.days_absent}</td>
                <td className="py-2 text-amber-400">{r.days_on_leave}</td>
                <td className="py-2 text-slate-300">{r.attendance_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-slate-500 text-sm text-center py-6">No data.</p>}
      </div>
    </div>
  );
}
