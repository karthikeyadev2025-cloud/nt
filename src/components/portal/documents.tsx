import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, CheckCircle2, Printer, PenLine, RotateCcw, ShieldCheck, X, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { cachedQuery } from '../../lib/cachedQuery';
import { inputCls, btnCls, cardCls } from './shared';

export const DOC_TYPE_LABELS: Record<string, string> = {
  offer_letter: 'Offer Letter',
  appointment_letter: 'Appointment Letter',
  welcome_letter: 'Welcome Letter',
  roles_responsibilities: 'Roles & Responsibilities',
  job_description: 'Job Description',
  confirmation_letter: 'Confirmation Letter',
  nda: 'Confidentiality Agreement (NDA)',
  code_of_conduct: 'Code of Conduct',
  posh_policy: 'POSH Policy',
  it_asset_policy: 'IT & Asset Policy',
  leave_policy: 'Leave Policy',
  salary_certificate: 'Salary Certificate',
  increment_letter: 'Increment / Promotion Letter',
  warning_letter: 'Warning Letter',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  internship_certificate: 'Internship Certificate',
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
  reporting_time?: string; staff_code?: string | null; exit_date?: string | null;
}) {
  return {
    name: user.full_name,
    designation: user.designation || user.role,
    role: user.role,
    segment: user.segmentName,
    joining_date: user.joining_date ? new Date(user.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
    ctc: user.salary_structure?.ctc ? Number(user.salary_structure.ctc).toLocaleString('en-IN') : '—',
    employment_type: (user.employment_type || 'full_time').replace('_', ' '),
    reporting_time: user.reporting_time || '9:30 AM – 6:30 PM, Monday to Saturday',
    staff_code: user.staff_code || '—',
    // Exit-document templates (experience, relieving, internship certificate)
    exit_date: user.exit_date
      ? new Date(user.exit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—',
    // Issue date, used as the letterhead date on every document
    today: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
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
        className="w-full bg-white rounded-lg touch-none border border-stone-300"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div className="flex justify-between items-center mt-2">
        <button onClick={clear} className="flex items-center gap-1 text-stone-700 text-xs">
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
      <div className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-7" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-stone-900 text-lg font-semibold">{title}</h3>
            {meta && <p className="text-stone-700 text-xs mt-0.5">{meta}</p>}
          </div>
          <button className="text-stone-700 hover:text-stone-900" onClick={onClose}>✕</button>
        </div>

        <div className="bg-white text-stone-800 rounded-lg p-6 whitespace-pre-wrap text-sm leading-relaxed font-serif mb-5">
          {content}
          {signed && signatureDataUrl && (
            <div className="mt-8 pt-3 border-t border-stone-300 inline-block">
              <img src={signatureDataUrl} alt="Signature" className="h-14" />
              <p className="text-xs text-stone-700 mt-1">Signed by {signedName} • {acknowledgedAt && new Date(acknowledgedAt).toLocaleString()}</p>
            </div>
          )}
          {signed && !signatureDataUrl && (
            <p className="text-xs text-stone-700 mt-6 pt-3 border-t border-stone-300">Acknowledged on {acknowledgedAt && new Date(acknowledgedAt).toLocaleString()}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-teal-700 text-sm font-medium mb-4">
          <button onClick={handlePrint} className="flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
        </div>

        {canSubmit && !signed && requiresSignature && (
          <div className="border-t border-stone-800 pt-5">
            <p className="text-stone-900 text-sm font-medium mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-teal-700" /> Sign to accept this document</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('draw')} className={`px-3 py-1 rounded-lg text-xs border ${mode === 'draw' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Draw Signature</button>
              <button onClick={() => setMode('type')} className={`px-3 py-1 rounded-lg text-xs border ${mode === 'type' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Type Name</button>
            </div>
            {mode === 'draw' ? (
              <SignaturePad onCapture={dataUrl => onSign && onSign(dataUrl, '')} />
            ) : (
              <div className="space-y-2">
                <input className={inputCls} placeholder="Type your full legal name" value={typedName} onChange={e => setTypedName(e.target.value)} />
                {typedName && <p className="text-2xl text-stone-900 bg-white rounded-lg px-4 py-3" style={{ fontFamily: 'cursive' }}>{typedName}</p>}
                <button className={btnCls + ' w-full'} disabled={!typedName.trim()} onClick={() => onSign && onSign('', typedName.trim())}>
                  Confirm & Sign
                </button>
              </div>
            )}
          </div>
        )}

        {canSubmit && !signed && !requiresSignature && (
          <div className="border-t border-stone-800 pt-5 flex justify-end">
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

  const load = useCallback(async () => {
    try {
      const data = await cachedQuery(`emp_docs:${staffUserId}`, async () => {
        const { data, error } = await supabase.from('employee_documents').select('*').eq('staff_user_id', staffUserId).order('issued_at', { ascending: false });
        if (error) throw error;
        return data || [];
      });
      setDocs(data);
      setLoaded(true);
    } catch (err: any) {
      toast.error(`Couldn't load documents: ${err.message}`);
      setLoaded(true);
    }
  }, [staffUserId]);
  useEffect(() => { load(); }, [load]);

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
        <div className="mb-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-600/40 text-amber-700 text-sm">
          You have {pending} document{pending > 1 ? 's' : ''} awaiting your signature/acknowledgement.
        </div>
      )}
      {docs.length === 0 && <p className="text-stone-700 text-sm text-center py-10">No documents issued yet.</p>}
      {docs.map(d => (
        <div key={d.id} className={cardCls + ' flex items-center justify-between cursor-pointer hover:border-stone-300'} onClick={() => setOpen(d)}>
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-teal-700" />
            <div>
              <p className="text-stone-900 text-sm font-medium">{d.title}</p>
              <p className="text-stone-700 text-xs">{DOC_TYPE_LABELS[d.doc_type]} • issued {new Date(d.issued_at).toLocaleDateString()}</p>
            </div>
          </div>
          {d.acknowledged_at
            ? <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {d.requires_signature ? 'Signed' : 'Acknowledged'}</span>
            : <span className="text-xs text-amber-700">{d.requires_signature ? 'Needs signature' : 'Needs review'}</span>}
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
export function MySalaryCard({ salary }: { salary?: { basic?: number; hra?: number; allowances?: number; deductions?: number; performance_bonus?: number; incentives?: number; ctc?: number } }) {
  const s = salary || {};
  const rupee = (n?: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold mb-4 text-sm">Salary Structure</h3>
      <div className="grid grid-cols-2 gap-y-3 text-sm">
        <span className="text-stone-700">Basic</span><span className="text-stone-900 text-right">{rupee(s.basic)}</span>
        <span className="text-stone-700">HRA</span><span className="text-stone-900 text-right">{rupee(s.hra)}</span>
        <span className="text-stone-700">Allowances</span><span className="text-stone-900 text-right">{rupee(s.allowances)}</span>
        {!!s.performance_bonus && (<><span className="text-stone-700">Performance Bonus</span><span className="text-emerald-700 text-right">{rupee(s.performance_bonus)}</span></>)}
        {!!s.incentives && (<><span className="text-stone-700">Incentives</span><span className="text-emerald-700 text-right">{rupee(s.incentives)}</span></>)}
        <span className="text-stone-700">Deductions</span><span className="text-red-700 text-right">− {rupee(s.deductions)}</span>
        <div className="col-span-2 border-t border-stone-800 my-1" />
        <span className="text-stone-900 font-semibold">Annual CTC</span><span className="text-teal-700 font-bold text-right">{rupee(s.ctc)}</span>
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
  if (!status || status.total === 0) return <span className="text-xs text-stone-700">No documents</span>;
  const complete = status.done === status.total;
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
      {complete ? 'Onboarding complete' : `${status.done}/${status.total} signed`}
    </span>
  );
}


export function EmployeeDocumentsModal({ staffUserId, staffName, onClose }: { staffUserId: string; staffName: string; onClose: () => void }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState<any | null>(null);

  useEffect(() => {
    cachedQuery(`emp_docs:${staffUserId}`, async () => {
      const { data, error } = await supabase.from('employee_documents').select('*').eq('staff_user_id', staffUserId).order('issued_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }).then(data => {
      if (data) setDocs(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [staffUserId]);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-stone-900 font-bold text-lg">{staffName}</h2>
            <p className="text-stone-700 text-sm">Collected Documents & Agreements</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full text-stone-700"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-stone-50">
          {loading ? (
            <p className="text-center text-stone-700 py-10">Loading documents...</p>
          ) : docs.length === 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
              <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-700 font-medium">No documents issued yet.</p>
              <p className="text-stone-500 text-sm mt-1">Issue an offer letter or policy document to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {docs.map(doc => (
                <div key={doc.id} className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-stone-900 font-bold text-lg">{doc.title}</span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${doc.acknowledged_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {doc.acknowledged_at ? 'SIGNED' : 'PENDING'}
                      </span>
                      <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full font-medium">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                    </div>
                    <p className="text-sm text-stone-500 mb-4">Issued on {new Date(doc.issued_at).toLocaleDateString()}</p>
                    
                    {doc.acknowledged_at ? (
                      <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-stone-900">Signatory Record</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-1">Signed By</p>
                            <p className="text-sm text-stone-900 font-bold">{doc.signed_name || staffName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-1">Timestamp</p>
                            <p className="text-sm text-stone-900 font-medium">{new Date(doc.acknowledged_at).toLocaleString()}</p>
                          </div>
                        </div>
                        {doc.signature_data_url && (
                          <div className="mt-4">
                            <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-2">Digital Signature</p>
                            <div className="bg-white border border-stone-200 rounded p-2 inline-block">
                              <img src={doc.signature_data_url} alt="Signature" className="h-12 object-contain" />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-4">
                        <p className="text-sm text-amber-800">This document has not been signed by the employee yet.</p>
                      </div>
                    )}
                    
                    <button 
                      onClick={() => setViewDoc(doc)}
                      className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" /> View Full Document
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {viewDoc && (
        <DocumentViewer
          title={viewDoc.title}
          content={viewDoc.content}
          meta={`${DOC_TYPE_LABELS[viewDoc.doc_type] || viewDoc.doc_type} • Issued ${new Date(viewDoc.issued_at).toLocaleDateString()}`}
          onClose={() => setViewDoc(null)}
        />
      )}
    </div>
  );
}
