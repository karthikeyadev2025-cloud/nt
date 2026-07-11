import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Ticket, Users2, Layers, Boxes, FileText,
  UserCog, LogOut, Wrench, ClipboardList, ChevronRight, ChevronLeft, CheckCircle2,
  Landmark, Megaphone, Briefcase,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSegments } from '../../lib/useSegments';
import type { Segment, Product } from '../../lib/database.types';
import { TicketsBoard, HRBoard, inputCls, btnCls, cardCls, SegmentTabs } from './shared';
import { DOC_TYPE_LABELS, renderTemplate, buildOnboardingVars, DocumentViewer, OnboardingStatusBadge } from './documents';
import { NotificationBell, AnnouncementsManager, BankChangeApprovals, PunctualityLeaderboard, BirthdaysWidget, CareersManager } from './features';
import { LeadsWorkspace } from './leads-workflow';
import { useToast } from '../../lib/toast';

const PERMISSION_KEYS = [
  'view_leads', 'manage_leads', 'create_leads', 'full_leads_view', 'bulk_assign_leads', 'approve_transfers',
  'view_tickets', 'manage_tickets', 'assign_tickets',
  'view_staff', 'manage_staff',
  'view_attendance', 'approve_leaves', 'approve_advances',
  'view_payroll', 'manage_payroll',
  'view_careers', 'manage_careers',
  'manage_content', 'view_reports',
];

