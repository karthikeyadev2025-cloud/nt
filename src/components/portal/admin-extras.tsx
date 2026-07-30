import { useEffect, useState } from 'react';
import { Search, X, Shield, Download, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cardCls } from './shared';
import { istDateStr } from '../../lib/dates';
import type { Segment } from '../../lib/database.types';

// ─────────────────────────── Security Audit Log viewer (super_admin only — table exists, had zero UI)
export function SecurityLogsViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('security_audit_logs').select('*').order('created_at', { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (!error && data) setLogs(data);
        setLoading(false);
      });
  }, []);

  const eventColor: Record<string, string> = {
    login_success: 'text-emerald-400', login_failed: 'text-red-400', logout: 'text-slate-400',
  };

  const filtered = filter ? logs.filter(l => l.event_type === filter) : logs;
  const eventTypes = [...new Set(logs.map(l => l.event_type))];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-sky-400" />
        <p className="text-slate-400 text-sm">Login/logout history and security events, most recent first.</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter('')} className={`px-3 py-1 rounded-lg text-xs border ${filter === '' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>All ({logs.length})</button>
        {eventTypes.map(e => (
          <button key={e} onClick={() => setFilter(e)} className={`px-3 py-1 rounded-lg text-xs border capitalize ${filter === e ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>{e.replace(/_/g, ' ')}</button>
        ))}
      </div>
      {loading ? <p className="text-slate-500 text-sm text-center py-10">Loading…</p> : (
        <div className="space-y-1.5">
          {filtered.map(l => (
            <div key={l.id} className={cardCls + ' flex items-center justify-between py-3'}>
              <div>
                <p className="text-white text-sm">{l.user_email || 'Unknown'}</p>
                <p className="text-slate-600 text-xs">{new Date(l.created_at).toLocaleString()}</p>
              </div>
              <span className={`text-xs capitalize ${eventColor[l.event_type] || 'text-slate-400'}`}>{l.event_type.replace(/_/g, ' ')}</span>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No events recorded yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Today at a Glance (Overview widget)
export function TodayAtAGlance() {
  const [stats, setStats] = useState<{ checkedIn: number; newLeads: number; openTickets: number; pendingApprovals: number } | null>(null);

  useEffect(() => {
    (async () => {
      const today = istDateStr();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const [{ count: checkedIn }, { count: newLeads }, { count: openTickets }, { count: leaveReq }, { count: advReq }, { count: bankReq }, { count: photoReq }, { count: transferReq }] = await Promise.all([
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', today).not('check_in_at', 'is', null),
        supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('salary_advance_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bank_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('photo_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('transfer_status', 'pending'),
      ]);
      setStats({
        checkedIn: checkedIn || 0, newLeads: newLeads || 0, openTickets: openTickets || 0,
        pendingApprovals: (leaveReq || 0) + (advReq || 0) + (bankReq || 0) + (photoReq || 0) + (transferReq || 0),
      });
    })();
  }, []);

  if (!stats) return null;
  const cards = [
    { label: 'Checked in today', value: stats.checkedIn, color: 'text-emerald-400' },
    { label: 'New leads today', value: stats.newLeads, color: 'text-sky-400' },
    { label: 'Open tickets', value: stats.openTickets, color: 'text-amber-400' },
    { label: 'Pending approvals', value: stats.pendingApprovals, color: 'text-purple-400' },
  ];
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-400" /> Today at a Glance</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="text-center">
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-slate-500 text-xs mt-1">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Setup Checklist (helps a new admin see what's not configured yet)
export function SetupChecklist({ segments }: { segments: Segment[] }) {
  const [checks, setChecks] = useState<{ label: string; done: boolean; hint: string }[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ count: staff }, { count: products }, { count: jobs }, { count: testimonials }, { count: shifts }, { count: templates }] = await Promise.all([
        supabase.from('app_users').select('id', { count: 'exact', head: true }).neq('role', 'super_admin'),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('job_postings').select('id', { count: 'exact', head: true }),
        supabase.from('testimonials').select('id', { count: 'exact', head: true }),
        supabase.from('shifts').select('id', { count: 'exact', head: true }),
        supabase.from('document_templates').select('id', { count: 'exact', head: true }),
      ]);
      setChecks([
        { label: 'Onboard your first employee', done: (staff || 0) > 0, hint: 'Access Control → Onboard Employee' },
        { label: 'Add software products to the catalog', done: (products || 0) > 3, hint: 'Products tab' },
        { label: 'Post a job opening', done: (jobs || 0) > 0, hint: 'Careers / Hiring tab' },
        { label: 'Add a client testimonial', done: (testimonials || 0) > 0, hint: 'Gallery / Team / Reviews tab' },
        { label: 'Define a work shift', done: (shifts || 0) > 0, hint: 'HR / Payroll → Shifts' },
        { label: 'Review onboarding document templates', done: (templates || 0) >= 3, hint: 'Documents & Onboarding tab' },
      ]);
    })();
  }, [segments]);

  if (!checks || dismissed) return null;
  const remaining = checks.filter(c => !c.done);
  if (remaining.length === 0) return null;

  return (
    <div className={cardCls + ' border-sky-700/40'}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Getting Set Up ({checks.length - remaining.length}/{checks.length})</h3>
        <button onClick={() => setDismissed(true)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2 text-sm">
            {c.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-slate-600 shrink-0" />}
            <span className={c.done ? 'text-slate-500 line-through' : 'text-slate-300'}>{c.label}</span>
            {!c.done && <span className="text-slate-600 text-xs ml-auto">{c.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Escapes characters that have special meaning inside a PostgREST .or() filter
// (commas separate conditions; parentheses group them) so a search for a name
// with a comma or bracket doesn't break the query.
function escapeOr(q: string): string {
  return q.replace(/([,()\\])/g, '\\$1');
}

// ─────────────────────────── Global Quick Search (header) — staff, leads, tickets by name/phone
export function QuickSearch({ onNavigate }: { onNavigate: (tab: string, focus?: { kind: 'staff' | 'lead' | 'ticket'; id: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ staff: any[]; leads: any[]; tickets: any[] }>({ staff: [], leads: [], tickets: [] });
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults({ staff: [], leads: [], tickets: [] }); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const s = escapeOr(q.trim());
      const [{ data: staff }, { data: leads }, { data: tickets }] = await Promise.all([
        supabase.from('app_users').select('id, full_name, email, phone, role').neq('role', 'super_admin').or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`).limit(5),
        supabase.from('marketing_leads').select('id, customer_name, phone, stage').or(`customer_name.ilike.%${s}%,phone.ilike.%${s}%`).limit(5),
        supabase.from('support_tickets').select('id, ticket_no, subject, customer_name').or(`subject.ilike.%${s}%,customer_name.ilike.%${s}%,ticket_no.ilike.%${s}%`).limit(5),
      ]);
      setResults({ staff: staff || [], leads: leads || [], tickets: tickets || [] });
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const totalResults = results.staff.length + results.leads.length + results.tickets.length;

  return (
    <div className="relative">
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-500 text-sm hover:border-slate-600 hover:text-slate-300 transition-colors">
        <Search className="w-4 h-4" /> <span className="hidden sm:inline">Search staff, leads, tickets…</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full max-h-[70vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 p-4 border-b border-slate-200">
              <Search className="w-4 h-4 text-slate-400" />
              <input autoFocus className="flex-1 bg-transparent text-slate-900 text-sm focus:outline-none placeholder-slate-400 font-medium" placeholder="Search by name, phone, email, ticket number…" value={q} onChange={e => setQ(e.target.value)} />
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-2">
              {searching && <p className="text-slate-500 text-sm text-center py-6 font-medium">Searching…</p>}
              {!searching && q.trim().length >= 2 && totalResults === 0 && <p className="text-slate-500 text-sm text-center py-6 font-medium">No results found.</p>}

              {results.staff.length > 0 && (
                <div className="mb-2">
                  <p className="text-slate-500 text-[11px] font-bold px-2 py-1 uppercase tracking-wider">STAFF</p>
                  {results.staff.map(s => (
                    <button key={s.id} onClick={() => { onNavigate('access', { kind: 'staff', id: s.id }); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm transition-colors">
                      <span className="text-slate-900 font-semibold">{s.full_name}</span> <span className="text-slate-500 text-xs">— {s.role} • {s.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.leads.length > 0 && (
                <div className="mb-2">
                  <p className="text-slate-500 text-[11px] font-bold px-2 py-1 uppercase tracking-wider">LEADS</p>
                  {results.leads.map(l => (
                    <button key={l.id} onClick={() => { onNavigate('crm', { kind: 'lead', id: l.id }); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm transition-colors">
                      <span className="text-slate-900 font-semibold">{l.customer_name}</span> <span className="text-slate-500 text-xs">— {l.phone} • {l.stage}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.tickets.length > 0 && (
                <div>
                  <p className="text-slate-500 text-[11px] font-bold px-2 py-1 uppercase tracking-wider">TICKETS</p>
                  {results.tickets.map(t => (
                    <button key={t.id} onClick={() => { onNavigate('tickets', { kind: 'ticket', id: t.id }); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm transition-colors">
                      <span className="text-blue-700 font-mono text-xs font-bold">{t.ticket_no}</span> <span className="text-slate-900 font-semibold ml-1">{t.subject}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Excel export helpers
export function ExportStaffButton() {
  async function exportStaff() {
    const { data } = await supabase.from('app_users').select('full_name, email, phone, role, segments, designation, employment_type, joining_date, is_active, staff_code').neq('role', 'super_admin').order('full_name');
    if (!data) return;
    const rows = data.map((u: any) => ({
      'Staff Code': u.staff_code, Name: u.full_name, Email: u.email, Phone: u.phone,
      Role: u.role, Segments: (u.segments || []).join(', '), Designation: u.designation,
      'Employment Type': u.employment_type, 'Joining Date': u.joining_date, Status: u.is_active ? 'Active' : 'Disabled',
    }));
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, `nikki-staff-${istDateStr()}.xlsx`);
  }
  return (
    <button onClick={exportStaff} className="flex items-center gap-1.5 text-sky-400 text-xs font-medium">
      <Download className="w-3.5 h-3.5" /> Export to Excel
    </button>
  );
}

export function ExportPayslipsButton() {
  async function exportPayslips() {
    const [{ data: slips }, { data: staff }] = await Promise.all([
      supabase.from('payslips').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
      supabase.from('app_users').select('id, full_name'),
    ]);
    if (!slips) return;
    const names = Object.fromEntries((staff || []).map((s: any) => [s.id, s.full_name]));
    const rows = slips.map((p: any) => ({
      Staff: names[p.staff_user_id] || '—', Month: p.period_month, Year: p.period_year,
      'Base Salary': p.base_salary, 'Present Days': p.present_days, 'Absent Days': p.absent_days,
      'Net Pay': p.net_pay, 'Amount Paid': p.amount_paid, Status: p.payment_status,
    }));
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payslips');
    XLSX.writeFile(wb, `nikki-payslips-${istDateStr()}.xlsx`);
  }
  return (
    <button onClick={exportPayslips} className="flex items-center gap-1.5 text-sky-400 text-xs font-medium">
      <Download className="w-3.5 h-3.5" /> Export to Excel
    </button>
  );
}
