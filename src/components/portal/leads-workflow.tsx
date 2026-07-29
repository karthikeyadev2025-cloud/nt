import { useEffect, useRef, useState } from 'react';
import { Phone, Upload, FileSpreadsheet, ArrowRightLeft, PhoneCall, CheckCircle2, XCircle, Camera, MapPin } from 'lucide-react';
import CameraCapture from '../CameraCapture';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { inputCls, btnCls, cardCls, LeadsBoard, SegmentTabs } from './shared';
import { normalizePhone } from '../../lib/phone';
import { enqueue, flushQueue, listQueued, queueCount, startAutoFlush, type QueuedVisit } from '../../lib/offlineQueue';
import { MyCallsChart } from './performance';
import type { Segment } from '../../lib/database.types';

// ─────────────────────────── Telecaller: counts-only dashboard
export function TelecallerStatsDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ assigned: number; calledToday: number; callbacks: number; convertedMonth: number; transfersPending: number } | null>(null);

  async function load() {
    if (!user) return;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [{ count: assigned }, { count: calledToday }, { count: callbacks }, { count: transfersPending }] = await Promise.all([
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id),
      supabase.from('lead_remarks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', todayStart.toISOString()),
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).not('callback_at', 'is', null),
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('transfer_requested_by', user.id).eq('transfer_status', 'pending'),
    ]);

    // Converted this month = leads this caller marked "Converted / Closed" this
    // month (a remark tagged [Converted / Closed]), which counts BOTH direct
    // closes and won-then-handed-off deals — not just handoffs.
    const { data: convRemarks } = await supabase.from('lead_remarks')
      .select('lead_id')
      .eq('user_id', user.id)
      .ilike('remark', '[Converted / Closed]%')
      .gte('created_at', monthStart.toISOString());
    const convertedMonth = new Set((convRemarks || []).map((r: any) => r.lead_id)).size;

    setStats({
      assigned: assigned || 0, calledToday: calledToday || 0, callbacks: callbacks || 0,
      convertedMonth, transfersPending: transfersPending || 0,
    });
  }
  useEffect(() => { load(); }, [user]);

  if (!stats) return null;
  const cards = [
    { label: 'Leads in my queue', value: stats.assigned, color: 'text-sky-400' },
    { label: 'Calls made today', value: stats.calledToday, color: 'text-white' },
    { label: 'Callbacks pending', value: stats.callbacks, color: 'text-amber-400' },
    { label: 'Converted this month', value: stats.convertedMonth, color: 'text-emerald-400' },
    { label: 'Transfers awaiting approval', value: stats.transfersPending, color: 'text-purple-400' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className={cardCls + ' text-center'}>
          <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
          <p className="text-slate-500 text-xs mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Telecaller: active call queue (click-to-call, quick remark, transfer request)
const OUTCOMES = [
  { value: 'contacted', label: 'Spoke — Interested' },
  { value: 'appointment', label: 'Appointment Booked' },
  { value: 'not_answered', label: 'Not Answered' },
  { value: 'lost', label: 'Not Interested' },
  { value: 'callback', label: 'Callback Requested' },
  { value: 'won', label: 'Converted / Closed' },
];

export function TelecallerQueue({ segments }: { segments: Segment[] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [executives, setExecutives] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [outcome, setOutcome] = useState('contacted');
  const [remark, setRemark] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentNote, setAppointmentNote] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPool, setShowPool] = useState(false);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase.from('marketing_leads').select('*')
      .eq('assigned_to', user.id).eq('transfer_status', 'none')
      .order('priority', { ascending: true })
      .order('callback_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error) { toast.error(`Couldn't load queue: ${error.message}`); return; }
    if (data) setLeads(data);
  }
  useEffect(() => { load(); }, [user]);
  useEffect(() => {
    if (!user) return;
    supabase.from('app_users').select('id, full_name, role, segments').eq('role', 'marketing_executive').eq('is_active', true)
      .then(({ data }) => { if (data) setExecutives(data); });
  }, [user]);

  async function openLead(lead: any) {
    setActive(lead);
    setOutcome('contacted');
    setRemark('');
    setCallbackDate('');
    setTransferTo('');
    const { data } = await supabase.from('lead_remarks').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false });
    setHistory(data || []);
  }

  function call(phone: string) {
    window.location.href = `tel:${phone}`;
  }

  async function submitOutcome() {
    if (!active || !user || !remark.trim()) { toast.error('Please add a remark before saving'); return; }
    const isCallback = outcome === 'callback';
    const isAppointment = outcome === 'appointment';
    if (isAppointment && !appointmentDate) { toast.error('Please pick the appointment date and time'); return; }
    if (isAppointment && new Date(appointmentDate) < new Date()) { toast.error('Appointment must be in the future'); return; }
    setBusy(true);
    // Only terminal outcomes (won / lost / not-answered) release the lead back to
    // the unassigned pool. "Interested" and callbacks stay with the caller so the
    // lead never disappears into a pool that restricted staff can't see.
    const releasesToPool = outcome === 'won' || outcome === 'lost' || outcome === 'not_answered';
    const patch: any = {
      stage: outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost'
           : outcome === 'not_answered' ? 'not_answered'
           : isAppointment ? 'qualified' : 'contacted',
      callback_at: isCallback && callbackDate ? new Date(callbackDate).toISOString() : null,
      assigned_to: releasesToPool ? null : user.id,
      updated_at: new Date().toISOString(),
    };
    if (isAppointment) {
      patch.appointment_at = new Date(appointmentDate).toISOString();
      patch.appointment_note = appointmentNote;
      patch.appointment_set_by = user.id;
    }
    const { error: updErr } = await supabase.from('marketing_leads').update(patch).eq('id', active.id);
    if (updErr) { toast.error(`Couldn't save: ${updErr.message}`); setBusy(false); return; }

    await supabase.from('lead_remarks').insert({
      lead_id: active.id, user_id: user.id, call_type: 'outgoing',
      remark: `[${OUTCOMES.find(o => o.value === outcome)?.label}] ${remark}`
        + (isAppointment ? ` — appointment ${new Date(appointmentDate).toLocaleString('en-IN')}` : ''),
    });

    setBusy(false);
    toast.success(
      isAppointment ? 'Appointment booked — your manager has been notified to assign an executive'
      : isCallback ? 'Callback scheduled — stays in your queue'
      : releasesToPool ? 'Saved — lead released to the unassigned pool'
      : 'Saved — lead stays in your queue for follow-up'
    );
    setActive(null);
    setAppointmentDate(''); setAppointmentNote('');
    load();
  }

  async function requestTransfer() {
    if (!active || !user || !transferTo) { toast.error('Select an executive to hand off to'); return; }
    setBusy(true);
    const { error } = await supabase.from('marketing_leads').update({
      pending_transfer_to: transferTo, transfer_requested_by: user.id, transfer_status: 'pending',
      transfer_note: remark, updated_at: new Date().toISOString(),
    }).eq('id', active.id);
    setBusy(false);
    if (error) { toast.error(`Couldn't request transfer: ${error.message}`); return; }
    if (remark.trim()) {
      await supabase.from('lead_remarks').insert({ lead_id: active.id, user_id: user.id, call_type: 'note', remark: `[Requested handoff to executive] ${remark}` });
    }
    toast.success('Handoff requested — awaiting manager/admin approval');
    setActive(null);
    load();
  }

  return (
    <div>
      <TelecallerStatsDashboard />
      <MyCallsChart />
      <h3 className="text-white font-semibold text-sm mb-3 mt-6">My Call Queue ({leads.length})</h3>
      <div className="space-y-2">
        {leads.map(l => (
          <div key={l.id} className={cardCls + ' flex items-center justify-between'}>
            <div className="min-w-0 cursor-pointer" onClick={() => openLead(l)}>
              <p className="text-white text-sm font-medium truncate">{l.customer_name}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {l.interested_in || 'No notes'} {l.callback_at && (
                  new Date(l.callback_at) <= new Date()
                    ? <span className="text-red-400 ml-2 font-medium">⚠ Overdue callback: {new Date(l.callback_at).toLocaleString()}</span>
                    : <span className="text-amber-400 ml-2">Callback: {new Date(l.callback_at).toLocaleString()}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => call(l.phone)} className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center text-white" title="Call">
                <Phone className="w-4 h-4" />
              </button>
              <button onClick={() => openLead(l)} className="text-sky-400 text-xs font-medium">Add Remark</button>
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-10">Your queue is empty. Claim leads from the unassigned pool below, or ask your manager to assign you some.</p>
        )}
      </div>

      <div className="mt-8">
        <button onClick={() => setShowPool(!showPool)} className="text-sky-400 text-sm font-medium">
          {showPool ? '▾' : '▸'} Unassigned Pool — claim new leads
        </button>
        {showPool && <div className="mt-4"><UnassignedLeadsPool segments={segments} onChanged={load} /></div>}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{active.customer_name}</h3>
              <button onClick={() => call(active.phone)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">
                <PhoneCall className="w-4 h-4" /> {active.phone}
              </button>
            </div>
            <p className="text-slate-500 text-xs">{active.interested_in}</p>

            <select className={inputCls} value={outcome} onChange={e => setOutcome(e.target.value)}>
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {outcome === 'callback' && (
              <input type="datetime-local" className={inputCls} value={callbackDate} onChange={e => setCallbackDate(e.target.value)} />
            )}
            {outcome === 'appointment' && (
              <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                <p className="text-sky-300 text-xs font-medium">Appointment date &amp; time *</p>
                <input type="datetime-local" className={inputCls} value={appointmentDate}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={e => setAppointmentDate(e.target.value)} />
                <input className={inputCls} placeholder="Location / what to bring (optional)"
                  value={appointmentNote} onChange={e => setAppointmentNote(e.target.value)} />
                <p className="text-slate-500 text-[11px]">Your manager will be notified to assign a field executive.</p>
              </div>
            )}
            <textarea className={inputCls} rows={2} placeholder="Remark *" value={remark} onChange={e => setRemark(e.target.value)} />
            <button className={btnCls + ' w-full'} disabled={busy} onClick={submitOutcome}>Save Outcome</button>

            <div className="border-t border-slate-800 pt-3">
              <p className="text-slate-400 text-xs mb-2 flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Appointment fixed? Hand off to a field executive:</p>
              <select className={inputCls + ' mb-2'} value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                <option value="">Select executive</option>
                {executives.map(ex => <option key={ex.id} value={ex.id}>{ex.full_name}</option>)}
              </select>
              <button className="w-full py-2 rounded-lg border border-purple-600 text-purple-300 text-sm font-medium" disabled={busy} onClick={requestTransfer}>
                Request Handoff (needs manager/admin approval)
              </button>
            </div>

            {history.length > 0 && (
              <div className="border-t border-slate-800 pt-3 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-slate-400 text-xs font-medium">Previous History {history.length > 0 && '— read before calling'}</p>
                {history.map(h => {
                  const isSystem = h.remark.startsWith('Stage changed:') || h.remark.startsWith('Reassigned:');
                  return (
                    <div key={h.id} className={`text-xs ${isSystem ? 'pl-2 border-l-2 border-slate-800' : ''}`}>
                      <p className="text-slate-600">
                        {new Date(h.created_at).toLocaleString()} • {h.author_name || 'System'}{h.author_staff_code ? ` (${h.author_staff_code})` : ''}
                      </p>
                      <p className={isSystem ? 'text-slate-500 italic' : 'text-slate-300'}>{h.remark}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Manager/Super Admin: transfer approvals
export function TransferApprovals() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from('marketing_leads').select('*').eq('transfer_status', 'pending').order('updated_at', { ascending: false });
    if (data) setItems(data);
    const { data: users } = await supabase.from('app_users').select('id, full_name');
    if (users) setNames(Object.fromEntries(users.map((u: any) => [u.id, u.full_name])));
  }
  useEffect(() => { load(); }, []);

  async function resolve(id: string, approve: boolean, targetExec: string) {
    const patch: any = { transfer_status: approve ? 'approved' : 'rejected', updated_at: new Date().toISOString() };
    if (approve) patch.assigned_to = targetExec;
    const { error } = await supabase.from('marketing_leads').update(patch).eq('id', id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(approve ? 'Handoff approved' : 'Handoff rejected');
    load();
  }

  if (items.length === 0) return <p className="text-slate-500 text-sm text-center py-10">No pending handoff requests.</p>;

  return (
    <div className="space-y-2">
      {items.map(l => (
        <div key={l.id} className={cardCls}>
          <p className="text-white text-sm font-medium">{l.customer_name} <span className="text-slate-500 text-xs">• {l.phone}</span></p>
          <p className="text-slate-500 text-xs mt-1">
            Requested by <span className="text-slate-300">{names[l.transfer_requested_by] || '—'}</span> → to <span className="text-slate-300">{names[l.pending_transfer_to] || '—'}</span>
          </p>
          {l.transfer_note && <p className="text-slate-400 text-xs mt-1">"{l.transfer_note}"</p>}
          <div className="flex gap-2 mt-3">
            <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs flex items-center gap-1" onClick={() => resolve(l.id, true, l.pending_transfer_to)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
            <button className="px-3 py-1 rounded bg-red-600 text-white text-xs flex items-center gap-1" onClick={() => resolve(l.id, false, l.pending_transfer_to)}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Manager/Super Admin: Excel bulk upload + assign
export function BulkLeadUpload({ segments }: { segments: Segment[] }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');
  const [segment, setSegment] = useState('');
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('app_users').select('id, full_name, role, segments').eq('is_active', true).neq('role', 'super_admin').order('full_name')
      .then(({ data }) => { if (data) setAllStaff(data); });
  }, []);

  // Anyone can be assigned bulk contacts to follow up — not just telecallers.
  // Staff already in the chosen segment are listed first for convenience,
  // but assigning across segments is allowed (assignment grants access regardless of segment).
  const sortedAssignees = [...allStaff].sort((a, b) => {
    const aMatch = segment && ((a.segments || []).includes(segment) || (a.segments || []).includes('all'));
    const bMatch = segment && ((b.segments || []).includes(segment) || (b.segments || []).includes('all'));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return a.full_name.localeCompare(b.full_name);
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = json.map(r => {
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') {
              return String(r[k]).trim();
            }
          }
          return '';
        };
        return {
          customer_name: getVal('Customer Name', 'Customer_Name', 'Full Name', 'Name', 'name', 'customer_name'),
          phone: normalizePhone(getVal('Phone Number', 'Phone_Number', 'Phone', 'phone', 'Mobile Number', 'Mobile', 'mobile', 'Contact', 'Contact Number', 'Contact_Number')),
          email: getVal('Email Address', 'Email_Address', 'Email', 'email'),
          interested_in: getVal('Notes', 'notes', 'Interest', 'Interested In', 'interested_in', 'Requirement', 'Remarks', 'Remark'),
        };
      }).filter(r => r.customer_name && r.phone);
      setRows(mapped);
    };
    reader.readAsArrayBuffer(file);
  }

  async function upload() {
    if (!segment) { toast.error('Select a segment for these leads'); return; }
    if (rows.length === 0) { toast.error('No valid rows found in the file'); return; }
    setBusy(true);
    const payload = rows.map(r => ({
      ...r, segment_slug: segment, source: 'bulk_upload' as const,
      assigned_to: assignTo || null, created_by: user?.id,
    }));
    const { error } = await supabase.from('marketing_leads').insert(payload);
    if (!error && assignTo) {
      await supabase.from('notifications').insert({
        user_id: assignTo, kind: 'lead_assigned', title: 'New leads assigned to you',
        body: `${rows.length} new leads were just uploaded and assigned to you.`, link: '/portal',
      });
    }
    setBusy(false);
    if (error) { toast.error(`Upload failed: ${error.message}`); return; }
    toast.success(`${rows.length} leads imported${assignTo ? ' and assigned' : ''}`);
    setRows([]); setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-1 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-sky-400" /> Bulk Upload Leads (Excel/CSV)</h3>
      <p className="text-slate-500 text-xs mb-4">Columns expected: Name, Phone, Email (optional), Notes (optional).</p>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
        className="text-slate-300 text-sm w-full mb-3 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-300 file:text-xs" />

      {rows.length > 0 && (
        <div className="mb-3">
          <p className="text-emerald-400 text-xs mb-2">{fileName}: {rows.length} valid rows detected</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select className={inputCls} value={segment} onChange={e => { setSegment(e.target.value); setAssignTo(''); }}>
              <option value="">Assign to Segment *</option>
              {segments
                .filter(s => isSuperAdmin || (user?.segments || []).includes('all') || (user?.segments || []).includes(s.slug))
                .map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={assignTo} onChange={e => setAssignTo(e.target.value)}>
              <option value="">Leave unassigned</option>
              {sortedAssignees
                .filter(s => !segment || (s.segments || []).includes(segment) || (s.segments || []).includes('all'))
                .map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
            </select>
          </div>
          <button className={btnCls} disabled={busy} onClick={upload}>
            <Upload className="w-4 h-4 inline mr-1.5" /> {busy ? 'Importing…' : `Import ${rows.length} Leads`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Reusable composite: board + bulk upload + transfer approvals
// Used by both Super Admin (always sees all) and Manager's own Staff Portal (permission-gated).
// ─────────────────────────── Manager/Super Admin: Team Activity Feed
// (company-wide stream of every call/visit/note across all leads — real workflow
// carried over from the original Aadya ManagerPortal "Conversations" tab.
// Without this, a manager has to open each lead individually to see any notes.)
export function TeamActivityFeed() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [leadNames, setLeadNames] = useState<Record<string, { name: string; phone: string }>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [days, setDays] = useState(7);

  async function viewPhoto(path: string) {
    const { data, error } = await supabase.storage.from('lead-photos').createSignedUrl(path, 300);
    if (error || !data) { toast.error("Couldn't load photo"); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function load() {
    setLoading(true);
    // Order by when the work actually happened, so a visit logged offline on
    // Monday and synced Wednesday sits on Monday, not at the top.
    let q = supabase.from('lead_remarks').select('*')
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }).limit(300);
    if (typeFilter) q = q.eq('call_type', typeFilter);
    if (personFilter) q = q.eq('user_id', personFilter);
    if (days) q = q.gte('created_at', new Date(Date.now() - days * 86400000).toISOString());
    const { data } = await q;
    if (data) setItems(data);
    const leadIds = [...new Set((data || []).map((r: any) => r.lead_id))];
    const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
    if (leadIds.length) {
      const { data: leads } = await supabase.from('marketing_leads').select('id, customer_name, phone').in('id', leadIds);
      if (leads) setLeadNames(Object.fromEntries(leads.map((l: any) => [l.id, { name: l.customer_name, phone: l.phone }])));
    }
    if (userIds.length) {
      const { data: users } = await supabase.from('app_users').select('id, full_name').in('id', userIds);
      if (users) setUserNames(Object.fromEntries(users.map((u: any) => [u.id, u.full_name])));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [typeFilter, personFilter, days]);

  const typeColor: Record<string, string> = {
    outgoing: 'text-sky-400', incoming: 'text-emerald-400', visit: 'text-amber-400',
    whatsapp: 'text-emerald-400', email: 'text-purple-400', note: 'text-slate-400',
    review: 'text-purple-300',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">Every call, visit and note across your team, most recent first.</p>
        <button className="text-sky-400 text-xs" onClick={load}>Refresh</button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <select className={inputCls + ' w-auto'} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All activity</option>
          <option value="visit">Field visits</option>
          <option value="outgoing">Calls</option>
          <option value="review">Reviews</option>
          <option value="note">Notes</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select className={inputCls + ' w-auto'} value={personFilter} onChange={e => setPersonFilter(e.target.value)}>
          <option value="">Everyone</option>
          {Object.entries(userNames).map(([id, name]) => <option key={id} value={id}>{name as string}</option>)}
        </select>
        <select className={inputCls + ' w-auto'} value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={0}>All time</option>
        </select>
      </div>
      {loading ? <p className="text-slate-500 text-sm text-center py-10">Loading…</p> : (
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.id} className={cardCls}>
              <div className="flex items-center justify-between">
                <p className="text-white text-sm font-medium">{leadNames[r.lead_id]?.name || 'Unknown lead'}</p>
                <span className={`text-xs ${typeColor[r.call_type] || 'text-slate-400'} capitalize`}>{r.call_type.replace('_', ' ')}</span>
              </div>
              <p className="text-slate-300 text-sm mt-1">{r.remark}</p>
              <p className="text-slate-600 text-xs mt-1">
                {userNames[r.user_id] || 'Unknown'} • {new Date(r.occurred_at || r.created_at).toLocaleString()}
                {r.occurred_at && new Date(r.created_at).getTime() - new Date(r.occurred_at).getTime() > 3600000 && (
                  <span className="text-slate-700"> • synced later</span>
                )}
              </p>
              {(r.address || r.photo_url || r.latitude) && (
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                  {r.address && <span className="text-slate-500">📍 {r.address}</span>}
                  {!r.address && r.latitude && (
                    <a className="text-sky-400" target="_blank" rel="noreferrer"
                      href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}>📍 View on map</a>
                  )}
                  {r.photo_url && (
                    <button className="text-sky-400" onClick={() => viewPhoto(r.photo_url)}>📷 Proof photo</button>
                  )}
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No activity yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Manager/Super Admin: Unassigned lead pool (claim / assign)
// Leads released by telecallers/executives (not-answered, lost, won→reopened, or
// created without an owner) land here. Without this view they were invisible to
// restricted staff and only reachable one-by-one by full-view managers.
export function UnassignedLeadsPool({ segments, onChanged }: { segments: Segment[]; onChanged?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [segFilter, setSegFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    let q = supabase.from('marketing_leads').select('*')
      .is('assigned_to', null).not('stage', 'in', '(won,lost)')
      .order('created_at', { ascending: false }).limit(400);
    if (segFilter) q = q.eq('segment_slug', segFilter);
    const { data, error } = await q;
    if (error) { toast.error(`Couldn't load pool: ${error.message}`); return; }
    setLeads(data || []);
    setSelected(new Set());
  }
  useEffect(() => { load(); }, [segFilter]);
  useEffect(() => {
    supabase.from('app_users').select('id, full_name, role, segments').eq('is_active', true).neq('role', 'super_admin').order('full_name')
      .then(({ data }) => { if (data) setStaff(data); });
  }, []);

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function assign(toId: string, ids: string[]) {
    if (!toId || ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from('marketing_leads')
      .update({ assigned_to: toId, updated_at: new Date().toISOString() }).in('id', ids);
    setBusy(false);
    if (error) { toast.error(`Couldn't assign: ${error.message}`); return; }
    if (toId !== user?.id) {
      await supabase.from('notifications').insert({
        user_id: toId, kind: 'lead_assigned', title: 'Leads assigned to you',
        body: `${ids.length} lead(s) from the unassigned pool were assigned to you.`, link: '/portal',
      });
    }
    toast.success(toId === user?.id ? `${ids.length} lead(s) claimed — now in your queue` : `${ids.length} lead(s) assigned`);
    load();
    onChanged?.();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
        <button className="text-sky-400 text-xs" onClick={load}>Refresh</button>
      </div>

      {selected.size > 0 && staff.length > 0 && (
        <div className={cardCls + ' mb-4 flex flex-wrap items-center gap-3'}>
          <span className="text-slate-300 text-sm">{selected.size} selected</span>
          <select className={inputCls + ' w-auto flex-1 min-w-[180px]'} value={assignTo} onChange={e => setAssignTo(e.target.value)}>
            <option value="">Assign selected to…</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
          </select>
          <button className={btnCls} disabled={busy || !assignTo} onClick={() => assign(assignTo, Array.from(selected))}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {leads.map(l => {
          const seg = segments.find(s => s.slug === l.segment_slug);
          return (
            <div key={l.id} className={cardCls + ' flex items-center justify-between gap-3'}>
              <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{l.customer_name}
                    {seg && <span className="text-xs px-2 py-0.5 rounded ml-2" style={{ backgroundColor: seg.color + '22', color: seg.color }}>{seg.name}</span>}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">{l.phone} • {l.stage.replace('_', ' ')} • {new Date(l.created_at).toLocaleDateString()}</p>
                </div>
              </label>
              <button className="text-sky-400 text-xs font-medium shrink-0" disabled={busy} onClick={() => user && assign(user.id, [l.id])}>
                Claim
              </button>
            </div>
          );
        })}
        {leads.length === 0 && <p className="text-slate-500 text-sm text-center py-10">The unassigned pool is empty.</p>}
      </div>
    </div>
  );
}

// ─────────────────────────── Appointments (manager / super admin)
// Leads where a telecaller booked a dated appointment. The manager's job here
// is to put a named field executive against each one before the date arrives.
export function AppointmentsBoard({ segments }: { segments: Segment[] }) {
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [execs, setExecs] = useState<any[]>([]);
  const [segFilter, setSegFilter] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'unassigned' | 'past'>('upcoming');
  const [busy, setBusy] = useState('');

  async function load() {
    let q = supabase.from('marketing_leads').select('*')
      .not('appointment_at', 'is', null)
      .not('stage', 'in', '(won,lost)')
      .order('appointment_at', { ascending: true }).limit(300);
    if (segFilter) q = q.eq('segment_slug', segFilter);
    if (scope === 'upcoming') q = q.gte('appointment_at', new Date().toISOString());
    if (scope === 'past') q = q.lt('appointment_at', new Date().toISOString());
    const { data, error } = await q;
    if (error) { toast.error(`Couldn't load appointments: ${error.message}`); return; }
    let rows = data || [];
    // "Needs an executive" = still sitting with whoever booked it, or nobody.
    if (scope === 'unassigned') {
      const execIds = new Set(execs.map(e => e.id));
      rows = rows.filter(l => !l.assigned_to || !execIds.has(l.assigned_to));
    }
    setLeads(rows);
  }

  useEffect(() => {
    supabase.from('app_users').select('id, full_name, role, segments')
      .eq('is_active', true).eq('role', 'marketing_executive').order('full_name')
      .then(({ data }) => { if (data) setExecs(data); });
    // Fallback for projects without pg_cron: sweeping here means reminders
    // still go out whenever a manager opens this board. The function is
    // idempotent, so calling it repeatedly is harmless.
    supabase.rpc('remind_unassigned_appointments');
  }, []);
  useEffect(() => { load(); }, [segFilter, scope, execs.length]);

  async function assignExec(leadId: string, execId: string, customerName: string, apptAt: string) {
    if (!execId) return;
    setBusy(leadId);
    const { error } = await supabase.from('marketing_leads')
      .update({ assigned_to: execId, updated_at: new Date().toISOString() }).eq('id', leadId);
    setBusy('');
    if (error) { toast.error(`Couldn't assign: ${error.message}`); return; }
    await supabase.from('notifications').insert({
      user_id: execId, kind: 'appointment', title: `Appointment assigned: ${customerName}`,
      body: `${new Date(apptAt).toLocaleString('en-IN')} — you are attending this appointment.`, link: '/portal',
    });
    toast.success('Executive assigned — they have been notified');
    load();
  }

  const fmt = (s: string) => new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div>
      <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
      <div className="flex gap-2 mb-4">
        {([['upcoming', 'Upcoming'], ['unassigned', 'Needs Executive'], ['past', 'Past']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setScope(v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${scope === v ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {leads.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-10">
          {scope === 'unassigned' ? 'Every appointment has an executive assigned.' : 'No appointments here.'}
        </p>
      )}

      <div className="space-y-2">
        {leads.map(l => {
          const overdue = new Date(l.appointment_at) < new Date();
          const assignedExec = execs.find(e => e.id === l.assigned_to);
          return (
            <div key={l.id} className={cardCls}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{l.customer_name} <span className="text-slate-500">• {l.phone}</span></p>
                  <p className={`text-xs mt-0.5 ${overdue ? 'text-amber-400' : 'text-sky-300'}`}>
                    {fmt(l.appointment_at)}{overdue ? ' — date passed' : ''}
                  </p>
                  {l.appointment_note && <p className="text-slate-500 text-xs mt-0.5">{l.appointment_note}</p>}
                  <p className="text-slate-600 text-[11px] mt-1">
                    {assignedExec ? `Executive: ${assignedExec.full_name}` : 'No executive assigned yet'}
                  </p>
                </div>
                <select className={inputCls + ' w-auto min-w-[190px]'} value={l.assigned_to || ''}
                  disabled={busy === l.id}
                  onChange={e => assignExec(l.id, e.target.value, l.customer_name, l.appointment_at)}>
                  <option value="">Assign executive…</option>
                  {execs
                    .filter(e => (e.segments || []).includes(l.segment_slug) || (e.segments || []).includes('all'))
                    .map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeadsWorkspace({ segments, focusLeadId }: { segments: Segment[]; focusLeadId?: string }) {
  const { hasPermission } = useAuth();
  const [sub, setSub] = useState<'board' | 'appointments' | 'pool' | 'bulk' | 'reassign' | 'transfers' | 'activity'>('board');
  const showBulk = hasPermission('bulk_assign_leads');
  const showTransfers = hasPermission('approve_transfers');

  // A search result forces the board sub-tab so the record can be opened there.
  useEffect(() => { if (focusLeadId) setSub('board'); }, [focusLeadId]);

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setSub('board')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'board' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Leads Board</button>
        <button onClick={() => setSub('appointments')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'appointments' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Appointments</button>
        <button onClick={() => setSub('pool')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'pool' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Unassigned Pool</button>
        <button onClick={() => setSub('activity')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'activity' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Team Activity</button>
        {showBulk && <button onClick={() => setSub('bulk')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'bulk' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Bulk Upload</button>}
        {showBulk && <button onClick={() => setSub('reassign')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'reassign' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Reassign Leads</button>}
        {showTransfers && <button onClick={() => setSub('transfers')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'transfers' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Handoff Approvals</button>}
      </div>
      {sub === 'board' && <LeadsBoard segments={segments} focusLeadId={focusLeadId} />}
      {sub === 'appointments' && <AppointmentsBoard segments={segments} />}
      {sub === 'pool' && <UnassignedLeadsPool segments={segments} />}
      {sub === 'activity' && <TeamActivityFeed />}
      {sub === 'bulk' && showBulk && <BulkLeadUpload segments={segments} />}
      {sub === 'reassign' && showBulk && <BulkReassignLeads segments={segments} />}
      {sub === 'transfers' && showTransfers && <TransferApprovals />}
    </div>
  );
}

// ─────────────────────────── Marketing Executive: field visits (photo + GPS + auto-address + notes)
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data?.display_name || '';
  } catch {
    return '';
  }
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

const VISIT_OUTCOMES = [
  { value: 'contacted', label: 'Follow-up needed' },
  { value: 'qualified', label: 'Interested — quoting' },
  { value: 'won', label: 'Closed — Won' },
  { value: 'lost', label: 'Closed — Lost' },
];

export function ExecutiveFieldVisits({ segments }: { segments: Segment[] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [remarks, setRemarks] = useState<any[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [outcome, setOutcome] = useState('contacted');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const [dealValue, setDealValue] = useState('');
  const [visitRequirement, setVisitRequirement] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [apptAt, setApptAt] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState<QueuedVisit[]>([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [newLead, setNewLead] = useState({ customer_name: '', phone: '', segment_slug: '', interested_in: '' });

  async function load() {
    if (!user) return;
    // Soonest commitment first: appointments and follow-ups you've promised
    // outrank leads you haven't scheduled anything on.
    const { data, error } = await supabase.from('marketing_leads').select('*')
      .eq('assigned_to', user.id).not('stage', 'in', '(won,lost)')
      .order('appointment_at', { ascending: true, nullsFirst: false })
      .order('next_followup_at', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: true });
    if (error) { toast.error(`Couldn't load your leads: ${error.message}`); return; }
    if (data) setLeads(data);
  }
  useEffect(() => { load(); }, [user]);
  // Fallback when pg_cron isn't enabled: sweeping here means due follow-ups
  // still notify whenever field staff open their queue. Idempotent.
  useEffect(() => { supabase.rpc('remind_due_followups'); }, []);

  // Offline queue: keep the pending count live, flush automatically on
  // reconnect / focus / timer, and refresh the lead list once things land.
  useEffect(() => {
    const refresh = async () => {
      setPendingCount(await queueCount());
      setPendingItems(await listQueued());
    };
    refresh();
    const stop = startAutoFlush(supabase, result => {
      refresh();
      if (result.synced > 0) { toast.success(`${result.synced} visit(s) synced`); load(); }
    });
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { stop(); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function syncNow() {
    setSyncing(true);
    const r = await flushQueue(supabase);
    setSyncing(false);
    setPendingCount(r.remaining);
    setPendingItems(await listQueued());
    if (r.synced > 0) { toast.success(`${r.synced} visit(s) synced`); load(); }
    else if (r.remaining > 0) toast.error(`Still offline — ${r.remaining} visit(s) waiting`);
  }

  const [duplicateInfo, setDuplicateInfo] = useState<any[] | null>(null);

  async function addFieldLead() {
    if (!user || !newLead.customer_name || !newLead.phone || !newLead.segment_slug) { toast.error('Name, phone and segment are required'); return; }
    const phone = normalizePhone(newLead.phone);

    if (!duplicateInfo) {
      // Restricted field staff only get a yes/no existence check (no lead-book
      // details); full-view staff get the detailed list. Try detailed first,
      // fall back to the boolean so the warning still fires either way.
      const { data: dupes } = await supabase.rpc('find_duplicate_leads', { _phone: phone, _segment_slug: newLead.segment_slug });
      if (dupes && dupes.length > 0) { setDuplicateInfo(dupes); return; }
      const { data: exists } = await supabase.rpc('lead_phone_exists', { _phone: phone, _segment_slug: newLead.segment_slug });
      if (exists) { setDuplicateInfo([{ id: 'exists', customer_name: 'An active lead with this number already exists', stage: '', assignee_name: '' }]); return; }
    }

    const { error } = await supabase.from('marketing_leads').insert({
      ...newLead, phone, source: 'field', assigned_to: user.id, created_by: user.id,
    });
    if (error) { toast.error(`Couldn't add lead: ${error.message}`); return; }
    toast.success('Lead added to your queue');
    setShowAddLead(false);
    setDuplicateInfo(null);
    setNewLead({ customer_name: '', phone: '', segment_slug: '', interested_in: '' });
    load();
  }

  async function openLead(lead: any) {
    setActive(lead);
    setOutcome('contacted');
    setRemark('');
    setPhotoDataUrl(null);
    setLocation(null);
    setDealValue(lead.invoice_amount || lead.estimated_value || '');
    setVisitRequirement(lead.interested_in || '');
    setNextFollowup(lead.next_followup_at ? new Date(lead.next_followup_at).toISOString().slice(0,16) : '');
    setApptAt(lead.appointment_at ? new Date(lead.appointment_at).toISOString().slice(0,16) : '');
    const { data } = await supabase.from('lead_remarks').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false });
    if (data) setRemarks(data);
  }

  async function captureLocation() {
    setLocating(true);
    const pos = await getPosition();
    if (!pos) { toast.error("Couldn't get location — check GPS permission"); setLocating(false); return; }
    const address = await reverseGeocode(pos.lat, pos.lng);
    setLocation({ ...pos, address });
    setLocating(false);
  }

  function openMaps() {
    if (!location) return;
    window.open(`https://www.google.com/maps?q=${location.lat},${location.lng}`, '_blank');
  }

  async function saveVisit() {
    if (!active || !user || !remark.trim()) { toast.error('Add a visit note before saving'); return; }
    setBusy(true);

    const photoBlob = photoDataUrl ? await (await fetch(photoDataUrl)).blob() : null;

    const isClosed = outcome === 'won' || outcome === 'lost';
    const patch: any = { stage: outcome, updated_at: new Date().toISOString() };
    if (location) {
      patch.latitude = location.lat; patch.longitude = location.lng;
      if (location.address) patch.address = location.address;
    }
    // Details learned on-site: the executive is the only person who knows the
    // real requirement and the deal value, so they capture it here.
    if (visitRequirement.trim()) patch.interested_in = visitRequirement.trim();
    if (dealValue) {
      if (outcome === 'won') patch.invoice_amount = Number(dealValue);
      else patch.estimated_value = Number(dealValue);
    }
    // Field staff schedule their own next touch; closing clears it so a won
    // deal doesn't keep nagging.
    patch.next_followup_at = isClosed ? null : (nextFollowup ? new Date(nextFollowup).toISOString() : null);
    // The executive can move or set the appointment themselves after meeting
    // the customer — they're the one who agreed the new time.
    if (apptAt) {
      patch.appointment_at = new Date(apptAt).toISOString();
      patch.appointment_set_by = user.id;
    } else if (isClosed) {
      patch.appointment_at = null;
    }
    // Ownership is retained on close. Releasing it used to wipe the closer's
    // own conversion numbers the moment they won, and the won/lost stages are
    // already excluded from the unassigned pool.

    // Queue first, always. The visit is safely on the device before any
    // network call, so a dead signal at a customer site can no longer lose
    // notes, photo or GPS. flushQueue then tries to send it immediately.
    const clientRef = crypto.randomUUID();
    await enqueue({
      id: clientRef,
      leadId: active.id,
      leadName: active.customer_name,
      userId: user.id,
      remark,
      callType: 'visit',
      occurredAt: new Date().toISOString(),
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      address: location?.address ?? null,
      photo: photoBlob,
      leadPatch: patch,
    });

    const result = await flushQueue(supabase);
    setBusy(false);
    setPendingCount(result.remaining);

    if (result.remaining > 0) {
      toast.success(`Visit saved on your phone — will sync automatically (${result.remaining} pending)`);
    } else {
      toast.success(isClosed ? 'Visit logged — lead closed' : 'Visit logged');
    }
    setActive(null);
    setDealValue(''); setVisitRequirement(''); setNextFollowup(''); setApptAt('');
    load();
  }

  async function viewPhoto(path: string) {
    const { data, error } = await supabase.storage.from('lead-photos').createSignedUrl(path, 300);
    if (error || !data) { toast.error("Couldn't load photo"); return; }
    window.open(data.signedUrl, '_blank');
  }

  return (
    <div>
      {(!online || pendingCount > 0) && (
        <div className={`mb-3 rounded-xl border px-4 py-3 ${online ? 'border-amber-600/40 bg-amber-500/10' : 'border-slate-600 bg-slate-800/60'}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className={`text-sm font-medium ${online ? 'text-amber-300' : 'text-slate-300'}`}>
                {online
                  ? `${pendingCount} visit${pendingCount === 1 ? '' : 's'} waiting to sync`
                  : `Offline${pendingCount > 0 ? ` — ${pendingCount} visit${pendingCount === 1 ? '' : 's'} saved on this phone` : ' — visits will be saved on this phone'}`}
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                {online ? 'Retrying automatically.' : 'Keep working — everything syncs when signal returns.'}
              </p>
            </div>
            {online && pendingCount > 0 && (
              <button className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 text-xs whitespace-nowrap"
                disabled={syncing} onClick={syncNow}>{syncing ? 'Syncing…' : 'Sync now'}</button>
            )}
          </div>
          {pendingItems.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1">
              {pendingItems.slice(0, 5).map(p => (
                <p key={p.id} className="text-slate-500 text-[11px]">
                  {p.leadName} — {new Date(p.occurredAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                  {p.photo ? ' • photo' : ''}{p.attempts > 0 ? ` • ${p.attempts} attempt(s)` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">My Field Leads ({leads.length})</h3>
        <button className="text-sky-400 text-xs font-medium" onClick={() => { setDuplicateInfo(null); setShowAddLead(true); }}>+ Add Lead</button>
      </div>
      <div className="space-y-2">
        {leads.map(l => (
          <div key={l.id} className={cardCls + ' cursor-pointer hover:border-slate-600'} onClick={() => openLead(l)}>
            <p className="text-white text-sm font-medium">{l.customer_name}</p>
            <p className="text-slate-500 text-xs mt-0.5">{l.phone} • {l.address || l.interested_in || 'No address captured yet'}</p>
            {l.next_followup_at && !l.appointment_at && (
              <p className={`text-xs mt-1 ${new Date(l.next_followup_at) < new Date() ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                {new Date(l.next_followup_at) < new Date() ? '⚠ Follow-up overdue: ' : '↻ Follow-up: '}
                {new Date(l.next_followup_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            )}
            {l.appointment_at && (
              <p className={`text-xs mt-1 font-medium ${new Date(l.appointment_at) < new Date() ? 'text-amber-400' : 'text-sky-300'}`}>
                📅 {new Date(l.appointment_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                {l.appointment_note ? ` — ${l.appointment_note}` : ''}
                {new Date(l.appointment_at) < new Date() ? ' (date passed)' : ''}
              </p>
            )}
          </div>
        ))}
        {leads.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No field leads assigned. Claim from the unassigned pool below, add your own, or ask for a handoff.</p>}
      </div>

      <div className="mt-8">
        <button onClick={() => setShowPool(!showPool)} className="text-sky-400 text-sm font-medium">
          {showPool ? '▾' : '▸'} Unassigned Pool — claim new leads
        </button>
        {showPool && <div className="mt-4"><UnassignedLeadsPool segments={segments} onChanged={load} /></div>}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{active.customer_name}</h3>
            <p className="text-slate-500 text-xs">{active.phone} {active.email && `• ${active.email}`}</p>

            <div className="border-t border-slate-800 pt-3">
              <p className="text-slate-300 text-sm font-medium mb-2">Log a Visit</p>

              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Captured" className="w-full rounded-lg mb-2" />
              ) : (
                <button className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm flex items-center justify-center gap-1.5 mb-2" onClick={() => setCapturing(true)}>
                  <Camera className="w-4 h-4" /> Take Client/Site Photo
                </button>
              )}

              {location ? (
                <div className="mb-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
                  <p className="text-emerald-400 text-xs">📍 {location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</p>
                  <button className="text-sky-400 text-xs mt-1" onClick={openMaps}>Open in Google Maps</button>
                </div>
              ) : (
                <button className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm flex items-center justify-center gap-1.5 mb-2" disabled={locating} onClick={captureLocation}>
                  <MapPin className="w-4 h-4" /> {locating ? 'Getting location…' : 'Capture Location & Address'}
                </button>
              )}

              <select className={inputCls + ' mb-2'} value={outcome} onChange={e => setOutcome(e.target.value)}>
                {VISIT_OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input className={inputCls + ' mb-2'} placeholder="What they actually need (updates the lead)"
                value={visitRequirement} onChange={e => setVisitRequirement(e.target.value)} />
              <input className={inputCls + ' mb-2'} type="number" min={0}
                placeholder={outcome === 'won' ? 'Final invoice amount (₹)' : 'Estimated deal value (₹)'}
                value={dealValue} onChange={e => setDealValue(e.target.value)} />
              <textarea className={inputCls} rows={2} placeholder="Visit notes / conversation summary *" value={remark} onChange={e => setRemark(e.target.value)} />
              {outcome !== 'won' && outcome !== 'lost' && (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  <div>
                    <p className="text-slate-400 text-xs mb-1">Next follow-up (reminds you)</p>
                    <input type="datetime-local" className={inputCls} value={nextFollowup}
                      onChange={e => setNextFollowup(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs mb-1">Next appointment (visible to manager)</p>
                    <input type="datetime-local" className={inputCls} value={apptAt}
                      onChange={e => setApptAt(e.target.value)} />
                  </div>
                </div>
              )}
              <button className={btnCls + ' w-full mt-2'} disabled={busy} onClick={saveVisit}>{busy ? 'Saving…' : 'Save Visit'}</button>
            </div>

            {remarks.length > 0 && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <p className="text-slate-400 text-xs font-medium">Full History</p>
                {remarks.map(r => (
                  <div key={r.id} className="text-xs">
                    <p className="text-slate-600">{new Date(r.created_at).toLocaleString()} • {r.author_name || 'System'}{r.author_staff_code ? ` (${r.author_staff_code})` : ''} • {r.call_type}</p>
                    <p className="text-slate-300">{r.remark}</p>
                    <div className="flex gap-3 mt-0.5">
                      {r.address && <span className="text-slate-500">📍 {r.address}</span>}
                      {r.photo_url && <button className="text-sky-400" onClick={() => viewPhoto(r.photo_url)}>View Photo</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {capturing && (
        <CameraCapture
          title="Client / Site Photo"
          onCapture={dataUrl => { setPhotoDataUrl(dataUrl); setCapturing(false); }}
          onCancel={() => setCapturing(false)}
        />
      )}

      {showAddLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddLead(false)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">Add Field Lead</h3>
            <p className="text-slate-500 text-xs">Found a new prospect on-site? Add them directly — it lands in your own queue.</p>
            <select className={inputCls} value={newLead.segment_slug} onChange={e => { setNewLead({ ...newLead, segment_slug: e.target.value }); setDuplicateInfo(null); }}>
              <option value="">Segment *</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <input className={inputCls} placeholder="Customer Name *" value={newLead.customer_name} onChange={e => setNewLead({ ...newLead, customer_name: e.target.value })} />
            <input className={inputCls} placeholder="Phone *" value={newLead.phone} onChange={e => { setNewLead({ ...newLead, phone: e.target.value }); setDuplicateInfo(null); }} />
            <input className={inputCls} placeholder="Interested In" value={newLead.interested_in} onChange={e => setNewLead({ ...newLead, interested_in: e.target.value })} />
            {duplicateInfo && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-600/40 text-xs">
                <p className="text-amber-300 font-medium mb-1">⚠ This phone number already exists:</p>
                {duplicateInfo.map((d: any) => (
                  <p key={d.id} className="text-amber-200/80">{d.customer_name} — {d.stage} {d.assignee_name ? `• with ${d.assignee_name}` : '• unassigned'}</p>
                ))}
                <p className="text-slate-400 mt-1">Click "Add Anyway" if this is genuinely a new/different inquiry.</p>
              </div>
            )}
            <button className={btnCls + ' w-full'} onClick={addFieldLead}>{duplicateInfo ? 'Add Anyway' : 'Add Lead'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Manager/Super Admin: Bulk Reassign (move all of X's active leads to Y in one action)
export function BulkReassignLeads({ segments }: { segments: Segment[] }) {
  const toast = useToast();
  const [staff, setStaff] = useState<any[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // "From" must include disabled staff too — offboarding someone is exactly
    // when you need to move their leads off them, after their account is disabled.
    supabase.from('app_users').select('id, full_name, role, segments, is_active').neq('role', 'super_admin').order('full_name')
      .then(({ data }) => { if (data) setStaff(data); });
  }, []);

  useEffect(() => {
    if (!fromId) { setLeads([]); setSelected(new Set()); return; }
    supabase.from('marketing_leads').select('*').eq('assigned_to', fromId).not('stage', 'in', '(won,lost)').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) { setLeads(data); setSelected(new Set(data.map((l: any) => l.id))); } // default: all selected
      });
  }, [fromId]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function reassign() {
    if (!toId) { toast.error('Select who to reassign to'); return; }
    if (selected.size === 0) { toast.error('Select at least one lead'); return; }
    setBusy(true);
    const { error } = await supabase.from('marketing_leads')
      .update({ assigned_to: toId, updated_at: new Date().toISOString() })
      .in('id', Array.from(selected));
    setBusy(false);
    if (error) { toast.error(`Couldn't reassign: ${error.message}`); return; }
    toast.success(`${selected.size} lead(s) reassigned`);
    setFromId(''); setToId(''); setLeads([]); setSelected(new Set());
  }

  const fromName = staff.find(s => s.id === fromId)?.full_name;
  const toName = staff.find(s => s.id === toId)?.full_name;

  return (
    <div>
      <p className="text-slate-400 text-sm mb-4">Move someone's active leads to another staff member — useful when they're on leave, offboarded, or you're rebalancing workload.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-slate-500 text-xs">From (current owner)</label>
          <select className={inputCls} value={fromId} onChange={e => { setFromId(e.target.value); setToId(''); }}>
            <option value="">Select staff member</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}{!s.is_active ? ' (disabled)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="text-slate-500 text-xs">To (new owner)</label>
          <select className={inputCls} value={toId} onChange={e => setToId(e.target.value)} disabled={!fromId}>
            <option value="">Select staff member</option>
            {staff.filter(s => s.id !== fromId && s.is_active).map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {fromId && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-300 text-sm">{leads.length} active lead(s) assigned to {fromName}</p>
            {leads.length > 0 && (
              <button className="text-sky-400 text-xs" onClick={() => setSelected(selected.size === leads.length ? new Set() : new Set(leads.map(l => l.id)))}>
                {selected.size === leads.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <div className="space-y-1.5 mb-4 max-h-72 overflow-y-auto">
            {leads.map(l => {
              const seg = segments.find(s => s.slug === l.segment_slug);
              return (
                <label key={l.id} className={cardCls + ' flex items-center gap-3 cursor-pointer py-2.5'}>
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                  <div className="flex-1">
                    <span className="text-white text-sm">{l.customer_name}</span>
                    <span className="text-slate-500 text-xs ml-2">{l.phone} • {l.stage}</span>
                  </div>
                  {seg && <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: seg.color + '22', color: seg.color }}>{seg.name}</span>}
                </label>
              );
            })}
            {leads.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No active leads currently assigned to this person.</p>}
          </div>
          {leads.length > 0 && (
            <button className={btnCls} disabled={busy || !toId} onClick={reassign}>
              {busy ? 'Reassigning…' : `Reassign ${selected.size} lead(s)${toName ? ` to ${toName}` : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
