import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ModalOverlay } from './Modal';

/*
  In-app replacement for window.confirm().

  Thirteen destructive actions — deleting leads in bulk, deleting a product,
  removing a holiday, merging lead records, overriding a payroll balance —
  were gated behind the browser's native confirm(). That dialog:

    • is prefixed "nikkitechnologies.com says" on every mobile browser,
      which reads as a scam popup rather than as part of the app;
    • is suppressed entirely by the "prevent this page from creating
      additional dialogs" checkbox, after which every guarded action
      silently returns false and the app appears to ignore the button;
    • cannot distinguish a destructive action from a routine one — the
      confirm button looks identical whether the user is about to delete
      41 leads or reschedule a meeting;
    • blocks the main thread, freezing any in-flight rendering behind it.

  useConfirm() returns a promise-based replacement with the same call shape,
  so `if (!await confirm({...})) return;` reads like the original guard.
*/

export interface ConfirmOptions {
  title: string;
  /** Supporting detail. Say what will happen and whether it can be undone. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' renders the confirm button red — use for destructive actions. */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>(resolve => {
      // If something opens a second confirm while one is pending, settle the
      // first as "cancelled" rather than leaving its caller awaiting forever.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setOpts(next);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOpts(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(ok);
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const danger = opts?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {opts && (
        <ModalOverlay
          className="fixed inset-0 z-[120] bg-nikki-navy/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClose={() => settle(false)}
          label={opts.title}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-nikki-border">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-nikki-surface-blue text-nikki-blue'}`}>
                <AlertTriangle aria-hidden="true" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-nikki-navy font-bold text-base leading-snug">{opts.title}</h2>
                {opts.body && <div className="text-stone-700 text-sm mt-1.5 leading-relaxed break-words">{opts.body}</div>}
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              {/*
                Cancel is first in the DOM and takes initial focus, so
                Enter on an accidentally-triggered dialog cancels rather
                than confirms a deletion. It's ordered left of Confirm
                visually, matching every other button pair in this app.
              */}
              <button
                type="button"
                autoFocus
                onClick={() => settle(false)}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-stone-100 hover:bg-nikki-border text-stone-800 text-sm font-semibold transition-colors"
              >
                {opts.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`flex-1 min-h-[44px] px-4 rounded-xl text-white text-sm font-bold transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-nikki-blue hover:bg-nikki-royal'}`}
              >
                {opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </ConfirmContext.Provider>
  );
}

// Hook colocated with its Provider, same convention as useToast/useAuth.
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
