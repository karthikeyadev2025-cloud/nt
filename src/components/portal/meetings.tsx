import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar, Clock, Video, MapPin, Phone as PhoneIcon, Users, Plus, X,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, ExternalLink,
  ClipboardCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { cachedRpc, invalidateQueryCache as invalidateRpcCache } from '../../lib/cachedRpc';
import { inputCls, btnCls, cardCls } from './shared';
import { istDateStr } from '../../lib/dates';

export type MeetingRow = {
  id: string; lead_id: string | null; segment_slug: string | null;
  meeting_type_name: string; meeting_type_slug: string;
  organizer_id: string; organizer_name: string; attendee_ids: string[];
  scheduled_at: string; duration_minutes: number;
  location_kind: 'google_meet' | 'in_person' | 'phone' | 'other';
  meet_link: string | null; location_address: string | null;
  customer_name: string | null; customer_phone: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  agenda: string; outcome_notes: string; next_step: string;
};

type MeetingType = {
  id: string; name: string; slug: string; default_duration_minutes: number;
  description: string | null; active: boolean; order_index: number;
  created_at: string | null; updated_at: string | null;
};

type StaffLite = { id: string; full_name: string; role: string };

type RpcResult = { ok: boolean; meeting_id?: string; conflict?: string; message?: string };

async function rpcCall<T = RpcResult>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
  // Call supabase.rpc(...) directly — extracting it to a local variable
  // first detaches it from the client instance's `this` and throws
  // "Cannot read properties of undefined (reading 'rest')" inside the
  // library (this.rest.rpc(...) with this === undefined). Every call
  // through this helper was silently failing because of that, swallowed
  // by the async-function wrapper turning the synchronous throw into a
  // rejected promise that callers' .catch() then quietly ate.
  return supabase.rpc(fn as never, args as never) as unknown as Promise<{ data: T | null; error: { message: string } | null }>;
}

