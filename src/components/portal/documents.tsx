import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, CheckCircle2, Printer, PenLine, RotateCcw, ShieldCheck, X, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type EmployeeDoc = Database['public']['Tables']['employee_documents']['Row'];
import { useToast } from '../../lib/toast';
import { useAuth } from '../../contexts/AuthContext';
import { cachedQuery } from '../../lib/cachedQuery';
import { inputCls, btnCls, cardCls } from './shared';
import { IdProofUploader } from './IdProofUploader';
import { DOC_TYPE_LABELS } from './documents-utils';

// ─────────────────────────── Signature Pad (draw on canvas, mobile + desktop)
// ─────────────────────────── My Signature (saved once, auto-stamped onto
// every document issued afterward — see issueDocuments() below).
export function MySignature() {
  const { user } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.from('app_users').select('signature_data_url').eq('id', user.id).maybeSingle();
        setSaved((data as { signature_data_url?: string } | null)?.signature_data_url || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function save(dataUrl: string) {
    if (!user) return;
    const { error } = await supabase.from('app_users').update({ signature_data_url: dataUrl } as never).eq('id', user.id);
    if (error) { toast.error(`Couldn't save signature: ${error.message}`); return; }
    setSaved(dataUrl);
    setEditing(false);
    toast.success('Signature saved — it will be stamped automatically on documents you issue from now on.');
  }

  if (loading) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-nikki-navy font-bold text-sm mb-1">My Signature</h3>
      <p className="text-stone-700 text-xs mb-3">Saved once, then stamped automatically as the company signature on every document you issue — offer letters, NDAs, and policies go out already signed.</p>
      {saved && !editing ? (
        <div>
          <div className="border border-nikki-border rounded-lg p-3 bg-white mb-2">
            <img src={saved} alt="Your saved signature" className="h-14 object-contain" />
          </div>
          <button onClick={() => setEditing(true)} className="text-nikki-blue text-xs font-medium">Replace signature</button>
        </div>
      ) : (
        <SignaturePad onCapture={save} />
      )}
    </div>
  );
}

// stampCompanySignature now lives in documents-utils.ts (imported above).

