import { useEffect, useMemo, useState } from 'react';
import { MapPin, Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import type { Segment, SupportTicket, Lead } from '../../lib/database.types';
import { istDateStr } from '../../lib/dates';
import { normalizePhone } from '../../lib/phone';
import { AttendanceDetailsModal } from './payroll';
import { cachedQuery, invalidateQueryCache } from '../../lib/cachedQuery';

export const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 text-sm focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20 focus:outline-none transition-all placeholder-stone-500';
export const btnCls =
  'px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-orange-700/20 border border-orange-600/30 transition-all active:scale-[0.98]';
export const cardCls = 'p-5 rounded-2xl bg-white border border-stone-200/90 shadow-md shadow-stone-200/50 backdrop-blur-md';

export function SegmentTabs({
  segments, value, onChange, includeAll = true,
}: { segments: Segment[]; value: string; onChange: (s: string) => void; includeAll?: boolean }) {
  const { user, canAccessSegment } = useAuth();
  const visible = segments.filter(s => canAccessSegment(s.slug) && !s.slug.toLowerCase().includes('cctv') && !s.name.toLowerCase().includes('cctv'));
  const showAll = includeAll && (user?.role === 'super_admin' || user?.segments.includes('all'));
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {showAll && (
        <button onClick={() => onChange('')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${value === '' ? 'bg-orange-700 text-white border-orange-200 shadow-md shadow-orange-700/20' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'}`}>
          All Segments
        </button>
      )}
      {visible.map(s => (
        <button key={s.slug} onClick={() => onChange(s.slug)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${value === s.slug ? 'text-stone-900 border-orange-200 shadow-md' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'} ${s.active === false ? 'opacity-70' : ''}`}
          style={value === s.slug ? { backgroundColor: s.color || '#1d4ed8' } : {}}
          title={s.active === false ? 'Retired — hidden from the website, existing work still manageable' : undefined}>
          {s.name}{s.active === false && <span className="ml-1.5 text-[10px] opacity-80">(retired)</span>}
        </button>
      ))}
    </div>
  );
}

const ticketStatusColors: Record<string, string> = {
  open: 'bg-teal-100 text-teal-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting_customer: 'bg-purple-100 text-purple-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-stone-100 text-stone-700',
};

export function TicketsBoard({ segments, focusId }: { segments: Segment[]; focusId?: string }) {
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
    const cacheKey = `tickets:${segFilter}:${statusFilter}`;
    try {
      const data = await cachedQuery(cacheKey, async () => {
        let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300);
        if (segFilter) q = q.eq('segment_slug', segFilter);
        if (statusFilter) q = q.eq('status', statusFilter);
        const { data, error } = await q;
        if (error) throw error;
        return data as SupportTicket[];
      });
      if (data) setTickets(data);
    } catch (err: any) {
      toast.error(`Couldn't load tickets: ${err.message}`);
    }
  }

  useEffect(() => { load(); }, [segFilter, statusFilter]);
  useEffect(() => {
    if (!focusId) return;
    const t = tickets.find(x => x.id === focusId);
    if (t) { setOpenTicket(t); loadReplies(t.id); }
    else {
      supabase.from('support_tickets').select('*').eq('id', focusId).maybeSingle()
        .then(({ data }) => { if (data) { setOpenTicket(data as SupportTicket); loadReplies(data.id); } });
    }
  }, [focusId, tickets]);
  useEffect(() => {
    cachedQuery('staff_users_summary', async () => {
      const { data, error } = await supabase.from('app_users').select('id, full_name, segments').eq('is_active', true).neq('role', 'super_admin');
      if (error) throw error;
      return data;
    }).then(data => { if (data) setStaff(data as any); }).catch(() => {});
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
            className={`px-3 py-1 rounded-lg text-xs font-medium border ${statusFilter === s ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>
            {s === '' ? `All (${tickets.length})` : `${s.replace('_', ' ')} (${counts[s] || 0})`}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {tickets.map(t => {
          const seg = segments.find(s => s.slug === t.segment_slug);
          return (
            <div key={t.id} className={cardCls + ' cursor-pointer hover:border-stone-300'}
              onClick={() => { setOpenTicket(t); loadReplies(t.id); }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-teal-700 text-sm">{t.ticket_no}</span>
                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (seg?.color || '#888') + '22', color: seg?.color }}>{seg?.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${ticketStatusColors[t.status]}`}>{t.status.replace('_', ' ')}</span>
                <span className="text-xs text-stone-700">{t.ticket_type}</span>
                <span className={`text-xs ${t.priority === 'urgent' ? 'text-red-700' : t.priority === 'high' ? 'text-amber-700' : 'text-stone-700'}`}>{t.priority}</span>
              </div>
              <p className="text-stone-900 font-medium mt-1.5">{t.subject}</p>
              <p className="text-stone-700 text-xs mt-0.5">{t.customer_name} • {t.customer_phone} • {new Date(t.created_at).toLocaleString()}</p>
            </div>
          );
        })}
        {tickets.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No tickets found.</p>}
      </div>

      {openTicket && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenTicket(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-mono text-teal-700 text-sm">{openTicket.ticket_no}</p>
                <h3 className="text-stone-900 text-lg font-semibold">{openTicket.subject}</h3>
                <p className="text-stone-700 text-sm">{openTicket.customer_name} • {openTicket.customer_phone} {openTicket.customer_email && `• ${openTicket.customer_email}`}</p>
              </div>
              <button className="text-stone-700 hover:text-stone-900" onClick={() => setOpenTicket(null)}>✕</button>
            </div>
            <p className="text-stone-700 text-sm mb-4 whitespace-pre-wrap">{openTicket.description}</p>
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
            <div className="border-t border-stone-800 pt-4 space-y-3">
              {replies.map(r => (
                <div key={r.id} className="text-sm">
                  <span className="text-teal-700 font-medium">{r.author_name}</span>
                  <span className="text-stone-700 text-xs ml-2">{new Date(r.created_at).toLocaleString()}</span>
                  <p className="text-stone-700 mt-0.5">{r.message}</p>
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
  new: 'bg-teal-100 text-teal-700', contacted: 'bg-indigo-100 text-indigo-700',
  qualified: 'bg-purple-100 text-purple-700', quoted: 'bg-amber-100 text-amber-700',
  won: 'bg-emerald-100 text-emerald-700', lost: 'bg-red-100 text-red-700',
  not_answered: 'bg-stone-100 text-stone-700',
};

export function LeadsBoard({ segments, focusLeadId }: { segments: Segment[]; focusLeadId?: string }) {
  const [segFilter, setSegFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string; segments: string[] }[]>([]);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [remarks, setRemarks] = useState<{ id: string; remark: string; call_type: string; created_at: string; address?: string; photo_url?: string; author_name?: string; author_staff_code?: string }[]>([]);
  const [leadPhotoUrls, setLeadPhotoUrls] = useState<Record<string, string>>({});
  const [previewLeadPhoto, setPreviewLeadPhoto] = useState<string | null>(null);
  const [newRemark, setNewRemark] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ segment_slug: '', customer_name: '', phone: '', email: '', interested_in: '', source: 'field' });
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  async function load() {
    const cacheKey = `leads:${segFilter}:${stageFilter}`;
    try {
      const data = await cachedQuery(cacheKey, async () => {
        let q = supabase.from('marketing_leads').select('*').order('created_at', { ascending: false }).limit(400);
        if (segFilter) q = q.eq('segment_slug', segFilter);
        if (stageFilter) q = q.eq('stage', stageFilter);
        const { data, error } = await q;
        if (error) throw error;
        return data as Lead[];
      });
      if (data) setLeads(data);
    } catch (err: any) {
      toast.error(`Couldn't load leads: ${err.message}`);
    }
  }
  useEffect(() => { load(); }, [segFilter, stageFilter]);
  useEffect(() => {
    if (!focusLeadId) return;
    const l = leads.find(x => x.id === focusLeadId);
    if (l) { setOpenLead(l); loadRemarks(l.id); }
    else {
      supabase.from('marketing_leads').select('*').eq('id', focusLeadId).maybeSingle()
        .then(({ data }) => { if (data) { setOpenLead(data as Lead); loadRemarks(data.id); } });
    }
  }, [focusLeadId, leads]);
  useEffect(() => {
    cachedQuery('staff_users_summary', async () => {
      const { data, error } = await supabase.from('app_users').select('id, full_name, segments').eq('is_active', true).neq('role', 'super_admin');
      if (error) throw error;
      return data;
    }).then(data => { if (data) setStaff(data as any); }).catch(() => {});
  }, []);

  async function update(id: string, patch: Partial<Lead>) {
    const { error } = await supabase.from('marketing_leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success('Lead updated');
    load();
    if (openLead?.id === id) setOpenLead({ ...openLead, ...patch } as Lead);
  }

  async function loadRemarks(id: string) {
    const { data } = await supabase.from('lead_remarks').select('*').eq('lead_id', id).order('occurred_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (!data) return;
    setRemarks(data as any);
    // lead-photos is a private bucket — resolve real signed URLs in bulk so
    // field-visit proof photos render as thumbnails in the history instead
    // of needing a click to open an external link.
    const paths = Array.from(new Set(data.map((r: any) => r.photo_url).filter(Boolean))) as string[];
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from('lead-photos').createSignedUrls(paths, 3600);
      if (signed) {
        const map: Record<string, string> = {};
        signed.forEach(s => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
        setLeadPhotoUrls(map);
      }
    }
  }

  async function addRemark(asReview = false) {
    if (!newRemark.trim() || !openLead || !user) return;
    const { error } = await supabase.from('lead_remarks').insert({
      lead_id: openLead.id, user_id: user.id, remark: newRemark,
      call_type: asReview ? 'review' : 'note',
    });
    if (error) { toast.error(`Couldn't add remark: ${error.message}`); return; }
    setNewRemark('');
    toast.success(
      asReview && openLead.assigned_to && openLead.assigned_to !== user.id
        ? 'Review sent — the lead owner has been notified'
        : 'Remark added'
    );
    loadRemarks(openLead.id);
  }

  const [dupWarning, setDupWarning] = useState<any[] | null>(null);

  async function createLead() {
    if (!form.segment_slug || !form.customer_name || !form.phone || !user) { toast.error('Segment, name and phone are required'); return; }
    const phone = normalizePhone(form.phone);

    if (!dupWarning) {
      const { data: dupes } = await supabase.rpc('find_duplicate_leads', { _phone: phone, _segment_slug: form.segment_slug });
      if (dupes && dupes.length > 0) { setDupWarning(dupes); return; }
      const { data: exists } = await supabase.rpc('lead_phone_exists', { _phone: phone, _segment_slug: form.segment_slug });
      if (exists) { setDupWarning([{ id: 'exists', customer_name: 'An active lead with this number already exists', stage: '', assignee_name: '' }]); return; }
    }

    const { error } = await supabase.from('marketing_leads').insert({ ...form, phone, created_by: user.id });
    if (error) { toast.error(`Couldn't create lead: ${error.message}`); return; }
    toast.success('Lead created');
    setShowAdd(false);
    setDupWarning(null);
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
          <button className={btnCls} onClick={() => { setDupWarning(null); setShowAdd(true); }}>+ Add Lead</button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setStageFilter('')} className={`px-3 py-1 rounded-lg text-xs border ${stageFilter === '' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>All ({leads.length})</button>
        {stages.map(s => (
          <button key={s} onClick={() => setStageFilter(s)} className={`px-3 py-1 rounded-lg text-xs border ${stageFilter === s ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>
            {s.replace('_', ' ')} ({funnel[s] || 0})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {leads.map(l => {
          const seg = segments.find(s => s.slug === l.segment_slug);
          return (
            <div key={l.id} className={cardCls + ' cursor-pointer hover:border-stone-300'} onClick={() => { setOpenLead(l); loadRemarks(l.id); }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-stone-900 font-medium">{l.customer_name}</span>
                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (seg?.color || '#888') + '22', color: seg?.color }}>{seg?.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${stageColors[l.stage]}`}>{l.stage.replace('_', ' ')}</span>
                <span className="text-xs text-stone-700">{l.source}</span>
              </div>
              <p className="text-stone-700 text-xs mt-1">
                {l.priority === 'high' && <span className="text-red-700 font-medium">● High </span>}
                {l.priority === 'low' && <span className="text-stone-700">● Low </span>}
                {l.phone} {l.interested_in && `• ${l.interested_in}`} • {new Date(l.created_at).toLocaleDateString()} {l.stage === 'won' && l.invoice_amount && <span className="text-emerald-700">• ₹{Number(l.invoice_amount).toLocaleString('en-IN')}</span>}</p>
            </div>
          );
        })}
        {leads.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No leads found.</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold text-lg">New Lead</h3>
            <select className={inputCls} value={form.segment_slug} onChange={e => setForm({ ...form, segment_slug: e.target.value })}>
              <option value="">Segment *</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <input className={inputCls} placeholder="Customer Name *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
            <input className={inputCls} placeholder="Phone *" value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setDupWarning(null); }} />
            <input className={inputCls} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={inputCls} placeholder="Interested In" value={form.interested_in} onChange={e => setForm({ ...form, interested_in: e.target.value })} />
            <select className={inputCls} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
              {['field', 'telecall', 'referral', 'whatsapp', 'website', 'other'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {dupWarning && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-600/40 text-xs">
                <p className="text-amber-700 font-medium mb-1">⚠ This phone number already exists:</p>
                {dupWarning.map((d: any) => (
                  <p key={d.id} className="text-amber-200/80">{d.customer_name} — {d.stage} {d.assignee_name ? `• with ${d.assignee_name}` : '• unassigned'}</p>
                ))}
                <p className="text-stone-700 mt-1">Click "Add Anyway" if this is genuinely a new/different inquiry.</p>
              </div>
            )}
            <button className={btnCls + ' w-full'} onClick={createLead}>{dupWarning ? 'Add Anyway' : 'Create Lead'}</button>
          </div>
        </div>
      )}

      {openLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenLead(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-3">
              <div>
                <h3 className="text-stone-900 text-lg font-semibold">{openLead.customer_name}</h3>
                <p className="text-stone-700 text-sm">{openLead.phone} {openLead.email && `• ${openLead.email}`}</p>
                {openLead.interested_in && <p className="text-stone-700 text-sm mt-1">Interested in: {openLead.interested_in}</p>}
                <p className="text-stone-700 text-xs mt-1.5">
                  Created {new Date(openLead.created_at).toLocaleString()} • source: {openLead.source}
                </p>
              </div>
              <button className="text-stone-700 hover:text-stone-900" onClick={() => setOpenLead(null)}>✕</button>
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
                {openLead.stage === 'won' && (
                  <>
                    <input className={inputCls} placeholder="Invoice Number" defaultValue={openLead.invoice_no || ''} onBlur={e => update(openLead.id, { invoice_no: e.target.value || null })} />
                    <select className={inputCls} defaultValue={openLead.priority || 'medium'}
                      onChange={e => update(openLead.id, { priority: e.target.value as 'high' | 'medium' | 'low' })}>
                      <option value="high">High priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="low">Low priority</option>
                    </select>
                    <input className={inputCls} placeholder="Alternate phone" defaultValue={openLead.alternate_phone || ''}
                      onBlur={e => update(openLead.id, { alternate_phone: normalizePhone(e.target.value) })} />
                    <input className={inputCls} type="number" placeholder="Invoice Amount (₹)" defaultValue={openLead.invoice_amount || ''} onBlur={e => update(openLead.id, { invoice_amount: e.target.value ? Number(e.target.value) : null })} />
                  </>
                )}
              </div>
            )}
            <div className="border-t border-stone-800 pt-3 space-y-2">
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Add call remark / note…" value={newRemark} onChange={e => setNewRemark(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRemark(false)} />
                <button className={btnCls} onClick={() => addRemark(false)}>Add</button>
                <button
                  className="px-3 py-2 rounded-lg border border-purple-600 text-purple-700 text-sm whitespace-nowrap"
                  title="Saves as a review and notifies whoever owns this lead"
                  onClick={() => addRemark(true)}>Send as Review</button>
              </div>
              <p className="text-stone-700 text-xs font-medium mb-1">Full History</p>
              {remarks.map(r => {
                const isSystem = r.remark.startsWith('Stage changed:') || r.remark.startsWith('Reassigned:');
                return (
                  <div key={r.id} className={`text-sm ${isSystem ? 'pl-2 border-l-2 border-stone-800' : ''}`}>
                    <span className="text-stone-700 text-xs">
                      {new Date(r.created_at).toLocaleString()} • {r.author_name || 'System'}{r.author_staff_code ? ` (${r.author_staff_code})` : ''}{!isSystem && ` • ${r.call_type}`}
                    </span>
                    <p className={isSystem ? 'text-stone-700 text-xs italic' : 'text-stone-700'}>{r.remark}</p>
                    {(r.address || r.photo_url) && (
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        {r.address && <span className="text-stone-700">📍 {r.address}</span>}
                        {r.photo_url && (
                          leadPhotoUrls[r.photo_url] ? (
                            <button onClick={() => setPreviewLeadPhoto(leadPhotoUrls[r.photo_url as string])} className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-stone-200 shadow-sm">
                              <img src={leadPhotoUrls[r.photo_url]} alt="Visit proof" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="shrink-0 w-12 h-12 rounded-lg bg-stone-200 animate-pulse" />
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {previewLeadPhoto && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewLeadPhoto(null)}>
          <button onClick={() => setPreviewLeadPhoto(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
            <X className="w-6 h-6" />
          </button>
          <img src={previewLeadPhoto} alt="Visit proof preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export function HRBoard({ segments }: { segments: Segment[] }) {
  const [segFilter, setSegFilter] = useState('');
  const [tab, setTab] = useState<'staff' | 'attendance' | 'leaves' | 'advances'>('staff');
  const [staff, setStaff] = useState<any[]>([]);
  // Track whether the first fetch has completed for each tab, so the UI can
  // distinguish "still loading" from "loaded but empty" — a blank screen with
  // no state feedback used to leave users unsure whether the app was working.
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [leavesLoaded, setLeavesLoaded] = useState(false);
  const [advancesLoaded, setAdvancesLoaded] = useState(false);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [date, setDate] = useState(istDateStr());
  const [selectedStaffModal, setSelectedStaffModal] = useState<{ id: string; name: string } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  useEffect(() => {
    setStaffLoaded(false);
    cachedQuery('hr_app_users', async () => {
      const { data, error } = await supabase.from('app_users').select('*').neq('role', 'super_admin').order('full_name');
      if (error) throw error;
      return data;
    }).then(data => {
      if (data) setStaff(data);
      setStaffLoaded(true);
    }).catch(() => setStaffLoaded(true));
  }, []);

  useEffect(() => {
    if (tab === 'attendance') {
      setAttendanceLoaded(false);
      cachedQuery(`attendance:${date}`, async () => {
        const { data, error } = await supabase.from('attendance_records').select('*').eq('attendance_date', date);
        if (error) throw error;
        return data;
      }).then(async (data) => {
        if (data) setAttendance(data);
        setAttendanceLoaded(true);
        if (!data) return;
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
      }).catch(() => setAttendanceLoaded(true));
    }
    if (tab === 'leaves') {
      setLeavesLoaded(false);
      cachedQuery('leave_requests', async () => {
        const { data, error } = await supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return data;
      }).then(data => { if (data) setLeaves(data); setLeavesLoaded(true); }).catch(() => setLeavesLoaded(true));
    }
    if (tab === 'advances') {
      setAdvancesLoaded(false);
      cachedQuery('salary_advance_requests', async () => {
        const { data, error } = await supabase.from('salary_advance_requests').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return data;
      }).then(data => { if (data) setAdvances(data); setAdvancesLoaded(true); }).catch(() => setAdvancesLoaded(true));
    }
  }, [tab, date]);

  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const inSeg = (s: any) => !segFilter || (s?.segments || []).includes(segFilter) || (s?.segments || []).includes('all');

  const [leaveBalances, setLeaveBalances] = useState<Record<string, any[]>>({});

  // Pull balances for everyone with a pending leave request, so the approver
  // can see what's left before deciding.
  useEffect(() => {
    const ids = Array.from(new Set(leaves.filter(l => l.status === 'pending').map(l => l.staff_user_id)));
    ids.forEach(async id => {
      if (leaveBalances[id]) return;
      const { data } = await supabase.rpc('get_leave_balances', { _staff_user_id: id });
      if (data) setLeaveBalances(prev => ({ ...prev, [id]: data }));
    });
  }, [leaves]);

  async function review(table: string, id: string, status: string, setter: (fn: any) => void, override = false) {
    const patch: any = { status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() };
    if (override) patch.override_balance = true;
    const { error } = await supabase.from(table).update(patch).eq('id', id);
    if (error) {
      // The balance guard raises a descriptive exception — offer the override
      // rather than leaving the approver stuck.
      if (table === 'leave_requests' && /entitlement/i.test(error.message)) {
        if (confirm(`${error.message}\n\nApprove anyway (override the balance)?`)) {
          return review(table, id, status, setter, true);
        }
        return;
      }
      toast.error(`Couldn't update request: ${error.message}`);
      return;
    }
    toast.success(`Request ${status}${override ? ' (balance overridden)' : ''}`);
    setter((prev: any[]) => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  // Only show tabs this person can actually act on — a manager without
  // approve_advances would otherwise see an Advances tab that is always empty.
  const visibleTabs = ([
    { id: 'staff' as const, show: hasPermission('view_staff') },
    { id: 'attendance' as const, show: hasPermission('view_attendance') },
    { id: 'leaves' as const, show: hasPermission('approve_leaves') || hasPermission('view_staff') },
    { id: 'advances' as const, show: hasPermission('approve_advances') || hasPermission('view_payroll') },
  ]).filter(t => t.show);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === tab)) setTab(visibleTabs[0].id);
  }, [visibleTabs.length]);

  return (
    <div>
      <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
      <div className="flex gap-2 mb-5">
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border capitalize ${tab === t.id ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>{t.id}</button>
        ))}
      </div>

      {tab === 'staff' && (
        <div className="space-y-2">
          {!staffLoaded ? (
            <div className="text-center py-10 text-stone-500 text-sm">Loading staff…</div>
          ) : staff.filter(inSeg).length === 0 ? (
            <div className="text-center py-10 text-stone-500 text-sm">
              {staff.length === 0
                ? 'No staff onboarded yet. Use "+ Onboard Employee" above to add your first team member.'
                : 'No staff match the current segment filter.'}
            </div>
          ) : staff.filter(inSeg).map(s => (
            <div key={s.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-2'}>
              <div>
                <p className="text-stone-900 font-medium">{s.full_name} <span className="text-stone-700 text-xs">({s.role})</span></p>
                <p className="text-stone-700 text-xs">{s.email} • {s.phone} • segments: {(s.segments || []).join(', ') || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.is_active ? 'active' : 'disabled'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200">
            <div>
              <p className="text-stone-900 font-semibold text-sm">Daily Attendance Logs</p>
              <p className="text-stone-500 text-xs">Select date to inspect check-in times, locations, and selfie photos</p>
            </div>
            <input type="date" className={inputCls + ' max-w-xs'} value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="space-y-3">
            {!staffLoaded || !attendanceLoaded ? (
              <div className="text-center py-10 text-stone-500 text-sm">Loading attendance…</div>
            ) : staff.filter(inSeg).length === 0 ? (
              <div className="text-center py-10 text-stone-500 text-sm">
                {staff.length === 0
                  ? 'No staff onboarded yet — no attendance to show.'
                  : 'No staff match the current segment filter.'}
              </div>
            ) : staff.filter(inSeg).map(s => {
              const rec = attendance.find(a => a.staff_user_id === s.id);
              return (
                <div key={s.id} className={cardCls + ' space-y-3'}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                    <div>
                      <span className="text-stone-900 font-bold text-sm mr-2">{s.full_name}</span>
                      <span className="text-stone-500 text-xs">({s.role.replace('_', ' ')})</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {rec ? (
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${rec.status === 'present' ? 'bg-emerald-100 text-emerald-700' : rec.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {rec.status.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">ABSENT / NO PUNCH</span>
                      )}
                      
                      <button 
                        onClick={() => setSelectedStaffModal({ id: s.id, name: s.full_name })}
                        className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors shadow-sm inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-teal-600" /> Full 30-Day History
                      </button>
                    </div>
                  </div>

                  {rec ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Check in */}
                      <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-100 flex items-center gap-3">
                        {rec.check_in_selfie_url && (
                          photoUrls[rec.check_in_selfie_url] ? (
                            <button onClick={() => setPreviewImage(photoUrls[rec.check_in_selfie_url])} className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-stone-200 shadow-sm">
                              <img src={photoUrls[rec.check_in_selfie_url]} alt="Check-in selfie" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="shrink-0 w-14 h-14 rounded-lg bg-stone-200 animate-pulse" />
                          )
                        )}
                        <div className="flex-1 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-stone-500 font-medium">Check In</p>
                            <p className="text-stone-900 font-semibold text-sm">
                              {rec.check_in_at ? new Date(rec.check_in_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                            </p>
                            {rec.is_late && <p className="text-amber-700 text-[11px] font-medium">{rec.minutes_late}m late</p>}
                          </div>
                          {rec.check_in_lat && rec.check_in_lng && (
                            <a
                              href={`https://maps.google.com/?q=${rec.check_in_lat},${rec.check_in_lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 border border-teal-100 shrink-0"
                            >
                              <MapPin className="w-3 h-3" /> Map
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Check out */}
                      <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-100 flex items-center gap-3">
                        {rec.check_out_selfie_url && (
                          photoUrls[rec.check_out_selfie_url] ? (
                            <button onClick={() => setPreviewImage(photoUrls[rec.check_out_selfie_url])} className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-stone-200 shadow-sm">
                              <img src={photoUrls[rec.check_out_selfie_url]} alt="Check-out selfie" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="shrink-0 w-14 h-14 rounded-lg bg-stone-200 animate-pulse" />
                          )
                        )}
                        <div className="flex-1 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-stone-500 font-medium">Check Out</p>
                            <p className="text-stone-900 font-semibold text-sm">
                              {rec.check_out_at ? new Date(rec.check_out_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                            </p>
                            {rec.work_mode && <p className="text-stone-600 text-[11px] capitalize font-medium">{rec.work_mode.replace('_', ' ')}</p>}
                          </div>
                          {rec.check_out_lat && rec.check_out_lng && (
                            <a
                              href={`https://maps.google.com/?q=${rec.check_out_lat},${rec.check_out_lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 border border-teal-100 shrink-0"
                            >
                              <MapPin className="w-3 h-3" /> Map
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-stone-500 text-xs italic">No check-in recorded for this date.</p>
                  )}
                </div>
              );
            })}
          </div>

          {selectedStaffModal && (
            <AttendanceDetailsModal
              staffUserId={selectedStaffModal.id}
              staffName={selectedStaffModal.name}
              onClose={() => setSelectedStaffModal(null)}
            />
          )}

          {previewImage && (
            <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
              <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                <X className="w-6 h-6" />
              </button>
              <img src={previewImage} alt="Selfie preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
            </div>
          )}
        </div>
      )}

      {tab === 'leaves' && (
        <div className="space-y-2">
          {!leavesLoaded ? (
            <div className="text-center py-10 text-stone-500 text-sm">Loading leave requests…</div>
          ) : leaves.filter(l => inSeg(staffById[l.staff_user_id])).length === 0 ? (
            <div className="text-center py-10 text-stone-500 text-sm">
              {leaves.length === 0 ? 'No leave requests yet.' : 'No leave requests match the current filter.'}
            </div>
          ) : leaves.filter(l => inSeg(staffById[l.staff_user_id])).map(l => (
            <div key={l.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-stone-900 text-sm font-medium">{staffById[l.staff_user_id]?.full_name || '—'} • {l.leave_type}</p>
                  <p className="text-stone-700 text-xs">{l.from_date} → {l.to_date} • {l.reason}</p>
                  {l.status === 'pending' && (() => {
                    const b = (leaveBalances[l.staff_user_id] || []).find((x: any) => x.leave_type === l.leave_type);
                    if (!b) return null;
                    if (b.is_unlimited) return <p className="text-stone-700 text-xs mt-0.5">unpaid leave — no balance limit</p>;
                    const rem = Number(b.remaining);
                    return (
                      <p className={`text-xs mt-0.5 ${rem <= 0 ? 'text-red-700' : 'text-stone-700'}`}>
                        Balance: {rem} of {Number(b.entitled)} {l.leave_type} days left ({Number(b.used)} used)
                      </p>
                    );
                  })()}
                </div>
                {l.status === 'pending' && hasPermission('approve_leaves') ? (
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review('leave_requests', l.id, 'approved', setLeaves)}>Approve</button>
                    <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review('leave_requests', l.id, 'rejected', setLeaves)}>Reject</button>
                  </div>
                ) : <span className="text-xs text-stone-700">{l.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'advances' && (
        <div className="space-y-2">
          {!advancesLoaded ? (
            <div className="text-center py-10 text-stone-500 text-sm">Loading salary advances…</div>
          ) : advances.filter(a => inSeg(staffById[a.staff_user_id])).length === 0 ? (
            <div className="text-center py-10 text-stone-500 text-sm">
              {advances.length === 0 ? 'No salary advance requests yet.' : 'No advances match the current filter.'}
            </div>
          ) : advances.filter(a => inSeg(staffById[a.staff_user_id])).map(a => (
            <div key={a.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-stone-900 text-sm font-medium">{staffById[a.staff_user_id]?.full_name || '—'} • ₹{Number(a.amount).toLocaleString('en-IN')}</p>
                  <p className="text-stone-700 text-xs">{a.reason} • {new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                {a.status === 'pending' && hasPermission('approve_advances') ? (
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review('salary_advance_requests', a.id, 'approved', setAdvances)}>Approve</button>
                    <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review('salary_advance_requests', a.id, 'rejected', setAdvances)}>Reject</button>
                  </div>
                ) : <span className="text-xs text-stone-700">{a.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