const IST_TZ = 'Asia/Kolkata';
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { timeZone: IST_TZ, day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const statusStyle = {
  scheduled: 'bg-teal-50 text-teal-700 border-teal-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-stone-100 text-stone-700 border-stone-200',
  no_show:   'bg-amber-50 text-amber-700 border-amber-200',
};

const locationIcon = {
  google_meet: <Video className="w-3.5 h-3.5" />,
  in_person:   <MapPin className="w-3.5 h-3.5" />,
  phone:       <PhoneIcon className="w-3.5 h-3.5" />,
  other:       <Calendar className="w-3.5 h-3.5" />,
};

// ═══════════════════════════════════════════════════════════════════
export function ScheduleMeetingModal({
  leadId, leadName, leadPhone, defaultAt, onClose, onSaved,
}: {
  leadId?: string | null; leadName?: string | null; leadPhone?: string | null;
  defaultAt?: string; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [conflictWarn, setConflictWarn] = useState<string | null>(null);
  const [waitingForMeetPaste, setWaitingForMeetPaste] = useState(false);

  const nextHour = useMemo(() => {
    const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
    return toLocalInput(d.toISOString());
  }, []);

  const [form, setForm] = useState({
    meeting_type_id: '', scheduled_at: defaultAt ? toLocalInput(defaultAt) : nextHour,
    duration_minutes: 30, location_kind: 'google_meet' as MeetingRow['location_kind'],
    meet_link: '', location_address: '', attendees: [] as string[], agenda: '',
    customer_name: leadName || '', customer_phone: leadPhone || '', customer_email: '',
  });

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('meeting_types' as never).select('*').eq('active', true).order('order_index'),
        supabase.from('app_users').select('id, full_name, role').eq('is_active', true).order('full_name'),
      ]);
      if (t) {
        const typedT = t as MeetingType[];
        setTypes(typedT);
        if (typedT.length && !form.meeting_type_id) {
          setForm(f => ({ ...f, meeting_type_id: typedT[0].id, duration_minutes: typedT[0].default_duration_minutes }));
        }
      }
      if (s) setStaff(s);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pickType(id: string) {
    const t = types.find(x => x.id === id);
    if (!t) return;
    setForm(f => ({ ...f, meeting_type_id: id, duration_minutes: t.default_duration_minutes }));
  }

  const MEET_URL_RE = /https?:\/\/meet\.google\.com\/(?:new|[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:\?[^\s]*)?/i;
  const MEET_URL_NO_PROTO_RE = /^meet\.google\.com\/(?:new|[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:\?[^\s]*)?$/i;

  function openAndAutoFillMeet() {
    window.open('https://meet.google.com/new', '_blank', 'noopener,noreferrer');
    setWaitingForMeetPaste(true);
    toast.success('Meet opened. Copy the URL from the Meet tab, then return here.');
  }

  useEffect(() => {
    if (!waitingForMeetPaste) return;
    async function tryFillFromClipboard() {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.clipboard?.readText) return;
      try {
        const raw = (await navigator.clipboard.readText()).trim();
        let match = raw.match(MEET_URL_RE)?.[0];
        if (!match && MEET_URL_NO_PROTO_RE.test(raw)) match = 'https://' + raw;
        if (match) {
          setForm(f => ({ ...f, meet_link: match! }));
          setWaitingForMeetPaste(false);
          toast.success('Meet link auto-filled from clipboard.');
        }
      } catch { /* permission denied — silent */ }
    }
    tryFillFromClipboard();
    document.addEventListener('visibilitychange', tryFillFromClipboard);
    return () => document.removeEventListener('visibilitychange', tryFillFromClipboard);
  }, [waitingForMeetPaste]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (waitingForMeetPaste && form.meet_link.match(MEET_URL_RE)) {
      setWaitingForMeetPaste(false);
    }
  }, [form.meet_link]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(force: boolean) {
    if (!form.meeting_type_id) { toast.error('Pick a meeting type'); return; }
    if (!form.scheduled_at) { toast.error('Pick a date and time'); return; }
    if (form.location_kind === 'in_person' && !form.location_address.trim()) {
      toast.error('Enter the meeting address'); return;
    }
    setBusy(true); setConflictWarn(null);
    const { data, error } = await rpcCall('schedule_meeting', {
      p_lead_id: leadId || null, p_meeting_type_id: form.meeting_type_id,
      p_scheduled_at: new Date(form.scheduled_at).toISOString(),
      p_duration_minutes: form.duration_minutes,
      p_location_kind: form.location_kind, p_meet_link: form.meet_link.trim() || null,
      p_location_address: form.location_address.trim() || null,
      p_attendee_ids: form.attendees, p_agenda: form.agenda,
      p_customer_name: form.customer_name.trim() || null,
      p_customer_phone: form.customer_phone.trim() || null,
      p_customer_email: form.customer_email.trim() || null,
      p_force: force,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data && !data.ok && data.message) { setConflictWarn(data.message); return; }
    invalidateRpcCache('list_meetings');
    toast.success('Meeting scheduled — attendees have been notified');
    onSaved(); onClose();
  }

  const toggleAttendee = (id: string) =>
    setForm(f => ({ ...f, attendees: f.attendees.includes(id) ? f.attendees.filter(x => x !== id) : [...f.attendees, id] }));

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-stone-900 font-extrabold text-base leading-tight">Schedule Meeting</h3>
              <p className="text-stone-700 text-xs font-semibold">{leadName ? `With ${leadName}` : 'Internal team meeting'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-700 hover:text-stone-900 hover:bg-stone-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-stone-700 mb-1 block">Meeting Type</label>
              <select className={inputCls} value={form.meeting_type_id} onChange={e => pickType(e.target.value)}>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-stone-700 mb-1 block">Duration (min)</label>
              <input type="number" min={5} max={480} className={inputCls}
                value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 mb-1 block">Date & Time (IST)</label>
            <input type="datetime-local" className={inputCls} value={form.scheduled_at}
              onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 mb-1 block">Where?</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {([
                { v: 'google_meet' as const, label: 'Google Meet', icon: <Video className="w-4 h-4" /> },
                { v: 'in_person' as const,   label: 'In Person',    icon: <MapPin className="w-4 h-4" /> },
                { v: 'phone' as const,       label: 'Phone',         icon: <PhoneIcon className="w-4 h-4" /> },
                { v: 'other' as const,       label: 'Other',         icon: <Calendar className="w-4 h-4" /> },
              ]).map(o => (
                <button key={o.v} type="button" onClick={() => setForm({ ...form, location_kind: o.v })}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1
                    ${form.location_kind === o.v ? 'bg-teal-50 border-teal-500 text-teal-800' : 'border-stone-200 text-stone-700'}`}>
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
            {form.location_kind === 'google_meet' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input className={inputCls + ' flex-1'} placeholder="Google Meet link (auto-fills, or paste)"
                    value={form.meet_link} onChange={e => setForm({ ...form, meet_link: e.target.value })} />
                  <button type="button" onClick={openAndAutoFillMeet}
                    className="shrink-0 px-3 py-2 rounded-lg bg-teal-50 border border-teal-300 text-teal-800 text-xs font-semibold hover:bg-teal-100 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" /> Open Meet & Auto-Fill
                  </button>
                </div>
                {waitingForMeetPaste && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <ClipboardCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-stone-900 text-xs font-semibold">Meet room opened in a new tab</p>
                      <p className="text-stone-700 text-[11px] mt-0.5">Copy the URL from the Meet tab, then click back here — we'll fill it in automatically.</p>
                    </div>
                    <button type="button" onClick={() => setWaitingForMeetPaste(false)}
                      className="text-amber-800 text-[11px] font-bold hover:underline shrink-0">Dismiss</button>
                  </div>
                )}
              </div>
            )}
            {form.location_kind === 'in_person' && (
              <input className={inputCls} placeholder="Address" value={form.location_address}
                onChange={e => setForm({ ...form, location_address: e.target.value })} />
            )}
          </div>

          {!leadId && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Customer name (optional)" value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              <input className={inputCls} placeholder="Phone (optional)" value={form.customer_phone}
                onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
              <input className={inputCls} placeholder="Email (optional)" value={form.customer_email}
                onChange={e => setForm({ ...form, customer_email: e.target.value })} />
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Additional Attendees ({form.attendees.length})
            </label>
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto border border-stone-200 rounded-lg p-2">
              {staff.filter(s => s.id !== user?.id).map(s => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-stone-700 hover:bg-stone-50 px-2 py-1 rounded cursor-pointer">
                  <input type="checkbox" checked={form.attendees.includes(s.id)} onChange={() => toggleAttendee(s.id)} />
                  <span className="truncate">{s.full_name} <span className="text-stone-500">({s.role})</span></span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 mb-1 block">Agenda / Prep Notes</label>
            <textarea className={inputCls} rows={3} placeholder="What are we discussing?"
              value={form.agenda} onChange={e => setForm({ ...form, agenda: e.target.value })} />
          </div>

          {conflictWarn && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-stone-900 text-sm font-medium">Scheduling conflict</p>
                <p className="text-stone-700 text-xs mt-0.5">{conflictWarn}</p>
                <button onClick={() => submit(true)} disabled={busy} className="text-amber-800 text-xs font-bold mt-2 hover:underline">
                  Schedule anyway →
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-100">Cancel</button>
            <button onClick={() => submit(false)} disabled={busy} className={btnCls + ' disabled:opacity-50'}>
              {busy ? 'Scheduling…' : 'Schedule Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function MeetingDetailModal({ meeting, onClose, onChanged }: {
  meeting: MeetingRow; onClose: () => void; onChanged: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'reschedule' | 'outcome'>('view');
  const [newAt, setNewAt] = useState(toLocalInput(meeting.scheduled_at));
  const [outcome, setOutcome] = useState<'completed' | 'no_show'>('completed');
  const [notes, setNotes] = useState(meeting.outcome_notes || '');
  const [nextStep, setNextStep] = useState(meeting.next_step || '');
  const [attendeeNames, setAttendeeNames] = useState<Record<string, string>>({});

  const isMine = meeting.organizer_id === user?.id;
  const isAttendee = meeting.attendee_ids.includes(user?.id || '');

  useEffect(() => {
    if (meeting.attendee_ids.length === 0) return;
    supabase.from('app_users').select('id, full_name').in('id', meeting.attendee_ids)
      .then(({ data }) => { if (data) setAttendeeNames(Object.fromEntries(data.map(u => [u.id, u.full_name]))); });
  }, [meeting.attendee_ids]);

  async function reschedule() {
    setBusy(true);
    const { data, error } = await rpcCall('reschedule_meeting', { p_meeting_id: meeting.id, p_new_at: new Date(newAt).toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data && !data.ok) {
      if (confirm(`${data.message}\n\nSchedule anyway?`)) {
        setBusy(true);
        const r2 = await rpcCall('reschedule_meeting', { p_meeting_id: meeting.id, p_new_at: new Date(newAt).toISOString(), p_force: true });
        setBusy(false);
        if (r2.error) { toast.error(r2.error.message); return; }
      } else return;
    }
    invalidateRpcCache('list_meetings'); toast.success('Meeting rescheduled'); onChanged(); onClose();
  }

  async function cancel() {
    const reason = prompt('Reason for cancelling? (optional)') ?? '';
    if (reason === null) return;
    setBusy(true);
    const { error } = await rpcCall('cancel_meeting', { p_meeting_id: meeting.id, p_reason: reason });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    invalidateRpcCache('list_meetings'); toast.success('Meeting cancelled — attendees notified'); onChanged(); onClose();
  }

  async function saveOutcome() {
    if (!notes.trim()) { toast.error('Please add outcome notes'); return; }
    setBusy(true);
    const { error } = await rpcCall('record_meeting_outcome', { p_meeting_id: meeting.id, p_outcome: outcome, p_notes: notes, p_next_step: nextStep });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    invalidateRpcCache('list_meetings'); toast.success('Outcome recorded'); onChanged(); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700">
              {locationIcon[meeting.location_kind]}
            </div>
            <div>
              <h3 className="text-stone-900 font-extrabold text-base leading-tight">{meeting.meeting_type_name}</h3>
              <p className="text-stone-700 text-xs">{meeting.customer_name || 'Internal team meeting'}</p>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-stone-700" /></button>
        </div>

        {mode === 'view' && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-stone-700">
              <Clock className="w-4 h-4" /><span>{fmtDateTime(meeting.scheduled_at)} • {meeting.duration_minutes} min</span>
            </div>
            <div className="flex items-center gap-2 text-stone-700">
              {locationIcon[meeting.location_kind]}
              <span className="capitalize">{meeting.location_kind.replace('_', ' ')}</span>
              {meeting.meet_link && (
                <a href={meeting.meet_link} target="_blank" rel="noreferrer"
                  className="text-teal-700 hover:underline flex items-center gap-1 ml-auto text-xs font-semibold">
                  <ExternalLink className="w-3 h-3" /> Join
                </a>
              )}
            </div>
            {meeting.location_address && <p className="text-stone-700 text-xs">📍 {meeting.location_address}</p>}
            {meeting.customer_phone && <p className="text-stone-700 text-xs">📞 {meeting.customer_phone}</p>}
            <div className="pt-2 border-t border-stone-100">
              <p className="text-stone-700 text-xs font-semibold">Organizer: {meeting.organizer_name}</p>
              {meeting.attendee_ids.length > 0 && (
                <p className="text-stone-700 text-xs mt-1">With: {meeting.attendee_ids.map(id => attendeeNames[id] || '—').join(', ')}</p>
              )}
            </div>
            {meeting.agenda && (
              <div className="pt-2 border-t border-stone-100">
                <p className="text-stone-700 text-xs font-semibold mb-1">Agenda</p>
                <p className="text-stone-900 text-sm whitespace-pre-wrap">{meeting.agenda}</p>
              </div>
            )}
            {(meeting.outcome_notes || meeting.next_step) && (
              <div className="pt-2 border-t border-stone-100 space-y-2">
                {meeting.outcome_notes && <div>
                  <p className="text-stone-700 text-xs font-semibold mb-1">Outcome</p>
                  <p className="text-stone-900 text-sm whitespace-pre-wrap">{meeting.outcome_notes}</p>
                </div>}
                {meeting.next_step && <div>
                  <p className="text-stone-700 text-xs font-semibold mb-1">Next Step</p>
                  <p className="text-stone-900 text-sm whitespace-pre-wrap">{meeting.next_step}</p>
                </div>}
              </div>
            )}
            <span className={`inline-block text-xs px-2 py-0.5 rounded border capitalize ${statusStyle[meeting.status]}`}>
              {meeting.status.replace('_', ' ')}
            </span>
            {(isMine || isAttendee) && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-stone-100">
                {meeting.status === 'scheduled' && isMine && (
                  <>
                    <button onClick={() => setMode('reschedule')} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100">Reschedule</button>
                    <button onClick={cancel} disabled={busy} className="px-3 py-1.5 rounded-lg border border-red-300 text-xs font-semibold text-red-700 hover:bg-red-50">Cancel Meeting</button>
                  </>
                )}
                {(meeting.status === 'scheduled' || meeting.status === 'no_show') && (isMine || isAttendee) && (
                  <button onClick={() => setMode('outcome')} className={btnCls + ' text-xs'}>Record Outcome</button>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'reschedule' && (
          <div className="space-y-3">
            <label className="text-xs font-bold text-stone-700 block">New Date & Time (IST)</label>
            <input type="datetime-local" className={inputCls} value={newAt} onChange={e => setNewAt(e.target.value)} />
            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setMode('view')} className="px-3 py-1.5 text-xs font-semibold text-stone-700">Back</button>
              <button onClick={reschedule} disabled={busy} className={btnCls + ' text-xs'}>{busy ? 'Saving…' : 'Reschedule'}</button>
            </div>
          </div>
        )}

        {mode === 'outcome' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-stone-700 mb-1 block">Outcome</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setOutcome('completed')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1
                    ${outcome === 'completed' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'border-stone-200 text-stone-700'}`}>
                  <CheckCircle2 className="w-4 h-4" /> Completed
                </button>
                <button onClick={() => setOutcome('no_show')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1
                    ${outcome === 'no_show' ? 'bg-amber-50 border-amber-500 text-amber-800' : 'border-stone-200 text-stone-700'}`}>
                  <XCircle className="w-4 h-4" /> No-show
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-stone-700 mb-1 block">What happened?</label>
              <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-700 mb-1 block">Next step (optional)</label>
              <input className={inputCls} value={nextStep} onChange={e => setNextStep(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setMode('view')} className="px-3 py-1.5 text-xs font-semibold text-stone-700">Back</button>
              <button onClick={saveOutcome} disabled={busy} className={btnCls + ' text-xs'}>{busy ? 'Saving…' : 'Save Outcome'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function MeetingListItem({ m, onOpen }: { m: MeetingRow; onOpen: (m: MeetingRow) => void }) {
  const isPast = new Date(m.scheduled_at).getTime() < Date.now();
  return (
    <div className={cardCls + ' cursor-pointer hover:border-stone-300'} onClick={() => onOpen(m)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-stone-900 text-sm font-semibold truncate">{m.meeting_type_name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${statusStyle[m.status]}`}>{m.status.replace('_', ' ')}</span>
          </div>
          <p className="text-stone-700 text-xs">{m.customer_name || 'Internal'}{m.customer_phone ? ` • ${m.customer_phone}` : ''}</p>
          <div className="flex items-center gap-3 mt-1.5 text-stone-700 text-xs">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDateTime(m.scheduled_at)}</span>
            <span className="flex items-center gap-1">{locationIcon[m.location_kind]} <span className="capitalize">{m.location_kind.replace('_', ' ')}</span></span>
          </div>
        </div>
        {m.meet_link && !isPast && m.status === 'scheduled' && (
          <a href={m.meet_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 flex items-center gap-1">
            <Video className="w-3.5 h-3.5" /> Join
          </a>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
export function MyMeetings() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [open, setOpen] = useState<MeetingRow | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 30);
    const to = new Date(now); to.setDate(to.getDate() + 90);
    const data = await cachedRpc(`list_meetings:mine:${istDateStr()}`, () =>
      rpcCall<MeetingRow[]>('list_meetings', { p_from: from.toISOString(), p_to: to.toISOString(), p_scope: 'mine' })
    );
    const list = Array.isArray(data) ? data : (data as { data?: MeetingRow[] } | null)?.data;
    if (Array.isArray(list)) setRows(list as MeetingRow[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const nowIso = new Date().toISOString();
  const upcoming = rows.filter(m => m.scheduled_at >= nowIso && m.status === 'scheduled');
  const past = rows.filter(m => m.scheduled_at < nowIso || m.status !== 'scheduled')
                   .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button onClick={() => setTab('upcoming')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === 'upcoming' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-stone-700 border border-transparent'}`}>
            Upcoming ({upcoming.length})
          </button>
          <button onClick={() => setTab('past')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === 'past' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-stone-700 border border-transparent'}`}>
            Past
          </button>
        </div>
        <button onClick={() => setShowSchedule(true)} className={btnCls + ' flex items-center gap-1'}>
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </div>

      <div className="space-y-2">
        {(tab === 'upcoming' ? upcoming : past).map(m => <MeetingListItem key={m.id} m={m} onOpen={setOpen} />)}
        {(tab === 'upcoming' ? upcoming : past).length === 0 && (
          <p className="text-stone-700 text-sm text-center py-10">
            {tab === 'upcoming' ? 'No upcoming meetings.' : 'No past meetings.'}
          </p>
        )}
      </div>

      {open && <MeetingDetailModal meeting={open} onClose={() => setOpen(null)} onChanged={load} />}
      {showSchedule && <ScheduleMeetingModal onClose={() => setShowSchedule(false)} onSaved={load} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
export function LeadMeetingsTab({ leadId, leadName, leadPhone }: {
  leadId: string; leadName: string; leadPhone: string;
}) {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [open, setOpen] = useState<MeetingRow | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  const load = useCallback(async () => {
    const from = new Date('2020-01-01').toISOString();
    const to = new Date(); to.setFullYear(to.getFullYear() + 2);
    const { data } = await rpcCall<MeetingRow[]>('list_meetings', { p_from: from, p_to: to.toISOString(), p_scope: 'team' });
    const list = Array.isArray(data) ? data : [];
    setRows((list as MeetingRow[]).filter(m => m.lead_id === leadId));
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-stone-700 text-xs font-semibold">{rows.length} meeting{rows.length === 1 ? '' : 's'} with this lead</p>
        <button onClick={() => setShowSchedule(true)} className={btnCls + ' text-xs flex items-center gap-1'}>
          <Plus className="w-3.5 h-3.5" /> Schedule Meeting
        </button>
      </div>
      <div className="space-y-2">
        {rows.map(m => <MeetingListItem key={m.id} m={m} onOpen={setOpen} />)}
        {rows.length === 0 && <p className="text-stone-700 text-sm text-center py-6">No meetings yet — schedule one to keep this lead moving.</p>}
      </div>
      {open && <MeetingDetailModal meeting={open} onClose={() => setOpen(null)} onChanged={load} />}
      {showSchedule && (
        <ScheduleMeetingModal leadId={leadId} leadName={leadName} leadPhone={leadPhone}
          onClose={() => setShowSchedule(false)} onSaved={load} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
export function TeamCalendar() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('team');
  const [open, setOpen] = useState<MeetingRow | null>(null);
  const [showSchedule, setShowSchedule] = useState<string | null>(null);

  const canScopeAll = hasPermission('manage_leads');

  const load = useCallback(async () => {
    const from = new Date(weekStart);
    const to = new Date(weekStart); to.setDate(to.getDate() + 7);
    const { data } = await rpcCall<MeetingRow[]>('list_meetings', { p_from: from.toISOString(), p_to: to.toISOString(), p_scope: scope });
    if (Array.isArray(data)) setRows(data);
  }, [weekStart, scope]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const buckets: Record<number, MeetingRow[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    rows.forEach(m => { const d = new Date(m.scheduled_at).getDay(); buckets[d].push(m); });
    return buckets;
  }, [rows]);

  const days = [0, 1, 2, 3, 4, 5, 6].map(offset => {
    const d = new Date(weekStart); d.setDate(d.getDate() + offset);
    return { offset, date: d, label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) };
  });

  function prev() { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }
  function next() { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }
  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); setWeekStart(d); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-stone-100"><ChevronLeft className="w-4 h-4 text-stone-700" /></button>
          <button onClick={today} className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100">Today</button>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-stone-100"><ChevronRight className="w-4 h-4 text-stone-700" /></button>
          <span className="ml-2 text-stone-900 text-sm font-semibold">
            {weekStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', day: 'numeric' })} –
            {' '}{new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={scope} onChange={e => setScope(e.target.value as typeof scope)} className={inputCls + ' w-auto'}>
            <option value="mine">My meetings</option>
            <option value="team">My team</option>
            {canScopeAll && <option value="all">Everyone</option>}
          </select>
          <button onClick={() => setShowSchedule(new Date().toISOString())} className={btnCls + ' flex items-center gap-1'}>
            <Plus className="w-4 h-4" /> Schedule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map(d => (
          <div key={d.offset} className="border border-stone-200 rounded-xl bg-white min-h-[220px]">
            <div className="px-2 py-1.5 border-b border-stone-100 flex items-center justify-between bg-stone-50 rounded-t-xl">
              <p className="text-stone-900 text-xs font-bold">{d.label}</p>
              <button onClick={() => { const start = new Date(d.date); start.setHours(10, 0, 0, 0); setShowSchedule(start.toISOString()); }}
                className="text-stone-500 hover:text-teal-700 text-xs">+</button>
            </div>
            <div className="p-1.5 space-y-1">
              {byDay[d.offset].length === 0 && <p className="text-stone-400 text-[10px] text-center py-4">No meetings</p>}
              {byDay[d.offset].map(m => (
                <button key={m.id} onClick={() => setOpen(m)}
                  className={`w-full text-left rounded-lg p-1.5 border text-xs ${statusStyle[m.status]} hover:brightness-95`}>
                  <p className="font-semibold truncate">{fmtTime(m.scheduled_at)} {m.meeting_type_name}</p>
                  <p className="text-[10px] truncate opacity-80">{m.customer_name || m.organizer_name}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && <MeetingDetailModal meeting={open} onClose={() => setOpen(null)} onChanged={load} />}
      {showSchedule && (
        <ScheduleMeetingModal defaultAt={showSchedule} onClose={() => setShowSchedule(null)} onSaved={load} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
export function MeetingTypesManager() {
  const toast = useToast();
  const [rows, setRows] = useState<MeetingType[]>([]);
  const [editing, setEditing] = useState<Partial<MeetingType> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('meeting_types' as never).select('*').order('order_index');
    if (data) setRows(data as MeetingType[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing) return;
    const name = (editing.name || '').trim();
    const slug = (editing.slug || '').trim();
    if (!name || !slug) { toast.error('Name and slug are required'); return; }
    if (!/^[a-z0-9_]+$/.test(slug)) { toast.error('Slug must be lowercase letters, digits, or underscores'); return; }
    let error;
    if (editing.id) {
      const { id, ...patch } = editing;
      ({ error } = await supabase.from('meeting_types' as never).update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id!));
    } else {
      ({ error } = await supabase.from('meeting_types' as never).insert(editing as never));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? 'Type updated' : 'Type added');
    setEditing(null); load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-stone-700 text-sm">Types shown in the "Schedule Meeting" dropdown. Rename, add, or hide as you like.</p>
        <button onClick={() => setEditing({ order_index: 100, default_duration_minutes: 30, active: true })} className={btnCls + ' flex items-center gap-1'}>
          <Plus className="w-4 h-4" /> Add Type
        </button>
      </div>
      <div className="space-y-2">
        {rows.map(t => (
          <div key={t.id} className={cardCls + ' flex items-center justify-between'}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-stone-900 text-sm font-semibold">{t.name}</p>
                <span className="text-[10px] text-stone-500 font-mono">{t.slug}</span>
                {!t.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">hidden</span>}
              </div>
              <p className="text-stone-700 text-xs">{t.default_duration_minutes} min default • {t.description || 'no description'}</p>
            </div>
            <button onClick={() => setEditing(t)} className="text-teal-700 text-sm font-semibold">Edit</button>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-stone-900 font-extrabold text-base">{editing.id ? 'Edit' : 'New'} Meeting Type</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-stone-700" /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Name (shown in dropdowns)" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <input className={inputCls} placeholder="Slug (a-z, 0-9, _)" value={editing.slug || ''}
                onChange={e => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 mb-1 block">Default Duration (min)</label>
                  <input type="number" min={5} max={480} className={inputCls} value={editing.default_duration_minutes ?? 30}
                    onChange={e => setEditing({ ...editing, default_duration_minutes: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 mb-1 block">Order</label>
                  <input type="number" className={inputCls} value={editing.order_index ?? 100}
                    onChange={e => setEditing({ ...editing, order_index: Number(e.target.value) })} />
                </div>
              </div>
              <textarea className={inputCls} rows={2} placeholder="Description (optional)"
                value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={editing.active !== false}
                  onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                Show in dropdown
              </label>
              <div className="flex justify-end gap-2 pt-3">
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs font-semibold text-stone-700">Cancel</button>
                <button onClick={save} className={btnCls + ' text-xs'}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
