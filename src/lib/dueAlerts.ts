import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

// Two-tone chime via the Web Audio API — no audio file to host or ship,
// so there's nothing that can 404 or get blocked by a CDN hiccup.
//
// Browsers refuse to let audio play until the page has had at least one
// user gesture (a click/tap/keypress) — an AudioContext created before
// that happens starts 'suspended' and produces no sound at all, silently,
// no error. Reusing one context (created lazily, resumed on first
// interaction) instead of a fresh one per chime means that by the time
// any alert could plausibly fire, it's already unlocked in the overwhelming
// majority of real sessions — logging in itself is a click.
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  return sharedAudioCtx;
}
if (typeof window !== 'undefined') {
  const unlock = () => { getAudioContext()?.resume().catch(() => {}); };
  ['click', 'touchstart', 'keydown'].forEach(evt => window.addEventListener(evt, unlock, { once: true, passive: true }));
}

function playChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const tones = [880, 1108.73]; // A5, C#6 — a short, pleasant two-note "ding"
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch {
    // Web Audio blocked or unsupported — the visual banner still fires.
  }
}

export type DueAlert = {
  key: string; leadId: string; customerName: string; phone: string;
  type: 'followup' | 'callback' | 'appointment' | 'meeting'; dueAt: string;
};

const SOUND_PREF_KEY = 'nt_due_alert_sound_enabled';
// Fires 15 minutes before the scheduled time, not at it — an actual
// heads-up you can act on ("call in 15 min") rather than a notice that
// the moment has already arrived and passed.
const ALERT_LEAD_MS = 15 * 60 * 1000;

export function useDueLeadAlerts() {
  const { user } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState<DueAlert[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState(() => localStorage.getItem(SOUND_PREF_KEY) !== 'false');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  // Every key we've either alerted on or decided not to (already overdue
  // when the session started) — never alert the same item twice.
  const seenRef = useRef<Set<string>>(new Set());
  const firstPollRef = useRef(true);

  function setSoundEnabled(v: boolean) {
    setSoundEnabledState(v);
    localStorage.setItem(SOUND_PREF_KEY, String(v));
  }

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  }

  const poll = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('marketing_leads')
      .select('id, customer_name, phone, next_followup_at, callback_at, appointment_at, stage')
      .eq('assigned_to', user.id)
      .not('stage', 'in', '(won,lost)')
      .or('next_followup_at.not.is.null,callback_at.not.is.null,appointment_at.not.is.null')
      .limit(200);
    if (error || !data) return;

    const now = Date.now();
    const isFirstPoll = firstPollRef.current;
    const newlyDue: DueAlert[] = [];
    data.forEach(l => {
      const candidates: { key: string; type: DueAlert['type']; dueAt: string | null }[] = [
        { key: `${l.id}-f`, type: 'followup', dueAt: l.next_followup_at },
        { key: `${l.id}-c`, type: 'callback', dueAt: l.callback_at },
        { key: `${l.id}-a`, type: 'appointment', dueAt: l.appointment_at },
      ];
      candidates.forEach(c => {
        if (!c.dueAt || seenRef.current.has(c.key)) return;
        const due = new Date(c.dueAt).getTime();
        if (due - ALERT_LEAD_MS > now) return; // more than 15 min away, not due yet
        seenRef.current.add(c.key);
        // On the very first poll after mount, anything already inside its
        // 15-minute window (or overdue) predates this session — silently
        // acknowledge it (it's already visible in the to-do list) instead
        // of firing an alert storm.
        if (isFirstPoll) return;
        newlyDue.push({ key: c.key, leadId: l.id, customerName: l.customer_name, phone: l.phone, type: c.type, dueAt: c.dueAt });
      });
    });

    // Meetings — a different table (the Team Calendar system), same
    // 15-minute-before threshold. list_meetings via supabase.rpc(...)
    // directly (never extracted to a local variable first — that
    // detaches it from the client's `this` and throws inside the
    // library, a bug fixed elsewhere in this codebase already).
    try {
      const from = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // small back-window covers anything just inside its 15-min mark
      const to = new Date(now + ALERT_LEAD_MS + 5 * 60000).toISOString();
      const { data: meetings } = await supabase.rpc('list_meetings' as never, { p_from: from, p_to: to, p_scope: 'mine' } as never) as unknown as {
        data: { id: string; lead_id: string | null; customer_name: string | null; customer_phone: string | null; meeting_type_name: string; scheduled_at: string; status: string }[] | null;
      };
      (Array.isArray(meetings) ? meetings : []).forEach(m => {
        const key = `mtg-${m.id}`;
        if (m.status !== 'scheduled' || seenRef.current.has(key)) return;
        const due = new Date(m.scheduled_at).getTime();
        if (due - ALERT_LEAD_MS > now) return;
        seenRef.current.add(key);
        if (isFirstPoll) return;
        newlyDue.push({ key, leadId: m.lead_id || '', customerName: m.customer_name || m.meeting_type_name, phone: m.customer_phone || '', type: 'meeting', dueAt: m.scheduled_at });
      });
    } catch { /* meetings are a bonus on this alert stream, not load-bearing */ }
    firstPollRef.current = false;

    if (newlyDue.length > 0) {
      setActiveAlerts(prev => [...prev, ...newlyDue]);
      if (soundEnabled) playChime();
      if (notifPermission === 'granted') {
        newlyDue.forEach(a => {
          const label = a.type === 'appointment' ? 'Appointment' : a.type === 'callback' ? 'Callback' : a.type === 'meeting' ? 'Meeting' : 'Follow-up';
          new Notification(`${label} in 15 min: ${a.customerName}`, { body: a.phone, tag: a.key });
        });
      }
    }
  }, [user, soundEnabled, notifPermission]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [poll]);

  function dismiss(key: string) {
    setActiveAlerts(prev => prev.filter(a => a.key !== key));
  }

  // Snooze: hide it now, but let it alert again after the delay instead of
  // marking it seen forever (dismiss stays permanent-for-this-item;
  // snooze is "remind me again shortly").
  function snooze(key: string, minutes = 60) {
    setActiveAlerts(prev => prev.filter(a => a.key !== key));
    setTimeout(() => { seenRef.current.delete(key); }, minutes * 60000);
  }

  return { activeAlerts, dismiss, snooze, soundEnabled, setSoundEnabled, requestNotificationPermission, notifPermission };
}
