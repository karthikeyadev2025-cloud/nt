import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, UserMinus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { cachedQuery } from '../../lib/cachedQuery';
import { cachedRpc } from '../../lib/cachedRpc';
import { inputCls, btnCls, cardCls } from './shared';
import type { Segment } from '../../lib/database.types';

// ─────────────────────────── Staff: request an attendance correction (missed punch)
export function MyRegularizations() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ attendance_date: '', requested_check_in: '', requested_check_out: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await cachedQuery(`regularizations:${user.id}`, async () => {
        const { data, error } = await supabase.from('attendance_regularizations').select('*')
          .eq('staff_user_id', user.id).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        return data || [];
      });
      setItems(data);
    } catch {
      // ignore
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!user) return;
    if (!form.attendance_date || !form.reason.trim()) { toast.error('Date and reason are required'); return; }
    if (!form.requested_check_in && !form.requested_check_out) { toast.error('Enter at least a check-in or check-out time'); return; }
    if (form.attendance_date > new Date().toISOString().slice(0, 10)) { toast.error("Can't correct a future date"); return; }
    setBusy(true);
    const { error } = await supabase.from('attendance_regularizations').insert({
      staff_user_id: user.id,
      attendance_date: form.attendance_date,
      requested_check_in: form.requested_check_in ? new Date(`${form.attendance_date}T${form.requested_check_in}`).toISOString() : null,
      requested_check_out: form.requested_check_out ? new Date(`${form.attendance_date}T${form.requested_check_out}`).toISOString() : null,
      reason: form.reason,
    });
    setBusy(false);
    if (error) { toast.error(`Couldn't submit: ${error.message}`); return; }
    toast.success('Correction request submitted for approval');
    setForm({ attendance_date: '', requested_check_in: '', requested_check_out: '', reason: '' });
    load();
  }

  const statusColor = (s: string) => s === 'approved' ? 'text-emerald-700' : s === 'rejected' ? 'text-red-700' : 'text-amber-700';

  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold mb-1 text-sm flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-teal-700" /> Attendance Correction
      </h3>
      <p className="text-stone-700 text-xs mb-3">Forgot to check in or out? Request a correction — it needs manager/HR approval.</p>
      <input type="date" className={inputCls + ' mb-2'} max={new Date().toISOString().slice(0, 10)}
        value={form.attendance_date} onChange={e => setForm({ ...form, attendance_date: e.target.value })} />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-stone-700 text-xs">Check-in time</label>
          <input type="time" className={inputCls} value={form.requested_check_in} onChange={e => setForm({ ...form, requested_check_in: e.target.value })} />
        </div>
        <div>
          <label className="text-stone-700 text-xs">Check-out time</label>
          <input type="time" className={inputCls} value={form.requested_check_out} onChange={e => setForm({ ...form, requested_check_out: e.target.value })} />
        </div>
      </div>
      <input className={inputCls + ' mb-3'} placeholder="Reason (e.g. phone battery died on site)" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
      <button className={btnCls + ' w-full'} disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Request Correction'}</button>

      {items.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {items.map(r => (
            <div key={r.id} className="flex justify-between text-xs">
              <span className="text-stone-700">{r.attendance_date} — {r.reason.slice(0, 30)}{r.reason.length > 30 ? '…' : ''}</span>
              <span className={statusColor(r.status)}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Manager/HR: review attendance corrections
export function RegularizationApprovals() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await cachedQuery('regularization_approvals_data', async () => {
        const [{ data: reg }, { data: users }] = await Promise.all([
          supabase.from('attendance_regularizations').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('app_users').select('id, full_name'),
        ]);
        return { items: reg || [], names: Object.fromEntries((users || []).map((u: any) => [u.id, u.full_name])) };
      });
      if (res) { setItems(res.items); setNames(res.names); }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, status: string) {
    const { error } = await supabase.from('attendance_regularizations')
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(`Correction ${status}`);
    load();
  }

  const pending = items.filter(i => i.status === 'pending');
  const fmtTime = (t: string | null) => t ? new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  if (pending.length === 0) return <p className="text-stone-700 text-sm text-center py-10">No pending attendance corrections.</p>;

  return (
    <div className="space-y-2">
      {pending.map(r => (
        <div key={r.id} className={cardCls}>
          <p className="text-stone-900 text-sm font-medium">{names[r.staff_user_id] || '—'} • {r.attendance_date}</p>
          <p className="text-stone-700 text-xs mt-1">In: {fmtTime(r.requested_check_in)} • Out: {fmtTime(r.requested_check_out)}</p>
          <p className="text-stone-700 text-xs mt-0.5">"{r.reason}"</p>
          {hasPermission('approve_leaves') && (
            <div className="flex gap-2 mt-3">
              <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review(r.id, 'approved')}>Approve</button>
              <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review(r.id, 'rejected')}>Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── HR: holiday calendar
export function HolidayManager({ segments }: { segments: Segment[] }) {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ holiday_date: '', name: '', segment_slug: '', is_optional: false });

  const load = useCallback(async () => {
    try {
      const data = await cachedQuery('holidays_list', async () => {
        const { data, error } = await supabase.from('holidays').select('*').order('holiday_date');
        if (error) throw error;
        return data || [];
      });
      setItems(data);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.holiday_date || !form.name) { toast.error('Date and name are required'); return; }
    const { error } = await supabase.from('holidays').insert({ ...form, segment_slug: form.segment_slug || null });
    if (error) { toast.error(error.message); return; }
    toast.success('Holiday added');
    setForm({ holiday_date: '', name: '', segment_slug: '', is_optional: false });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remove this holiday?')) return;
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  const upcoming = items.filter(h => h.holiday_date >= new Date().toISOString().slice(0, 10));
  const past = items.filter(h => h.holiday_date < new Date().toISOString().slice(0, 10));

  return (
    <div>
      <div className={cardCls + ' mb-5 space-y-2'}>
        <h3 className="text-stone-900 font-semibold text-sm flex items-center gap-2"><CalendarX className="w-4 h-4 text-teal-700" /> Add Holiday</h3>
        <p className="text-stone-700 text-xs">Holidays are excluded from working-day counts, so payroll doesn't treat them as absences.</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className={inputCls} value={form.holiday_date} onChange={e => setForm({ ...form, holiday_date: e.target.value })} />
          <input className={inputCls} placeholder="Holiday name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <select className={inputCls} value={form.segment_slug} onChange={e => setForm({ ...form, segment_slug: e.target.value })}>
          <option value="">Company-wide</option>
          {segments.map(s => <option key={s.slug} value={s.slug}>{s.name} only</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-stone-900 cursor-pointer">
          <input type="checkbox" checked={form.is_optional} onChange={e => setForm({ ...form, is_optional: e.target.checked })} />
          Optional holiday <span className="text-stone-700 text-xs">(still counts as a working day)</span>
        </label>
        <button className={btnCls} onClick={add}>Add Holiday</button>
      </div>

      <p className="text-stone-700 text-xs font-medium mb-2">Upcoming ({upcoming.length})</p>
      <div className="space-y-1.5 mb-5">
        {upcoming.map(h => (
          <div key={h.id} className={cardCls + ' flex items-center justify-between py-2.5'}>
            <div>
              <p className="text-stone-900 text-sm">{h.name} {h.is_optional && <span className="text-amber-700 text-xs">(optional)</span>}</p>
              <p className="text-stone-700 text-xs">{new Date(h.holiday_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                {h.segment_slug && ` • ${segments.find(s => s.slug === h.segment_slug)?.name || h.segment_slug}`}</p>
            </div>
            <button className="text-red-700 text-xs" onClick={() => remove(h.id)}>Remove</button>
          </div>
        ))}
        {upcoming.length === 0 && <p className="text-stone-700 text-sm">No upcoming holidays added yet.</p>}
      </div>

      {past.length > 0 && (
        <details>
          <summary className="text-stone-700 text-xs cursor-pointer">Past holidays ({past.length})</summary>
          <div className="space-y-1 mt-2">
            {past.map(h => (
              <div key={h.id} className="flex justify-between text-xs text-stone-700">
                <span>{h.name}</span><span>{h.holiday_date}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─────────────────────────── HR/Super Admin: offboard an employee properly
export function OffboardStaff({ staffMember, onDone }: { staffMember: any; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    exit_date: new Date().toISOString().slice(0, 10),
    exit_reason: 'resigned',
    exit_note: '',
    disable_account: true,
  });
  const [openLeads, setOpenLeads] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
      .eq('assigned_to', staffMember.id).not('stage', 'in', '(won,lost)')
      .then(({ count }) => setOpenLeads(count || 0));
  }, [staffMember.id]);

  async function submit() {
    setBusy(true);
    const { error } = await supabase.from('app_users').update({
      exit_date: form.exit_date,
      exit_reason: form.exit_reason,
      exit_note: form.exit_note,
      is_active: !form.disable_account,
      updated_at: new Date().toISOString(),
    }).eq('id', staffMember.id);
    setBusy(false);
    if (error) { toast.error(`Couldn't offboard: ${error.message}`); return; }
    toast.success(`${staffMember.full_name} offboarded`);
    onDone();
  }

  return (
    <div className="space-y-3">
      <h3 className="text-stone-900 font-semibold">Offboard {staffMember.full_name}</h3>
      {openLeads > 0 && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-600/40 text-amber-700 text-xs">
          ⚠ They still have <strong>{openLeads} active lead(s)</strong> assigned. Reassign those first
          (CRM → Reassign Leads) so nothing gets orphaned.
        </div>
      )}
      <div>
        <label className="text-stone-700 text-xs">Last working day</label>
        <input type="date" className={inputCls} value={form.exit_date} onChange={e => setForm({ ...form, exit_date: e.target.value })} />
      </div>
      <div>
        <label className="text-stone-700 text-xs">Reason</label>
        <select className={inputCls} value={form.exit_reason} onChange={e => setForm({ ...form, exit_reason: e.target.value })}>
          {['resigned', 'terminated', 'contract_ended', 'retired', 'other'].map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </div>
      <textarea className={inputCls} rows={2} placeholder="Notes (optional)" value={form.exit_note} onChange={e => setForm({ ...form, exit_note: e.target.value })} />
      <label className="flex items-center gap-2 text-sm text-stone-900 cursor-pointer">
        <input type="checkbox" checked={form.disable_account} onChange={e => setForm({ ...form, disable_account: e.target.checked })} />
        Disable their login immediately
      </label>
      <button className={btnCls + ' w-full'} disabled={busy} onClick={submit}>
        <UserMinus className="w-4 h-4 inline mr-1.5" /> {busy ? 'Saving…' : 'Confirm Offboarding'}
      </button>
      <p className="text-stone-700 text-xs">Their record, documents, attendance and payslip history are all retained — nothing is deleted.</p>
    </div>
  );
}

// ─────────────────────────── HR: resolve dangling check-ins (forgot to check out)
export function DanglingCheckins() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [customTime, setCustomTime] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await cachedRpc('list_dangling_checkins', () => supabase.rpc('list_dangling_checkins'));
      const list = (data as any)?.data || data;
      if (Array.isArray(list)) setItems(list);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function close(rec: any) {
    setBusy(rec.id);
    const t = customTime[rec.id];
    const checkOut = t ? new Date(`${rec.attendance_date}T${t}`).toISOString() : null;
    const { error } = await supabase.rpc('close_dangling_checkin', { _record_id: rec.id, _check_out: checkOut });
    setBusy('');
    if (error) { toast.error(`Couldn't close: ${error.message}`); return; }
    toast.success('Day closed — staff member notified');
    load();
  }

  if (items.length === 0) {
    return <p className="text-stone-700 text-sm text-center py-10">No unclosed attendance days. All clear.</p>;
  }

  return (
    <div>
      <p className="text-stone-700 text-sm mb-4">
        These staff checked in but never checked out. Closing a day uses their shift end time unless you set one —
        it's marked as auto-closed, never counted as a real punch.
      </p>
      <div className="space-y-2">
        {items.map(r => (
          <div key={r.id} className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-stone-900 text-sm font-medium">{r.full_name}</p>
                <p className="text-stone-700 text-xs mt-0.5">
                  {r.attendance_date} • in at {new Date(r.check_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  <span className="text-amber-700 ml-2">{r.days_open} day(s) open</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input type="time" className={inputCls + ' w-32'} value={customTime[r.id] || ''}
                  onChange={e => setCustomTime({ ...customTime, [r.id]: e.target.value })} />
                <button className={btnCls} disabled={busy === r.id} onClick={() => close(r)}>
                  {busy === r.id ? 'Closing…' : 'Close Day'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Overdue tickets (SLA breach)
export function OverdueTickets({ segments }: { segments: Segment[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [segment, setSegment] = useState('');

  useEffect(() => {
    cachedRpc(`list_overdue_tickets:${segment}`, () => supabase.rpc('list_overdue_tickets', { _segment_slug: segment || null }))
      .then(res => {
        const data = (res as any)?.data || res;
        if (Array.isArray(data)) setItems(data);
      }).catch(() => {});
  }, [segment]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-stone-700 text-sm">Open tickets past their SLA resolution target.</p>
        <select className={inputCls + ' w-auto'} value={segment} onChange={e => setSegment(e.target.value)}>
          <option value="">All Segments</option>
          {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>
      {items.length === 0 ? (
        <p className="text-stone-700 text-sm text-center py-10">No tickets are overdue. Nice.</p>
      ) : (
        <div className="space-y-2">
          {items.map(t => {
            const over = Math.round(Number(t.hours_open) - t.target_hours);
            const seg = segments.find(s => s.slug === t.segment_slug);
            return (
              <div key={t.id} className={cardCls + ' border-red-900/50'}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-teal-700 text-sm">{t.ticket_no}</span>
                  {seg && <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: seg.color + '22', color: seg.color }}>{seg.name}</span>}
                  <span className="text-xs text-red-700 font-medium">{over}h over target</span>
                  <span className="text-xs text-stone-700">{t.priority} • target {t.target_hours}h</span>
                </div>
                <p className="text-stone-900 text-sm mt-1">{t.subject}</p>
                <p className="text-stone-700 text-xs mt-0.5">{t.customer_name} • open {Math.round(Number(t.hours_open))}h</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
