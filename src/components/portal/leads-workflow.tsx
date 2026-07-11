import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Phone, Upload, FileSpreadsheet, ArrowRightLeft, PhoneCall, CheckCircle2, XCircle } from 'lucide-react';
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

  function openLead(lead: any) {
    setActive(lead);
    setOutcome('contacted');
    setRemark('');
    setCallbackDate('');
    setTransferTo('');
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
                {l.interested_in || 'No notes'} {l.callback_at && <span className="text-amber-400 ml-2">Callback: {new Date(l.callback_at).toLocaleString()}</span>}
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
  const [telecallers, setTelecallers] = useState<any[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('app_users').select('id, full_name, segments').eq('role', 'telecaller').eq('is_active', true)
      .then(({ data }) => { if (data) setTelecallers(data); });
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
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
              {telecallers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
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
export function LeadsWorkspace({ segments }: { segments: Segment[] }) {
  const { hasPermission } = useAuth();
  const [sub, setSub] = useState<'board' | 'bulk' | 'transfers'>('board');
  const showBulk = hasPermission('bulk_assign_leads');
  const showTransfers = hasPermission('approve_transfers');

  return (
    <div>
      {(showBulk || showTransfers) && (
        <div className="flex gap-2 mb-5">
          <button onClick={() => setSub('board')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'board' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Leads Board</button>
          {showBulk && <button onClick={() => setSub('bulk')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'bulk' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Bulk Upload</button>}
          {showTransfers && <button onClick={() => setSub('transfers')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'transfers' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Handoff Approvals</button>}
        </div>
      )}
      {sub === 'board' && <LeadsBoard segments={segments} />}
      {sub === 'bulk' && showBulk && <BulkLeadUpload segments={segments} />}
      {sub === 'transfers' && showTransfers && <TransferApprovals />}
    </div>
  );
}
