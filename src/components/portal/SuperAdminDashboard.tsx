import { useEffect, useState, lazy, Suspense } from 'react';
import {
  LayoutDashboard, Ticket, Users2, Layers, Boxes, FileText,
  UserCog, LogOut, Wrench, ClipboardList, ChevronRight, ChevronLeft, CheckCircle2,
  Landmark, Megaphone, Briefcase, Image as ImageIcon, Shield,
  Clock, CalendarDays, CreditCard, Repeat, Menu, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSegments } from '../../lib/useSegments';
import type { Segment, Product } from '../../lib/database.types';
import { TicketsBoard, HRBoard, inputCls, btnCls, cardCls, SegmentTabs } from './shared';
import { DOC_TYPE_LABELS, renderTemplate, buildOnboardingVars, DocumentViewer, OnboardingStatusBadge, EmployeeDocumentsModal } from './documents';
import { ImageUpload } from './ImageUpload';
import { NotificationBell, AnnouncementsManager, BankChangeApprovals, PunctualityLeaderboard, BirthdaysWidget, CareersManager, PhotoChangeApprovals, ShiftSwapBoard } from './features';
import { TasksBoard } from './tasks';
import { LeadsWorkspace } from './leads-workflow';
// Charts pull in recharts, which alone accounts for ~380KB of JavaScript —
// by far the single heaviest chunk in the whole app. A direct static import
// here forced that entire library to download and parse before ANY part of
// the dashboard (including the numbers, task lists, and everything that
// actually matters most) could render. On the slow mobile connections this
// business genuinely uses, 380KB alone can take anywhere from 10 seconds to
// several minutes — this was very likely the dominant cause of "the
// dashboard takes forever to load," far more than any individual database
// query. Lazy-loading these means the critical content renders immediately,
// and the charts fill in a moment later once that heavy chunk finishes
// downloading in the background.
const AttendanceTrendChart = lazy(() => import('./performance').then(m => ({ default: m.AttendanceTrendChart })));
const TicketStatusChart = lazy(() => import('./performance').then(m => ({ default: m.TicketStatusChart })));
const LeadsFunnelChart = lazy(() => import('./performance').then(m => ({ default: m.LeadsFunnelChart })));
import { ShiftsManager, PayslipManager, AttendanceSummaryTable } from './payroll';
import { RegularizationApprovals, HolidayManager, OffboardStaff, DanglingCheckins, OverdueTickets } from './lifecycle';
import { MyAttendance, MyRequests, MyDocuments, MyProfile } from './StaffPortal';
import { SecurityLogsViewer, TodayAtAGlance, SetupChecklist, QuickSearch, ExportStaffButton } from './admin-extras';
import SessionDevices from '../SessionDevices';
import { useToast } from '../../lib/toast';
import { istDateStr } from '../../lib/dates';
import { KiteTailLogo } from '../KiteTailLogo';

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
// ─────────────────────────── Action Centre (role-aware "what needs me today")
// The segment stat cards below tell you how the business is doing; this tells
// you what is waiting on YOU. Every item is gated on the permission that lets
// the person actually act on it, so nobody is shown a queue they can't clear.
// Shown while the ~380KB recharts chunk downloads in the background — the
// rest of the dashboard is already fully interactive at this point.
function ChartPlaceholder() {
  return (
    <div className={cardCls + ' h-64 flex items-center justify-center'}>
      <p className="text-stone-500 text-sm">Loading chart…</p>
    </div>
  );
}

