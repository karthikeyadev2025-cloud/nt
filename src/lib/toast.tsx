import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; kind: ToastKind; message: string; action?: ToastAction }

export interface ToastContextType {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  /**
   * A toast carrying one action, for an Undo window.
   *
   * `ms` is how long the toast stays, and callers use it as the window in
   * which the action can still be taken — so it has to be long enough to
   * notice, read and reach on a phone, not the 4 seconds a "Saved" gets.
   * The action button dismisses the toast itself, so taking it never races
   * the timer.
   */
  action: (msg: string, label: string, onClick: () => void, ms?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string, action?: ToastAction, ms?: number) => {
    const id = ++counter;
    setItems(prev => [...prev, { id, kind, message, action }]);
    // Errors stay twice as long. Four seconds is fine for "Saved" but it's
    // not enough to read, understand and act on a failure message — and
    // these are the toasts that actually carry information the user needs
    // (a rejected save, a sync error, a validation message from the DB).
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), ms ?? (kind === 'error' ? 8000 : 4000));
  }, []);

  const value: ToastContextType = useMemo(() => ({
    success: (msg: string) => push('success', msg),
    error: (msg: string) => push('error', msg),
    info: (msg: string) => push('info', msg),
    action: (msg: string, label: string, onClick: () => void, ms = 7000) =>
      push('info', msg, { label, onClick }, ms),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        Live region. Without this a toast is a purely visual event: a screen
        reader user submitted a form, got no spoken confirmation, and had no
        way to know whether it saved or failed.

        role="status"/aria-live="polite" queues the announcement behind
        whatever is being read rather than cutting it off — correct for
        "Saved", and correct for errors too here, since every error toast in
        this app accompanies an action the user just took and none of them
        are time-critical interruptions. aria-atomic makes the toast read as
        one sentence instead of word-fragments as it animates in.

        The region itself is always mounted (not conditional on there being
        toasts) because assistive tech only announces changes inside a live
        region that already existed when the change happened.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[100] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
        {items.map(t => (
          <div key={t.id}
            className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm animate-in fade-in slide-in-from-bottom-2 ${
              t.kind === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-200' :
              t.kind === 'error' ? 'bg-red-950 border-red-700 text-red-200' :
              'bg-nikki-navy border-stone-700 text-stone-200'
            }`}>
            {/* The icon duplicates what the colour already says, so it's
                decorative — hiding it stops the toast being read as
                "image, Saved". Meaning never rests on colour alone: the
                text itself always states the outcome. */}
            {t.kind === 'success' ? <CheckCircle2 aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" /> : t.kind === 'error' ? <XCircle aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" /> : null}
            <span className="flex-1">{t.message}</span>
            {/* Sized to the 44px touch floor like every other primary control:
                this is the button someone jabs at on a phone having just
                realised they tapped the wrong lead, and missing it means the
                action they wanted to stop goes through. */}
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  setItems(prev => prev.filter(x => x.id !== t.id));
                  t.action!.onClick();
                }}
                className="shrink-0 min-h-[44px] px-3 -my-1 rounded-lg font-bold underline underline-offset-2 hover:bg-white/10">
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
              aria-label="Dismiss notification"
              className="opacity-60 hover:opacity-100 -m-2 p-2 shrink-0">
              <X aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// useToast is a hook, not a component — same reasoning as useAuth in
// AuthContext.tsx: a context's Provider and its accompanying hook belong
// in the same file by convention, not split apart to satisfy this rule.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// reportResult lives in toast-utils.ts, imported directly from there by
// callers — kept out of this file so it doesn't trip
// react-refresh/only-export-components alongside ToastProvider/useToast,
// which stay here since a Context's Provider and its accompanying hook are
// conventionally colocated.
