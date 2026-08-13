import { useState, type ReactNode } from 'react';
import { LogOut, Menu, X, Bell, BellOff, MessageCircle, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBell } from './features';
import { useDueLeadAlerts } from '../../lib/dueAlerts';
import { waLink } from '../../lib/phone';

export type PortalTab = { id: string; label: string; icon: LucideIcon; show: boolean };

// Fixed-position stack of "coming up in ~15 minutes" cards — sound +
// visual, separate from the ephemeral 4-second toast system since these
// need to actually get someone's attention, not flash and vanish.
// Deliberately minimal: Call + Dismiss only. The full to-do list (My
// To-Do on Home) is where Mark Done / Reschedule live — this banner's
// job is just to interrupt at the right moment, not duplicate that UI.
const ALERT_TYPE_META: Record<string, { label: string; icon: string }> = {
  followup: { label: 'Follow-up in 15 min', icon: '📞' },
  callback: { label: 'Callback in 15 min', icon: '☎️' },
  appointment: { label: 'Appointment in 15 min', icon: '📅' },
  meeting: { label: 'Meeting in 15 min', icon: '🗓️' },
};

export function DueAlertBanner({ alerts, onDismiss, onSnooze }: { alerts: ReturnType<typeof useDueLeadAlerts>['activeAlerts']; onDismiss: (key: string) => void; onSnooze: (key: string, minutes?: number) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-1.5rem)] max-w-sm space-y-2">
      {alerts.map(a => (
        <div key={a.key} className="bg-white border-2 border-nikki-royal rounded-2xl shadow-2xl p-3.5 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">{ALERT_TYPE_META[a.type]?.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-nikki-navy text-sm font-bold truncate">{ALERT_TYPE_META[a.type]?.label}: {a.customerName}</p>
              <p className="text-stone-700 text-xs">{a.phone}</p>
            </div>
            <button onClick={() => onDismiss(a.key)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 shrink-0"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-1.5">
            <a href={`tel:${a.phone}`} onClick={() => onDismiss(a.key)} className="flex-1 text-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Call</a>
            {waLink(a.phone) && (
              <a href={waLink(a.phone) ?? undefined} target="_blank" rel="noreferrer" onClick={() => onDismiss(a.key)} className="p-1.5 rounded-lg bg-[#25D366] text-white shrink-0" title="WhatsApp">
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            <button onClick={() => onSnooze(a.key, 60)} className="px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold shrink-0">Snooze 1h</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Shared chrome for every role-specific portal (Telecaller, Marketing
 * Executive, and the generic Staff fallback). Renders the sidebar, mobile
 * drawer, header, and sign-out — every portal composing this gets session
 * handling, notification routing, and nav behavior for free, and a fix
 * here (e.g. a sidebar bug, a notification routing change) applies to
 * every role at once instead of needing to be repeated in N files.
 *
 * `brandLabel` lets each portal show its own identity in the sidebar
 * ("Telecaller Portal" vs "Field Portal") without forking the layout.
 */
export function PortalShell({
  tabs, activeTab, onTabChange, brandLabel, subLabel, children,
}: {
  tabs: PortalTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  brandLabel: string;
  subLabel: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const visibleTabs = tabs.filter(t => t.show);
  const { activeAlerts, dismiss, snooze, soundEnabled, setSoundEnabled, requestNotificationPermission, notifPermission } = useDueLeadAlerts();

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row text-nikki-navy">
      <DueAlertBanner alerts={activeAlerts} onDismiss={dismiss} onSnooze={snooze} />
      {/* ── Desktop Collapsible Sidebar ── */}
      <aside className={`hidden md:flex flex-col border-r border-nikki-border bg-white backdrop-blur sticky top-0 h-screen transition-all duration-300 z-40 shadow-sm ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-4 border-b border-nikki-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/nikki-logo-new.png" alt="Nikki Technologies" className="w-8 h-8 shrink-0 object-contain" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-nikki-navy font-bold text-sm tracking-tight truncate">{brandLabel}</p>
                <p className="text-stone-700 text-[11px] font-mono truncate">{subLabel}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-stone-700 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleTabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-nikki-surface-blue border border-nikki-border text-nikki-navy shadow-sm font-semibold'
                    : 'text-stone-700 hover:text-nikki-navy hover:bg-stone-100 border border-transparent'
                }`}
                title={collapsed ? t.label : undefined}
              >
                <t.icon className={`w-5 h-5 shrink-0 ${active ? 'text-nikki-blue' : 'text-stone-700'}`} />
                {!collapsed && <span className="truncate">{t.label}</span>}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-nikki-border">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-stone-50 border border-nikki-border">
            <div className="w-8 h-8 rounded-lg bg-nikki-surface-blue border border-nikki-border text-nikki-navy font-bold flex items-center justify-center text-xs shrink-0">
              {user?.full_name?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-nikki-navy text-xs font-semibold truncate">{user?.full_name}</p>
                <p className="text-stone-700 text-[10px] capitalize truncate">{user?.role?.replace('_', ' ')}</p>
              </div>
            )}
            <button onClick={signOut} className="text-stone-700 hover:text-red-700 p-1" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-nikki-border px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-30 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-1 -ml-1 text-stone-700 shrink-0"><Menu className="w-6 h-6" /></button>
            <div className="md:hidden shrink-0">
              <img src="/nikki-logo-new.png" alt="Nikki Technologies" className="w-8 h-8 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-nikki-navy font-bold text-base md:text-lg tracking-tight truncate">
                {visibleTabs.find(t => t.id === activeTab)?.label || brandLabel}
              </h1>
              <p className="text-stone-700 text-xs hidden sm:block truncate">{subLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => { setSoundEnabled(!soundEnabled); if (notifPermission === 'default') requestNotificationPermission(); }}
              title={soundEnabled ? 'Sound alerts on for due follow-ups/appointments — tap to mute' : 'Sound alerts muted — tap to enable'}
              className={`p-1.5 rounded-lg transition-colors ${soundEnabled ? 'text-nikki-blue hover:bg-nikki-surface-blue' : 'text-stone-400 hover:bg-stone-100'}`}>
              {soundEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
            <NotificationBell onNavigate={(t) => { if (visibleTabs.some(x => x.id === t)) onTabChange(t); }} />
            <button onClick={signOut} className="md:hidden text-stone-700 hover:text-red-700"><LogOut className="w-5 h-5" /></button>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-nikki-navy/50" onClick={() => setMobileNavOpen(false)} />
            <div className="relative w-72 max-w-[85vw] bg-white h-full overflow-y-auto p-4 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src="/nikki-logo-new.png" alt="Nikki Technologies" className="w-8 h-8 shrink-0 object-contain" />
                  <div className="min-w-0">
                    <p className="text-nikki-navy font-bold text-sm tracking-tight truncate">{brandLabel}</p>
                    <p className="text-stone-700 text-[11px] font-mono truncate">{subLabel}</p>
                  </div>
                </div>
                <button onClick={() => setMobileNavOpen(false)} className="p-1 text-stone-700 shrink-0"><X className="w-5 h-5" /></button>
              </div>
              <nav className="flex-1 space-y-1">
                {visibleTabs.map(t => {
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { onTabChange(t.id); setMobileNavOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'bg-nikki-surface-blue border border-nikki-border text-nikki-navy shadow-sm font-semibold'
                          : 'text-stone-700 hover:text-nikki-navy hover:bg-stone-100 border border-transparent'
                      }`}
                    >
                      <t.icon className={`w-5 h-5 shrink-0 ${active ? 'text-nikki-blue' : 'text-stone-700'}`} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </nav>
              <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-stone-700 hover:text-red-700 text-sm font-semibold border-t border-nikki-border pt-3">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        )}

        <main className="p-4 md:p-6 max-w-6xl w-full mx-auto flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
