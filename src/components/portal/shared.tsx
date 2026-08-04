import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import type { Segment, SupportTicket, Lead, Database } from '../../lib/database.types';

type LeaveRequest = Database['public']['Tables']['leave_requests']['Row'];
type AttendanceRow = Database['public']['Tables']['attendance_records']['Row'];
type SalaryAdvance = Database['public']['Tables']['salary_advance_requests']['Row'];
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

// See STAGE_LABELS above — same rationale: DB values stay, rendered
// vocabulary is friendlier. `waiting_customer` was reading as an enum name
// to support agents; `in_progress` looked like a system field.
export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'Working on it',
  waiting_customer: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const ticketStatusLabel = (s: string) => TICKET_STATUS_LABELS[s] ?? s.replace('_', ' ');

// SLA targets copied from the seed in ticket_sla_policies (migration
// 20260726000002). Duplicating them client-side lets us render the
// "overdue" badge without a JOIN on every ticket render — the policies
// change rarely and are not user-editable per row. If they ever drift,
// the source of truth remains the DB; this map is a friendly local cache
// that gets replaced with real values on the first successful fetch.
const SLA_RESOLUTION_HOURS: Record<string, number> = {
  urgent: 8, high: 24, medium: 72, low: 168,
};

// Returns { overdue: true, label: '3h overdue' } or { overdue: false,
// label: '2h left' } for a ticket, based on age vs its priority's SLA.
// Closed/resolved tickets return null (nothing to render).
function ticketSlaState(t: SupportTicket): { overdue: boolean; label: string } | null {
  if (t.status === 'resolved' || t.status === 'closed') return null;
  const hours = SLA_RESOLUTION_HOURS[t.priority] ?? 72;
  const openedAt = t.created_at ? new Date(t.created_at ?? '').getTime() : Date.now();
  const targetAt = openedAt + hours * 3600 * 1000;
  const diffMs = targetAt - Date.now();
  const overdue = diffMs < 0;
  const absHours = Math.abs(diffMs) / 3600 / 1000;
  const fmt = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}m`;
  return overdue
    ? { overdue: true, label: `${fmt(absHours)} overdue` }
    : { overdue: false, label: `${fmt(absHours)} left` };
}

export function TicketsBoard({ segments, focusId }: { segments: Segment[]; focusId?: string }) {
  const [segFilter, setSegFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // See STAGE_LABELS above / leads Fix A — staff without full segment
  // visibility land on their own tickets by default. Support agents kept
  // saying "I opened tickets and I don't know which ones I'm working on."
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string; segments: string[] }[]>([]);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<{ id: string; author_name: string; message: string; created_at: string }[]>([]);
  const [reply, setReply] = useState('');
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  // Support agents (no manage_tickets, no assign_tickets) default to My Tickets.
  useEffect(() => {
    if (user && !hasPermission('manage_tickets') && !hasPermission('assign_tickets')) {
      setAssignFilter('mine');
    }
  }, [user, hasPermission]);

  const load = useCallback(async () => {
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
    } catch (err) {
      toast.error(`Couldn't load tickets: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }, [segFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
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
    const { error } = await supabase.from('support_tickets').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success('Ticket updated');
    load();
    if (openTicket?.id === id) setOpenTicket({ ...openTicket, ...patch } as SupportTicket);
  }

  async function sendReply() {
    if (!reply.trim() || !openTicket || !user) return;
    const { error } = await supabase.from('ticket_replies').insert({
      ticket_id: openTicket.id, author_user_id: user.id, author_name: user.full_name, message: reply, is_staff: true,
    } as never);
    if (error) { toast.error(`Couldn't send reply: ${error.message}`); return; }
    setReply('');
    loadReplies(openTicket.id);
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (assignFilter === 'mine' && t.assigned_to !== user?.id) return false;
      if (assignFilter === 'unassigned' && t.assigned_to) return false;
      return true;
    });
  }, [tickets, assignFilter, user?.id]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    filteredTickets.forEach(t => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [filteredTickets]);

  return (
    <div>
      <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
      {/* Assignment filter — see comment on the assignFilter useState above.
          Support agents default to Mine; managers see All. */}
      <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl mb-3 w-fit">
        <button onClick={() => setAssignFilter('mine')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'mine' ? 'bg-teal-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
          My Tickets ({tickets.filter(t => t.assigned_to === user?.id).length})
        </button>
        <button onClick={() => setAssignFilter('all')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'all' ? 'bg-orange-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
          All ({tickets.length})
        </button>
        <button onClick={() => setAssignFilter('unassigned')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'unassigned' ? 'bg-amber-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
          Unassigned ({tickets.filter(t => !t.assigned_to).length})
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {['', 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border ${statusFilter === s ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>
            {s === '' ? `All (${filteredTickets.length})` : `${ticketStatusLabel(s)} (${counts[s] || 0})`}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredTickets.map(t => {
          const seg = segments.find(s => s.slug === t.segment_slug);
          const sla = ticketSlaState(t);
          const canWork = hasPermission('manage_tickets');
          const isMine = t.assigned_to === user?.id;
          const isOpen = !['resolved', 'closed'].includes(t.status);
          const assignedName = staff.find(x => x.id === t.assigned_to)?.full_name;
          return (
            <div key={t.id} className={cardCls + ' hover:border-stone-300'}>
              <div className="flex flex-wrap items-center gap-3 cursor-pointer"
                onClick={() => { setOpenTicket(t); loadReplies(t.id); }}>
                <span className="font-mono text-teal-700 text-sm">{t.ticket_no}</span>
                <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (seg?.color || '#888') + '22', color: seg?.color ?? undefined }}>{seg?.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${ticketStatusColors[t.status]}`}>{ticketStatusLabel(t.status)}</span>
                <span className="text-xs text-stone-700">{t.ticket_type}</span>
                <span className={`text-xs ${t.priority === 'urgent' ? 'text-red-700 font-bold' : t.priority === 'high' ? 'text-amber-700 font-semibold' : 'text-stone-700'}`}>{t.priority}</span>
                {/* SLA badge — red pill when overdue, amber when < 25% of window left,
                    silent otherwise so we don't distract on healthy tickets. */}
                {sla && sla.overdue && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                    ⏰ {sla.label}
                  </span>
                )}
                {sla && !sla.overdue && sla.label.endsWith('h left') && parseInt(sla.label) < 4 && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    ⏳ {sla.label}
                  </span>
                )}
                {assignedName ? (
                  <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold flex items-center gap-1">
                    👤 {assignedName}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-900 border border-amber-200 font-medium">
                    📥 Unassigned
                  </span>
                )}
              </div>
              <p className="text-stone-900 font-medium mt-1.5 cursor-pointer"
                onClick={() => { setOpenTicket(t); loadReplies(t.id); }}>{t.subject}</p>
              <p className="text-stone-700 text-xs mt-0.5">{t.customer_name} • {t.customer_phone} • {new Date(t.created_at ?? '').toLocaleString()}</p>
              {/* Primary actions — one-click on the card, no drilling into
                  the modal. Only shown for staff who can actually change the
                  ticket. Set of buttons depends on current state:
                    - unassigned & I can work it → Take This
                    - already mine, still open → Mark Working / Waiting / Resolved
                    - assigned to someone else → nothing (open the modal to see) */}
              {canWork && isOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {!t.assigned_to && user && (
                    <button onClick={(e) => { e.stopPropagation(); update(t.id, { assigned_to: user.id, status: 'in_progress' }); }}
                      className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-sm">
                      ✋ Take This
                    </button>
                  )}
                  {t.assigned_to && !isMine && hasPermission('assign_tickets') && user && (
                    <button onClick={(e) => { e.stopPropagation(); update(t.id, { assigned_to: user.id }); }}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-lg">
                      Take Over
                    </button>
                  )}
                  {isMine && t.status === 'open' && (
                    <button onClick={(e) => { e.stopPropagation(); update(t.id, { status: 'in_progress' }); }}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold rounded-lg">
                      🔧 Start Working
                    </button>
                  )}
                  {isMine && t.status === 'in_progress' && (
                    <button onClick={(e) => { e.stopPropagation(); update(t.id, { status: 'waiting_customer' }); }}
                      className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-semibold rounded-lg">
                      💬 Waiting on Customer
                    </button>
                  )}
                  {isMine && ['in_progress', 'waiting_customer', 'open'].includes(t.status) && (
                    <button onClick={(e) => { e.stopPropagation(); update(t.id, { status: 'resolved' }); }}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-sm">
                      ✅ Mark Resolved
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredTickets.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No tickets in this view.</p>}
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
                  {['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].map(s => <option key={s} value={s}>{ticketStatusLabel(s)}</option>)}
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
                  <span className="text-stone-700 text-xs ml-2">{new Date(r.created_at ?? '').toLocaleString()}</span>
                  <p className="text-stone-700 mt-0.5">{r.message}</p>
                </div>
              ))}
              {hasPermission('manage_tickets') && (
                <div className="flex gap-2 pt-2">
                  <input className={inputCls} placeholder="Type your reply — the customer will see this via email/portal." value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} />
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

// Friendly labels for the stage values shown to staff. DB values stay the
// same (no migration) — only the rendered text changes. Anywhere the UI
// used `stage.replace('_', ' ')` it now uses this map so the vocabulary is
// consistent everywhere and reads like a person talking, not a CRM.
export const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Called',
  qualified: 'Interested',
  quoted: 'Quote Sent',
  won: 'Won',
  lost: 'Lost',
  not_answered: 'Callback later',
};
export const stageLabel = (stage: string) => STAGE_LABELS[stage] ?? stage.replace('_', ' ');

// The "Log Outcome" catalog — this is what a staff member sees when they
// record what happened on a call or visit. Each row maps a
// person-language outcome to (a) the underlying DB stage, (b) the
// call_type for the lead_remarks row, and (c) how many days later the
// system should nudge them to follow up. `requiresNote` forces the user
// to say why for deal-ending outcomes so we never lose the reason a deal
// was lost.
export type Outcome = {
  key: string;
  label: string;
  stage: string;
  callType: 'outgoing' | 'incoming' | 'visit' | 'whatsapp' | 'email' | 'note';
  followupDays: number | null;   // null = no follow-up (deal closed)
  requiresNote?: boolean;
  hint?: string;
};

export const CALL_OUTCOMES: Outcome[] = [
  { key: 'no_answer',        label: 'No answer',              stage: 'not_answered', callType: 'outgoing', followupDays: 1 },
  { key: 'voicemail',        label: 'Left voicemail',         stage: 'contacted',    callType: 'outgoing', followupDays: 1 },
  { key: 'callback_later',   label: 'Asked to call back',     stage: 'not_answered', callType: 'outgoing', followupDays: 2, hint: 'Pick a specific follow-up time below.' },
  { key: 'interested',       label: 'Spoke — interested',     stage: 'qualified',    callType: 'outgoing', followupDays: 3 },
  { key: 'not_interested',   label: 'Spoke — not interested', stage: 'lost',         callType: 'outgoing', followupDays: null, requiresNote: true, hint: 'Say briefly why so we can learn from it.' },
  { key: 'quote_sent',       label: 'Sent quote',             stage: 'quoted',       callType: 'outgoing', followupDays: 7 },
  { key: 'deal_won',         label: 'Deal won 🎉',            stage: 'won',          callType: 'note',     followupDays: null, requiresNote: true },
  { key: 'deal_lost',        label: 'Deal lost',              stage: 'lost',         callType: 'note',     followupDays: null, requiresNote: true, hint: 'Say briefly why so we can learn from it.' },
];

export const VISIT_OUTCOMES: Outcome[] = [
  { key: 'visit_interested',  label: 'Met — interested',      stage: 'qualified', callType: 'visit', followupDays: 3 },
  { key: 'visit_not_interested', label: 'Met — not interested', stage: 'lost',    callType: 'visit', followupDays: null, requiresNote: true },
  { key: 'visit_absent',      label: 'Nobody home',           stage: 'not_answered', callType: 'visit', followupDays: 1 },
  { key: 'visit_quoted',      label: 'Quoted on site',        stage: 'quoted',    callType: 'visit', followupDays: 7 },
  { key: 'visit_won',         label: 'Closed deal on site 🎉', stage: 'won',      callType: 'visit', followupDays: null, requiresNote: true },
];

export function LeadsBoard({ segments, focusLeadId }: { segments: Segment[]; focusLeadId?: string }) {
  const [segFilter, setSegFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string; segments: string[] }[]>([]);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [remarks, setRemarks] = useState<{ id: string; remark: string; call_type: string; created_at: string; address?: string; photo_url?: string; author_name?: string; author_staff_code?: string }[]>([]);
  const [leadPhotoUrls, setLeadPhotoUrls] = useState<Record<string, string>>({});
  const [previewLeadPhoto, setPreviewLeadPhoto] = useState<string | null>(null);
  const [newRemark, setNewRemark] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ segment_slug: '', customer_name: '', phone: '', email: '', interested_in: '', source: 'field' });

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkStage, setBulkStage] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Assignment & Staff filter state
  // Staff without full_leads_view land on their own leads by default —
  // the old default of 'all' meant a telecaller opened the board and
  // couldn't see which rows were theirs without an extra click.
  // "Log Outcome" flow state — the primary action a staff member takes
  // after a call/visit. See LogOutcomeDialog at the bottom of this file.
  const [logOutcomeLead, setLogOutcomeLead] = useState<Lead | null>(null);

  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'assigned' | 'unassigned'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { user, hasPermission } = useAuth();
  const toast = useToast();
  // See comment on assignFilter above — restricted staff default to 'mine'.
  useEffect(() => {
    if (user && !hasPermission('full_leads_view') && !hasPermission('bulk_assign_leads')) {
      setAssignFilter('mine');
    }
  }, [user, hasPermission]);

  function toggleSelectAll() {
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map(l => l.id));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleBulkAssign() {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from('marketing_leads')
      .update({ assigned_to: bulkAssignee || null, updated_at: new Date().toISOString() } as never)
      .in('id', selectedIds);

    if (error) { toast.error(`Bulk assign failed: ${error.message}`); setBulkBusy(false); return; }

    if (bulkAssignee) {
      const assigneeObj = staff.find(s => s.id === bulkAssignee);
      await supabase.from('notifications').insert({
        user_id: bulkAssignee,
        kind: 'lead_assigned',
        title: 'New leads assigned to you',
        body: `${selectedIds.length} leads were assigned to you.`,
        link: '/portal',
      } as never);
      toast.success(`${selectedIds.length} leads assigned to ${assigneeObj?.full_name || 'staff'}`);
    } else {
      toast.success(`${selectedIds.length} leads set to Unassigned`);
    }

    setBulkBusy(false);
    setSelectedIds([]);
    setBulkAssignee('');
    invalidateQueryCache('leads:');
    load();
  }

  async function handleBulkStage() {
    if (selectedIds.length === 0 || !bulkStage) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from('marketing_leads')
      .update({ stage: bulkStage, updated_at: new Date().toISOString() } as never)
      .in('id', selectedIds);

    if (error) { toast.error(`Bulk stage change failed: ${error.message}`); setBulkBusy(false); return; }

    toast.success(`${selectedIds.length} leads updated to stage "${stageLabel(bulkStage)}"`);
    setBulkBusy(false);
    setSelectedIds([]);
    setBulkStage('');
    invalidateQueryCache('leads:');
    load();
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected lead(s)? This action cannot be undone.`)) return;
    setBulkBusy(true);
    const { error } = await supabase.from('marketing_leads').delete().in('id', selectedIds);
    if (error) { toast.error(`Bulk delete failed: ${error.message}`); setBulkBusy(false); return; }

    toast.success(`${selectedIds.length} leads deleted successfully`);
    setBulkBusy(false);
    setSelectedIds([]);
    invalidateQueryCache('leads:');
    load();
  }

  async function deleteLead(id: string) {
    if (!window.confirm('Are you sure you want to delete this lead? This action cannot be undone.')) return;
    const { error } = await supabase.from('marketing_leads').delete().eq('id', id);
    if (error) { toast.error(`Couldn't delete lead: ${error.message}`); return; }
    toast.success('Lead deleted successfully');
    setOpenLead(null);
    setEditingLead(null);
    invalidateQueryCache('leads:');
    load();
  }

  async function saveEditedLead(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLead) return;
    const { error } = await supabase.from('marketing_leads').update({
      customer_name: editingLead.customer_name,
      phone: editingLead.phone,
      email: editingLead.email || null,
      segment_slug: editingLead.segment_slug,
      interested_in: editingLead.interested_in || null,
      stage: editingLead.stage,
      priority: editingLead.priority || 'medium',
      assigned_to: editingLead.assigned_to || null,
      invoice_no: editingLead.invoice_no || null,
      invoice_amount: editingLead.invoice_amount || null,
      updated_at: new Date().toISOString(),
    } as never).eq('id', editingLead.id);

    if (error) { toast.error(`Failed to save lead: ${error.message}`); return; }
    toast.success('Lead details updated');
    if (openLead?.id === editingLead.id) setOpenLead({ ...openLead, ...editingLead });
    setEditingLead(null);
    invalidateQueryCache('leads:');
    load();
  }

  const load = useCallback(async () => {
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
    } catch (err) {
      toast.error(`Couldn't load leads: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }, [segFilter, stageFilter]);
  useEffect(() => { load(); }, [load]);
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
    const { error } = await supabase.from('marketing_leads').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success('Lead updated');
    invalidateQueryCache('leads:');
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
    } as never);
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
    if (!form.segment_slug || !form.customer_name || !user) { toast.error('Segment and name are required'); return; }
    const phone = form.phone ? normalizePhone(form.phone) : 'Pending Collection';

    if (phone !== 'Pending Collection' && !dupWarning) {
      const { data: dupes } = await supabase.rpc('find_duplicate_leads', { _phone: phone, _segment_slug: form.segment_slug });
      if (dupes && dupes.length > 0) { setDupWarning(dupes); return; }
      const { data: exists } = await supabase.rpc('lead_phone_exists', { _phone: phone, _segment_slug: form.segment_slug });
      if (exists) { setDupWarning([{ id: 'exists', customer_name: 'An active lead with this number already exists', stage: '', assignee_name: '' }]); return; }
    }

    const { error } = await supabase.from('marketing_leads').insert({ ...form, phone, created_by: user.id } as never);
    if (error) { toast.error(`Couldn't create lead: ${error.message}`); return; }
    toast.success('Lead created');
    setShowAdd(false);
    setDupWarning(null);
    setForm({ segment_slug: '', customer_name: '', phone: '', email: '', interested_in: '', source: 'field' });
    invalidateQueryCache('leads:');
    load();
  }

  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.full_name])), [staff]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (assignFilter === 'assigned' && !l.assigned_to) return false;
      if (assignFilter === 'unassigned' && l.assigned_to) return false;
      if (assignFilter === 'mine' && l.assigned_to !== user?.id) return false;
      if (staffFilter && l.assigned_to !== staffFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (l.customer_name || '').toLowerCase().includes(q);
        const phoneMatch = (l.phone || '').toLowerCase().includes(q);
        const notesMatch = (l.interested_in || '').toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !notesMatch) return false;
      }
      return true;
    });
  }, [leads, assignFilter, staffFilter, searchQuery]);

  const funnel = useMemo(() => {
    const f: Record<string, number> = {};
    filteredLeads.forEach(l => { f[l.stage] = (f[l.stage] || 0) + 1; });
    return f;
  }, [filteredLeads]);

  return (
    <div>
      {/* Top Header & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
          <input
            type="text"
            className={inputCls + ' text-xs py-2 w-full sm:w-64 bg-white shadow-sm'}
            placeholder="🔍 Search leads by name, phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {hasPermission('create_leads') || hasPermission('manage_leads') ? (
            <button className={btnCls + ' shrink-0'} onClick={() => { setDupWarning(null); setShowAdd(true); }}>+ Add Lead</button>
          ) : null}
        </div>
      </div>

      {/* Simplified Unified Filter Bar */}
      <div className="p-3 bg-white border border-stone-200 rounded-2xl shadow-sm mb-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
          {/* Assignment Switcher */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl flex-wrap">
            <button onClick={() => { setAssignFilter('mine'); setStaffFilter(''); }} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'mine' && !staffFilter ? 'bg-teal-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
              My Leads ({leads.filter(l => l.assigned_to === user?.id).length})
            </button>
            <button onClick={() => { setAssignFilter('all'); setStaffFilter(''); }} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'all' && !staffFilter ? 'bg-orange-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
              All ({leads.length})
            </button>
            <button onClick={() => { setAssignFilter('assigned'); setStaffFilter(''); }} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'assigned' && !staffFilter ? 'bg-indigo-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
              Assigned ({leads.filter(l => l.assigned_to).length})
            </button>
            <button onClick={() => { setAssignFilter('unassigned'); setStaffFilter(''); }} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${assignFilter === 'unassigned' && !staffFilter ? 'bg-amber-700 text-white shadow-sm' : 'text-stone-700 hover:text-stone-900'}`}>
              Unassigned ({leads.filter(l => !l.assigned_to).length})
            </button>
          </div>

          <select className={inputCls + ' text-xs py-1.5 w-auto bg-stone-50 border-stone-200 font-semibold'} value={staffFilter} onChange={e => { setStaffFilter(e.target.value); setAssignFilter('all'); }}>
            <option value="">Filter by Staff Member...</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>

        {/* Stage Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setStageFilter('')} className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${stageFilter === '' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>All Stages</button>
          {stages.map(s => (
            <button key={s} onClick={() => setStageFilter(s)} className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${stageFilter === s ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
              {stageLabel(s)} ({funnel[s] || 0})
            </button>
          ))}
        </div>
      </div>

      {(user?.role === 'super_admin' || hasPermission('manage_leads')) && (
        <div className="mb-4 flex items-center justify-between gap-3 p-3 bg-stone-100/90 border border-stone-200 rounded-2xl flex-wrap shadow-sm">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
              checked={filteredLeads.length > 0 && selectedIds.length === filteredLeads.length}
              onChange={toggleSelectAll}
            />
            <span className="text-xs font-bold text-stone-800">
              {selectedIds.length > 0 ? `${selectedIds.length} Selected` : `Select All (${filteredLeads.length})`}
            </span>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <select className={inputCls + ' text-xs py-1.5 w-auto bg-white'} value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)}>
                <option value="">Reassign To...</option>
                <option value="">Unassigned Pool</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <button disabled={bulkBusy} onClick={handleBulkAssign} className="px-3 py-1.5 bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold rounded-xl shadow-sm">
                Assign ({selectedIds.length})
              </button>

              <select className={inputCls + ' text-xs py-1.5 w-auto bg-white'} value={bulkStage} onChange={e => setBulkStage(e.target.value)}>
                <option value="">Change Stage...</option>
                {stages.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </select>
              <button disabled={bulkBusy || !bulkStage} onClick={handleBulkStage} className="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-xl shadow-sm">
                Apply Stage
              </button>

              {user?.role === 'super_admin' && (
                <button disabled={bulkBusy} onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm">
                  Delete ({selectedIds.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {filteredLeads.map(l => {
          const seg = segments.find(s => s.slug === l.segment_slug);
          const needsPhone = !l.phone || l.phone === 'Pending Collection';
          const isSelected = selectedIds.includes(l.id);
          const assignedStaffName = l.assigned_to ? staffById[l.assigned_to] : null;
          return (
            <div key={l.id} className={cardCls + ` cursor-pointer hover:border-stone-300 flex items-start gap-3 transition-colors ${isSelected ? 'bg-orange-50/50 border-orange-300' : ''}`}>
              {(user?.role === 'super_admin' || hasPermission('manage_leads')) && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => { e.stopPropagation(); toggleSelect(l.id); }}
                  onClick={e => e.stopPropagation()}
                  className="mt-1 w-4 h-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 cursor-pointer shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5" onClick={() => { setOpenLead(l); loadRemarks(l.id); }} style={{ cursor: 'pointer' }}>
                  <span className="text-stone-900 font-bold">{l.customer_name}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: (seg?.color || '#888') + '22', color: seg?.color ?? undefined }}>{seg?.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${stageColors[l.stage]}`}>{stageLabel(l.stage)}</span>
                  {assignedStaffName ? (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold flex items-center gap-1 shadow-sm">
                      👤 {assignedStaffName}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-900 border border-amber-200 font-medium">
                      📥 Unassigned
                    </span>
                  )}
                  {needsPhone ? (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-1 shadow-sm">
                      📍 Collect Phone
                    </span>
                  ) : (
                    <span className="text-xs text-stone-700 font-semibold">📞 {l.phone}</span>
                  )}
                  <span className="text-xs text-stone-700 ml-auto">{l.source}</span>
                </div>
                <p className="text-stone-700 text-xs mt-1">
                  {l.priority === 'high' && <span className="text-red-700 font-medium">● High </span>}
                  {l.priority === 'low' && <span className="text-stone-700">● Low </span>}
                  {l.interested_in && `${l.interested_in} • `}Created {new Date(l.created_at ?? '').toLocaleDateString()} {l.stage === 'won' && l.invoice_amount && <span className="text-emerald-700">• ₹{Number(l.invoice_amount).toLocaleString('en-IN')}</span>}
                </p>
                {/* Primary action: log what happened. Only shown to whoever
                    can actually work the lead (owner or a manage_leads holder)
                    and only while the deal is still open. */}
                {hasPermission('manage_leads') && (l.assigned_to === user?.id || hasPermission('full_leads_view')) && !['won', 'lost'].includes(l.stage) && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setLogOutcomeLead(l); }}
                      className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-sm inline-flex items-center gap-1.5">
                      📞 Log Outcome
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenLead(l); loadRemarks(l.id); }}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-lg">
                      View history
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filteredLeads.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No matching leads found.</p>}
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
            <div className="flex justify-between items-start mb-3 gap-3">
              <div>
                <h3 className="text-stone-900 text-lg font-bold">{openLead.customer_name}</h3>
                <p className="text-stone-700 text-sm">{openLead.phone} {openLead.email && `• ${openLead.email}`}</p>
                {openLead.interested_in && <p className="text-stone-700 text-sm mt-1">Interested in: {openLead.interested_in}</p>}
                <p className="text-stone-700 text-xs mt-1.5">
                  Created {new Date(openLead.created_at ?? '').toLocaleString()} • source: {openLead.source}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(user?.role === 'super_admin' || hasPermission('manage_leads')) && (
                  <>
                    <button onClick={() => setEditingLead(openLead)} className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs font-bold rounded-xl border border-orange-200 shadow-sm transition-colors">
                      Edit Lead
                    </button>
                    <button onClick={() => deleteLead(openLead.id)} className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 shadow-sm transition-colors">
                      Delete
                    </button>
                  </>
                )}
                <button className="text-stone-700 hover:text-stone-900 p-1" onClick={() => setOpenLead(null)}>✕</button>
              </div>
            </div>
            {hasPermission('manage_leads') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <select className={inputCls} value={openLead.stage} onChange={e => update(openLead.id, { stage: e.target.value as Lead['stage'] })}>
                  {stages.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
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
                      {new Date(r.created_at ?? '').toLocaleString()} • {r.author_name || 'System'}{r.author_staff_code ? ` (${r.author_staff_code})` : ''}{!isSystem && ` • ${r.call_type}`}
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

      {logOutcomeLead && (
        <LogOutcomeDialog
          lead={logOutcomeLead}
          onClose={() => setLogOutcomeLead(null)}
          onDone={() => {
            setLogOutcomeLead(null);
            invalidateQueryCache('leads:');
            load();
          }}
        />
      )}

      {previewLeadPhoto && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewLeadPhoto(null)}>
          <button onClick={() => setPreviewLeadPhoto(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
            <X className="w-6 h-6" />
          </button>
          <img src={previewLeadPhoto} alt="Visit proof preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {editingLead && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingLead(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in duration-150" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-stone-900 font-extrabold text-lg">Edit Lead Details</h3>
              <button onClick={() => setEditingLead(null)} className="text-stone-700 hover:text-stone-900">✕</button>
            </div>
            <form onSubmit={saveEditedLead} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Customer Name</label>
                <input className={inputCls} required value={editingLead.customer_name} onChange={e => setEditingLead({ ...editingLead, customer_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Phone Number</label>
                  <input className={inputCls} required value={editingLead.phone} onChange={e => setEditingLead({ ...editingLead, phone: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Email</label>
                  <input className={inputCls} value={editingLead.email || ''} onChange={e => setEditingLead({ ...editingLead, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Segment</label>
                  <select className={inputCls} value={editingLead.segment_slug} onChange={e => setEditingLead({ ...editingLead, segment_slug: e.target.value })}>
                    {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Stage</label>
                  <select className={inputCls} value={editingLead.stage} onChange={e => setEditingLead({ ...editingLead, stage: e.target.value as Lead['stage'] })}>
                    {stages.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Interested In</label>
                  <input className={inputCls} value={editingLead.interested_in || ''} onChange={e => setEditingLead({ ...editingLead, interested_in: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Assign To Staff</label>
                  <select className={inputCls} value={editingLead.assigned_to || ''} onChange={e => setEditingLead({ ...editingLead, assigned_to: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {staff.filter(s => s.segments.includes('all') || s.segments.includes(editingLead.segment_slug)).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              </div>
              {editingLead.stage === 'won' && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Invoice Number</label>
                    <input className={inputCls} value={editingLead.invoice_no || ''} onChange={e => setEditingLead({ ...editingLead, invoice_no: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Invoice Amount (₹)</label>
                    <input type="number" className={inputCls} value={editingLead.invoice_amount || ''} onChange={e => setEditingLead({ ...editingLead, invoice_amount: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center pt-3 border-t border-stone-100">
                <button type="button" onClick={() => deleteLead(editingLead.id)} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200">
                  Delete Lead
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingLead(null)} className="px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-orange-700 hover:bg-orange-600 rounded-xl shadow-md">Save Changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// LogOutcomeDialog — the "record what happened" primary action for staff.
//
// Replaces the old confusion where a telecaller had to (a) change the
// stage dropdown, (b) type a remark separately, (c) set next-followup in
// yet another dialog, and (d) hope everything saved. This dialog collapses
// all of that into one form and one RPC call (log_lead_outcome) that does
// all three writes atomically — so we never end up with half-updated
// records like "stage changed to qualified with no note explaining why".
// ─────────────────────────────────────────────────────────────────────
function LogOutcomeDialog({
  lead,
  onClose,
  onDone,
}: {
  lead: Lead;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  // Field visits use a different outcome list (with 'visit' call_type).
  const [mode, setMode] = useState<'call' | 'visit'>('call');
  const catalog = mode === 'call' ? CALL_OUTCOMES : VISIT_OUTCOMES;
  const [outcomeKey, setOutcomeKey] = useState<string>('');
  const [note, setNote] = useState('');
  const [followupOverride, setFollowupOverride] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const outcome = catalog.find(o => o.key === outcomeKey) || null;

  // Default follow-up: today + outcome.followupDays, in the format
  // <input type="datetime-local"> expects (YYYY-MM-DDTHH:mm, LOCAL time).
  const defaultFollowup = React.useMemo(() => {
    if (!outcome || outcome.followupDays === null) return '';
    const d = new Date();
    d.setDate(d.getDate() + outcome.followupDays);
    d.setHours(10, 0, 0, 0);  // default to 10 AM local, feels human
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [outcome]);

  const followupValue = followupOverride || defaultFollowup;

  async function submit() {
    if (!outcome) { toast.error('Pick what happened first.'); return; }
    if (outcome.requiresNote && !note.trim()) {
      toast.error('Please add a short note — this outcome needs a reason.');
      return;
    }
    setBusy(true);
    // Build the remark: prefix with outcome label so history reads clearly
    // even when the note is empty, and never lose the person's typed context.
    const remark = note.trim()
      ? `[${outcome.label}] ${note.trim()}`
      : `[${outcome.label}]`;
    const nextFollowup = outcome.followupDays === null
      ? null
      : (followupValue ? new Date(followupValue).toISOString() : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC added in
    // migration 20260803140000; Database types were generated before that ran.
    // Regenerate with `supabase gen types typescript` and remove this cast.
    const { error } = await (supabase.rpc as any)('log_lead_outcome', {
      p_lead_id: lead.id,
      p_new_stage: outcome.stage,
      p_call_type: outcome.callType,
      p_remark: remark,
      p_next_followup_at: nextFollowup,
    });
    setBusy(false);
    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    toast.success('Saved. Stage and follow-up updated.');
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-stone-700 text-xs uppercase tracking-wide font-bold">Log outcome for</p>
            <h3 className="text-stone-900 text-lg font-bold mt-0.5">{lead.customer_name}</h3>
            <p className="text-stone-600 text-xs mt-0.5">{lead.phone} • currently {stageLabel(lead.stage)}</p>
          </div>
          <button onClick={onClose} className="text-stone-700 hover:text-stone-900 p-1">✕</button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setMode('call'); setOutcomeKey(''); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold ${mode === 'call' ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}>
            📞 Phone call
          </button>
          <button
            onClick={() => { setMode('visit'); setOutcomeKey(''); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold ${mode === 'visit' ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}>
            🚗 Field visit
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">What happened?</label>
            <select
              className={inputCls}
              value={outcomeKey}
              onChange={e => setOutcomeKey(e.target.value)}>
              <option value="">Pick an outcome…</option>
              {catalog.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            {outcome?.hint && <p className="text-xs text-stone-600 mt-1 italic">{outcome.hint}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Notes {outcome?.requiresNote && <span className="text-red-600">*</span>}
            </label>
            <textarea
              className={inputCls}
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={outcome?.requiresNote ? 'Required — say briefly why.' : 'Optional — anything worth remembering.'}
            />
          </div>

          {outcome && outcome.followupDays !== null && (
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Next follow-up
                <span className="text-stone-600 font-normal"> (auto-set to {outcome.followupDays} day{outcome.followupDays === 1 ? '' : 's'} from now — change if you want)</span>
              </label>
              <input
                type="datetime-local"
                className={inputCls}
                value={followupValue}
                onChange={e => setFollowupOverride(e.target.value)}
              />
            </div>
          )}

          {outcome && outcome.followupDays === null && (
            <p className="text-xs text-stone-600 italic">
              This outcome closes the lead — no follow-up will be scheduled.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !outcome}
            className="px-4 py-2 text-xs font-bold text-white bg-orange-700 hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-md">
            {busy ? 'Saving…' : 'Save & advance'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HRBoard({ segments }: { segments: Segment[] }) {
  const [segFilter, setSegFilter] = useState('');
  const [tab, setTab] = useState<'staff' | 'attendance' | 'leaves' | 'advances'>('staff');
  const [staff, setStaff] = useState<{ id: string; full_name: string; role: string; email: string; phone: string; segments: string[]; is_active: boolean; reporting_time?: string | null }[]>([]);
  // Track whether the first fetch has completed for each tab, so the UI can
  // distinguish "still loading" from "loaded but empty" — a blank screen with
  // no state feedback used to leave users unsure whether the app was working.
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [leavesLoaded, setLeavesLoaded] = useState(false);
  const [advancesLoaded, setAdvancesLoaded] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [date, setDate] = useState(istDateStr());
  // HR polish additions:
  //   staffSearch: filter the Staff tab by name/email/phone
  //   attendanceView: 'all' vs 'late' vs 'missing' — before this you saw
  //                   every row and had to eyeball who came in late
  //   leavesStatus / advancesStatus: default 'pending' so approvers don't
  //                                  scroll past historical decisions to
  //                                  find what needs their action
  const [staffSearch, setStaffSearch] = useState('');
  const [attendanceView, setAttendanceView] = useState<'all' | 'late' | 'missing'>('all');
  const [leavesStatus, setLeavesStatus] = useState<'pending' | 'all'>('pending');
  const [advancesStatus, setAdvancesStatus] = useState<'pending' | 'all'>('pending');
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
      if (data) setStaff(data as never);
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
          const map: Record<string, string> = {};
          const relativePaths: string[] = [];
          paths.forEach(p => {
            if (p.startsWith('http') || p.startsWith('data:')) {
              map[p] = p;
            } else {
              relativePaths.push(p);
            }
          });

          if (relativePaths.length > 0) {
            const [{ data: signed1 }, { data: signed2 }] = await Promise.all([
              supabase.storage.from('selfies').createSignedUrls(relativePaths, 3600),
              supabase.storage.from('attendance-selfies').createSignedUrls(relativePaths, 3600),
            ]);
            if (signed1) signed1.forEach(s => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
            if (signed2) signed2.forEach(s => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
          }
          setPhotoUrls(map);
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
    const { error } = await supabase.from(table as never).update(patch as never).eq('id', id);
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
          <div className="flex items-center gap-2 mb-3">
            <input
              className={inputCls + ' text-sm'}
              placeholder="🔍 Search by name, email, or phone…"
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
            />
            {staffSearch && (
              <button onClick={() => setStaffSearch('')}
                className="px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl whitespace-nowrap">
                Clear
              </button>
            )}
          </div>
          {(() => {
            // Filter first — used both for the empty-state check and the rendering.
            const q = staffSearch.trim().toLowerCase();
            const filtered = staff.filter(inSeg).filter(s => {
              if (!q) return true;
              return (s.full_name || '').toLowerCase().includes(q)
                  || (s.email || '').toLowerCase().includes(q)
                  || (s.phone || '').toLowerCase().includes(q);
            });
            if (!staffLoaded) return <div className="text-center py-10 text-stone-500 text-sm">Loading staff…</div>;
            if (filtered.length === 0) return (
              <div className="text-center py-10 text-stone-500 text-sm">
                {staff.length === 0
                  ? 'No staff onboarded yet. Use "+ Onboard Employee" above to add your first team member.'
                  : q
                    ? `No staff match "${staffSearch}".`
                    : 'No staff match the current segment filter.'}
              </div>
            );
            return filtered.map(s => (
            <div key={s.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-2'}>
              <div>
                <p className="text-stone-900 font-medium">{s.full_name} <span className="text-stone-700 text-xs">({s.role})</span></p>
                <p className="text-stone-700 text-xs">{s.email} • {s.phone} • segments: {(s.segments || []).join(', ') || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.is_active ? 'active' : 'disabled'}</span>
            </div>
          ));
          })()}
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

          {/* HR-2: quick filters. Late = check_in_at AFTER the person's
              reporting_time (defaults to 11 AM). Missing = no check-in yet. */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-fit">
            <button onClick={() => setAttendanceView('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${attendanceView === 'all' ? 'bg-stone-800 text-white' : 'text-stone-700'}`}>
              Everyone
            </button>
            <button onClick={() => setAttendanceView('late')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${attendanceView === 'late' ? 'bg-amber-700 text-white' : 'text-stone-700'}`}>
              Late arrivals
            </button>
            <button onClick={() => setAttendanceView('missing')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${attendanceView === 'missing' ? 'bg-red-700 text-white' : 'text-stone-700'}`}>
              Not checked in
            </button>
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
            ) : staff.filter(inSeg).filter(s => {
              const rec = attendance.find(a => a.staff_user_id === s.id);
              if (attendanceView === 'all') return true;
              if (attendanceView === 'missing') return !rec || !rec.check_in_at;
              // Late = checked in after reporting_time (default 11:00)
              if (!rec || !rec.check_in_at) return false;
              const rt = (s.reporting_time as string) || '11:00:00';
              const d = new Date(rec.check_in_at);
              const cim = d.getHours() * 60 + d.getMinutes();
              const parts = rt.split(':');
              return cim > (parseInt(parts[0]) * 60 + parseInt(parts[1]));
            }).map(s => {
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
                          {(rec.status ?? "").toUpperCase()}
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
                        {rec.check_in_selfie_url && (() => {
                          const src = photoUrls[rec.check_in_selfie_url] || (rec.check_in_selfie_url.startsWith('http') || rec.check_in_selfie_url.startsWith('data:') ? rec.check_in_selfie_url : null);
                          return src ? (
                            <button onClick={() => setPreviewImage(src)} className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-stone-200 shadow-sm hover:opacity-90 transition-opacity">
                              <img src={src} alt="Check-in selfie" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                            </button>
                          ) : (
                            <div className="shrink-0 w-14 h-14 rounded-lg bg-stone-200 animate-pulse" />
                          );
                        })()}
                        <div className="flex-1 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-stone-500 font-medium">Check In</p>
                            <p className="text-stone-900 font-semibold text-sm">
                              {rec.check_in_at ? new Date(rec.check_in_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
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
                        {rec.check_out_selfie_url && (() => {
                          const src = photoUrls[rec.check_out_selfie_url] || (rec.check_out_selfie_url.startsWith('http') || rec.check_out_selfie_url.startsWith('data:') ? rec.check_out_selfie_url : null);
                          return src ? (
                            <button onClick={() => setPreviewImage(src)} className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-stone-200 shadow-sm hover:opacity-90 transition-opacity">
                              <img src={src} alt="Check-out selfie" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                            </button>
                          ) : (
                            <div className="shrink-0 w-14 h-14 rounded-lg bg-stone-200 animate-pulse" />
                          );
                        })()}
                        <div className="flex-1 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-stone-500 font-medium">Check Out</p>
                            <p className="text-stone-900 font-semibold text-sm">
                              {rec.check_out_at ? new Date(rec.check_out_at ?? '').toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
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

      {tab === 'leaves' && (() => {
        // HR-3: default to pending so approvers don't scroll past history.
        const shown = leaves.filter(l => leavesStatus === 'all' || l.status === 'pending');
        return (
        <div className="space-y-2">
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-fit mb-3">
            <button onClick={() => setLeavesStatus('pending')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${leavesStatus === 'pending' ? 'bg-amber-700 text-white' : 'text-stone-700'}`}>
              Pending ({leaves.filter(l => l.status === 'pending').length})
            </button>
            <button onClick={() => setLeavesStatus('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${leavesStatus === 'all' ? 'bg-stone-800 text-white' : 'text-stone-700'}`}>
              All ({leaves.length})
            </button>
          </div>
          {!leavesLoaded ? (
            <div className="text-center py-10 text-stone-500 text-sm">Loading leave requests…</div>
          ) : shown.filter(l => inSeg(staffById[l.staff_user_id])).length === 0 ? (
            <div className="text-center py-10 text-stone-500 text-sm">
              {leaves.length === 0 ? 'No leave requests yet.' : 'No leave requests match the current filter.'}
            </div>
          ) : shown.filter(l => inSeg(staffById[l.staff_user_id])).map(l => (
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
        );
      })()}

      {tab === 'advances' && (() => {
        const shownA = advances.filter(a => advancesStatus === 'all' || a.status === 'pending');
        return (
        <div className="space-y-2">
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-fit mb-3">
            <button onClick={() => setAdvancesStatus('pending')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${advancesStatus === 'pending' ? 'bg-amber-700 text-white' : 'text-stone-700'}`}>
              Pending ({advances.filter(a => a.status === 'pending').length})
            </button>
            <button onClick={() => setAdvancesStatus('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${advancesStatus === 'all' ? 'bg-stone-800 text-white' : 'text-stone-700'}`}>
              All ({advances.length})
            </button>
          </div>
          {!advancesLoaded ? (
            <div className="text-center py-10 text-stone-500 text-sm">Loading salary advances…</div>
          ) : shownA.filter(a => inSeg(staffById[a.staff_user_id])).length === 0 ? (
            <div className="text-center py-10 text-stone-500 text-sm">
              {advances.length === 0 ? 'No salary advance requests yet.' : 'No advances match the current filter.'}
            </div>
          ) : shownA.filter(a => inSeg(staffById[a.staff_user_id])).map(a => (
            <div key={a.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-stone-900 text-sm font-medium">{staffById[a.staff_user_id]?.full_name || '—'} • ₹{Number(a.amount).toLocaleString('en-IN')}</p>
                  <p className="text-stone-700 text-xs">{a.reason} • {new Date(a.created_at ?? '').toLocaleDateString()}</p>
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
        );
      })()}
    </div>
  );
}
