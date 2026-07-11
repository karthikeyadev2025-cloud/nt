import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import type { Segment, SupportTicket, Lead } from '../../lib/database.types';

export const inputCls =
  'w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:border-sky-500 focus:outline-none';
export const btnCls =
  'px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-sm font-semibold transition-colors';
export const cardCls = 'p-5 rounded-2xl bg-slate-900/60 border border-slate-800';

export function SegmentTabs({
  segments, value, onChange, includeAll = true,
}: { segments: Segment[]; value: string; onChange: (s: string) => void; includeAll?: boolean }) {
  const { user, canAccessSegment } = useAuth();
  const visible = segments.filter(s => canAccessSegment(s.slug));
  const showAll = includeAll && (user?.role === 'super_admin' || user?.segments.includes('all'));
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {showAll && (
        <button onClick={() => onChange('')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${value === '' ? 'bg-sky-500 text-slate-950 border-sky-500' : 'border-slate-700 text-slate-300 hover:border-sky-600'}`}>
          All Segments
        </button>
      )}
      {visible.map(s => (
        <button key={s.slug} onClick={() => onChange(s.slug)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${value === s.slug ? 'text-slate-950 border-transparent' : 'border-slate-700 text-slate-300 hover:border-sky-600'}`}
          style={value === s.slug ? { backgroundColor: s.color } : {}}>
          {s.name}
        </button>
      ))}
    </div>
  );
}

const ticketStatusColors: Record<string, string> = {
  open: 'bg-sky-500/20 text-sky-300',
  in_progress: 'bg-amber-500/20 text-amber-300',
  waiting_customer: 'bg-purple-500/20 text-purple-300',
  resolved: 'bg-emerald-500/20 text-emerald-300',
  closed: 'bg-slate-500/20 text-slate-400',
};