function ActionCentre({ onGo }: { onGo: (tab: string) => void }) {
  const { user, hasPermission } = useAuth();
  const [c, setC] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const isSA = user?.role === 'super_admin';
  const canLeaves = isSA || hasPermission('approve_leaves');
  const canAdvances = isSA || hasPermission('approve_advances');
  const canLeads = isSA || hasPermission('bulk_assign_leads') || hasPermission('full_leads_view');
  const canTransfers = isSA || hasPermission('approve_transfers');
  const canTickets = isSA || hasPermission('view_tickets') || hasPermission('manage_tickets');
  const canAttendance = isSA || hasPermission('view_attendance');
  const canStaff = isSA || hasPermission('manage_staff');
  // "Approvals" tab groups salary advances + staff/attendance approvals — mirror the
  // navigation gate at line 1622 so both stay in lock-step.
  const canApprovals = isSA || hasPermission('approve_advances') || hasPermission('manage_staff');

  useEffect(() => {
    (async () => {
      const today = istDateStr();
      const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      let out: Record<string, number> = {};

      // Was ~14 separate parallel count-only queries here — each a full round
      // trip. A real performance trace showed bursts of 41-53 simultaneous
      // requests firing on dashboard load; this was a major contributor. Now
      // one RPC call returns everything in a single round trip. RLS still
      // applies exactly as before (verified: the RPC is NOT SECURITY DEFINER,
      // so a segment-scoped manager still only sees their segment's counts).
      const { data: counts, error: rpcError } = await supabase.rpc('get_dashboard_counts', { p_user_id: user?.id });

      if (rpcError || !counts) {
        // Real fallback, not just a log line: if the RPC is missing (most
        // likely cause: the migration that creates it hasn't been applied
        // to this database yet) or fails for any other reason, the
        // dashboard must still work correctly — it just costs the extra
        // round trips again, exactly as it did before this optimization.
        // A performance improvement must never become a hard dependency
        // that silently breaks core functionality when not perfectly
        // synchronized with a database migration.
        if (rpcError) console.error('get_dashboard_counts RPC failed, falling back to individual queries:', rpcError.message);
        const jobs: Promise<void>[] = [];
        const count = async (key: string, q: any) => {
          const { count: n } = await q;
          out[key] = n || 0;
        };
        if (canLeaves) jobs.push(count('leaves',
          supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')));
        if (canAdvances) jobs.push(count('advances',
          supabase.from('salary_advance_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')));
        if (canStaff) jobs.push(count('regularizations',
          supabase.from('attendance_regularizations').select('id', { count: 'exact', head: true }).eq('status', 'pending')));
        if (canTransfers) jobs.push(count('transfers',
          supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('transfer_status', 'pending')));
        if (canLeads) {
          jobs.push(count('unassignedLeads',
            supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
              .is('assigned_to', null).not('stage', 'in', '(won,lost)')));
          jobs.push(count('overdueFollowups',
            supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
              .not('next_followup_at', 'is', null).lt('next_followup_at', new Date().toISOString())
              .not('stage', 'in', '(won,lost)')));
          jobs.push(count('apptsSoon',
            supabase.from('marketing_leads').select('id', { count: 'exact', head: true })
              .not('appointment_at', 'is', null).gte('appointment_at', new Date().toISOString())
              .lte('appointment_at', soon).not('stage', 'in', '(won,lost)')));
        }
        jobs.push(count('myTasks',
          supabase.from('office_tasks').select('id', { count: 'exact', head: true })
            .eq('assigned_to', user?.id).in('status', ['pending', 'in_progress'])));
        if (canStaff || canLeads) jobs.push(count('overdueTasks',
          supabase.from('office_tasks').select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'in_progress'])
            .lt('due_date', istDateStr())));
        if (canTickets) {
          jobs.push(count('openTickets',
            supabase.from('support_tickets').select('id', { count: 'exact', head: true })
              .in('status', ['open', 'in_progress'])));
          jobs.push(count('unassignedTickets',
            supabase.from('support_tickets').select('id', { count: 'exact', head: true })
              .is('assigned_to', null).in('status', ['open', 'in_progress'])));
        }
        if (canAttendance) {
          const [{ data: staff }, { data: present }] = await Promise.all([
            supabase.from('app_users').select('id').eq('is_active', true).neq('role', 'super_admin'),
            supabase.from('attendance_records').select('staff_user_id').eq('attendance_date', today),
          ]);
          const inToday = new Set((present || []).map((r: any) => r.staff_user_id));
          out.notCheckedIn = (staff || []).filter((s: any) => !inToday.has(s.id)).length;
        }
        await Promise.all(jobs);
      } else {
        out = counts;
        // Attendance's "not checked in" figure needs the attendance permission
        // gate — the RPC always computes it, we just only display it when
        // canAttendance is true (same gating the old per-widget code used).
        if (!canAttendance) delete out.notCheckedIn;
      }

      setC(out);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return null;

  const items = [
    { key: 'leaves', label: 'Leave requests to review', tab: 'hr', tone: 'text-amber-700', show: canLeaves },
    { key: 'advances', label: 'Advance requests to review', tab: 'hr', tone: 'text-amber-700', show: canAdvances },
    { key: 'dangling', label: 'Check-ins missing check-out from yesterday', tab: 'hr', tone: 'text-amber-700 font-extrabold', show: canAttendance },
    { key: 'pendingApprovals', label: 'Requests waiting for approval', tab: 'approvals', tone: 'text-amber-700 font-extrabold', show: canApprovals },
    { key: 'overdueTickets', label: 'Overdue tickets (SLA missed)', tab: 'tickets', tone: 'text-red-700 font-extrabold', show: canTickets },
    { key: 'unassignedLeads', label: 'Unassigned leads waiting', tab: 'crm', tone: 'text-amber-700 font-extrabold', show: canLeads },
    { key: 'myTasks', label: 'Tasks assigned to me', tab: 'tasks', tone: 'text-teal-700 font-extrabold', show: true },
    { key: 'overdueTasks', label: 'Tasks overdue', tab: 'tasks', tone: 'text-red-700 font-extrabold', show: canStaff || canLeads },
    { key: 'overdueFollowups', label: 'Follow-ups overdue', tab: 'crm', tone: 'text-red-700 font-extrabold', show: canLeads },
    { key: 'transfers', label: 'Lead handoffs to approve', tab: 'crm', tone: 'text-purple-700 font-extrabold', show: canTransfers },
    { key: 'openTickets', label: 'Open tickets', tab: 'tickets', tone: 'text-stone-900 font-extrabold', show: canTickets },
    { key: 'notCheckedIn', label: 'Staff not checked in today', tab: 'hr', tone: 'text-stone-900 font-extrabold', show: canAttendance },
  ].filter(i => i.show && (c[i.key] ?? 0) > 0);

  if (items.length === 0) {
    return (
      <div className={cardCls + ' mb-6'}>
        <p className="text-emerald-700 font-bold text-sm">Nothing waiting on you right now.</p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h3 className="text-stone-900 text-xs font-extrabold tracking-wider mb-2">NEEDS YOUR ATTENTION</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(i => (
          <button key={i.key} onClick={() => onGo(i.tab)}
            className={cardCls + ' text-left hover:border-orange-400 cursor-pointer transition-all'}>
            <p className={`text-3xl ${i.tone}`}>{c[i.key]}</p>
            <p className="text-stone-700 text-xs font-semibold mt-1">{i.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Overview({ segments, onAddStaff, onGo }: { segments: Segment[]; onAddStaff: () => void; onGo: (tab: string) => void }) {
  const { user, hasPermission } = useAuth();
  const canOnboard = user?.role === 'super_admin' || hasPermission('manage_staff');
  const [stats, setStats] = useState<Record<string, { tickets: number; openTickets: number; leads: number; won: number; staff: number }>>({});

  useEffect(() => {
    (async () => {
      // Was 4 queries per segment (tickets, open tickets, leads, won) plus
      // 1 more for staff — 9 total for today's 2 segments, scaling up as
      // more are added. Now one RPC call. Falls back to the original method
      // if the RPC is unavailable for any reason.
      const { data: summary, error: rpcError } = await supabase.rpc('get_segment_summary');

      if (rpcError || !summary) {
        if (rpcError) console.error('get_segment_summary RPC failed, falling back to individual queries:', rpcError.message);
        const perSeg = await Promise.all(segments.map(async seg => {
          const [tickets, openTickets, leads, won] = await Promise.all([
            supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('segment_slug', seg.slug),
            supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('segment_slug', seg.slug).in('status', ['open', 'in_progress']),
            supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('segment_slug', seg.slug),
            supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('segment_slug', seg.slug).eq('stage', 'won'),
          ]);
          return { slug: seg.slug, tickets: tickets.count || 0, openTickets: openTickets.count || 0, leads: leads.count || 0, won: won.count || 0 };
        }));
        const s: Record<string, any> = {};
        segments.forEach(seg => { s[seg.slug] = { tickets: 0, openTickets: 0, leads: 0, won: 0, staff: 0 } });
        const { data: staff } = await supabase.from('app_users').select('segments, is_active');
        perSeg.forEach(p => { s[p.slug] = { ...s[p.slug], tickets: p.tickets, openTickets: p.openTickets, leads: p.leads, won: p.won } });
        (staff || []).forEach((u: any) => {
          if (!u.is_active) return;
          (u.segments || []).forEach((slug: string) => { if (s[slug]) s[slug].staff++; });
        });
        setStats(s);
        return;
      }

      const s: Record<string, any> = {};
      segments.forEach(seg => {
        s[seg.slug] = summary[seg.slug] || { tickets: 0, openTickets: 0, leads: 0, won: 0, staff: 0 };
      });
      setStats(s);
    })();
  }, [segments]);

  return (
    <div className="space-y-5">
      <ActionCentre onGo={onGo} />
      {canOnboard && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 rounded-2xl bg-orange-50 border border-orange-200 shadow-sm">
          <p className="text-orange-950 font-bold text-sm">New hire waiting? Onboard them — account, salary and documents, all in one step.</p>
          <button onClick={onAddStaff} className="self-start sm:self-auto shrink-0 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold shadow-md shadow-orange-700/20 whitespace-nowrap">+ Onboard Employee</button>
        </div>
      )}
      <SetupChecklist segments={segments} />
      <TodayAtAGlance />
      <div className="grid md:grid-cols-2 gap-5">
        <BirthdaysWidget />
        <PunctualityLeaderboard segments={segments} />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <Suspense fallback={<ChartPlaceholder />}><AttendanceTrendChart /></Suspense>
        <Suspense fallback={<ChartPlaceholder />}><TicketStatusChart /></Suspense>
      </div>
      <Suspense fallback={<ChartPlaceholder />}><LeadsFunnelChart segments={segments} /></Suspense>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {segments.map(seg => {
        const st = stats[seg.slug] || { tickets: 0, openTickets: 0, leads: 0, won: 0, staff: 0 };
        return (
          <div key={seg.slug} className={cardCls}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
              <h3 className="text-stone-900 font-bold">{seg.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-2xl font-extrabold text-stone-900">{st.openTickets}</p><p className="text-stone-700 text-xs">Open tickets</p></div>
              <div><p className="text-2xl font-extrabold text-stone-900">{st.leads}</p><p className="text-stone-700 text-xs">Total leads</p></div>
              <div><p className="text-2xl font-extrabold text-emerald-700">{st.won}</p><p className="text-stone-700 text-xs">Won deals</p></div>
              <div><p className="text-2xl font-extrabold text-stone-900">{st.staff}</p><p className="text-stone-700 text-xs">Staff</p></div>
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
  joining_date: istDateStr(),
  date_of_birth: '',
  reporting_time: '9:30 AM – 6:30 PM, Monday to Saturday',
  reports_to: '',
  blood_group: '', id_proof_number: '',
  shift_id: '',
  salary_structure: { basic: 0, hra: 0, allowances: 0, deductions: 0, performance_bonus: 0, incentives: 0, ctc: 0 },
  doc_types: ['offer_letter', 'appointment_letter', 'welcome_letter', 'roles_responsibilities'] as string[],
};

function OnboardingWizard({ segments, onDone, onClose }: { segments: Segment[]; onDone: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>(emptyOnboard);
  const [templates, setTemplates] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    supabase.from('document_templates').select('*').eq('active', true).then(({ data }) => { if (data) setTemplates(data); });
    supabase.from('shifts').select('*').eq('is_active', true).order('created_at').then(({ data }) => { if (data) setShifts(data); });
    supabase.from('app_users').select('id, full_name, role').eq('is_active', true)
      .in('role', ['manager', 'hr', 'super_admin']).order('full_name')
      .then(({ data }) => { if (data) setManagers(data); });
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
    const failures: string[] = [];

    // The account row was just created by the edge function (service-role,
    // bypasses RLS) a moment ago — the admin's own RLS-scoped client can hit
    // a brief propagation delay seeing it as freshly matchable, the same
    // class of timing issue documented in AuthContext's fetchAppUser retry.
    // A couple of quick retries here means a transient blip doesn't silently
    // drop the salary structure, which is the single most consequential
    // field in this whole wizard.
    let updateError: { message: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: err } = await supabase.from('app_users').update({
        designation: form.designation,
        employment_type: form.employment_type,
        joining_date: form.joining_date,
        date_of_birth: form.date_of_birth || null,
        reporting_time: form.reporting_time,
        blood_group: form.blood_group,
        id_proof_number: form.id_proof_number,
        reports_to: form.reports_to || null,
        salary_structure: form.salary_structure,
      }).eq('id', userId);
      updateError = err;
      if (!err) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
    if (updateError) failures.push(`Salary & employment details: ${updateError.message}`);

    // Assign the selected work shift so late tracking works from day one.
    if (form.shift_id) {
      const { error: shiftError } = await supabase.from('staff_shifts').insert({ staff_user_id: userId, shift_id: form.shift_id });
      if (shiftError) failures.push(`Shift assignment: ${shiftError.message}`);
    }

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
      if (docError) failures.push(`Document issuance: ${docError.message}`);
    }

    // The account itself always exists at this point — but don't tell the
    // admin it succeeded cleanly if anything after account creation failed.
    // The old code showed an unconditional "onboarded successfully" toast
    // even when the salary/shift/document steps above had just failed,
    // which is how staff records silently ended up missing data the admin
    // believed they'd entered.
    if (failures.length > 0) {
      toast.error(`${form.full_name}'s account was created, but this failed — please fix in Access Control: ${failures.join(' • ')}`);
    } else {
      toast.success(`${form.full_name} onboarded successfully`);
    }
    setBusy(false);
    onDone();
  }

  const steps = ['Basic Info', 'Role & Segment', 'Salary', 'Documents', 'Review'];

  function validateStep(i: number): string | null {
    if (i === 0) {
      if (!form.full_name.trim()) return 'Full name is required';
      if (!form.email.trim() || !form.email.includes('@')) return 'A valid email is required';
      if ((form.password || '').length < 6) return 'Temporary password must be at least 6 characters';
    }
    if (i === 1 && form.segments.length === 0) return 'Select at least one segment';
    return null;
  }

  function next() {
    const problem = validateStep(step);
    if (problem) { setMsg(problem); return; }
    setMsg('');
    setStep(step + 1);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-stone-900 font-semibold text-lg">Onboard New Employee</h3>
          <button className="text-stone-700 hover:text-stone-900" onClick={onClose}>✕</button>
        </div>
        <div className="flex items-center gap-1 mb-6 text-xs">
          {steps.map((s, i) => (
            <div key={s} className={`flex items-center gap-1 ${i <= step ? 'text-teal-700' : 'text-stone-700'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${i <= step ? 'border-teal-400' : 'border-stone-200'}`}>{i < step ? '✓' : i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 mx-1 text-stone-700" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <input className={inputCls} placeholder="Full Name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            <input className={inputCls} placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Temporary Password *" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              <button type="button" className="px-3 py-2 rounded-lg border border-stone-200 text-stone-700 text-xs whitespace-nowrap"
                onClick={() => {
                  const gen = Array.from(crypto.getRandomValues(new Uint8Array(9)))
                    .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 55]).join('');
                  setForm({ ...form, password: gen });
                }}>Generate</button>
              <button type="button" className="px-3 py-2 rounded-lg border border-stone-200 text-stone-700 text-xs whitespace-nowrap disabled:opacity-40"
                disabled={!form.password}
                onClick={() => { navigator.clipboard?.writeText(form.password); toast.success('Password copied'); }}>Copy</button>
            </div>
            <input className={inputCls} placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className={inputCls} placeholder="Designation (e.g. Field Technician)" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Blood Group (optional)" value={form.blood_group} onChange={e => setForm({ ...form, blood_group: e.target.value })} />
              <input className={inputCls} placeholder="ID Proof No. (Aadhaar/PAN, optional)" value={form.id_proof_number} onChange={e => setForm({ ...form, id_proof_number: e.target.value })} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Role</p>
              <select className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {['manager', 'hr', 'marketing_executive', 'telecaller', 'support_agent', 'employee'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Segment Access</p>
              <div className="flex flex-wrap gap-2">
                {[...segments.map(s => ({ slug: s.slug, name: s.name })), { slug: 'all', name: 'ALL SEGMENTS' }].map(s => (
                  <button key={s.slug} onClick={() => toggleSeg(s.slug)}
                    className={`px-3 py-1 rounded-full text-xs border ${form.segments.includes(s.slug) ? 'bg-teal-500 text-stone-950 border-teal-500' : 'border-stone-200 text-stone-700'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-stone-700 text-sm font-medium mb-2">Employment Type</p>
                <select className={inputCls} value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
                  {['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <p className="text-stone-700 text-sm font-medium mb-2">Joining Date</p>
                <input type="date" className={inputCls} value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} />
              </div>
              <div>
                <p className="text-stone-700 text-sm font-medium mb-2">Date of Birth <span className="text-stone-700 font-normal">(optional)</span></p>
                <input type="date" className={inputCls} value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
            </div>
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Work Shift <span className="text-stone-700 font-normal">(drives late tracking & punctuality)</span></p>
              {shifts.length === 0 ? (
                <p className="text-amber-700 text-xs">No shifts defined yet — late tracking won't work for this employee. Create one under HR / Payroll → Shifts, or continue without.</p>
              ) : (
                <select className={inputCls} value={form.shift_id} onChange={e => {
                  const sh = shifts.find(s => s.id === e.target.value);
                  setForm({
                    ...form, shift_id: e.target.value,
                    // Keep the human-readable letter text in sync with the real shift.
                    reporting_time: sh ? `${sh.start_time.slice(0, 5)} – ${sh.end_time.slice(0, 5)}` : form.reporting_time,
                  });
                }}>
                  <option value="">No shift (no late tracking)</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}, grace {s.grace_minutes}min)</option>)}
                </select>
              )}
            </div>
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Reporting Time / Shift <span className="text-stone-700 font-normal">(shown on offer & welcome letters)</span></p>
              <input className={inputCls} value={form.reporting_time} onChange={e => setForm({ ...form, reporting_time: e.target.value })} placeholder="e.g. 9:30 AM – 6:30 PM, Monday to Saturday" />
            </div>
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Reports To <span className="text-stone-700 font-normal">(their direct manager gets their leave requests)</span></p>
              <select className={inputCls} value={form.reports_to} onChange={e => setForm({ ...form, reports_to: e.target.value })}>
                <option value="">No direct manager — notify all approvers</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.role.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-stone-700 text-sm">This breakdown will be visible to the employee in their portal for full transparency.</p>
            <div className="grid grid-cols-2 gap-3">
              {(['basic', 'hra', 'allowances', 'deductions', 'performance_bonus', 'incentives'] as const).map(k => (
                <div key={k}>
                  <label className="text-stone-700 text-xs capitalize">{k.replace('_',' ')} (monthly ₹)</label>
                  <input type="number" className={inputCls} value={form.salary_structure[k]}
                    onChange={e => setForm({ ...form, salary_structure: { ...form.salary_structure, [k]: Number(e.target.value) } })} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-stone-700 text-xs">Annual CTC (₹)</label>
              <input type="number" className={inputCls} value={form.salary_structure.ctc}
                onChange={e => setForm({ ...form, salary_structure: { ...form.salary_structure, ctc: Number(e.target.value) } })} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-stone-700 text-sm mb-2">Select documents to auto-generate and place directly in the employee's portal.</p>
            {availableTemplates.length === 0 && <p className="text-amber-700 text-sm">Select a segment first to see relevant templates.</p>}
            {availableTemplates.map(t => (
              <div key={t.id} className={cardCls + ' flex items-center justify-between'}>
                <label className="flex items-center gap-2 text-sm text-stone-900 cursor-pointer">
                  <input type="checkbox" checked={form.doc_types.includes(t.doc_type)} onChange={() => toggleDoc(t.doc_type)} />
                  {t.title} <span className="text-stone-700 text-xs">({DOC_TYPE_LABELS[t.doc_type]}{t.requires_signature ? ' • needs signature' : ' • acknowledge only'})</span>
                </label>
                <button className="text-teal-700 text-xs" onClick={() => previewDoc(t)}>Preview</button>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div className={cardCls}>
              <p className="text-stone-900 font-medium">{form.full_name} — {form.designation || form.role}</p>
              <p className="text-stone-700 text-xs mt-1">{form.email} • {primarySegment?.name || form.segments.join(', ')}</p>
              <p className="text-stone-700 text-xs">Joining {form.joining_date} • {form.employment_type.replace('_', ' ')}</p>
              <p className="text-stone-700 text-xs mt-1">CTC ₹{Number(form.salary_structure.ctc).toLocaleString('en-IN')}/yr</p>
              <p className="text-stone-700 text-xs mt-1">Documents: {form.doc_types.map((d: string) => DOC_TYPE_LABELS[d]).join(', ') || 'none'}</p>
            </div>
            {msg && <p className="text-red-700 text-xs">{msg}</p>}
          </div>
        )}

        {msg && step < 4 && <p className="text-red-700 text-xs mt-4">{msg}</p>}

        <div className="flex justify-between mt-6">
          <button className="flex items-center gap-1 text-stone-700 text-sm disabled:opacity-30" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < 4 ? (
            <button className={btnCls + ' flex items-center gap-1'} onClick={next}>Next <ChevronRight className="w-4 h-4" /></button>
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
function AccessControl({ segments, openSignal, focusStaffId }: { segments: Segment[]; openSignal?: number; focusStaffId?: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [snapshot, setSnapshot] = useState<{ designation: string; ctc: number } | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showOffboard, setShowOffboard] = useState(false);
  const [viewDocsFor, setViewDocsFor] = useState<any | null>(null);

  useEffect(() => { if (openSignal) setShowOnboard(true); }, [openSignal]);

  async function doResetPassword() {
    if (!editing) return;
    if (resetPasswordValue.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setResettingPassword(true);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'reset_password', user_id: editing.id, new_password: resetPasswordValue },
    });
    setResettingPassword(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Failed to reset password'); return; }
    toast.success('Password updated');
    setResetPasswordValue('');
  }

  async function load() {
    const { data } = await supabase.from('app_users').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
  }

  const owners = users.filter(u => u.role === 'super_admin');
  const staffOnly = users.filter(u => u.role !== 'super_admin');
  useEffect(() => { load(); }, []);

  // Open the Manage Access editor for a staff member arriving from global search.
  useEffect(() => {
    if (!focusStaffId || users.length === 0) return;
    const u = users.find(x => x.id === focusStaffId);
    if (u && u.role !== 'super_admin') {
      setEditing({ ...u, permission_overrides: u.permission_overrides || {}, salary_structure: u.salary_structure || { basic: 0, hra: 0, allowances: 0, deductions: 0, performance_bonus: 0, incentives: 0, ctc: 0 } });
      setSnapshot({ designation: u.designation || '', ctc: u.salary_structure?.ctc || 0 });
      setResetPasswordValue('');
    }
  }, [focusStaffId, users]);

  async function saveUser() {
    if (!editing) return;
    const { error } = await supabase.from('app_users').update({
      role: editing.role,
      segments: editing.segments,
      permission_overrides: editing.permission_overrides || {},
      is_active: editing.is_active,
      designation: editing.designation || '',
      employment_type: editing.employment_type || 'full_time',
      salary_structure: editing.salary_structure || { basic: 0, hra: 0, allowances: 0, deductions: 0, performance_bonus: 0, incentives: 0, ctc: 0 },
      updated_at: new Date().toISOString(),
    }).eq('id', editing.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }

    const newDesig = editing.designation || '';
    const newCtc = editing.salary_structure?.ctc || 0;
    let historyError: string | null = null;
    if (snapshot && (newDesig !== snapshot.designation || newCtc !== snapshot.ctc)) {
      const { error: histErr } = await supabase.from('promotions').insert({
        staff_user_id: editing.id,
        previous_designation: snapshot.designation, new_designation: newDesig,
        previous_ctc: snapshot.ctc, new_ctc: newCtc,
        note: 'Updated via Access Control', created_by: currentUser?.id,
      });
      historyError = histErr?.message || null;
    }

    // The actual designation/CTC change above already succeeded — that's
    // real and doesn't need to be undone. But if the audit-trail entry
    // failed to save, the employee's Role & Compensation History will have
    // a silent gap explaining why their pay changed, so that's worth
    // surfacing distinctly rather than folding into a blanket success toast.
    if (historyError) {
      toast.error(`Access updated, but the compensation-history record failed to save: ${historyError}`);
    } else {
      toast.success('Access updated');
    }
    setEditing(null);
    setSnapshot(null);
    load();
  }

  const toggleSeg = (obj: any, setObj: (o: any) => void, slug: string) => {
    const cur: string[] = obj.segments || [];
    setObj({ ...obj, segments: cur.includes(slug) ? cur.filter(s => s !== slug) : [...cur, slug] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <p className="text-stone-700 text-sm">Onboard staff, assign segment access and function permissions — no code needed.</p>
        <div className="flex items-center gap-4">
          <ExportStaffButton />
          <button className={btnCls} onClick={() => setShowOnboard(true)}>+ Onboard Employee</button>
        </div>
      </div>
      {/* Owner account shown separately — you are the account holder, not a
          managed employee. Mixing it into the staff list reads as if you're
          one of your own employees. */}
      {owners.length > 0 && (
        <div className="mb-5">
          <p className="text-stone-700 text-xs uppercase tracking-wider mb-2">Owner account</p>
          {owners.map(u => (
            <div key={u.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-3 border-teal-800/60'}>
              <div>
                <p className="text-stone-900 font-medium">
                  {u.full_name}
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-teal-100 text-teal-700">Owner · full access</span>
                </p>
                <p className="text-stone-700 text-xs">{u.email}</p>
              </div>
              <span className="text-stone-700 text-xs">Not a managed employee</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-stone-700 text-xs uppercase tracking-wider mb-2">
        Staff ({staffOnly.length})
      </p>
      <div className="space-y-2">
        {staffOnly.length === 0 && (
          <p className="text-stone-700 text-sm text-center py-8">
            No staff onboarded yet. Use “+ Onboard Employee” above to add your first team member.
          </p>
        )}
        {staffOnly.map(u => (
          <div key={u.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-3'}>
            <div>
              <p className="text-stone-900 font-medium">{u.full_name} <span className="text-teal-700 text-xs">({u.role.replace('_', ' ')})</span></p>
              <p className="text-stone-700 text-xs">{u.email} • segments: {(u.segments || []).join(', ') || 'none'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{u.is_active ? 'active' : 'disabled'}</span>
              <OnboardingStatusBadge staffUserId={u.id} />
              <button className="text-teal-700 text-sm font-medium" onClick={() => {
                setEditing({ ...u, permission_overrides: u.permission_overrides || {}, salary_structure: u.salary_structure || { basic: 0, hra: 0, allowances: 0, deductions: 0, performance_bonus: 0, incentives: 0, ctc: 0 } });
                setSnapshot({ designation: u.designation || '', ctc: u.salary_structure?.ctc || 0 });
                setResetPasswordValue('');
                setShowOffboard(false);
              }}>Manage Access</button>
            </div>
          </div>
        ))}
      </div>

      {showOnboard && (
        <OnboardingWizard segments={segments} onClose={() => setShowOnboard(false)} onDone={() => { setShowOnboard(false); load(); }} />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold text-lg">{editing.full_name} — Access Control</h3>
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
              <p className="text-stone-700 text-sm font-medium mb-2">Salary Structure <span className="text-stone-700 font-normal">(visible to employee)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {(['basic', 'hra', 'allowances', 'deductions', 'performance_bonus', 'incentives'] as const).map(k => (
                  <div key={k}>
                    <label className="text-stone-700 text-xs capitalize">{k.replace('_',' ')} (monthly ₹)</label>
                    <input type="number" className={inputCls} value={editing.salary_structure?.[k] || 0}
                      onChange={e => setEditing({ ...editing, salary_structure: { ...editing.salary_structure, [k]: Number(e.target.value) } })} />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-stone-700 text-xs">Annual CTC (₹)</label>
                  <input type="number" className={inputCls} value={editing.salary_structure?.ctc || 0}
                    onChange={e => setEditing({ ...editing, salary_structure: { ...editing.salary_structure, ctc: Number(e.target.value) } })} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Segment Access</p>
              <div className="flex flex-wrap gap-2">
                {[...segments.map(s => ({ slug: s.slug, name: s.name })), { slug: 'all', name: 'ALL SEGMENTS' }].map(s => (
                  <button key={s.slug} onClick={() => toggleSeg(editing, setEditing, s.slug)}
                    className={`px-3 py-1 rounded-full text-xs border ${(editing.segments || []).includes(s.slug) ? 'bg-teal-500 text-stone-950 border-teal-500' : 'border-stone-200 text-stone-700'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-stone-700 text-sm font-medium mb-2">Function Permissions <span className="text-stone-700 font-normal">(override role defaults)</span></p>
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
                      className={`px-2.5 py-1.5 rounded-lg text-xs border text-left ${val === true ? 'border-emerald-500 text-emerald-700' : val === false ? 'border-red-500 text-red-700' : 'border-stone-200 text-stone-700'}`}>
                      {p.replace(/_/g, ' ')} {val === true ? '✓' : val === false ? '✕' : '· role default'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-stone-800 pt-3">
              <p className="text-stone-700 text-sm font-medium mb-2">Reset Password</p>
              <div className="flex gap-2">
                <input className={inputCls} type="password" placeholder="New password (min 6 characters)" value={resetPasswordValue} onChange={e => setResetPasswordValue(e.target.value)} />
                <button className={btnCls} disabled={resettingPassword} onClick={doResetPassword}>{resettingPassword ? 'Setting…' : 'Set'}</button>
              </div>
              <p className="text-stone-700 text-xs mt-1">Sets their password directly — tell them the new password securely. They can also self-reset via "Forgot password?" on the login page.</p>
            </div>
            <div className="border-t border-stone-800 pt-3">
              <button className="text-teal-700 text-sm font-medium mb-4 block" onClick={() => { setViewDocsFor(editing); setEditing(null); }}>View Documents</button>
              {showOffboard ? (
                <OffboardStaff staffMember={editing} onDone={() => { setShowOffboard(false); setEditing(null); load(); }} />
              ) : editing.exit_date ? (
                <p className="text-stone-700 text-xs">
                  Offboarded on {new Date(editing.exit_date).toLocaleDateString()} — {String(editing.exit_reason || '').replace('_', ' ')}
                </p>
              ) : (
                <button className="text-red-700 text-sm font-medium" onClick={() => setShowOffboard(true)}>Offboard this employee…</button>
              )}
            </div>
            <button className={btnCls + ' w-full'} onClick={saveUser}>Save Access</button>
          </div>
        </div>
      )}
      {viewDocsFor && (
        <EmployeeDocumentsModal
          staffUserId={viewDocsFor.id}
          staffName={viewDocsFor.full_name}
          onClose={() => setViewDocsFor(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────── Tickets composite (queue + SLA overdue)
function TicketsSection({ segments, focusId }: { segments: Segment[]; focusId?: string }) {
  const [sub, setSub] = useState<'queue' | 'overdue'>('queue');
  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setSub('queue')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'queue' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>All Tickets</button>
        <button onClick={() => setSub('overdue')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'overdue' ? 'border-red-500 text-red-700' : 'border-stone-200 text-stone-700'}`}>Overdue (SLA)</button>
      </div>
      {sub === 'queue' && <TicketsBoard segments={segments} focusId={focusId} />}
      {sub === 'overdue' && <OverdueTickets segments={segments} />}
    </div>
  );
}

// ─────────────────────────────────────── HR composite (attendance/leaves + shifts + payslips + summary)
// ─────────────────────────── Leave entitlement policy (HR)
function LeavePolicyManager() {
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('leave_policies').select('*').is('role_name', null).order('leave_type');
    if (data) setRows(data);
  }
  useEffect(() => { load(); }, []);

  async function save(id: string, annual_days: number) {
    setBusy(true);
    const { error } = await supabase.from('leave_policies').update({ annual_days }).eq('id', id);
    setBusy(false);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    toast.success('Entitlement updated');
  }

  return (
    <div className={cardCls}>
      <h3 className="text-stone-900 font-semibold mb-1 text-sm">Annual Leave Entitlements</h3>
      <p className="text-stone-700 text-xs mb-4">Days granted per employee per calendar year. Balances are calculated from approved requests, counting working days only.</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3">
            <span className="text-stone-700 text-sm capitalize">{r.leave_type}</span>
            {r.is_unlimited ? (
              <span className="text-stone-700 text-xs">unlimited (unpaid)</span>
            ) : (
              <input type="number" min={0} className={inputCls + ' w-24 text-right'} defaultValue={r.annual_days}
                disabled={busy} onBlur={e => { const v = Number(e.target.value); if (v !== Number(r.annual_days)) save(r.id, v); }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HRSection({ segments }: { segments: Segment[] }) {
  const { user, hasPermission } = useAuth();
  const isSA = user?.role === 'super_admin';
  // Shifts & payslips require payroll/staff management; a manager with only
  // view_attendance would otherwise see tabs whose saves are RLS-rejected.
  const canPayroll = isSA || hasPermission('manage_payroll');
  const canShifts = isSA || hasPermission('manage_staff') || hasPermission('manage_payroll');
  const canSummary = isSA || hasPermission('view_attendance') || hasPermission('view_reports');
  const [sub, setSub] = useState<'core' | 'shifts' | 'payslips' | 'summary' | 'policy' | 'corrections' | 'holidays' | 'dangling'>('core');
  const canPolicy = isSA || hasPermission('manage_staff');
  const canApprove = isSA || hasPermission('approve_leaves');
  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setSub('core')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'core' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Staff & Leaves</button>
        {canApprove && <button onClick={() => setSub('corrections')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'corrections' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Attendance Corrections</button>}
        {canSummary && <button onClick={() => setSub('dangling')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'dangling' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Unclosed Days</button>}
        {canShifts && <button onClick={() => setSub('shifts')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'shifts' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Shifts</button>}
        {canPayroll && <button onClick={() => setSub('payslips')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'payslips' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Payslips</button>}
        {canSummary && <button onClick={() => setSub('summary')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'summary' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Attendance Summary</button>}
        {canPolicy && <button onClick={() => setSub('policy')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'policy' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Leave Policy</button>}
        {canPolicy && <button onClick={() => setSub('holidays')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'holidays' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Holidays</button>}
      </div>
      {sub === 'core' && <HRBoard segments={segments} />}
      {sub === 'corrections' && canApprove && <RegularizationApprovals />}
      {sub === 'dangling' && canSummary && <DanglingCheckins />}
      {sub === 'shifts' && canShifts && <ShiftsManager segments={segments} />}
      {sub === 'payslips' && canPayroll && <PayslipManager />}
      {sub === 'summary' && canSummary && <AttendanceSummaryTable segments={segments} />}
      {sub === 'policy' && canPolicy && <LeavePolicyManager />}
      {sub === 'holidays' && canPolicy && <HolidayManager segments={segments} />}
    </div>
  );
}

// ─────────────────────────────────────── Approvals (bank + photo change requests)
function ApprovalsSection() {
  const [sub, setSub] = useState<'bank' | 'photo'>('bank');
  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setSub('bank')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'bank' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Bank Details</button>
        <button onClick={() => setSub('photo')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'photo' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Profile Photos</button>
      </div>
      {sub === 'bank' && <BankChangeApprovals />}
      {sub === 'photo' && <PhotoChangeApprovals />}
    </div>
  );
}

// ─────────────────────────────────────── Segments Manager
function SegmentsManager({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Segment[]>([]);
  const [editing, setEditing] = useState<Partial<Segment> | null>(null);
  const [usage, setUsage] = useState<Record<string, { staff: number; leads: number; tickets: number }>>({});
  const toast = useToast();

  async function load() {
    const { data } = await supabase.from('segments').select('*').order('order_index');
    if (data) setRows(data as Segment[]);

    // Live dependency counts — retiring a segment must never silently strand data.
    const [{ data: staff }, { data: leads }, { data: tickets }] = await Promise.all([
      supabase.from('app_users').select('segments').eq('is_active', true).neq('role', 'super_admin'),
      supabase.from('marketing_leads').select('segment_slug').not('stage', 'in', '(won,lost)'),
      supabase.from('support_tickets').select('segment_slug').in('status', ['open', 'in_progress', 'waiting_customer']),
    ]);
    const u: Record<string, { staff: number; leads: number; tickets: number }> = {};
    (data || []).forEach((s: any) => { u[s.slug] = { staff: 0, leads: 0, tickets: 0 }; });
    (staff || []).forEach((s: any) => (s.segments || []).forEach((slug: string) => { if (u[slug]) u[slug].staff++; }));
    (leads || []).forEach((l: any) => { if (u[l.segment_slug]) u[l.segment_slug].leads++; });
    (tickets || []).forEach((t: any) => { if (u[t.segment_slug]) u[t.segment_slug].tickets++; });
    setUsage(u);
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(seg: Segment) {
    const retiring = seg.active;
    const use = usage[seg.slug] || { staff: 0, leads: 0, tickets: 0 };
    if (retiring) {
      const attached = [
        use.staff ? `${use.staff} staff member(s)` : null,
        use.leads ? `${use.leads} open lead(s)` : null,
        use.tickets ? `${use.tickets} open ticket(s)` : null,
      ].filter(Boolean);
      const warning = attached.length
        ? `"${seg.name}" still has ${attached.join(', ')}.\n\nRetiring removes it from the public website immediately. Existing data is NOT deleted and stays manageable in staff portals so you can wind it down.\n\nContinue?`
        : `Retire "${seg.name}"? It will disappear from the public website. Nothing is deleted and you can reactivate it any time.`;
      if (!confirm(warning)) return;
    }
    const { error } = await supabase.from('segments').update({ active: !seg.active }).eq('id', seg.id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(retiring ? `${seg.name} retired — hidden from the website` : `${seg.name} reactivated`);
    load(); onChanged();
  }

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
        <p className="text-stone-700 text-sm">Add a new business vertical anytime — tickets, leads, staff scoping pick it up automatically.</p>
        <button className={btnCls} onClick={() => setEditing({ slug: '', name: '', tagline: '', description: '', icon: 'Layers', color: '#0ea5e9', ticket_prefix: '', order_index: rows.length + 1, active: true })}>+ New Segment</button>
      </div>
      <div className="space-y-2">
        {rows.map(s => (
          <div key={s.id} className={cardCls + ' flex items-center justify-between' + (s.active ? '' : ' opacity-60')}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <div>
                <p className="text-stone-900 font-bold">{s.name} <span className="text-stone-700 text-xs">({s.slug} • NKT-{s.ticket_prefix}-)</span></p>
                <p className="text-stone-700 text-xs">{s.tagline}</p>
                {usage[s.slug] && (usage[s.slug].staff > 0 || usage[s.slug].leads > 0 || usage[s.slug].tickets > 0) && (
                  <p className="text-stone-700 text-xs mt-0.5">
                    {usage[s.slug].staff} staff · {usage[s.slug].leads} open leads · {usage[s.slug].tickets} open tickets
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${s.active ? 'text-emerald-700' : 'text-amber-700'}`}>{s.active ? 'live' : 'retired'}</span>
              <button className="text-teal-700 text-sm" onClick={() => setEditing(s)}>Edit</button>
              <button className={s.active ? 'text-amber-700 text-sm' : 'text-emerald-700 text-sm'} onClick={() => toggleActive(s)}>
                {s.active ? 'Retire' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">{editing.id ? 'Edit' : 'New'} Segment</h3>
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
        <p className="text-stone-700 text-sm">Add any new software product without code — it appears on the website instantly.</p>
        <button className={btnCls} onClick={() => setEditing({ segment_slug: 'software', slug: '', name: '', tagline: '', description: '', external_url: '', demo_cta: 'Visit Website', status: 'active', order_index: rows.length + 1, features: [] })}>+ Add Product</button>
      </div>
      <div className="space-y-2">
        {rows.map(p => (
          <div key={p.id} className={cardCls + ' flex flex-wrap items-center justify-between gap-2'}>
            <div>
              <p className="text-stone-900 font-bold">{p.name} <span className="text-stone-700 text-xs">/{p.slug}</span></p>
              <p className="text-stone-700 text-xs">{p.tagline} {p.external_url && `• ${p.external_url}`}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : p.status === 'coming_soon' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-700'}`}>{p.status}</span>
              <button className="text-teal-700 text-sm" onClick={() => setEditing({ ...p, features: p.features || [] })}>Edit</button>
              <button className="text-red-700 text-sm" onClick={() => remove(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">{editing.id ? 'Edit' : 'Add'} Product</h3>
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
            <ImageUpload placeholder="Upload Product Logo" value={editing.logo_url || ''} onChange={url => setEditing({ ...editing, logo_url: url })} />
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-stone-700 text-sm font-medium">Feature Cards</p>
                <button className="text-teal-700 text-xs" onClick={() => setEditing({ ...editing, features: [...editing.features, { title: '', description: '', icon: 'CheckCircle2' }] })}>+ Add feature</button>
              </div>
              {editing.features.map((f: any, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 mb-2">
                  <input className={inputCls} placeholder="Title" value={f.title} onChange={e => {
                    const fs = [...editing.features]; fs[i] = { ...f, title: e.target.value }; setEditing({ ...editing, features: fs });
                  }} />
                  <input className={inputCls} placeholder="Description" value={f.description} onChange={e => {
                    const fs = [...editing.features]; fs[i] = { ...f, description: e.target.value }; setEditing({ ...editing, features: fs });
                  }} />
                  <button className="text-red-700 text-xs px-2" onClick={() => setEditing({ ...editing, features: editing.features.filter((_: any, j: number) => j !== i) })}>✕</button>
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
          <h3 className="text-stone-900 font-bold mb-3">Services on Website</h3>
          <div className="space-y-2 mb-4">
            {services.filter(s => s.segment_slug === seg).map(s => (
              <div key={s.id} className="flex justify-between items-center text-sm">
                <span className="text-stone-800 font-medium">{s.title}</span>
                <button className="text-red-700 text-xs font-semibold" onClick={() => removeService(s.id)}>Remove</button>
              </div>
            ))}
          </div>
          <input className={inputCls + ' mb-2'} placeholder="Service title" value={newService.title} onChange={e => setNewService({ ...newService, title: e.target.value })} />
          <input className={inputCls + ' mb-2'} placeholder="Description" value={newService.description} onChange={e => setNewService({ ...newService, description: e.target.value })} />
          <button className={btnCls} onClick={addService}>Add Service</button>
        </div>
        <div className={cardCls}>
          <h3 className="text-stone-900 font-bold mb-3">Ticket Types (support form options)</h3>
          <div className="space-y-2 mb-4">
            {types.filter(t => t.segment_slug === seg).map(t => (
              <div key={t.id} className="flex justify-between items-center text-sm">
                <span className="text-stone-800 font-medium">{t.name}</span>
                <button className="text-red-700 text-xs font-semibold" onClick={() => removeType(t.id)}>Remove</button>
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
// ─────────────────────────────────────── Site Media Manager (Gallery, Team, Testimonials — was missing entirely)
function SiteMediaManager({ segments }: { segments: Segment[] }) {
  const toast = useToast();
  const [tab, setTab] = useState<'gallery' | 'team' | 'testimonials' | 'logos'>('gallery');
  const [gallery, setGallery] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [logos, setLogos] = useState<any[]>([]);
  const [newGallery, setNewGallery] = useState({ title: '', image_url: '', segment_slug: '' });
  const [newTeam, setNewTeam] = useState({ name: '', designation: '', photo_url: '', segment_slug: '' });
  const [newTestimonial, setNewTestimonial] = useState({ customer_name: '', content: '', rating: 5, segment_slug: '' });
  const [newLogo, setNewLogo] = useState({ name: '', logo_url: '', segment_slug: '' });

  async function load() {
    const [{ data: g }, { data: t }, { data: te }, { data: lg }] = await Promise.all([
      supabase.from('gallery_items').select('*').order('order_index'),
      supabase.from('team_members').select('*').order('order_index'),
      supabase.from('testimonials').select('*').order('order_index'),
      supabase.from('client_logos').select('*').order('order_index'),
    ]);
    if (g) setGallery(g);
    if (t) setTeam(t);
    if (te) setTestimonials(te);
    if (lg) setLogos(lg);
  }
  useEffect(() => { load(); }, []);

  async function addLogo() {
    if (!newLogo.name || !newLogo.logo_url) { toast.error('Name and logo URL are required'); return; }
    const { error } = await supabase.from('client_logos').insert({ ...newLogo, segment_slug: newLogo.segment_slug || null, order_index: logos.length + 1 });
    if (error) { toast.error(error.message); return; }
    toast.success('Client logo added');
    setNewLogo({ name: '', logo_url: '', segment_slug: '' });
    load();
  }

  async function addGallery() {
    if (!newGallery.image_url) { toast.error('Image URL is required'); return; }
    const { error } = await supabase.from('gallery_items').insert({ ...newGallery, segment_slug: newGallery.segment_slug || null, order_index: gallery.length + 1 });
    if (error) { toast.error(error.message); return; }
    toast.success('Added to gallery');
    setNewGallery({ title: '', image_url: '', segment_slug: '' });
    load();
  }
  async function addTeam() {
    if (!newTeam.name) { toast.error('Name is required'); return; }
    const { error } = await supabase.from('team_members').insert({ ...newTeam, segment_slug: newTeam.segment_slug || null, order_index: team.length + 1 });
    if (error) { toast.error(error.message); return; }
    toast.success('Team member added');
    setNewTeam({ name: '', designation: '', photo_url: '', segment_slug: '' });
    load();
  }
  async function addTestimonial() {
    if (!newTestimonial.customer_name || !newTestimonial.content) { toast.error('Name and testimonial text are required'); return; }
    const { error } = await supabase.from('testimonials').insert({ ...newTestimonial, segment_slug: newTestimonial.segment_slug || null, order_index: testimonials.length + 1 });
    if (error) { toast.error(error.message); return; }
    toast.success('Testimonial added');
    setNewTestimonial({ customer_name: '', content: '', rating: 5, segment_slug: '' });
    load();
  }
  async function toggleActive(table: string, id: string, active: boolean, setter: () => void) {
    const { error } = await supabase.from(table).update({ active: !active }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setter();
  }
  async function remove(table: string, id: string, setter: () => void) {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    setter();
  }

  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('gallery')} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === 'gallery' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Gallery ({gallery.length})</button>
        <button onClick={() => setTab('team')} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === 'team' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Team ({team.length})</button>
        <button onClick={() => setTab('testimonials')} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === 'testimonials' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Testimonials ({testimonials.length})</button>
        <button onClick={() => setTab('logos')} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === 'logos' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>Client Logos ({logos.length})</button>
      </div>

      {tab === 'gallery' && (
        <div>
          <div className={cardCls + ' mb-4 space-y-2'}>
            <p className="text-stone-900 text-sm font-medium">Add Gallery Photo</p>
            <ImageUpload placeholder="Upload Gallery Image *" value={newGallery.image_url} onChange={url => setNewGallery({ ...newGallery, image_url: url })} />
            <input className={inputCls} placeholder="Caption (optional)" value={newGallery.title} onChange={e => setNewGallery({ ...newGallery, title: e.target.value })} />
            <select className={inputCls} value={newGallery.segment_slug} onChange={e => setNewGallery({ ...newGallery, segment_slug: e.target.value })}>
              <option value="">All segments</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <button className={btnCls} onClick={addGallery}>Add Photo</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {gallery.map(g => (
              <div key={g.id} className="relative rounded-lg overflow-hidden border border-stone-800">
                <img src={g.image_url} alt={g.title} className="w-full h-28 object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  <button className="text-xs text-stone-900" onClick={() => toggleActive('gallery_items', g.id, g.active, load)}>{g.active ? 'Hide' : 'Show'}</button>
                  <button className="text-xs text-red-700" onClick={() => remove('gallery_items', g.id, load)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div>
          <div className={cardCls + ' mb-4 space-y-2'}>
            <p className="text-stone-900 text-sm font-medium">Add Team Member</p>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Name *" value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} />
              <input className={inputCls} placeholder="Designation" value={newTeam.designation} onChange={e => setNewTeam({ ...newTeam, designation: e.target.value })} />
            </div>
            <ImageUpload placeholder="Upload Team Photo" value={newTeam.photo_url} onChange={url => setNewTeam({ ...newTeam, photo_url: url })} />
            <select className={inputCls} value={newTeam.segment_slug} onChange={e => setNewTeam({ ...newTeam, segment_slug: e.target.value })}>
              <option value="">All segments</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <button className={btnCls} onClick={addTeam}>Add Team Member</button>
          </div>
          <div className="space-y-2">
            {team.map(t => (
              <div key={t.id} className={cardCls + ' flex items-center justify-between'}>
                <div className="flex items-center gap-3">
                  {t.photo_url && <img src={t.photo_url} className="w-9 h-9 rounded-full object-cover" />}
                  <div>
                    <p className="text-stone-900 text-sm">{t.name}</p>
                    <p className="text-stone-700 text-xs">{t.designation}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="text-stone-700 text-xs" onClick={() => toggleActive('team_members', t.id, t.active, load)}>{t.active ? 'Hide' : 'Show'}</button>
                  <button className="text-red-700 text-xs" onClick={() => remove('team_members', t.id, load)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'testimonials' && (
        <div>
          <div className={cardCls + ' mb-4 space-y-2'}>
            <p className="text-stone-900 text-sm font-medium">Add Testimonial</p>
            <input className={inputCls} placeholder="Customer Name *" value={newTestimonial.customer_name} onChange={e => setNewTestimonial({ ...newTestimonial, customer_name: e.target.value })} />
            <textarea className={inputCls} rows={2} placeholder="Testimonial text *" value={newTestimonial.content} onChange={e => setNewTestimonial({ ...newTestimonial, content: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={newTestimonial.rating} onChange={e => setNewTestimonial({ ...newTestimonial, rating: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
              </select>
              <select className={inputCls} value={newTestimonial.segment_slug} onChange={e => setNewTestimonial({ ...newTestimonial, segment_slug: e.target.value })}>
                <option value="">All segments</option>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </div>
            <button className={btnCls} onClick={addTestimonial}>Add Testimonial</button>
          </div>
          <div className="space-y-2">
            {testimonials.map(t => (
              <div key={t.id} className={cardCls}>
                <div className="flex items-center justify-between">
                  <p className="text-stone-900 text-sm font-medium">{t.customer_name} <span className="text-amber-700 text-xs">{'★'.repeat(t.rating)}</span></p>
                  <div className="flex gap-3">
                    <button className="text-stone-700 text-xs" onClick={() => toggleActive('testimonials', t.id, t.active, load)}>{t.active ? 'Hide' : 'Show'}</button>
                    <button className="text-red-700 text-xs" onClick={() => remove('testimonials', t.id, load)}>Delete</button>
                  </div>
                </div>
                <p className="text-stone-700 text-sm mt-1">{t.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'logos' && (
        <div>
          <div className={cardCls + ' mb-4 space-y-2'}>
            <p className="text-stone-900 text-sm font-medium">Add Client Logo</p>
            <p className="text-stone-700 text-xs">Shows in the scrolling "Trusted By" strip on the homepage.</p>
            <input className={inputCls} placeholder="Client Name *" value={newLogo.name} onChange={e => setNewLogo({ ...newLogo, name: e.target.value })} />
            <ImageUpload placeholder="Upload Client Logo *" value={newLogo.logo_url} onChange={url => setNewLogo({ ...newLogo, logo_url: url })} />
            <select className={inputCls} value={newLogo.segment_slug} onChange={e => setNewLogo({ ...newLogo, segment_slug: e.target.value })}>
              <option value="">All segments</option>
              {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <button className={btnCls} onClick={addLogo}>Add Logo</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {logos.map(l => (
              <div key={l.id} className="relative rounded-lg overflow-hidden border border-stone-800 bg-white p-4 flex items-center justify-center">
                <img src={l.logo_url} alt={l.name} className="max-h-10 object-contain" />
                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  <button className="text-xs text-stone-900" onClick={() => toggleActive('client_logos', l.id, l.active, load)}>{l.active ? 'Hide' : 'Show'}</button>
                  <button className="text-xs text-red-700" onClick={() => remove('client_logos', l.id, load)}>Delete</button>
                </div>
              </div>
            ))}
            {logos.length === 0 && <p className="text-stone-700 text-sm col-span-full text-center py-6">No client logos yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

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
      <p className="text-stone-700 text-sm">Edit any text on the public website. Changes go live immediately.</p>
      {sections.map(sec => (
        <div key={sec} className={cardCls}>
          <h3 className="text-stone-900 font-semibold capitalize mb-3">{sec}</h3>
          <div className="space-y-3">
            {rows.filter(r => r.section === sec).map(r => (
              <div key={r.id}>
                <label className="text-stone-700 text-xs capitalize">{r.key}</label>
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
  const [viewDocsFor, setViewDocsFor] = useState<any | null>(null);
  const [issueDocs, setIssueDocs] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('document_templates').select('*').order('doc_type'),
      supabase.from('app_users').select('*').eq('is_active', true).neq('role', 'super_admin').order('full_name'),
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
      staff_code: issueFor.staff_code, exit_date: issueFor.exit_date,
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
          <h3 className="text-stone-900 font-semibold">Document Templates</h3>
          <button className={btnCls} onClick={() => setEditingTpl({ segment_slug: '', doc_type: 'other', title: '', body: '', active: true, requires_signature: true })}>+ New Template</button>
        </div>
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className={cardCls + ' flex items-center justify-between'}>
              <div>
                <p className="text-stone-900 text-sm font-medium">{t.title}</p>
                <p className="text-stone-700 text-xs">{DOC_TYPE_LABELS[t.doc_type]} • {segments.find(s => s.slug === t.segment_slug)?.name || 'All segments'} • {t.requires_signature ? 'needs signature' : 'acknowledge only'}</p>
              </div>
              <div className="flex gap-3">
                <button className="text-teal-700 text-xs" onClick={() => setPreview({ title: t.title, content: t.body })}>Preview</button>
                <button className="text-teal-700 text-xs" onClick={() => setEditingTpl(t)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-stone-900 font-semibold mb-4">Issue Documents to Existing Staff</h3>
        <div className="space-y-2">
          {staff.map(s => (
            <div key={s.id} className={cardCls + ' flex items-center justify-between'}>
              <p className="text-stone-900 text-sm">{s.full_name} <span className="text-stone-700 text-xs">({s.role})</span></p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 border-r border-stone-200 pr-3">
                  <OnboardingStatusBadge staffUserId={s.id} />
                  <button onClick={() => setViewDocsFor(s)} className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded transition-colors">
                    View Collected
                  </button>
                </div>
                <button className="text-teal-700 text-xs font-medium hover:text-teal-900" onClick={() => openIssue(s)}>Issue Document</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingTpl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditingTpl(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">{editingTpl.id ? 'Edit' : 'New'} Template</h3>
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
            <p className="text-stone-700 text-xs">Placeholders: {'{{name}} {{designation}} {{role}} {{segment}} {{joining_date}} {{ctc}} {{employment_type}} {{company}}'}</p>
            <textarea className={inputCls} rows={10} value={editingTpl.body} onChange={e => setEditingTpl({ ...editingTpl, body: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-stone-900 cursor-pointer">
              <input type="checkbox" checked={editingTpl.requires_signature !== false} onChange={e => setEditingTpl({ ...editingTpl, requires_signature: e.target.checked })} />
              Requires employee signature <span className="text-stone-700 text-xs">(off = simple acknowledge)</span>
            </label>
            <button className={btnCls + ' w-full'} onClick={saveTemplate}>Save Template</button>
          </div>
        </div>
      )}

      {issueFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setIssueFor(null)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">Issue documents to {issueFor.full_name}</h3>
            {relevantTemplates(issueFor).map(t => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-stone-900 cursor-pointer">
                <input type="checkbox" checked={issueDocs.includes(t.id)} onChange={() => setIssueDocs(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])} />
                {t.title}
              </label>
            ))}
            <button className={btnCls + ' w-full'} disabled={busy} onClick={issue}>{busy ? 'Issuing…' : 'Issue Selected Documents'}</button>
          </div>
        </div>
      )}
      {preview && <DocumentViewer title={preview.title} content={preview.content} onClose={() => setPreview(null)} />}
      {viewDocsFor && (
        <EmployeeDocumentsModal
          staffUserId={viewDocsFor.id}
          staffName={viewDocsFor.full_name}
          onClose={() => setViewDocsFor(null)}
        />
      )}
    </div>
  );
}

type Tab = 'overview' | 'tasks' | 'tickets' | 'crm' | 'hr' | 'access' | 'segments' | 'products' | 'catalog' | 'documents' | 'approvals' | 'announcements' | 'careers' | 'media' | 'content' | 'security'
  | 'my_attendance' | 'my_documents' | 'my_requests' | 'my_profile' | 'my_swap' | 'my_sessions';

export default function SuperAdminDashboard() {
  const { user, signOut, hasPermission } = useAuth();
  const { segments } = useSegments(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [onboardSignal, setOnboardSignal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [focus, setFocus] = useState<{ kind: 'staff' | 'lead' | 'ticket'; id: string } | null>(null);

  function navigateWithFocus(t: string, f?: { kind: 'staff' | 'lead' | 'ticket'; id: string }) {
    setTab(t as Tab);
    setFocus(f || null);
  }

  const isSuperAdmin = user?.role === 'super_admin';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Admin tabs: each requires the same permission enforced at the database (RLS) level —
  // shown here only when the person can actually use it, not just when they're super_admin.
  // Grouped so the sidebar (and mobile drawer) reads as sections, not one flat list of 20+ items.
  type TabDef = { id: Tab; label: string; icon: any; show: boolean };
  const rawGroups: { label: string; items: TabDef[] }[] = [
    {
      label: 'My Workspace',
      items: [
        // The literal owner account isn't a managed employee (no attendance/
        // leave/payslip of their own to self-service) — HR/managers routed
        // into this same dashboard still need all of this, so it's gated on
        // isSuperAdmin specifically, not on being in the admin console.
        { id: 'my_attendance', label: 'My Attendance', icon: Clock, show: !isSuperAdmin },
        { id: 'my_documents', label: 'My Documents', icon: FileText, show: !isSuperAdmin },
        { id: 'my_requests', label: 'Leaves & Advances', icon: CalendarDays, show: !isSuperAdmin },
        { id: 'my_profile', label: 'My Profile', icon: CreditCard, show: !isSuperAdmin },
        { id: 'my_swap', label: 'Shift Swap', icon: Repeat, show: !isSuperAdmin },
        { id: 'my_sessions', label: 'My Sessions', icon: Shield, show: true },
      ],
    },
    {
      label: 'Executive Overview',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, show: true },
        { id: 'tickets', label: 'Tickets', icon: Ticket, show: isSuperAdmin || hasPermission('view_tickets') || hasPermission('manage_tickets') },
        { id: 'tasks', label: 'Tasks', icon: ClipboardList, show: true },
        { id: 'crm', label: 'CRM / Leads', icon: ClipboardList, show: isSuperAdmin || hasPermission('view_leads') || hasPermission('manage_leads') },
        { id: 'hr', label: 'HR / Payroll', icon: Users2, show: isSuperAdmin || hasPermission('view_staff') || hasPermission('manage_staff') || hasPermission('view_attendance') || hasPermission('manage_payroll') },
      ],
    },
    {
      label: 'Administration',
      items: [
        { id: 'access', label: 'Access Control', icon: UserCog, show: isSuperAdmin || hasPermission('manage_staff') },
        { id: 'segments', label: 'Segments', icon: Layers, show: isSuperAdmin },
        { id: 'products', label: 'Products', icon: Boxes, show: isSuperAdmin || hasPermission('manage_content') },
        { id: 'catalog', label: 'Services & Ticket Types', icon: Wrench, show: isSuperAdmin || hasPermission('manage_content') },
        { id: 'documents', label: 'Documents & Onboarding', icon: FileText, show: isSuperAdmin || hasPermission('manage_staff') },
        { id: 'approvals', label: 'Approvals', icon: Landmark, show: isSuperAdmin || hasPermission('approve_advances') || hasPermission('manage_staff') },
        { id: 'announcements', label: 'Announcements', icon: Megaphone, show: isSuperAdmin || hasPermission('manage_staff') },
        { id: 'careers', label: 'Careers / Hiring', icon: Briefcase, show: isSuperAdmin || hasPermission('view_careers') || hasPermission('manage_careers') },
        { id: 'media', label: 'Gallery / Team / Reviews', icon: ImageIcon, show: isSuperAdmin || hasPermission('manage_content') },
        { id: 'content', label: 'Website Content', icon: FileText, show: isSuperAdmin || hasPermission('manage_content') },
        { id: 'security', label: 'Security Logs', icon: Shield, show: isSuperAdmin },
      ],
    },
  ];
  const tabGroups = rawGroups
    .map(g => ({ ...g, items: g.items.filter(t => t.show) }))
    .filter(g => g.items.length > 0);

  const tabs = tabGroups.flatMap(g => g.items);

  function goTo(t: Tab) {
    setTab(t);
    setMobileNavOpen(false);
  }

  const navGroups = (
    <>
      {tabGroups.map(g => (
        <div key={g.label} className="mb-5">
          <p className="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-stone-700 uppercase">{g.label}</p>
          <div className="space-y-1">
            {g.items.map(t => (
              <button key={t.id} onClick={() => goTo(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.id ? 'bg-orange-50 border border-orange-200 text-orange-800 shadow-sm' : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-transparent'}`}>
                <t.icon className={`w-4 h-4 shrink-0 ${tab === t.id ? 'text-orange-700' : 'text-stone-700'}`} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex text-stone-900" key={refreshKey}>
      <aside className="w-60 shrink-0 border-r border-stone-200 bg-white p-4 hidden md:flex flex-col shadow-sm">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <KiteTailLogo className="w-8 h-8 shrink-0" />
          <div>
            <p className="text-stone-900 font-extrabold text-sm leading-tight">Nikki Technologies</p>
            <p className="text-stone-700 text-[11px] font-semibold">{isSuperAdmin ? 'Super Admin' : 'Admin Console'}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto">{navGroups}</nav>
        <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-stone-700 hover:text-red-700 text-sm font-semibold mt-auto border-t border-stone-200 pt-3">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </aside>

      {/* Mobile nav drawer — a flat 20+ item horizontal scroll strip doesn't scale,
          so mobile gets the same grouped sections as the desktop sidebar, in an overlay. */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-stone-900/50" onClick={() => setMobileNavOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-white h-full overflow-y-auto p-4 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex items-center gap-2.5">
                <KiteTailLogo className="w-8 h-8 shrink-0" />
                <div>
                  <p className="text-stone-900 font-extrabold text-sm leading-tight">Nikki Technologies</p>
                  <p className="text-stone-700 text-[11px] font-semibold">{isSuperAdmin ? 'Super Admin' : 'Admin Console'}</p>
                </div>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="p-1 text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <nav className="flex-1">{navGroups}</nav>
            <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-stone-700 hover:text-red-700 text-sm font-semibold border-t border-stone-200 pt-3">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 p-5 md:p-8 overflow-y-auto min-w-0">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-1.5 -ml-1.5 text-stone-700 shrink-0"><Menu className="w-6 h-6" /></button>
            <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight truncate">{tabs.find(t => t.id === tab)?.label}</h1>
          </div>
          <div className="flex items-center gap-3">
            <QuickSearch onNavigate={navigateWithFocus} />
            <NotificationBell onNavigate={(t) => setTab(t as Tab)} />
            <span className="text-stone-700 text-sm hidden sm:block">{user?.full_name}</span>
            <button onClick={signOut} className="md:hidden text-stone-700"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        {tab === 'my_attendance' && <MyAttendance />}
        {tab === 'my_documents' && <MyDocuments />}
        {tab === 'my_requests' && <MyRequests />}
        {tab === 'my_profile' && <MyProfile />}
        {tab === 'my_swap' && <ShiftSwapBoard />}
        {tab === 'overview' && <Overview segments={segments} onGo={(t) => setTab(t as Tab)} onAddStaff={() => { setOnboardSignal(s => s + 1); setTab('access'); }} />}
        {tab === 'tasks' && <TasksBoard segments={segments} />}
        {tab === 'tickets' && <TicketsSection segments={segments} focusId={focus?.kind === 'ticket' ? focus.id : undefined} />}
        {tab === 'crm' && <LeadsWorkspace segments={segments} focusLeadId={focus?.kind === 'lead' ? focus.id : undefined} />}
        {tab === 'hr' && <HRSection segments={segments} />}
        {tab === 'access' && <AccessControl segments={segments} openSignal={onboardSignal} focusStaffId={focus?.kind === 'staff' ? focus.id : undefined} />}
        {tab === 'segments' && <SegmentsManager onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'products' && <ProductsManager segments={segments} />}
        {tab === 'catalog' && <CatalogManager segments={segments} />}
        {tab === 'documents' && <DocumentsManager segments={segments} />}
        {tab === 'approvals' && <ApprovalsSection />}
        {tab === 'announcements' && <AnnouncementsManager segments={segments} />}
        {tab === 'careers' && <CareersManager segments={segments} />}
        {tab === 'media' && <SiteMediaManager segments={segments} />}
        {tab === 'content' && <ContentManager />}
        {tab === 'security' && <SecurityLogsViewer />}
        {tab === 'my_sessions' && <SessionDevices />}
      </main>
    </div>
  );
}
