import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

// Two-tone chime via the Web Audio API — no audio file to host or ship,
// so there's nothing that can 404 or get blocked by a CDN hiccup.
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
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
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Web Audio blocked or unsupported — the visual banner still fires.
  }
}

export type DueAlert = {
  key: string; leadId: string; customerName: string; phone: string;
  type: 'followup' | 'callback' | 'appointment'; dueAt: string;
};

const SOUND_PREF_KEY = 'nt_due_alert_sound_enabled';

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
        if (due > now) return; // not due yet
        seenRef.current.add(c.key);
        // On the very first poll after mount, anything already overdue
        // predates this session — silently acknowledge it (it's already
        // visible in the to-do list) instead of firing an alert storm.
        if (firstPollRef.current) return;
        newlyDue.push({ key: c.key, leadId: l.id, customerName: l.customer_name, phone: l.phone, type: c.type, dueAt: c.dueAt });
      });
    });
    firstPollRef.current = false;

    if (newlyDue.length > 0) {
      setActiveAlerts(prev => [...prev, ...newlyDue]);
      if (soundEnabled) playChime();
      if (notifPermission === 'granted') {
        newlyDue.forEach(a => {
          const label = a.type === 'appointment' ? 'Appointment' : a.type === 'callback' ? 'Callback' : 'Follow-up';
          new Notification(`${label} due: ${a.customerName}`, { body: a.phone, tag: a.key });
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
