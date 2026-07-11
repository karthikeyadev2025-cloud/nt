import { useEffect, useState } from 'react';
import { FileText, CheckCircle2, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { inputCls, btnCls, cardCls } from './shared';

export const DOC_TYPE_LABELS: Record<string, string> = {
  offer_letter: 'Offer Letter',
  welcome_letter: 'Welcome Letter',
  roles_responsibilities: 'Roles & Responsibilities',
  policy: 'Policy',
  other: 'Document',
};

export function renderTemplate(body: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.split(`{{${key}}}`).join(val || '—'),
    body
  );
}

export function buildOnboardingVars(user: {
  full_name: string; designation: string; role: string; segmentName: string;
  joining_date: string; salary_structure: { ctc: number }; employment_type: string;
}) {
  return {
    name: user.full_name,
    designation: user.designation || user.role,
    role: user.role,
    segment: user.segmentName,
    joining_date: user.joining_date ? new Date(user.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
    ctc: user.salary_structure?.ctc ? Number(user.salary_structure.ctc).toLocaleString('en-IN') : '—',
    employment_type: (user.employment_type || 'full_time').replace('_', ' '),
    company: 'Nikki Technologies',
  };
}

// Printable/downloadable document viewer — used in both portals
export function DocumentViewer({
  title, content, meta, onClose, canAcknowledge, acknowledgedAt, onAcknowledge,
}: {
  title: string;
  content: string;
  meta?: string;
  onClose: () => void;
  canAcknowledge?: boolean;
  acknowledgedAt?: string | null;
  onAcknowledge?: () => void;
}) {
  function handlePrint() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 60px auto; color: #1e293b; line-height: 1.7; white-space: pre-wrap; }
        h1 { font-size: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; }
        .meta { color: #64748b; font-size: 12px; margin-bottom: 30px; }
      </style></head>
      <body><h1>${title}</h1><div class="meta">Nikki Technologies${meta ? ' • ' + meta : ''}</div>${content.replace(/\n/g, '<br/>')}</body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-7" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-white text-lg font-semibold">{title}</h3>
            {meta && <p className="text-slate-500 text-xs mt-0.5">{meta}</p>}
          </div>
          <button className="text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="bg-white text-slate-800 rounded-lg p-6 whitespace-pre-wrap text-sm leading-relaxed font-serif mb-5">
          {content}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={handlePrint} className="flex items-center gap-1.5 text-sky-400 text-sm font-medium">
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
          {canAcknowledge && (
            acknowledgedAt ? (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Acknowledged on {new Date(acknowledgedAt).toLocaleDateString()}
              </span>
            ) : (
              <button className={btnCls} onClick={onAcknowledge}>I acknowledge I've read this</button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Employee-facing document list (used in StaffPortal)
export function MyDocumentsList({ staffUserId }: { staffUserId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data } = await supabase.from('employee_documents').select('*').eq('staff_user_id', staffUserId).order('issued_at', { ascending: false });
    if (data) setDocs(data);
    setLoaded(true);
  }
  useEffect(() => { load(); }, [staffUserId]);

  async function acknowledge(id: string) {
    await supabase.from('employee_documents').update({ acknowledged_at: new Date().toISOString() }).eq('id', id);
    await load();
    setOpen((prev: any) => prev ? { ...prev, acknowledged_at: new Date().toISOString() } : prev);
  }

  if (!loaded) return null;

  return (
    <div className="space-y-2">
      {docs.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No documents issued yet.</p>}
      {docs.map(d => (
        <div key={d.id} className={cardCls + ' flex items-center justify-between cursor-pointer hover:border-slate-600'} onClick={() => setOpen(d)}>
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-sky-400" />
            <div>
              <p className="text-white text-sm font-medium">{d.title}</p>
              <p className="text-slate-500 text-xs">{DOC_TYPE_LABELS[d.doc_type]} • issued {new Date(d.issued_at).toLocaleDateString()}</p>
            </div>
          </div>
          {d.acknowledged_at
            ? <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged</span>
            : <span className="text-xs text-amber-400">Pending review</span>}
        </div>
      ))}
      {open && (
        <DocumentViewer
          title={open.title}
          content={open.content}
          meta={`Issued ${new Date(open.issued_at).toLocaleDateString()}`}
          onClose={() => setOpen(null)}
          canAcknowledge
          acknowledgedAt={open.acknowledged_at}
          onAcknowledge={() => acknowledge(open.id)}
        />
      )}
    </div>
  );
}

// Read-only salary transparency card (used in StaffPortal)
export function MySalaryCard({ salary }: { salary: { basic?: number; hra?: number; allowances?: number; deductions?: number; ctc?: number } }) {
  const s = salary || {};
  const rupee = (n?: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold mb-4 text-sm">Salary Structure</h3>
      <div className="grid grid-cols-2 gap-y-3 text-sm">
        <span className="text-slate-400">Basic</span><span className="text-white text-right">{rupee(s.basic)}</span>
        <span className="text-slate-400">HRA</span><span className="text-white text-right">{rupee(s.hra)}</span>
        <span className="text-slate-400">Allowances</span><span className="text-white text-right">{rupee(s.allowances)}</span>
        <span className="text-slate-400">Deductions</span><span className="text-red-300 text-right">− {rupee(s.deductions)}</span>
        <div className="col-span-2 border-t border-slate-800 my-1" />
        <span className="text-white font-semibold">Annual CTC</span><span className="text-sky-400 font-bold text-right">{rupee(s.ctc)}</span>
      </div>
    </div>
  );
}

export const salaryInputCls = inputCls;
