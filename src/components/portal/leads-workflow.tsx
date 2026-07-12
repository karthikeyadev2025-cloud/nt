import { useEffect, useRef, useState } from 'react';
import { Phone, Upload, FileSpreadsheet, ArrowRightLeft, PhoneCall, CheckCircle2, XCircle, Camera, MapPin } from 'lucide-react';
import CameraCapture from '../CameraCapture';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { inputCls, btnCls, cardCls, LeadsBoard } from './shared';
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

    const [{ count: assigned }, { count: calledToday }, { count: callbacks }, { count: convertedMonth }, { count: transfersPending }] = await Promise.all([
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id),
      supabase.from('lead_remarks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', todayStart.toISOString()),
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).not('callback_at', 'is', null),
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('transfer_requested_by', user.id).eq('stage', 'won').gte('updated_at', monthStart.toISOString()),
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('transfer_requested_by', user.id).eq('transfer_status', 'pending'),
    ]);
    setStats({
      assigned: assigned || 0, calledToday: calledToday || 0, callbacks: callbacks || 0,
      convertedMonth: convertedMonth || 0, transfersPending: transfersPending || 0,
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
  { value: 'not_answered', label: 'Not Answered' },
  { value: 'lost', label: 'Not Interested' },
  { value: 'callback', label: 'Callback Requested' },
  { value: 'won', label: 'Converted / Closed' },
];

export function TelecallerQueue() {
  const { user } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [executives, setExecutives] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [outcome, setOutcome] = useState('contacted');
  const [remark, setRemark] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase.from('marketing_leads').select('*')
      .eq('assigned_to', user.id).eq('transfer_status', 'none')
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
    setBusy(true);
    const isCallback = outcome === 'callback';
    const patch: any = {
      stage: outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : outcome === 'not_answered' ? 'not_answered' : 'contacted',
      callback_at: isCallback && callbackDate ? new Date(callbackDate).toISOString() : null,
      assigned_to: isCallback ? user.id : null,  // callback stays with her; everything else releases to the pool
      updated_at: new Date().toISOString(),
    };
    const { error: updErr } = await supabase.from('marketing_leads').update(patch).eq('id', active.id);
    if (updErr) { toast.error(`Couldn't save: ${updErr.message}`); setBusy(false); return; }

    await supabase.from('lead_remarks').insert({
      lead_id: active.id, user_id: user.id, call_type: 'outgoing',
      remark: `[${OUTCOMES.find(o => o.value === outcome)?.label}] ${remark}`,
    });

    setBusy(false);
    toast.success(isCallback ? 'Callback scheduled — stays in your queue' : 'Saved — lead released back to the pool');
    setActive(null);
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
          <p className="text-slate-500 text-sm text-center py-10">Your queue is empty. Ask your manager to assign you leads.</p>
        )}
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
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = json.map(r => ({
        customer_name: r.Name || r.name || r.customer_name || '',
        phone: String(r.Phone || r.phone || r.Mobile || r.mobile || '').trim(),
        email: r.Email || r.email || '',
        interested_in: r.Notes || r.notes || r.Interest || r.interested_in || '',
      })).filter(r => r.customer_name && r.phone);
      setRows(mapped);
    };
    reader.readAsBinaryString(file);
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
            <select className={inputCls} value={segment} onChange={e => setSegment(e.target.value)}>
              <option value="">Assign to Segment *</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={assignTo} onChange={e => setAssignTo(e.target.value)}>
              <option value="">Leave unassigned</option>
              {sortedAssignees.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
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
  const [items, setItems] = useState<any[]>([]);
  const [leadNames, setLeadNames] = useState<Record<string, { name: string; phone: string }>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('lead_remarks').select('*').order('created_at', { ascending: false }).limit(300);
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
  useEffect(() => { load(); }, []);

  const typeColor: Record<string, string> = {
    outgoing: 'text-sky-400', incoming: 'text-emerald-400', visit: 'text-amber-400',
    whatsapp: 'text-emerald-400', email: 'text-purple-400', note: 'text-slate-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">Every call, visit and note across the whole team, most recent first.</p>
        <button className="text-sky-400 text-xs" onClick={load}>Refresh</button>
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
                {userNames[r.user_id] || 'Unknown'} • {new Date(r.created_at).toLocaleString()}
                {r.address && <span> • 📍 {r.address}</span>}
              </p>
            </div>
          ))}
          {items.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No activity yet.</p>}
        </div>
      )}
    </div>
  );
}

