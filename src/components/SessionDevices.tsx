import { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone, Tablet, Globe, LogOut, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  listActiveSessions,
  revokeSessionRow,
  revokeAllOtherSessions,
  getCurrentSessionRowId,
  SessionRow,
} from '../lib/sessionTracker';
import { useToast } from '../lib/toast';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 45_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

function iconFor(platform: string | null) {
  if (platform === 'web-mobile') return Smartphone;
  if (platform === 'web-tablet') return Tablet;
  if (platform === 'web-pwa') return Globe;
  return Monitor;
}

// A tiny helper — shows a hint message only after `after` ms have elapsed.
// Prevents "loading forever" feeling on slow connections without changing
// the visual layout every second.
function SlowHint({ after, message }: { after: number; message: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), after);
    return () => clearTimeout(t);
  }, [after]);
  if (!show) return null;
  return <p className="text-stone-500 text-xs">{message}</p>;
}

export default function SessionDevices() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRowId = getCurrentSessionRowId();

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    const list = await listActiveSessions(user.id);
    setRows(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user) return;
      setLoading(true);
      let list = await listActiveSessions(user.id);
      // Closes a real, observed race: on a fresh page load, this query can
      // run before beginSession() has finished creating THIS device's own
      // row, showing "no active devices found" even though one is about to
      // exist. One short retry catches that without a real "empty" state
      // ever waiting longer than necessary.
      if (mounted && list.length === 0) {
        await new Promise(r => setTimeout(r, 1500));
        if (!mounted) return;
        list = await listActiveSessions(user.id);
      }
      if (!mounted) return;
      // If the migration hasn't been run yet the query returns [] and we still
      // want to inform the user (not silently hide the panel).
      setRows(list);
      setLoading(false);
    })();
    // Refresh every 30s while the panel is mounted AND the tab is actually
    // visible. Confirmed via two real HAR files from live sessions: Chrome
    // throttles/pauses timers in background tabs, then fires the whole
    // backlog at once the moment the tab regains focus — every burst of
    // duplicate requests lined up exactly with a tab switch back to this
    // site. Skipping the poll while hidden means there's no backlog to fire
    // when the tab becomes visible again — just the next normal 30s tick.
    const t = window.setInterval(() => {
      if (mounted && document.visibilityState === 'visible') refresh();
    }, 30_000);
    return () => { mounted = false; window.clearInterval(t); };
  }, [user, refresh]);

  async function handleRevoke(row: SessionRow) {
    if (!user) return;
    if (row.id === currentRowId) {
      toast.info('Use Sign Out at the bottom of the sidebar to end this device.');
      return;
    }
    setBusyId(row.id);
    const { error } = await revokeSessionRow(row.id, user.id);
    setBusyId(null);
    if (error) {
      setError(error);
      toast.error(`Couldn't revoke device: ${error}`);
      return;
    }
    toast.success(`Signed out ${row.device_label}`);
    // Optimistic: drop it from the list immediately.
    setRows(prev => prev.filter(r => r.id !== row.id));
  }

  async function handleRevokeAllOthers() {
    if (!user) return;
    setBusyBulk(true);
    const { error, count } = await revokeAllOtherSessions(user.id);
    setBusyBulk(false);
    if (error) {
      setError(error);
      toast.error(`Couldn't sign out other devices: ${error}`);
      return;
    }
    toast.success(count > 0 ? `Signed out ${count} other device${count === 1 ? '' : 's'}` : 'No other devices were signed in');
    refresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200/90 p-6 shadow-sm" data-testid="session-devices-panel">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h3 className="text-stone-900 font-extrabold text-base tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-orange-700" />
            Session Devices
          </h3>
          <p className="text-stone-700 text-xs mt-1 font-medium">
            Every browser you've signed in from. Revoke any device with one click.
          </p>
        </div>
        <button
          onClick={handleRevokeAllOthers}
          disabled={busyBulk || rows.filter(r => r.id !== currentRowId).length === 0}
          className="text-xs font-bold px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          data-testid="revoke-all-others-button"
        >
          {busyBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          Sign out all other devices
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold" data-testid="session-devices-error">
          {error.toLowerCase().includes('user_sessions') || error.toLowerCase().includes('schema cache')
            ? 'Session tracking isn\'t set up yet. Ask your administrator to run the user_sessions migration.'
            : error}
        </div>
      )}

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center text-stone-500 text-sm gap-2">
          <div className="flex items-center">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading your devices…
          </div>
          <SlowHint after={8000} message="Still trying — connection looks slow." />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-stone-700 text-sm" data-testid="session-devices-empty">
          No active devices found. If you just signed in on this device, refresh in a moment.
        </div>
      ) : (
        <ul className="space-y-3" data-testid="session-devices-list">
          {rows.map(r => {
            const Icon = iconFor(r.platform_hint);
            const isCurrent = r.id === currentRowId;
            return (
              <li
                key={r.id}
                data-testid={`session-row-${r.id}`}
                className={`flex items-center gap-3 p-3.5 rounded-xl border ${isCurrent ? 'border-orange-300 bg-orange-50/60' : 'border-stone-200 bg-stone-50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isCurrent ? 'bg-orange-700 text-white' : 'bg-white border border-stone-200 text-stone-700'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-stone-900 text-sm font-bold truncate">{r.device_label}</p>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-orange-700 text-white flex items-center gap-1" data-testid="current-device-badge">
                        <CheckCircle2 className="w-3 h-3" /> This device
                      </span>
                    )}
                  </div>
                  <p className="text-stone-700 text-[11px] font-medium mt-0.5">
                    Active {relativeTime(r.last_seen_at)} · Signed in {relativeTime(r.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(r)}
                  disabled={isCurrent || busyId === r.id}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed border-red-200 text-red-700 bg-white hover:bg-red-50"
                  data-testid={`revoke-session-${r.id}`}
                  title={isCurrent ? 'Use Sign Out to end this session' : 'Sign this device out'}
                >
                  {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Revoke'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-stone-400 text-[11px] font-medium mt-4 leading-relaxed">
        Devices are updated automatically every minute. A revoked device is signed out within about a minute of the click.
      </p>
    </div>
  );
}
