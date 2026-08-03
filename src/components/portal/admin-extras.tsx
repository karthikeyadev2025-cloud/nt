import { useEffect, useState } from 'react';
import { Search, X, Shield, Download, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cachedRpc } from '../../lib/cachedRpc';
import { cachedQuery } from '../../lib/cachedQuery';
import { cardCls } from './shared';
import { istDateStr } from '../../lib/dates';
import { useAuth } from '../../contexts/AuthContext';
import type { Segment } from '../../lib/database.types';

// ─────────────────────────── Security Audit Log viewer (super_admin only)
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
    login_success: 'text-emerald-700 font-semibold', login_failed: 'text-red-700 font-semibold', logout: 'text-stone-700 font-semibold',
  };

  const filtered = filter ? logs.filter(l => l.event_type === filter) : logs;
  const eventTypes = [...new Set(logs.map(l => l.event_type))];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-orange-700" />
        <p className="text-stone-700 text-sm font-semibold">Login/logout history and security events, most recent first.</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter('')} className={`px-3 py-1 rounded-lg text-xs font-semibold border ${filter === '' ? 'border-orange-600 bg-orange-50 text-orange-800' : 'border-stone-300 bg-white text-stone-700'}`}>All ({logs.length})</button>
        {eventTypes.map(e => (
          <button key={e} onClick={() => setFilter(e)} className={`px-3 py-1 rounded-lg text-xs font-semibold border capitalize ${filter === e ? 'border-orange-600 bg-orange-50 text-orange-800' : 'border-stone-300 bg-white text-stone-700'}`}>{e.replace(/_/g, ' ')}</button>
        ))}
      </div>
      {loading ? <p className="text-stone-700 text-sm font-semibold text-center py-10">Loading…</p> : (
        <div className="space-y-1.5">
          {filtered.map(l => (
            <div key={l.id} className={cardCls + ' flex items-center justify-between py-3'}>
              <div>
                <p className="text-stone-900 text-sm font-bold">{l.user_email || 'Unknown'}</p>
                <p className="text-stone-700 text-xs font-medium">{new Date(l.created_at).toLocaleString()}</p>
              </div>
              <span className={`text-xs capitalize ${eventColor[l.event_type] || 'text-stone-700'}`}>{l.event_type.replace(/_/g, ' ')}</span>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-stone-700 text-sm text-center py-10 font-semibold">No events recorded yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Today at a Glance (Overview widget)
export function TodayAtAGlance() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ checkedIn: number; newLeads: number; openTickets: number; pendingApprovals: number } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      let counts: any = null;
      try {
        const res = await cachedRpc(
          `get_dashboard_counts:${user.id}`,
          () => supabase.rpc('get_dashboard_counts', { p_user_id: user.id })
        );
        counts = (res as any)?.data || res;
      } catch {
        counts = null;
      }

      if (counts && typeof counts === 'object') {
        setStats({
          checkedIn: counts.checkedInToday || 0,
          newLeads: counts.newLeadsToday || 0,
          openTickets: counts.openTickets || 0,
          pendingApprovals: (counts.leaves || 0) + (counts.advances || 0) + (counts.bankChangeReq || 0) + (counts.photoChangeReq || 0) + (counts.transfers || 0),
        });
      } else {
        setStats({ checkedIn: 0, newLeads: 0, openTickets: 0, pendingApprovals: 0 });
      }
    })();
  }, [user?.id]);

  if (!stats) return null;
  const cards = [
    { label: 'Checked in today', value: stats.checkedIn, color: 'text-emerald-700' },
    { label: 'New leads today', value: stats.newLeads, color: 'text-orange-700' },
    { label: 'Open tickets', value: stats.openTickets, color: 'text-amber-700' },
    { label: 'Pending approvals', value: stats.pendingApprovals, color: 'text-purple-700' },
  ];
  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-bold text-sm mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-orange-700" /> Today at a Glance</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="text-center">
            <p className={`text-3xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-stone-800 text-xs font-semibold mt-1">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Setup Checklist (helps a new admin see what's not configured yet)
export function SetupChecklist({ segments: _segments }: { segments: Segment[] }) {
  const [checks, setChecks] = useState<{ label: string; done: boolean; hint: string }[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    cachedQuery('setup_checklist_counts', async () => {
      const { data } = await supabase.from('app_users').select('id').limit(5);
      return { staff: (data || []).length };
    }).then(counts => {
      setChecks([
        { label: 'Onboard your first employee', done: (counts?.staff || 0) > 0, hint: 'Access Control → Onboard Employee' },
        { label: 'Add software products to the catalog', done: true, hint: 'Products tab' },
        { label: 'Post a job opening', done: true, hint: 'Careers / Hiring tab' },
        { label: 'Add customer testimonials', done: true, hint: 'Gallery / Team / Reviews tab' },
        { label: 'Configure employee shifts', done: true, hint: 'HR / Payroll → Shifts' },
        { label: 'Upload document templates', done: true, hint: 'Documents & Onboarding tab' },
      ]);
    }).catch(() => {});
  }, []);

  if (!checks || dismissed) return null;
  const remaining = checks.filter(c => !c.done);
  if (remaining.length === 0) return null;

  return (
    <div className={cardCls + ' border-orange-200 bg-white'}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-900 font-bold text-sm">Getting Set Up ({checks.length - remaining.length}/{checks.length})</h3>
        <button onClick={() => setDismissed(true)} className="text-stone-700 hover:text-stone-700 p-1"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2.5 text-sm">
            {c.done ? <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" /> : <Circle className="w-4 h-4 text-stone-700 shrink-0" />}
            <span className={c.done ? 'text-stone-700 line-through font-medium' : 'text-stone-900 font-bold'}>{c.label}</span>
            {!c.done && <span className="text-stone-700 text-xs font-semibold bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md ml-auto">{c.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Quick Search for admin header
type QuickFocus = { kind: 'staff' | 'lead' | 'ticket'; id: string };
export function QuickSearch({ onNavigate }: { onNavigate: (tab: string, focus?: QuickFocus) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; title: string; subtitle: string; tab: string; kind: QuickFocus['kind'] }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const t = setTimeout(async () => {
      const [{ data: staff }, { data: leads }, { data: tickets }] = await Promise.all([
        supabase.from('app_users').select('id, full_name, email, role').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
        supabase.from('marketing_leads').select('id, customer_name, phone, segment_slug').or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(5),
        supabase.from('support_tickets').select('id, ticket_no, subject').or(`ticket_no.ilike.%${q}%,subject.ilike.%${q}%`).limit(5),
      ]);
      const res: typeof results = [];
      (staff || []).forEach(s => res.push({ id: s.id, title: s.full_name, subtitle: `${s.role} • ${s.email}`, tab: 'access', kind: 'staff' }));
      (leads || []).forEach(l => res.push({ id: l.id, title: l.customer_name, subtitle: `Lead • ${l.phone}`, tab: 'crm', kind: 'lead' }));
      (tickets || []).forEach(tk => res.push({ id: tk.id, title: tk.ticket_no, subtitle: tk.subject, tab: 'tickets', kind: 'ticket' }));
      setResults(res);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-stone-300 text-sm focus-within:border-orange-600 focus-within:ring-2 focus-within:ring-orange-600/20 shadow-sm w-48 sm:w-64">
        <Search className="w-4 h-4 text-stone-700 shrink-0" />
        <input
          className="bg-transparent border-none p-0 text-stone-900 text-xs focus:ring-0 focus:outline-none w-full placeholder-stone-400 font-medium"
          placeholder="Search staff, leads, tickets..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && <button onClick={() => { setQuery(''); setOpen(false); }} className="text-stone-700 hover:text-stone-700"><X className="w-3.5 h-3.5" /></button>}
      </div>
      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setOpen(false)} />
          <div className="fixed left-3 right-3 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:inset-x-auto sm:mt-2 sm:w-80
                          max-h-[70vh] sm:max-h-96 overflow-y-auto bg-white border border-stone-200 rounded-2xl shadow-xl p-2 space-y-1">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  onNavigate(r.tab, { kind: r.kind, id: r.id });
                  setOpen(false);
                  setQuery('');
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-stone-100 transition-colors"
              >
                <p className="text-stone-900 font-bold text-xs truncate">{r.title}</p>
                <p className="text-stone-700 text-[11px] font-medium truncate">{r.subtitle}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── Export Staff CSV button
export function ExportStaffButton() {
  async function exportCsv() {
    const { data } = await supabase.from('app_users').select('*');
    if (!data || data.length === 0) return;
    const headers = ['id', 'full_name', 'email', 'role', 'phone', 'designation', 'is_active', 'joining_date'];
    const csvRows = [headers.join(',')];
    data.forEach(u => {
      csvRows.push(headers.map(h => JSON.stringify((u as Record<string, unknown>)[h] ?? '')).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `staff_export_${istDateStr()}.csv`; a.click();
  }
  return (
    <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold border border-stone-300 transition-all">
      <Download className="w-3.5 h-3.5" /> Export CSV
    </button>
  );
}

export function ExportPayslipsButton() {
  async function exportCsv() {
    const [{ data }, { data: staff }] = await Promise.all([
      supabase.from('payslips').select('*'),
      supabase.from('app_users').select('id, full_name'),
    ]);
    if (!data || data.length === 0) return;
    const names = Object.fromEntries((staff || []).map((s: any) => [s.id, s.full_name]));
    const headers = ['id', 'staff_name', 'period_month', 'period_year', 'base_salary', 'net_pay', 'payment_status', 'amount_paid'];
    const csvRows = [headers.join(',')];
    data.forEach((p: any) => {
      const row = { ...p, staff_name: names[p.staff_user_id] || '' };
      csvRows.push(headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `payslips_export_${istDateStr()}.csv`; a.click();
  }
  return (
    <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold border border-stone-300 transition-all">
      <Download className="w-3.5 h-3.5" /> Export Payslips CSV
    </button>
  );
}
