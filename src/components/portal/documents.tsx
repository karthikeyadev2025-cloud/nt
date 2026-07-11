import { useEffect, useRef, useState } from 'react';
import { FileText, CheckCircle2, Printer, PenLine, RotateCcw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
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

// ─────────────────────────── Signature Pad (draw on canvas, mobile + desktop)
function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  function ctx() {
    const c = canvasRef.current;
    return c ? c.getContext('2d') : null;
  }

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const g = ctx();
    if (!g) return;
    g.beginPath();
    g.moveTo(x, y);
    setEmpty(false);
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const g = ctx();
    if (!g) return;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.strokeStyle = '#0f172a';
    g.lineTo(x, y);
    g.stroke();
  }
  function end() { drawing.current = false; }

  function clear() {
    const c = canvasRef.current;
    const g = ctx();
    if (c && g) g.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }

  function capture() {
    const c = canvasRef.current;
    if (!c || empty) return;
    onCapture(c.toDataURL('image/png'));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={140}
        className="w-full bg-white rounded-lg touch-none border border-slate-300"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div className="flex justify-between items-center mt-2">
        <button onClick={clear} className="flex items-center gap-1 text-slate-400 text-xs">
          <RotateCcw className="w-3.5 h-3.5" /> Clear
        </button>
        <button onClick={capture} disabled={empty} className={btnCls + ' disabled:opacity-40'}>
          <PenLine className="w-4 h-4 inline mr-1.5" /> Use This Signature
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Document Viewer (view / print / sign / acknowledge)
export function DocumentViewer({
  title, content, meta, onClose,
  requiresSignature, signed, signatureDataUrl, signedName, acknowledgedAt,
  onSign, onAcknowledge,
}: {
  title: string;
  content: string;
  meta?: string;
  onClose: () => void;
  requiresSignature?: boolean;
  signed?: boolean;
  signatureDataUrl?: string | null;
  signedName?: string | null;
  acknowledgedAt?: string | null;
  onSign?: (dataUrl: string, typedName: string) => void;
  onAcknowledge?: () => void;
}) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const canSubmit = requiresSignature !== undefined; // viewer is interactive only when a callback context is given

  function handlePrint() {
    const w = window.open('', '_blank');
    if (!w) return;
    const sigBlock = signed && signatureDataUrl
      ? `<div style="margin-top:40px"><img src="${signatureDataUrl}" style="height:60px"/><p style="font-size:12px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:6px;width:260px">Signed by ${signedName || ''} on ${acknowledgedAt ? new Date(acknowledgedAt).toLocaleDateString() : ''}</p></div>`
      : signed ? `<p style="margin-top:40px;font-size:12px;color:#64748b">Acknowledged on ${acknowledgedAt ? new Date(acknowledgedAt).toLocaleDateString() : ''}</p>` : '';
    w.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 60px auto; color: #1e293b; line-height: 1.7; white-space: pre-wrap; }
        h1 { font-size: 20px; border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; }
        .meta { color: #64748b; font-size: 12px; margin-bottom: 30px; }
      </style></head>
      <body><h1>${title}</h1><div class="meta">Nikki Technologies${meta ? ' • ' + meta : ''}</div>${content.replace(/\n/g, '<br/>')}${sigBlock}</body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-7" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-white text-lg font-semibold">{title}</h3>
            {meta && <p className="text-slate-500 text-xs mt-0.5">{meta}</p>}
          </div>
          <button className="text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="bg-white text-slate-800 rounded-lg p-6 whitespace-pre-wrap text-sm leading-relaxed font-serif mb-5">
          {content}
          {signed && signatureDataUrl && (
            <div className="mt-8 pt-3 border-t border-slate-300 inline-block">
              <img src={signatureDataUrl} alt="Signature" className="h-14" />
              <p className="text-xs text-slate-500 mt-1">Signed by {signedName} • {acknowledgedAt && new Date(acknowledgedAt).toLocaleString()}</p>
            </div>
          )}
          {signed && !signatureDataUrl && (
            <p className="text-xs text-slate-500 mt-6 pt-3 border-t border-slate-300">Acknowledged on {acknowledgedAt && new Date(acknowledgedAt).toLocaleString()}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-sky-400 text-sm font-medium mb-4">
          <button onClick={handlePrint} className="flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
        </div>

        {canSubmit && !signed && requiresSignature && (
          <div className="border-t border-slate-800 pt-5">
            <p className="text-white text-sm font-medium mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-sky-400" /> Sign to accept this document</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('draw')} className={`px-3 py-1 rounded-lg text-xs border ${mode === 'draw' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Draw Signature</button>
              <button onClick={() => setMode('type')} className={`px-3 py-1 rounded-lg text-xs border ${mode === 'type' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Type Name</button>
            </div>
            {mode === 'draw' ? (
              <SignaturePad onCapture={dataUrl => onSign && onSign(dataUrl, '')} />
            ) : (
              <div className="space-y-2">
                <input className={inputCls} placeholder="Type your full legal name" value={typedName} onChange={e => setTypedName(e.target.value)} />
                {typedName && <p className="text-2xl text-slate-900 bg-white rounded-lg px-4 py-3" style={{ fontFamily: 'cursive' }}>{typedName}</p>}
                <button className={btnCls + ' w-full'} disabled={!typedName.trim()} onClick={() => onSign && onSign('', typedName.trim())}>
                  Confirm & Sign
                </button>
              </div>
            )}
          </div>
        )}

        {canSubmit && !signed && !requiresSignature && (
          <div className="border-t border-slate-800 pt-5 flex justify-end">
            <button className={btnCls} onClick={onAcknowledge}>I acknowledge I've read this</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Employee-facing document list (StaffPortal)
export function MyDocumentsList({ staffUserId, employeeName }: { staffUserId: string; employeeName?: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();

  async function load() {
    const { data, error } = await supabase.from('employee_documents').select('*').eq('staff_user_id', staffUserId).order('issued_at', { ascending: false });
    if (error) { toast.error(`Couldn't load documents: ${error.message}`); setLoaded(true); return; }
    if (data) setDocs(data);
    setLoaded(true);
  }
  useEffect(() => { load(); }, [staffUserId]);

  async function sign(id: string, dataUrl: string, typedName: string) {
    const patch = {
      acknowledged_at: new Date().toISOString(),
      signature_data_url: dataUrl || null,
      signed_name: typedName || employeeName || '',
    };
    const { error } = await supabase.from('employee_documents').update(patch).eq('id', id);
    if (error) { toast.error(`Couldn't save signature: ${error.message}`); return; }
    toast.success('Document signed');
    await load();
    setOpen((prev: any) => prev ? { ...prev, ...patch } : prev);
  }

  async function acknowledge(id: string) {
    const patch = { acknowledged_at: new Date().toISOString() };
    const { error } = await supabase.from('employee_documents').update(patch).eq('id', id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    toast.success('Acknowledged');
    await load();
    setOpen((prev: any) => prev ? { ...prev, ...patch } : prev);
  }

  if (!loaded) return null;
  const pending = docs.filter(d => !d.acknowledged_at).length;

  return (
    <div className="space-y-2">
      {pending > 0 && (
        <div className="mb-3 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-600/40 text-amber-300 text-sm">
          You have {pending} document{pending > 1 ? 's' : ''} awaiting your signature/acknowledgement.
        </div>
      )}
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
            ? <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {d.requires_signature ? 'Signed' : 'Acknowledged'}</span>
            : <span className="text-xs text-amber-400">{d.requires_signature ? 'Needs signature' : 'Needs review'}</span>}
        </div>
      ))}
      {open && (
        <DocumentViewer
          title={open.title}
          content={open.content}
          meta={`Issued ${new Date(open.issued_at).toLocaleDateString()}`}
          onClose={() => setOpen(null)}
          requiresSignature={open.requires_signature}
          signed={!!open.acknowledged_at}
          signatureDataUrl={open.signature_data_url}
          signedName={open.signed_name}
          acknowledgedAt={open.acknowledged_at}
          onSign={(dataUrl, typedName) => sign(open.id, dataUrl, typedName)}
          onAcknowledge={() => acknowledge(open.id)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Read-only salary transparency card
export function MySalaryCard({ salary }: { salary?: { basic?: number; hra?: number; allowances?: number; deductions?: number; ctc?: number } }) {
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

// ─────────────────────────── Onboarding status badge (Super Admin views)
export function OnboardingStatusBadge({ staffUserId }: { staffUserId: string }) {
  const [status, setStatus] = useState<{ total: number; done: number } | null>(null);
  useEffect(() => {
    supabase.from('employee_documents').select('acknowledged_at').eq('staff_user_id', staffUserId)
      .then(({ data }) => {
        if (data) setStatus({ total: data.length, done: data.filter((d: any) => d.acknowledged_at).length });
      });
  }, [staffUserId]);
  if (!status || status.total === 0) return <span className="text-xs text-slate-600">No documents</span>;
  const complete = status.done === status.total;
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${complete ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
      {complete ? 'Onboarding complete' : `${status.done}/${status.total} signed`}
    </span>
  );
}