// ─────────────────────────── Signature Pad (draw on canvas, mobile + desktop)
export function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
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
      <div className="bg-white border border-nikki-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-7" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-nikki-navy text-lg font-semibold">{title}</h3>
            {meta && <p className="text-stone-700 text-xs mt-0.5">{meta}</p>}
          </div>
          <button className="text-stone-700 hover:text-nikki-navy" onClick={onClose}>✕</button>
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

        <div className="flex items-center gap-1.5 text-nikki-blue text-sm font-medium mb-4">
          <button onClick={handlePrint} className="flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
        </div>

        {canSubmit && !signed && requiresSignature && (
          <div className="border-t border-stone-800 pt-5">
            <p className="text-nikki-navy text-sm font-medium mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-nikki-blue" /> Sign to accept this document</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('draw')} className={`px-3 py-1 rounded-lg text-xs border ${mode === 'draw' ? 'border-nikki-royal text-nikki-blue' : 'border-nikki-border text-stone-700'}`}>Draw Signature</button>
              <button onClick={() => setMode('type')} className={`px-3 py-1 rounded-lg text-xs border ${mode === 'type' ? 'border-nikki-royal text-nikki-blue' : 'border-nikki-border text-stone-700'}`}>Type Name</button>
            </div>
            {mode === 'draw' ? (
              <SignaturePad onCapture={dataUrl => onSign && onSign(dataUrl, '')} />
            ) : (
              <div className="space-y-2">
                <input className={inputCls} placeholder="Type your full legal name" value={typedName} onChange={e => setTypedName(e.target.value)} />
                {typedName && <p className="text-2xl text-nikki-navy bg-white rounded-lg px-4 py-3" style={{ fontFamily: 'cursive' }}>{typedName}</p>}
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
  const [docs, setDocs] = useState<EmployeeDoc[]>([]);
  const [open, setOpen] = useState<EmployeeDoc | null>(null);
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
    } catch (err) {
      toast.error(`Couldn't load documents: ${(err instanceof Error ? err.message : String(err))}`);
      setLoaded(true);
    }
  }, [staffUserId, toast]);
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
    setOpen((prev) => prev ? { ...prev, ...patch } : prev);
  }

  async function acknowledge(id: string) {
    const patch = { acknowledged_at: new Date().toISOString() };
    const { error } = await supabase.from('employee_documents').update(patch).eq('id', id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    toast.success('Acknowledged');
    await load();
    setOpen((prev) => prev ? { ...prev, ...patch } : prev);
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
            <FileText className="w-5 h-5 text-nikki-blue" />
            <div>
              <p className="text-nikki-navy text-sm font-medium">{d.title}</p>
              <p className="text-stone-700 text-xs">{DOC_TYPE_LABELS[d.doc_type]} • issued {new Date(d.issued_at ?? '').toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(d as unknown as { company_signature_data_url?: string }).company_signature_data_url && (
              <span className="text-xs text-nikki-blue flex items-center gap-1" title="Countersigned by Nikki Technologies"><ShieldCheck className="w-3.5 h-3.5" /> Company signed</span>
            )}
            {d.acknowledged_at
              ? <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {d.requires_signature ? 'Signed' : 'Acknowledged'}</span>
              : <span className="text-xs text-amber-700">{d.requires_signature ? 'Needs signature' : 'Needs review'}</span>}
          </div>
        </div>
      ))}
      {open && (
        <DocumentViewer
          title={open.title}
          content={open.content}
          meta={`Issued ${new Date(open.issued_at ?? '').toLocaleDateString()}`}
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
      <h3 className="text-nikki-navy font-semibold mb-4 text-sm">Salary Structure</h3>
      <div className="grid grid-cols-2 gap-y-3 text-sm">
        <span className="text-stone-700">Basic</span><span className="text-nikki-navy text-right">{rupee(s.basic)}</span>
        <span className="text-stone-700">HRA</span><span className="text-nikki-navy text-right">{rupee(s.hra)}</span>
        <span className="text-stone-700">Allowances</span><span className="text-nikki-navy text-right">{rupee(s.allowances)}</span>
        {!!s.performance_bonus && (<><span className="text-stone-700">Performance Bonus</span><span className="text-emerald-700 text-right">{rupee(s.performance_bonus)}</span></>)}
        {!!s.incentives && (<><span className="text-stone-700">Incentives</span><span className="text-emerald-700 text-right">{rupee(s.incentives)}</span></>)}
        <span className="text-stone-700">Deductions</span><span className="text-red-700 text-right">− {rupee(s.deductions)}</span>
        <div className="col-span-2 border-t border-stone-800 my-1" />
        <span className="text-nikki-navy font-semibold">Annual CTC</span><span className="text-nikki-blue font-bold text-right">{rupee(s.ctc)}</span>
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
        if (data) setStatus({ total: data.length, done: data.filter((d: { acknowledged_at: string | null }) => d.acknowledged_at).length });
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
  const [docs, setDocs] = useState<EmployeeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState<EmployeeDoc | null>(null);

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
    <div className="fixed inset-0 z-50 bg-nikki-navy/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-nikki-border flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-nikki-navy font-bold text-lg">{staffName}</h2>
            <p className="text-stone-700 text-sm">Collected Documents & Agreements</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-nikki-border rounded-full text-stone-700"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-stone-50">
          {loading ? (
            <p className="text-center text-stone-700 py-10">Loading documents...</p>
          ) : docs.length === 0 ? (
            <div className="bg-white rounded-xl border border-nikki-border p-8 text-center">
              <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-700 font-medium">No documents issued yet.</p>
              <p className="text-stone-500 text-sm mt-1">Issue an offer letter or policy document to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {docs.map(doc => (
                <div key={doc.id} className="bg-white border border-nikki-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-nikki-navy font-bold text-lg">{doc.title}</span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${doc.acknowledged_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {doc.acknowledged_at ? 'SIGNED' : 'PENDING'}
                      </span>
                      <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full font-medium">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                    </div>
                    <p className="text-sm text-stone-500 mb-4">Issued on {new Date(doc.issued_at ?? '').toLocaleDateString()}</p>

                    {(doc as unknown as { company_signature_data_url?: string }).company_signature_data_url && (
                      <div className="bg-nikki-surface-blue p-3 rounded-lg border border-nikki-surface-blue mb-3 flex items-center gap-3">
                        <img src={(doc as unknown as { company_signature_data_url?: string }).company_signature_data_url} alt="Company signature" className="h-10 object-contain bg-white rounded border border-nikki-border px-2" />
                        <div>
                          <p className="text-xs font-bold text-nikki-navy">Signed for Nikki Technologies</p>
                          <p className="text-[11px] text-nikki-blue/80">{new Date((doc as unknown as { company_signed_at?: string }).company_signed_at ?? '').toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                    
                    {doc.acknowledged_at ? (
                      <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-nikki-navy">Signatory Record</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-1">Signed By</p>
                            <p className="text-sm text-nikki-navy font-bold">{doc.signed_name || staffName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-1">Timestamp</p>
                            <p className="text-sm text-nikki-navy font-medium">{new Date(doc.acknowledged_at ?? '').toLocaleString()}</p>
                          </div>
                        </div>
                        {doc.signature_data_url && (
                          <div className="mt-4">
                            <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mb-2">Digital Signature</p>
                            <div className="bg-white border border-nikki-border rounded p-2 inline-block">
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

          {/* ID proof — a real file upload, unlike everything above this
              (which are text templates the system generates). HR/admin can
              upload here for this employee, or the employee can upload
              their own from My Profile — same component either way. */}
          <div className="mt-4">
            <IdProofUploader staffUserId={staffUserId} canManage />
          </div>
        </div>
      </div>
      
      {viewDoc && (
        <DocumentViewer
          title={viewDoc.title}
          content={viewDoc.content}
          meta={`${DOC_TYPE_LABELS[viewDoc.doc_type] || viewDoc.doc_type} • Issued ${new Date(viewDoc.issued_at ?? '').toLocaleDateString()}`}
          onClose={() => setViewDoc(null)}
        />
      )}
    </div>
  );
}