// ─────────────────────────────────────── Overview
function Overview({ segments, onAddStaff }: { segments: Segment[]; onAddStaff: () => void }) {
  const [stats, setStats] = useState<Record<string, { tickets: number; openTickets: number; leads: number; won: number; staff: number }>>({});

  useEffect(() => {
    (async () => {
      const [{ data: tickets }, { data: leads }, { data: staff }] = await Promise.all([
        supabase.from('support_tickets').select('segment_slug,status'),
        supabase.from('marketing_leads').select('segment_slug,stage'),
        supabase.from('app_users').select('segments,is_active'),
      ]);
      const s: Record<string, { tickets: number; openTickets: number; leads: number; won: number; staff: number }> = {};
      segments.forEach(seg => { s[seg.slug] = { tickets: 0, openTickets: 0, leads: 0, won: 0, staff: 0 }; });
      (tickets || []).forEach((t: any) => {
        if (s[t.segment_slug]) {
          s[t.segment_slug].tickets++;
          if (t.status === 'open' || t.status === 'in_progress') s[t.segment_slug].openTickets++;
        }
      });
      (leads || []).forEach((l: any) => {
        if (s[l.segment_slug]) {
          s[l.segment_slug].leads++;
          if (l.stage === 'won') s[l.segment_slug].won++;
        }
      });
      (staff || []).forEach((u: any) => {
        if (!u.is_active) return;
        (u.segments || []).forEach((slug: string) => { if (s[slug]) s[slug].staff++; });
      });
      setStats(s);
    })();
  }, [segments]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-sky-500/10 border border-sky-700/40">
        <p className="text-sky-200 text-sm">New hire waiting? Onboard them — account, salary and documents, all in one step.</p>
        <button onClick={onAddStaff} className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold whitespace-nowrap">+ Onboard Employee</button>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <BirthdaysWidget />
        <PunctualityLeaderboard segments={segments} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {segments.map(seg => {
        const st = stats[seg.slug] || { tickets: 0, openTickets: 0, leads: 0, won: 0, staff: 0 };
        return (
          <div key={seg.slug} className={cardCls}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
              <h3 className="text-white font-semibold">{seg.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-2xl font-bold text-white">{st.openTickets}</p><p className="text-slate-500 text-xs">Open tickets</p></div>
              <div><p className="text-2xl font-bold text-white">{st.leads}</p><p className="text-slate-500 text-xs">Total leads</p></div>
              <div><p className="text-2xl font-bold text-emerald-400">{st.won}</p><p className="text-slate-500 text-xs">Won deals</p></div>
              <div><p className="text-2xl font-bold text-white">{st.staff}</p><p className="text-slate-500 text-xs">Staff</p></div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────── Onboarding Wizard (create + salary + documents in one flow)
const emptyOnboard = {
  full_name: '', email: '', password: '', phone: '', designation: '',
  role: 'employee', segments: [] as string[], employment_type: 'full_time',
  joining_date: new Date().toISOString().slice(0, 10),
  date_of_birth: '',
  reporting_time: '9:30 AM – 6:30 PM, Monday to Saturday',
  salary_structure: { basic: 0, hra: 0, allowances: 0, deductions: 0, ctc: 0 },
  doc_types: ['welcome_letter', 'offer_letter', 'roles_responsibilities'] as string[],
};

function OnboardingWizard({ segments, onDone, onClose }: { segments: Segment[]; onDone: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>(emptyOnboard);
  const [templates, setTemplates] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    supabase.from('document_templates').select('*').eq('active', true).then(({ data }) => { if (data) setTemplates(data); });
  }, []);

  const toggleSeg = (slug: string) => {
    const cur: string[] = form.segments;
    setForm({ ...form, segments: cur.includes(slug) ? cur.filter((s: string) => s !== slug) : [...cur, slug] });
  };
  const toggleDoc = (t: string) => {
    const cur: string[] = form.doc_types;
    setForm({ ...form, doc_types: cur.includes(t) ? cur.filter((x: string) => x !== t) : [...cur, t] });
  };

  const primarySegment = segments.find(s => form.segments.includes(s.slug)) || null;
  const availableTemplates = templates.filter(t => !t.segment_slug || t.segment_slug === primarySegment?.slug);

  function previewDoc(t: any) {
    const vars = buildOnboardingVars({
      full_name: form.full_name, designation: form.designation, role: form.role,
      segmentName: primarySegment?.name || 'Nikki Technologies',
      joining_date: form.joining_date, salary_structure: form.salary_structure, employment_type: form.employment_type,
      reporting_time: form.reporting_time,
    });
    setPreview({ title: t.title, content: renderTemplate(t.body, vars) });
  }

  async function submit() {
    setMsg(''); setBusy(true);
    if (!form.email || !form.password || !form.full_name) { setMsg('Name, email and password required'); setBusy(false); return; }
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: form.email, password: form.password, full_name: form.full_name, phone: form.phone,
        role: form.role, segments: form.segments,
      },
    });
    if (error || data?.error) { setMsg(data?.error || error?.message || 'Failed to create account'); setBusy(false); return; }
    const userId = data.user_id;

    const { error: updateError } = await supabase.from('app_users').update({
      designation: form.designation,
      employment_type: form.employment_type,
      joining_date: form.joining_date,
      date_of_birth: form.date_of_birth || null,
      reporting_time: form.reporting_time,
      salary_structure: form.salary_structure,
    }).eq('id', userId);
    if (updateError) toast.error(`Account created, but salary/details save failed: ${updateError.message}`);

    const vars = buildOnboardingVars({
      full_name: form.full_name, designation: form.designation, role: form.role,
      segmentName: primarySegment?.name || 'Nikki Technologies',
      joining_date: form.joining_date, salary_structure: form.salary_structure, employment_type: form.employment_type,
      reporting_time: form.reporting_time,
    });
    const docsToIssue = availableTemplates.filter(t => form.doc_types.includes(t.doc_type));
    if (docsToIssue.length) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: docError } = await supabase.from('employee_documents').insert(
        docsToIssue.map(t => ({
          staff_user_id: userId, doc_type: t.doc_type, title: t.title,
          content: renderTemplate(t.body, vars), issued_by: user?.id, requires_signature: t.requires_signature,
        }))
      );
      if (docError) toast.error(`Account created, but documents failed to issue: ${docError.message}`);
    }

    toast.success(`${form.full_name} onboarded successfully`);
    setBusy(false);
    onDone();
  }

  const steps = ['Basic Info', 'Role & Segment', 'Salary', 'Documents', 'Review'];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">Onboard New Employee</h3>
          <button className="text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="flex items-center gap-1 mb-6 text-xs">
          {steps.map((s, i) => (
            <div key={s} className={`flex items-center gap-1 ${i <= step ? 'text-sky-400' : 'text-slate-600'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${i <= step ? 'border-sky-400' : 'border-slate-700'}`}>{i < step ? '✓' : i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 mx-1 text-slate-700" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <input className={inputCls} placeholder="Full Name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            <input className={inputCls} placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={inputCls} placeholder="Temporary Password *" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <input className={inputCls} placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className={inputCls} placeholder="Designation (e.g. Field Technician)" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-slate-300 text-sm font-medium mb-2">Role</p>
              <select className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {['manager', 'hr', 'marketing_executive', 'telecaller', 'support_agent', 'employee'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium mb-2">Segment Access</p>
              <div className="flex flex-wrap gap-2">
                {[...segments.map(s => ({ slug: s.slug, name: s.name })), { slug: 'all', name: 'ALL SEGMENTS' }].map(s => (
                  <button key={s.slug} onClick={() => toggleSeg(s.slug)}
                    className={`px-3 py-1 rounded-full text-xs border ${form.segments.includes(s.slug) ? 'bg-sky-500 text-slate-950 border-sky-500' : 'border-slate-700 text-slate-400'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-slate-300 text-sm font-medium mb-2">Employment Type</p>
                <select className={inputCls} value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
                  {['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <p className="text-slate-300 text-sm font-medium mb-2">Joining Date</p>
                <input type="date" className={inputCls} value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} />
              </div>
              <div>
                <p className="text-slate-300 text-sm font-medium mb-2">Date of Birth <span className="text-slate-500 font-normal">(optional)</span></p>
                <input type="date" className={inputCls} value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium mb-2">Reporting Time / Shift <span className="text-slate-500 font-normal">(shown on offer & welcome letters)</span></p>
              <input className={inputCls} value={form.reporting_time} onChange={e => setForm({ ...form, reporting_time: e.target.value })} placeholder="e.g. 9:30 AM – 6:30 PM, Monday to Saturday" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">This breakdown will be visible to the employee in their portal for full transparency.</p>
            <div className="grid grid-cols-2 gap-3">
              {(['basic', 'hra', 'allowances', 'deductions'] as const).map(k => (
                <div key={k}>
                  <label className="text-slate-400 text-xs capitalize">{k} (monthly ₹)</label>
                  <input type="number" className={inputCls} value={form.salary_structure[k]}
                    onChange={e => setForm({ ...form, salary_structure: { ...form.salary_structure, [k]: Number(e.target.value) } })} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-slate-400 text-xs">Annual CTC (₹)</label>
              <input type="number" className={inputCls} value={form.salary_structure.ctc}
                onChange={e => setForm({ ...form, salary_structure: { ...form.salary_structure, ctc: Number(e.target.value) } })} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-slate-400 text-sm mb-2">Select documents to auto-generate and place directly in the employee's portal.</p>
            {availableTemplates.length === 0 && <p className="text-amber-400 text-sm">Select a segment first to see relevant templates.</p>}
            {availableTemplates.map(t => (
              <div key={t.id} className={cardCls + ' flex items-center justify-between'}>
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={form.doc_types.includes(t.doc_type)} onChange={() => toggleDoc(t.doc_type)} />
                  {t.title} <span className="text-slate-500 text-xs">({DOC_TYPE_LABELS[t.doc_type]}{t.requires_signature ? ' • needs signature' : ' • acknowledge only'})</span>
                </label>
                <button className="text-sky-400 text-xs" onClick={() => previewDoc(t)}>Preview</button>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div className={cardCls}>
              <p className="text-white font-medium">{form.full_name} — {form.designation || form.role}</p>
              <p className="text-slate-400 text-xs mt-1">{form.email} • {primarySegment?.name || form.segments.join(', ')}</p>
              <p className="text-slate-400 text-xs">Joining {form.joining_date} • {form.employment_type.replace('_', ' ')}</p>
              <p className="text-slate-400 text-xs mt-1">CTC ₹{Number(form.salary_structure.ctc).toLocaleString('en-IN')}/yr</p>
              <p className="text-slate-400 text-xs mt-1">Documents: {form.doc_types.map((d: string) => DOC_TYPE_LABELS[d]).join(', ') || 'none'}</p>
            </div>
            {msg && <p className="text-red-400 text-xs">{msg}</p>}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button className="flex items-center gap-1 text-slate-400 text-sm disabled:opacity-30" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < 4 ? (
            <button className={btnCls + ' flex items-center gap-1'} onClick={() => setStep(step + 1)}>Next <ChevronRight className="w-4 h-4" /></button>
          ) : (
            <button className={btnCls + ' flex items-center gap-1.5'} disabled={busy} onClick={submit}>
              <CheckCircle2 className="w-4 h-4" /> {busy ? 'Creating…' : 'Complete Onboarding'}
            </button>
          )}
        </div>
      </div>
      {preview && <DocumentViewer title={preview.title} content={preview.content} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ─────────────────────────────────────── Access Control (users × segments × permissions)
function AccessControl({ segments, openSignal }: { segments: Segment[]; openSignal?: number }) {
  const [users, setUsers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const toast = useToast();

  useEffect(() => { if (openSignal) setShowOnboard(true); }, [openSignal]);

  async function load() {
    const { data } = await supabase.from('app_users').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
  }
  useEffect(() => { load(); }, []);

  async function saveUser() {
    if (!editing) return;
    const { error } = await supabase.from('app_users').update({
      role: editing.role,
      segments: editing.segments,
      permission_overrides: editing.permission_overrides || {},
      is_active: editing.is_active,
      designation: editing.designation || '',
      employment_type: editing.employment_type || 'full_time',
      salary_structure: editing.salary_structure || { basic: 0, hra: 0, allowances: 0, deductions: 0, ctc: 0 },
      updated_at: new Date().toISOString(),
    }).eq('id', editing.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    toast.success('Access updated');
    setEditing(null);
    load();
  }

  const toggleSeg = (obj: any, setObj: (o: any) => void, slug: string) => {
    const cur: string[] = obj.segments || [];
    setObj({ ...obj, segments: cur.includes(slug) ? cur.filter(s => s !== slug) : [...cur, slug] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <p className="text-slate-400 text-sm">Onboard staff, assign segment access and function permissions — no code needed.</p>
        <button className={btnCls} onClick={() => setShowOnboard(true)}>+ Onboard Employee</button>
      </div>
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-3'}>
            <div>
              <p className="text-white font-medium">{u.full_name} <span className="text-sky-400 text-xs">({u.role})</span></p>
              <p className="text-slate-500 text-xs">{u.email} • segments: {(u.segments || []).join(', ') || 'none'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{u.is_active ? 'active' : 'disabled'}</span>
              <OnboardingStatusBadge staffUserId={u.id} />
              {u.role !== 'super_admin' && (
                <button className="text-sky-400 text-sm font-medium" onClick={() => setEditing({ ...u, permission_overrides: u.permission_overrides || {}, salary_structure: u.salary_structure || { basic: 0, hra: 0, allowances: 0, deductions: 0, ctc: 0 } })}>Manage Access</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showOnboard && (
        <OnboardingWizard segments={segments} onClose={() => setShowOnboard(false)} onDone={() => { setShowOnboard(false); load(); }} />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg">{editing.full_name} — Access Control</h3>
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>
                {['manager', 'hr', 'marketing_executive', 'telecaller', 'support_agent', 'employee'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select className={inputCls} value={editing.is_active ? '1' : '0'} onChange={e => setEditing({ ...editing, is_active: e.target.value === '1' })}>
                <option value="1">Active</option><option value="0">Disabled</option>
              </select>
              <input className={inputCls} placeholder="Designation" value={editing.designation || ''} onChange={e => setEditing({ ...editing, designation: e.target.value })} />
              <select className={inputCls} value={editing.employment_type || 'full_time'} onChange={e => setEditing({ ...editing, employment_type: e.target.value })}>
                {['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium mb-2">Salary Structure <span className="text-slate-500 font-normal">(visible to employee)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {(['basic', 'hra', 'allowances', 'deductions'] as const).map(k => (
                  <div key={k}>
                    <label className="text-slate-500 text-xs capitalize">{k} (monthly ₹)</label>
                    <input type="number" className={inputCls} value={editing.salary_structure?.[k] || 0}
                      onChange={e => setEditing({ ...editing, salary_structure: { ...editing.salary_structure, [k]: Number(e.target.value) } })} />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs">Annual CTC (₹)</label>
                  <input type="number" className={inputCls} value={editing.salary_structure?.ctc || 0}
                    onChange={e => setEditing({ ...editing, salary_structure: { ...editing.salary_structure, ctc: Number(e.target.value) } })} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium mb-2">Segment Access</p>
              <div className="flex flex-wrap gap-2">
                {[...segments.map(s => ({ slug: s.slug, name: s.name })), { slug: 'all', name: 'ALL SEGMENTS' }].map(s => (
                  <button key={s.slug} onClick={() => toggleSeg(editing, setEditing, s.slug)}
                    className={`px-3 py-1 rounded-full text-xs border ${(editing.segments || []).includes(s.slug) ? 'bg-sky-500 text-slate-950 border-sky-500' : 'border-slate-700 text-slate-400'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium mb-2">Function Permissions <span className="text-slate-500 font-normal">(override role defaults)</span></p>
              <div className="grid grid-cols-2 gap-1.5">
                {PERMISSION_KEYS.map(p => {
                  const val = editing.permission_overrides?.[p];
                  return (
                    <button key={p} onClick={() => {
                      const next = { ...(editing.permission_overrides || {}) };
                      if (val === undefined) next[p] = true;
                      else if (val === true) next[p] = false;
                      else delete next[p];
                      setEditing({ ...editing, permission_overrides: next });
                    }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs border text-left ${val === true ? 'border-emerald-500 text-emerald-300' : val === false ? 'border-red-500 text-red-300' : 'border-slate-700 text-slate-500'}`}>
                      {p.replace(/_/g, ' ')} {val === true ? '✓' : val === false ? '✕' : '· role default'}
                    </button>
                  );
                })}
              </div>
            </div>
            <button className={btnCls + ' w-full'} onClick={saveUser}>Save Access</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────── Segments Manager
function SegmentsManager({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Segment[]>([]);
  const [editing, setEditing] = useState<Partial<Segment> | null>(null);
  const toast = useToast();

  async function load() {
    const { data } = await supabase.from('segments').select('*').order('order_index');
    if (data) setRows(data as Segment[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name || !editing?.slug || !editing?.ticket_prefix) { toast.error('Name, slug and ticket prefix are required'); return; }
    let error;
    if (editing.id) {
      const { id, ...patch } = editing;
      ({ error } = await supabase.from('segments').update(patch).eq('id', id));
    } else {
      ({ error } = await supabase.from('segments').insert(editing));
    }
    if (error) { toast.error(`Couldn't save segment: ${error.message}`); return; }
    toast.success(editing.id ? 'Segment updated' : 'Segment created');
    setEditing(null); load(); onChanged();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <p className="text-slate-400 text-sm">Add a new business vertical anytime — tickets, leads, staff scoping pick it up automatically.</p>
        <button className={btnCls} onClick={() => setEditing({ slug: '', name: '', tagline: '', description: '', icon: 'Layers', color: '#0ea5e9', ticket_prefix: '', order_index: rows.length + 1, active: true })}>+ New Segment</button>
      </div>
      <div className="space-y-2">
        {rows.map(s => (
          <div key={s.id} className={cardCls + ' flex items-center justify-between'}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <div>
                <p className="text-white font-medium">{s.name} <span className="text-slate-500 text-xs">({s.slug} • NKT-{s.ticket_prefix}-)</span></p>
                <p className="text-slate-500 text-xs">{s.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${s.active ? 'text-emerald-300' : 'text-red-300'}`}>{s.active ? 'active' : 'hidden'}</span>
              <button className="text-sky-400 text-sm" onClick={() => setEditing(s)}>Edit</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{editing.id ? 'Edit' : 'New'} Segment</h3>
            <input className={inputCls} placeholder="Name *" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <input className={inputCls} placeholder="Slug * (e.g. ai_automation)" value={editing.slug || ''} disabled={!!editing.id} onChange={e => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })} />
            <input className={inputCls} placeholder="Ticket Prefix * (e.g. AI)" value={editing.ticket_prefix || ''} onChange={e => setEditing({ ...editing, ticket_prefix: e.target.value.toUpperCase() })} />
            <input className={inputCls} placeholder="Tagline" value={editing.tagline || ''} onChange={e => setEditing({ ...editing, tagline: e.target.value })} />
            <textarea className={inputCls} rows={2} placeholder="Description" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Icon (lucide name)" value={editing.icon || ''} onChange={e => setEditing({ ...editing, icon: e.target.value })} />
              <input className={inputCls} type="color" value={editing.color || '#0ea5e9'} onChange={e => setEditing({ ...editing, color: e.target.value })} />
              <select className={inputCls} value={editing.active ? '1' : '0'} onChange={e => setEditing({ ...editing, active: e.target.value === '1' })}>
                <option value="1">Active</option><option value="0">Hidden</option>
              </select>
            </div>
            <button className={btnCls + ' w-full'} onClick={save}>Save Segment</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────── Products Manager (no-code add)
function ProductsManager({ segments }: { segments: Segment[] }) {
  const [rows, setRows] = useState<Product[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const toast = useToast();

  async function load() {
    const { data } = await supabase.from('products').select('*').order('order_index');
    if (data) setRows(data as Product[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name || !editing?.slug) { toast.error('Name and slug are required'); return; }
    const payload = { ...editing, features: editing.features || [] };
    let error;
    if (editing.id) {
      const { id, ...patch } = payload;
      ({ error } = await supabase.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
    } else {
      ({ error } = await supabase.from('products').insert(payload));
    }
    if (error) { toast.error(`Couldn't save product: ${error.message}`); return; }
    toast.success(editing.id ? 'Product updated' : 'Product added');
    setEditing(null); load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this product?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { toast.error(`Couldn't delete: ${error.message}`); return; }
    toast.success('Product deleted');
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <p className="text-slate-400 text-sm">Add any new software product without code — it appears on the website instantly.</p>
        <button className={btnCls} onClick={() => setEditing({ segment_slug: 'software', slug: '', name: '', tagline: '', description: '', external_url: '', demo_cta: 'Visit Website', status: 'active', order_index: rows.length + 1, features: [] })}>+ Add Product</button>
      </div>
      <div className="space-y-2">
        {rows.map(p => (
          <div key={p.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-2'}>
            <div>
              <p className="text-white font-medium">{p.name} <span className="text-slate-500 text-xs">/{p.slug}</span></p>
              <p className="text-slate-500 text-xs">{p.tagline} {p.external_url && `• ${p.external_url}`}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : p.status === 'coming_soon' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-400'}`}>{p.status}</span>
              <button className="text-sky-400 text-sm" onClick={() => setEditing({ ...p, features: p.features || [] })}>Edit</button>
              <button className="text-red-400 text-sm" onClick={() => remove(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{editing.id ? 'Edit' : 'Add'} Product</h3>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Name *" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <input className={inputCls} placeholder="Slug *" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
            </div>
            <input className={inputCls} placeholder="Tagline" value={editing.tagline} onChange={e => setEditing({ ...editing, tagline: e.target.value })} />
            <textarea className={inputCls} rows={3} placeholder="Description" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="External URL (link-out)" value={editing.external_url || ''} onChange={e => setEditing({ ...editing, external_url: e.target.value })} />
              <input className={inputCls} placeholder="Button label" value={editing.demo_cta} onChange={e => setEditing({ ...editing, demo_cta: e.target.value })} />
              <select className={inputCls} value={editing.segment_slug} onChange={e => setEditing({ ...editing, segment_slug: e.target.value })}>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                <option value="active">Active</option><option value="coming_soon">Coming Soon</option><option value="hidden">Hidden</option>
              </select>
            </div>
            <input className={inputCls} placeholder="Logo URL" value={editing.logo_url || ''} onChange={e => setEditing({ ...editing, logo_url: e.target.value })} />
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-slate-300 text-sm font-medium">Feature Cards</p>
                <button className="text-sky-400 text-xs" onClick={() => setEditing({ ...editing, features: [...editing.features, { title: '', description: '', icon: 'CheckCircle2' }] })}>+ Add feature</button>
              </div>
              {editing.features.map((f: any, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 mb-2">
                  <input className={inputCls} placeholder="Title" value={f.title} onChange={e => {
                    const fs = [...editing.features]; fs[i] = { ...f, title: e.target.value }; setEditing({ ...editing, features: fs });
                  }} />
                  <input className={inputCls} placeholder="Description" value={f.description} onChange={e => {
                    const fs = [...editing.features]; fs[i] = { ...f, description: e.target.value }; setEditing({ ...editing, features: fs });
                  }} />
                  <button className="text-red-400 text-xs px-2" onClick={() => setEditing({ ...editing, features: editing.features.filter((_: any, j: number) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            <button className={btnCls + ' w-full'} onClick={save}>Save Product</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────── Services + Ticket Types Manager
function CatalogManager({ segments }: { segments: Segment[] }) {
  const [seg, setSeg] = useState(segments[0]?.slug || '');
  const [services, setServices] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [newService, setNewService] = useState({ title: '', description: '', icon: 'Settings' });
  const [newType, setNewType] = useState('');
  const toast = useToast();

  async function load() {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('services').select('*').order('order_index'),
      supabase.from('ticket_types').select('*').order('order_index'),
    ]);
    if (s) setServices(s);
    if (t) setTypes(t);
  }
  useEffect(() => { load(); }, []);

  async function addService() {
    if (!newService.title || !seg) { toast.error('Enter a service title'); return; }
    const { error } = await supabase.from('services').insert({ ...newService, segment_slug: seg, order_index: services.filter(x => x.segment_slug === seg).length + 1 });
    if (error) { toast.error(`Couldn't add: ${error.message}`); return; }
    toast.success('Service added');
    setNewService({ title: '', description: '', icon: 'Settings' });
    load();
  }
  async function addType() {
    if (!newType || !seg) { toast.error('Enter a ticket type name'); return; }
    const { error } = await supabase.from('ticket_types').insert({ segment_slug: seg, name: newType, order_index: types.filter(x => x.segment_slug === seg).length + 1 });
    if (error) { toast.error(`Couldn't add: ${error.message}`); return; }
    toast.success('Ticket type added');
    setNewType('');
    load();
  }
  async function removeService(id: string) {
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) { toast.error(`Couldn't remove: ${error.message}`); return; }
    load();
  }
  async function removeType(id: string) {
    const { error } = await supabase.from('ticket_types').delete().eq('id', id);
    if (error) { toast.error(`Couldn't remove: ${error.message}`); return; }
    load();
  }

  return (
    <div>
      <SegmentTabs segments={segments} value={seg} onChange={s => setSeg(s || segments[0]?.slug || '')} includeAll={false} />
      <div className="grid md:grid-cols-2 gap-6">
        <div className={cardCls}>
          <h3 className="text-white font-semibold mb-3">Services on Website</h3>
          <div className="space-y-2 mb-4">
            {services.filter(s => s.segment_slug === seg).map(s => (
              <div key={s.id} className="flex justify-between items-center text-sm">
                <span className="text-slate-300">{s.title}</span>
                <button className="text-red-400 text-xs" onClick={() => removeService(s.id)}>Remove</button>
              </div>
            ))}
          </div>
          <input className={inputCls + ' mb-2'} placeholder="Service title" value={newService.title} onChange={e => setNewService({ ...newService, title: e.target.value })} />
          <input className={inputCls + ' mb-2'} placeholder="Description" value={newService.description} onChange={e => setNewService({ ...newService, description: e.target.value })} />
          <button className={btnCls} onClick={addService}>Add Service</button>
        </div>
        <div className={cardCls}>
          <h3 className="text-white font-semibold mb-3">Ticket Types (support form options)</h3>
          <div className="space-y-2 mb-4">
            {types.filter(t => t.segment_slug === seg).map(t => (
              <div key={t.id} className="flex justify-between items-center text-sm">
                <span className="text-slate-300">{t.name}</span>
                <button className="text-red-400 text-xs" onClick={() => removeType(t.id)}>Remove</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="New ticket type" value={newType} onChange={e => setNewType(e.target.value)} />
            <button className={btnCls} onClick={addType}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────── Content CMS
function ContentManager() {
  const [rows, setRows] = useState<{ id: string; section: string; key: string; value: string }[]>([]);
  const [saved, setSaved] = useState('');
  const toast = useToast();

  useEffect(() => {
    supabase.from('site_content').select('*').order('section').then(({ data }) => { if (data) setRows(data as any); });
  }, []);

  async function save(row: { id: string; value: string }) {
    const { error } = await supabase.from('site_content').update({ value: row.value, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    setSaved(row.id);
    setTimeout(() => setSaved(''), 1500);
  }

  const sections = [...new Set(rows.map(r => r.section))];
  return (
    <div className="space-y-6">
      <p className="text-slate-400 text-sm">Edit any text on the public website. Changes go live immediately.</p>
      {sections.map(sec => (
        <div key={sec} className={cardCls}>
          <h3 className="text-white font-semibold capitalize mb-3">{sec}</h3>
          <div className="space-y-3">
            {rows.filter(r => r.section === sec).map(r => (
              <div key={r.id}>
                <label className="text-slate-400 text-xs capitalize">{r.key}</label>
                <div className="flex gap-2 mt-1">
                  <textarea className={inputCls} rows={r.value.length > 80 ? 2 : 1} value={r.value}
                    onChange={e => setRows(prev => prev.map(x => x.id === r.id ? { ...x, value: e.target.value } : x))} />
                  <button className={btnCls} onClick={() => save(r)}>{saved === r.id ? '✓' : 'Save'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────── Dashboard shell
// ─────────────────────────────────────── Documents Manager (templates + issue to existing staff)
function DocumentsManager({ segments }: { segments: Segment[] }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [editingTpl, setEditingTpl] = useState<any | null>(null);
  const [issueFor, setIssueFor] = useState<any | null>(null);
  const [issueDocs, setIssueDocs] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('document_templates').select('*').order('doc_type'),
      supabase.from('app_users').select('*').eq('is_active', true).order('full_name'),
    ]);
    if (t) setTemplates(t);
    if (s) setStaff(s);
  }
  useEffect(() => { load(); }, []);

  async function saveTemplate() {
    if (!editingTpl?.title || !editingTpl?.body) { toast.error('Title and body are required'); return; }
    let error;
    if (editingTpl.id) {
      const { id, ...patch } = editingTpl;
      ({ error } = await supabase.from('document_templates').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
    } else {
      ({ error } = await supabase.from('document_templates').insert(editingTpl));
    }
    if (error) { toast.error(`Couldn't save template: ${error.message}`); return; }
    toast.success(editingTpl.id ? 'Template updated' : 'Template created');
    setEditingTpl(null); load();
  }

  function openIssue(staffMember: any) {
    setIssueFor(staffMember);
    setIssueDocs([]);
  }

  const relevantTemplates = (staffMember: any) => templates.filter(t => t.active && (!t.segment_slug || (staffMember?.segments || []).includes(t.segment_slug) || (staffMember?.segments || []).includes('all')));

  async function issue() {
    if (!issueFor || issueDocs.length === 0) { toast.error('Select at least one document'); return; }
    setBusy(true);
    const seg = segments.find(s => (issueFor.segments || []).includes(s.slug));
    const vars = buildOnboardingVars({
      full_name: issueFor.full_name, designation: issueFor.designation, role: issueFor.role,
      segmentName: seg?.name || 'Nikki Technologies', joining_date: issueFor.joining_date,
      salary_structure: issueFor.salary_structure || {}, employment_type: issueFor.employment_type,
      reporting_time: issueFor.reporting_time,
    });
    const { data: { user } } = await supabase.auth.getUser();
    const docs = templates.filter(t => issueDocs.includes(t.id));
    const { error } = await supabase.from('employee_documents').upsert(
      docs.map(t => ({
        staff_user_id: issueFor.id, doc_type: t.doc_type, title: t.title,
        content: renderTemplate(t.body, vars), issued_by: user?.id, issued_at: new Date().toISOString(),
        requires_signature: t.requires_signature,
      })),
      { onConflict: 'staff_user_id,doc_type,title' }
    );
    setBusy(false);
    if (error) { toast.error(`Couldn't issue documents: ${error.message}`); return; }
    toast.success(`${docs.length} document(s) issued to ${issueFor.full_name}`);
    setIssueFor(null); load();
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-semibold">Document Templates</h3>
          <button className={btnCls} onClick={() => setEditingTpl({ segment_slug: '', doc_type: 'other', title: '', body: '', active: true, requires_signature: true })}>+ New Template</button>
        </div>
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className={cardCls + ' flex items-center justify-between'}>
              <div>
                <p className="text-white text-sm font-medium">{t.title}</p>
                <p className="text-slate-500 text-xs">{DOC_TYPE_LABELS[t.doc_type]} • {segments.find(s => s.slug === t.segment_slug)?.name || 'All segments'} • {t.requires_signature ? 'needs signature' : 'acknowledge only'}</p>
              </div>
              <div className="flex gap-3">
                <button className="text-sky-400 text-xs" onClick={() => setPreview({ title: t.title, content: t.body })}>Preview</button>
                <button className="text-sky-400 text-xs" onClick={() => setEditingTpl(t)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-white font-semibold mb-4">Issue Documents to Existing Staff</h3>
        <div className="space-y-2">
          {staff.map(s => (
            <div key={s.id} className={cardCls + ' flex items-center justify-between'}>
              <p className="text-white text-sm">{s.full_name} <span className="text-slate-500 text-xs">({s.role})</span></p>
              <div className="flex items-center gap-3">
                <OnboardingStatusBadge staffUserId={s.id} />
                <button className="text-sky-400 text-xs" onClick={() => openIssue(s)}>Issue Document</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingTpl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditingTpl(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{editingTpl.id ? 'Edit' : 'New'} Template</h3>
            <input className={inputCls} placeholder="Title *" value={editingTpl.title} onChange={e => setEditingTpl({ ...editingTpl, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={editingTpl.doc_type} onChange={e => setEditingTpl({ ...editingTpl, doc_type: e.target.value })}>
                {Object.keys(DOC_TYPE_LABELS).map(k => <option key={k} value={k}>{DOC_TYPE_LABELS[k]}</option>)}
              </select>
              <select className={inputCls} value={editingTpl.segment_slug || ''} onChange={e => setEditingTpl({ ...editingTpl, segment_slug: e.target.value || null })}>
                <option value="">All segments</option>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </div>
            <p className="text-slate-500 text-xs">Placeholders: {'{{name}} {{designation}} {{role}} {{segment}} {{joining_date}} {{ctc}} {{employment_type}} {{company}}'}</p>
            <textarea className={inputCls} rows={10} value={editingTpl.body} onChange={e => setEditingTpl({ ...editingTpl, body: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input type="checkbox" checked={editingTpl.requires_signature !== false} onChange={e => setEditingTpl({ ...editingTpl, requires_signature: e.target.checked })} />
              Requires employee signature <span className="text-slate-500 text-xs">(off = simple acknowledge)</span>
            </label>
            <button className={btnCls + ' w-full'} onClick={saveTemplate}>Save Template</button>
          </div>
        </div>
      )}

      {issueFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setIssueFor(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">Issue documents to {issueFor.full_name}</h3>
            {relevantTemplates(issueFor).map(t => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-white cursor-pointer">
                <input type="checkbox" checked={issueDocs.includes(t.id)} onChange={() => setIssueDocs(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])} />
                {t.title}
              </label>
            ))}
            <button className={btnCls + ' w-full'} disabled={busy} onClick={issue}>{busy ? 'Issuing…' : 'Issue Selected Documents'}</button>
          </div>
        </div>
      )}
      {preview && <DocumentViewer title={preview.title} content={preview.content} onClose={() => setPreview(null)} />}
    </div>
  );
}

type Tab = 'overview' | 'tickets' | 'crm' | 'hr' | 'access' | 'segments' | 'products' | 'catalog' | 'documents' | 'approvals' | 'announcements' | 'careers' | 'content';

export default function SuperAdminDashboard() {
  const { user, signOut } = useAuth();
  const { segments } = useSegments();
  const [tab, setTab] = useState<Tab>('overview');
  const [onboardSignal, setOnboardSignal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tickets', label: 'Tickets', icon: Ticket },
    { id: 'crm', label: 'CRM / Leads', icon: ClipboardList },
    { id: 'hr', label: 'HR / Payroll', icon: Users2 },
    { id: 'access', label: 'Access Control', icon: UserCog },
    { id: 'segments', label: 'Segments', icon: Layers },
    { id: 'products', label: 'Products', icon: Boxes },
    { id: 'catalog', label: 'Services & Ticket Types', icon: Wrench },
    { id: 'documents', label: 'Documents & Onboarding', icon: FileText },
    { id: 'approvals', label: 'Bank Approvals', icon: Landmark },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'careers', label: 'Careers / Hiring', icon: Briefcase },
    { id: 'content', label: 'Website Content', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex" key={refreshKey}>
      <aside className="w-60 shrink-0 border-r border-slate-800 p-4 hidden md:flex flex-col">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950">N</div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Nikki Technologies</p>
            <p className="text-slate-500 text-[10px]">Super Admin</p>
          </div>
        </div>
        <nav className="space-y-1 flex-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === t.id ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
        <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-400 text-sm">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </aside>

      <main className="flex-1 p-5 md:p-8 overflow-y-auto">
        <div className="md:hidden flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs border ${tab === t.id ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{tabs.find(t => t.id === tab)?.label}</h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-slate-500 text-sm hidden sm:block">{user?.full_name}</span>
            <button onClick={signOut} className="md:hidden text-slate-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        {tab === 'overview' && <Overview segments={segments} onAddStaff={() => { setOnboardSignal(s => s + 1); setTab('access'); }} />}
        {tab === 'tickets' && <TicketsBoard segments={segments} />}
        {tab === 'crm' && <LeadsWorkspace segments={segments} />}
        {tab === 'hr' && <HRBoard segments={segments} />}
        {tab === 'access' && <AccessControl segments={segments} openSignal={onboardSignal} />}
        {tab === 'segments' && <SegmentsManager onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'products' && <ProductsManager segments={segments} />}
        {tab === 'catalog' && <CatalogManager segments={segments} />}
        {tab === 'documents' && <DocumentsManager segments={segments} />}
        {tab === 'approvals' && <BankChangeApprovals />}
        {tab === 'announcements' && <AnnouncementsManager segments={segments} />}
        {tab === 'careers' && <CareersManager segments={segments} />}
        {tab === 'content' && <ContentManager />}
      </main>
    </div>
  );
}