export function TicketsBoard({ segments }: { segments: Segment[] }) {
  const [segFilter, setSegFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string; segments: string[] }[]>([]);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<{ id: string; author_name: string; message: string; created_at: string }[]>([]);
  const [reply, setReply] = useState('');
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  async function load() {
    let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300);
    if (segFilter) q = q.eq('segment_slug', segFilter);
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) { toast.error(`Couldn't load tickets: ${error.message}`); return; }
    if (data) setTickets(data as SupportTicket[]);
  }

  useEffect(() => { load(); }, [segFilter, statusFilter]);
  useEffect(() => {
    supabase.from('app_users').select('id, full_name, segments').eq('is_active', true).neq('role', 'super_admin')
      .then(({ data }) => { if (data) setStaff(data as any); });
  }, []);

  async function loadReplies(id: string) {
    const { data } = await supabase.from('ticket_replies').select('*').eq('ticket_id', id).order('created_at');
    if (data) setReplies(data as any);
  }

  async function update(id: string, patch: Partial<SupportTicket>) {
    const { error } = await supabase.from('support_tickets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success('Ticket updated');
    load();
    if (openTicket?.id === id) setOpenTicket({ ...openTicket, ...patch } as SupportTicket);
  }

  async function sendReply() {
    if (!reply.trim() || !openTicket || !user) return;
    const { error } = await supabase.from('ticket_replies').insert({
      ticket_id: openTicket.id, author_user_id: user.id, author_name: user.full_name, message: reply, is_staff: true,
    });
    if (error) { toast.error(`Couldn't send reply: ${error.message}`); return; }
    setReply('');
    loadReplies(openTicket.id);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    tickets.forEach(t => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [tickets]);

  return (
    <div>
      <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
      <div className="flex flex-wrap gap-2 mb-5">
        {['', 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border ${statusFilter === s ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>
            {s === '' ? `All (${tickets.length})` : `${s.replace('_', ' ')} (${counts[s] || 0})`}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {tickets.map(t => {
          const seg = segments.find(s => s.slug === t.segment_slug);
          return (
            <div key={t.id} className={cardCls + ' cursor-pointer hover:border-slate-600'}
              onClick={() => { setOpenTicket(t); loadReplies(t.id); }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sky-400 text-sm">{t.ticket_no}</span>
                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (seg?.color || '#888') + '22', color: seg?.color }}>{seg?.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${ticketStatusColors[t.status]}`}>{t.status.replace('_', ' ')}</span>
                <span className="text-xs text-slate-500">{t.ticket_type}</span>
                <span className={`text-xs ${t.priority === 'urgent' ? 'text-red-400' : t.priority === 'high' ? 'text-amber-400' : 'text-slate-500'}`}>{t.priority}</span>
              </div>
              <p className="text-white font-medium mt-1.5">{t.subject}</p>
              <p className="text-slate-500 text-xs mt-0.5">{t.customer_name} • {t.customer_phone} • {new Date(t.created_at).toLocaleString()}</p>
            </div>
          );
        })}
        {tickets.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No tickets found.</p>}
      </div>

      {openTicket && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenTicket(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-mono text-sky-400 text-sm">{openTicket.ticket_no}</p>
                <h3 className="text-white text-lg font-semibold">{openTicket.subject}</h3>
                <p className="text-slate-400 text-sm">{openTicket.customer_name} • {openTicket.customer_phone} {openTicket.customer_email && `• ${openTicket.customer_email}`}</p>
              </div>
              <button className="text-slate-400 hover:text-white" onClick={() => setOpenTicket(null)}>✕</button>
            </div>
            <p className="text-slate-300 text-sm mb-4 whitespace-pre-wrap">{openTicket.description}</p>
            {hasPermission('manage_tickets') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <select className={inputCls} value={openTicket.status} onChange={e => update(openTicket.id, { status: e.target.value as SupportTicket['status'] })}>
                  {['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select className={inputCls} value={openTicket.priority} onChange={e => update(openTicket.id, { priority: e.target.value as SupportTicket['priority'] })}>
                  {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className={inputCls} value={openTicket.assigned_to || ''} onChange={e => update(openTicket.id, { assigned_to: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {staff.filter(s => s.segments.includes('all') || s.segments.includes(openTicket.segment_slug)).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              {replies.map(r => (
                <div key={r.id} className="text-sm">
                  <span className="text-sky-400 font-medium">{r.author_name}</span>
                  <span className="text-slate-600 text-xs ml-2">{new Date(r.created_at).toLocaleString()}</span>
                  <p className="text-slate-300 mt-0.5">{r.message}</p>
                </div>
              ))}
              {hasPermission('manage_tickets') && (
                <div className="flex gap-2 pt-2">
                  <input className={inputCls} placeholder="Add internal note / reply…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} />
                  <button className={btnCls} onClick={sendReply}>Send</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const stages: Lead['stage'][] = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'not_answered'];
const stageColors: Record<string, string> = {
  new: 'bg-sky-500/20 text-sky-300', contacted: 'bg-indigo-500/20 text-indigo-300',
  qualified: 'bg-purple-500/20 text-purple-300', quoted: 'bg-amber-500/20 text-amber-300',
  won: 'bg-emerald-500/20 text-emerald-300', lost: 'bg-red-500/20 text-red-300',
  not_answered: 'bg-slate-500/20 text-slate-400',
};

export function LeadsBoard({ segments }: { segments: Segment[] }) {
  const [segFilter, setSegFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string; segments: string[] }[]>([]);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [remarks, setRemarks] = useState<{ id: string; remark: string; call_type: string; created_at: string; address?: string; photo_url?: string }[]>([]);
  const [newRemark, setNewRemark] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ segment_slug: '', customer_name: '', phone: '', email: '', interested_in: '', source: 'field' });
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  async function load() {
    let q = supabase.from('marketing_leads').select('*').order('created_at', { ascending: false }).limit(400);
    if (segFilter) q = q.eq('segment_slug', segFilter);
    if (stageFilter) q = q.eq('stage', stageFilter);
    const { data, error } = await q;
    if (error) { toast.error(`Couldn't load leads: ${error.message}`); return; }
    if (data) setLeads(data as Lead[]);
  }
  useEffect(() => { load(); }, [segFilter, stageFilter]);
  useEffect(() => {
    supabase.from('app_users').select('id, full_name, segments').eq('is_active', true).neq('role', 'super_admin')
      .then(({ data }) => { if (data) setStaff(data as any); });
  }, []);

  async function update(id: string, patch: Partial<Lead>) {
    const { error } = await supabase.from('marketing_leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success('Lead updated');
    load();
    if (openLead?.id === id) setOpenLead({ ...openLead, ...patch } as Lead);
  }

  async function loadRemarks(id: string) {
    const { data } = await supabase.from('lead_remarks').select('*').eq('lead_id', id).order('created_at', { ascending: false });
    if (data) setRemarks(data as any);
  }

  async function addRemark() {
    if (!newRemark.trim() || !openLead || !user) return;
    const { error } = await supabase.from('lead_remarks').insert({ lead_id: openLead.id, user_id: user.id, remark: newRemark, call_type: 'note' });
    if (error) { toast.error(`Couldn't add remark: ${error.message}`); return; }
    setNewRemark('');
    loadRemarks(openLead.id);
  }

  async function viewLeadPhoto(path: string) {
    const { data, error } = await supabase.storage.from('lead-photos').createSignedUrl(path, 300);
    if (error || !data) { toast.error("Couldn't load photo"); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function createLead() {
    if (!form.segment_slug || !form.customer_name || !form.phone || !user) { toast.error('Segment, name and phone are required'); return; }
    const { error } = await supabase.from('marketing_leads').insert({ ...form, created_by: user.id });
    if (error) { toast.error(`Couldn't create lead: ${error.message}`); return; }
    toast.success('Lead created');
    setShowAdd(false);
    setForm({ segment_slug: '', customer_name: '', phone: '', email: '', interested_in: '', source: 'field' });
    load();
  }

  const funnel = useMemo(() => {
    const f: Record<string, number> = {};
    leads.forEach(l => { f[l.stage] = (f[l.stage] || 0) + 1; });
    return f;
  }, [leads]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
        {hasPermission('create_leads') || hasPermission('manage_leads') ? (
          <button className={btnCls} onClick={() => setShowAdd(true)}>+ Add Lead</button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setStageFilter('')} className={`px-3 py-1 rounded-lg text-xs border ${stageFilter === '' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>All ({leads.length})</button>
        {stages.map(s => (
          <button key={s} onClick={() => setStageFilter(s)} className={`px-3 py-1 rounded-lg text-xs border ${stageFilter === s ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>
            {s.replace('_', ' ')} ({funnel[s] || 0})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {leads.map(l => {
          const seg = segments.find(s => s.slug === l.segment_slug);
          return (
            <div key={l.id} className={cardCls + ' cursor-pointer hover:border-slate-600'} onClick={() => { setOpenLead(l); loadRemarks(l.id); }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-white font-medium">{l.customer_name}</span>
                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (seg?.color || '#888') + '22', color: seg?.color }}>{seg?.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${stageColors[l.stage]}`}>{l.stage.replace('_', ' ')}</span>
                <span className="text-xs text-slate-500">{l.source}</span>
              </div>
              <p className="text-slate-500 text-xs mt-1">{l.phone} {l.interested_in && `• ${l.interested_in}`} • {new Date(l.created_at).toLocaleDateString()}</p>
            </div>
          );
        })}
        {leads.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No leads found.</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg">New Lead</h3>
            <select className={inputCls} value={form.segment_slug} onChange={e => setForm({ ...form, segment_slug: e.target.value })}>
              <option value="">Segment *</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <input className={inputCls} placeholder="Customer Name *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
            <input className={inputCls} placeholder="Phone *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className={inputCls} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={inputCls} placeholder="Interested In" value={form.interested_in} onChange={e => setForm({ ...form, interested_in: e.target.value })} />
            <select className={inputCls} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
              {['field', 'telecall', 'referral', 'whatsapp', 'website', 'other'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className={btnCls + ' w-full'} onClick={createLead}>Create Lead</button>
          </div>
        </div>
      )}

      {openLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenLead(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-3">
              <div>
                <h3 className="text-white text-lg font-semibold">{openLead.customer_name}</h3>
                <p className="text-slate-400 text-sm">{openLead.phone} {openLead.email && `• ${openLead.email}`}</p>
                {openLead.interested_in && <p className="text-slate-500 text-sm mt-1">Interested in: {openLead.interested_in}</p>}
              </div>
              <button className="text-slate-400 hover:text-white" onClick={() => setOpenLead(null)}>✕</button>
            </div>
            {hasPermission('manage_leads') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <select className={inputCls} value={openLead.stage} onChange={e => update(openLead.id, { stage: e.target.value as Lead['stage'] })}>
                  {stages.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select className={inputCls} value={openLead.assigned_to || ''} onChange={e => update(openLead.id, { assigned_to: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {staff.filter(s => s.segments.includes('all') || s.segments.includes(openLead.segment_slug)).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Add call remark / note…" value={newRemark} onChange={e => setNewRemark(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRemark()} />
                <button className={btnCls} onClick={addRemark}>Add</button>
              </div>
              {remarks.map(r => (
                <div key={r.id} className="text-sm">
                  <span className="text-slate-600 text-xs">{new Date(r.created_at).toLocaleString()} • {r.call_type}</span>
                  <p className="text-slate-300">{r.remark}</p>
                  {(r.address || r.photo_url) && (
                    <div className="flex gap-3 mt-0.5 text-xs">
                      {r.address && <span className="text-slate-500">📍 {r.address}</span>}
                      {r.photo_url && <button className="text-sky-400" onClick={() => viewLeadPhoto(r.photo_url as string)}>View Photo</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HRBoard({ segments }: { segments: Segment[] }) {
  const [segFilter, setSegFilter] = useState('');
  const [tab, setTab] = useState<'staff' | 'attendance' | 'leaves' | 'advances'>('staff');
  const [staff, setStaff] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  useEffect(() => {
    supabase.from('app_users').select('*').neq('role', 'super_admin').order('full_name').then(({ data }) => { if (data) setStaff(data); });
  }, []);

  useEffect(() => {
    if (tab === 'attendance') {
      supabase.from('attendance_records').select('*').eq('attendance_date', date)
        .then(({ data }) => { if (data) setAttendance(data); });
    }
    if (tab === 'leaves') {
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(200)
        .then(({ data }) => { if (data) setLeaves(data); });
    }
    if (tab === 'advances') {
      supabase.from('salary_advance_requests').select('*').order('created_at', { ascending: false }).limit(200)
        .then(({ data }) => { if (data) setAdvances(data); });
    }
  }, [tab, date]);

  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const inSeg = (s: any) => !segFilter || (s?.segments || []).includes(segFilter) || (s?.segments || []).includes('all');

  async function review(table: string, id: string, status: string, setter: (fn: any) => void) {
    const { error } = await supabase.from(table).update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Couldn't update request: ${error.message}`); return; }
    toast.success(`Request ${status}`);
    setter((prev: any[]) => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  async function viewSelfie(path: string) {
    const { data, error } = await supabase.storage.from('selfies').createSignedUrl(path, 300);
    if (error || !data) { toast.error("Couldn't load photo"); return; }
    window.open(data.signedUrl, '_blank');
  }

  return (
    <div>
      <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
      <div className="flex gap-2 mb-5">
        {(['staff', 'attendance', 'leaves', 'advances'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm border capitalize ${tab === t ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>{t}</button>
        ))}
      </div>

      {tab === 'staff' && (
        <div className="space-y-2">
          {staff.filter(inSeg).map(s => (
            <div key={s.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-2'}>
              <div>
                <p className="text-white font-medium">{s.full_name} <span className="text-slate-500 text-xs">({s.role})</span></p>
                <p className="text-slate-500 text-xs">{s.email} • {s.phone} • segments: {(s.segments || []).join(', ') || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${s.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{s.is_active ? 'active' : 'disabled'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'attendance' && (
        <div>
          <input type="date" className={inputCls + ' max-w-xs mb-4'} value={date} onChange={e => setDate(e.target.value)} />
          <div className="space-y-2">
            {staff.filter(inSeg).map(s => {
              const rec = attendance.find(a => a.staff_user_id === s.id);
              return (
                <div key={s.id} className={cardCls + ' flex items-center justify-between'}>
                  <p className="text-white text-sm">{s.full_name}</p>
                  {rec ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-400">
                        In: {rec.check_in_at ? new Date(rec.check_in_at).toLocaleTimeString() : '—'} •
                        Out: {rec.check_out_at ? new Date(rec.check_out_at).toLocaleTimeString() : '—'}
                        <span className="ml-2 text-emerald-300">{rec.status}</span>
                      </p>
                      {(rec.check_in_selfie_url || rec.check_out_selfie_url) && (
                        <button className="text-sky-400 text-xs" onClick={() => viewSelfie(rec.check_in_selfie_url || rec.check_out_selfie_url)}>Photo</button>
                      )}
                    </div>
                  ) : <span className="text-xs text-red-300">absent / no record</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="space-y-2">
          {leaves.filter(l => inSeg(staffById[l.staff_user_id])).map(l => (
            <div key={l.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-white text-sm font-medium">{staffById[l.staff_user_id]?.full_name || '—'} • {l.leave_type}</p>
                  <p className="text-slate-500 text-xs">{l.from_date} → {l.to_date} • {l.reason}</p>
                </div>
                {l.status === 'pending' && hasPermission('approve_leaves') ? (
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review('leave_requests', l.id, 'approved', setLeaves)}>Approve</button>
                    <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review('leave_requests', l.id, 'rejected', setLeaves)}>Reject</button>
                  </div>
                ) : <span className="text-xs text-slate-400">{l.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'advances' && (
        <div className="space-y-2">
          {advances.filter(a => inSeg(staffById[a.staff_user_id])).map(a => (
            <div key={a.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-white text-sm font-medium">{staffById[a.staff_user_id]?.full_name || '—'} • ₹{Number(a.amount).toLocaleString('en-IN')}</p>
                  <p className="text-slate-500 text-xs">{a.reason} • {new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                {a.status === 'pending' && hasPermission('approve_advances') ? (
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review('salary_advance_requests', a.id, 'approved', setAdvances)}>Approve</button>
                    <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review('salary_advance_requests', a.id, 'rejected', setAdvances)}>Reject</button>
                  </div>
                ) : <span className="text-xs text-slate-400">{a.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