export function LeadsWorkspace({ segments }: { segments: Segment[] }) {
  const { hasPermission } = useAuth();
  const [sub, setSub] = useState<'board' | 'bulk' | 'reassign' | 'transfers' | 'activity'>('board');
  const showBulk = hasPermission('bulk_assign_leads');
  const showTransfers = hasPermission('approve_transfers');

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setSub('board')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'board' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Leads Board</button>
        <button onClick={() => setSub('activity')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'activity' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Team Activity</button>
        {showBulk && <button onClick={() => setSub('bulk')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'bulk' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Bulk Upload</button>}
        {showBulk && <button onClick={() => setSub('reassign')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'reassign' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Reassign Leads</button>}
        {showTransfers && <button onClick={() => setSub('transfers')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'transfers' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Handoff Approvals</button>}
      </div>
      {sub === 'board' && <LeadsBoard segments={segments} />}
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
  const [newLead, setNewLead] = useState({ customer_name: '', phone: '', segment_slug: '', interested_in: '' });

  async function load() {
    if (!user) return;
    const { data, error } = await supabase.from('marketing_leads').select('*')
      .eq('assigned_to', user.id).not('stage', 'in', '(won,lost)')
      .order('updated_at', { ascending: true });
    if (error) { toast.error(`Couldn't load your leads: ${error.message}`); return; }
    if (data) setLeads(data);
  }
  useEffect(() => { load(); }, [user]);

  const [duplicateInfo, setDuplicateInfo] = useState<any[] | null>(null);

  async function addFieldLead() {
    if (!user || !newLead.customer_name || !newLead.phone || !newLead.segment_slug) { toast.error('Name, phone and segment are required'); return; }

    if (!duplicateInfo) {
      const { data: dupes } = await supabase.rpc('find_duplicate_leads', { _phone: newLead.phone, _segment_slug: newLead.segment_slug });
      if (dupes && dupes.length > 0) { setDuplicateInfo(dupes); return; } // show warning, wait for confirm
    }

    const { error } = await supabase.from('marketing_leads').insert({
      ...newLead, source: 'field', assigned_to: user.id, created_by: user.id,
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
    let photo_url: string | null = null;
    if (photoDataUrl) {
      const res = await fetch(photoDataUrl);
      const blob = await res.blob();
      const path = `${active.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('lead-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) toast.error(`Photo upload failed: ${upErr.message}`);
      else photo_url = path;
    }

    const { error: remErr } = await supabase.from('lead_remarks').insert({
      lead_id: active.id, user_id: user.id, call_type: 'visit', remark,
      photo_url, latitude: location?.lat ?? null, longitude: location?.lng ?? null, address: location?.address ?? null,
    });
    if (remErr) { toast.error(`Couldn't save visit: ${remErr.message}`); setBusy(false); return; }

    const isClosed = outcome === 'won' || outcome === 'lost';
    const patch: any = { stage: outcome, updated_at: new Date().toISOString() };
    if (photo_url) patch.photo_url = photo_url;
    if (location) { patch.latitude = location.lat; patch.longitude = location.lng; }
    if (isClosed) patch.assigned_to = null; // release back to pool once closed

    const { error: leadErr } = await supabase.from('marketing_leads').update(patch).eq('id', active.id);
    setBusy(false);
    if (leadErr) { toast.error(`Couldn't update lead: ${leadErr.message}`); return; }

    toast.success(isClosed ? 'Visit logged — lead closed' : 'Visit logged');
    setActive(null);
    load();
  }

  async function viewPhoto(path: string) {
    const { data, error } = await supabase.storage.from('lead-photos').createSignedUrl(path, 300);
    if (error || !data) { toast.error("Couldn't load photo"); return; }
    window.open(data.signedUrl, '_blank');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">My Field Leads ({leads.length})</h3>
        <button className="text-sky-400 text-xs font-medium" onClick={() => { setDuplicateInfo(null); setShowAddLead(true); }}>+ Add Lead</button>
      </div>
      <div className="space-y-2">
        {leads.map(l => (
          <div key={l.id} className={cardCls + ' cursor-pointer hover:border-slate-600'} onClick={() => openLead(l)}>
            <p className="text-white text-sm font-medium">{l.customer_name}</p>
            <p className="text-slate-500 text-xs mt-0.5">{l.phone} • {l.address || l.interested_in || 'No address captured yet'}</p>
          </div>
        ))}
        {leads.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No field leads assigned. Ask your manager or a telecaller to hand one off to you.</p>}
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
              <textarea className={inputCls} rows={2} placeholder="Visit notes / conversation summary *" value={remark} onChange={e => setRemark(e.target.value)} />
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
    supabase.from('app_users').select('id, full_name, role, segments').eq('is_active', true).neq('role', 'super_admin').order('full_name')
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
      next.has(id) ? next.delete(id) : next.add(id);
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
      <p className="text-slate-400 text-sm mb-4">Move someone's active leads to another staff member — useful when they're on leave or you're rebalancing workload.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-slate-500 text-xs">From (current owner)</label>
          <select className={inputCls} value={fromId} onChange={e => { setFromId(e.target.value); setToId(''); }}>
            <option value="">Select staff member</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-slate-500 text-xs">To (new owner)</label>
          <select className={inputCls} value={toId} onChange={e => setToId(e.target.value)} disabled={!fromId}>
            <option value="">Select staff member</option>
            {staff.filter(s => s.id !== fromId).map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
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
