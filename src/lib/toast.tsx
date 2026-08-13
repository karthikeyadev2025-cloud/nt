import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string; }

export interface ToastContextType {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter;
    setItems(prev => [...prev, { id, kind, message }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const value: ToastContextType = useMemo(() => ({
    success: (msg: string) => push('success', msg),
    error: (msg: string) => push('error', msg),
    info: (msg: string) => push('info', msg),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
        {items.map(t => (
          <div key={t.id}
            className={`flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm animate-in fade-in slide-in-from-bottom-2 ${
              t.kind === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-200' :
              t.kind === 'error' ? 'bg-red-950 border-red-700 text-red-200' :
              'bg-nikki-navy border-stone-700 text-stone-200'
            }`}>
            {t.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : t.kind === 'error' ? <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> : null}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))} className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
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
