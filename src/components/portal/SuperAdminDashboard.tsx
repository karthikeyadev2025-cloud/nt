import { useEffect, useState, lazy, Suspense } from 'react';
import {
  LayoutDashboard, Ticket, Users2, Layers, Boxes, FileText,
  UserCog, LogOut, Wrench, ClipboardList, ChevronRight, ChevronLeft, CheckCircle2,
  Landmark, Megaphone, Briefcase, Image as ImageIcon, Shield,
  Clock, CalendarDays, CreditCard, Repeat, Menu, X, Key, Bell, BellOff, TrendingUp, PartyPopper,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cachedRpc } from '../../lib/cachedRpc';
import { cachedQuery } from '../../lib/cachedQuery';
import { useAuth } from '../../contexts/AuthContext';
import { useSegments } from '../../lib/useSegments';
import { useDueLeadAlerts } from '../../lib/dueAlerts';
import type { Segment, Product, ProductFeature, Tables } from '../../lib/database.types';
import { TicketsBoard, HRBoard, inputCls, btnCls, cardCls, SegmentTabs, MyLeadsToDoList } from './shared';
import { DOC_TYPE_LABELS, renderTemplate, buildOnboardingVars, DocumentViewer, OnboardingStatusBadge, EmployeeDocumentsModal } from './documents';
import { ImageUpload } from './ImageUpload';
import { NotificationBell, AnnouncementsManager, BankChangeApprovals, PunctualityLeaderboard, BirthdaysWidget, CareersManager, PhotoChangeApprovals, ShiftSwapBoard } from './features';
import { TasksBoard } from './tasks';
import { LeadsWorkspace } from './leads-workflow';
import { TeamCalendar, MeetingTypesManager } from './meetings';
import { DueAlertBanner } from './portal-shell';
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
import { SourcingFunnelWidget } from './performance';
import { ShiftsManager, PayslipManager, AttendanceSummaryTable } from './payroll';
import { RegularizationApprovals, HolidayManager, OffboardStaff, DanglingCheckins, OverdueTickets } from './lifecycle';
import { MyAttendance, MyRequests, MyDocuments, MyProfile } from './StaffPortal';
import { SecurityLogsViewer, SetupChecklist, QuickSearch, ExportStaffButton } from './admin-extras';
import SessionDevices from '../SessionDevices';
import { ChangePasswordModal } from '../ChangePasswordModal';
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

function ActionCentre({ onGo }: { onGo: (tab: string, filter?: { segFilter?: string; stageFilter?: string; ticketStatus?: string }) => void }) {
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
  const canApprovals = isSA || hasPermission('approve_advances') || hasPermission('manage_staff');

  useEffect(() => {
    (async () => {
      try {
        const result = await cachedRpc(
          `get_dashboard_counts:${user?.id}`,
          () => supabase.rpc('get_dashboard_counts', { p_user_id: user?.id }),
          15_000,
          30_000
        ) as { data?: Record<string, number>; error?: { message: string } | null };
        if (result.error) {
          console.error('get_dashboard_counts RPC error:', result.error.message);
        } else if (result.data) {
          setC({
            ...result.data,
            pendingApprovals: (result.data.leaves || 0) + (result.data.advances || 0)
              + (result.data.bankChangeReq || 0) + (result.data.photoChangeReq || 0) + (result.data.transfers || 0),
          });
        }
      } catch (err) {
        console.error('get_dashboard_counts failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) return null;

  // "Attention" items — click-through, dim when zero, only render if the
  // viewer's role can act on them. "Snapshot" items are always-visible
  // context (not urgent, just informational) — no dimming.
  const attentionItems = [
    { key: 'leaves', label: 'Leave requests to review', tab: 'hr', tone: 'text-amber-700 font-bold', show: canLeaves },
    { key: 'advances', label: 'Advance requests to review', tab: 'hr', tone: 'text-amber-700 font-bold', show: canAdvances },
    { key: 'transfers', label: 'Lead transfers to approve', tab: 'crm', tone: 'text-amber-700 font-bold', show: canTransfers },
    { key: 'regularizations', label: 'Attendance corrections to review', tab: 'hr', tone: 'text-amber-700 font-bold', show: canAttendance || canApprovals },
    { key: 'overdueTickets', label: 'Overdue tickets (SLA missed)', tab: 'tickets', tone: 'text-red-700 font-extrabold', show: canTickets },
    { key: 'unassignedLeads', label: 'Unassigned leads waiting', tab: 'crm', tone: 'text-amber-700 font-extrabold', show: canLeads },
    { key: 'overdueFollowups', label: 'Follow-ups overdue', tab: 'crm', tone: 'text-red-700 font-extrabold', show: canLeads },
    { key: 'overdueCallbacksAppts', label: 'Callbacks/appointments overdue', tab: 'crm', tone: 'text-red-700 font-extrabold', show: canLeads },
    { key: 'duplicateLeadGroups', label: 'Duplicate leads to merge', tab: 'crm', tone: 'text-amber-700 font-bold', show: canLeads },
    { key: 'myTasks', label: 'Tasks assigned to me', tab: 'tasks', tone: 'text-teal-700 font-extrabold', show: true },
    { key: 'overdueTasks', label: 'Tasks overdue', tab: 'tasks', tone: 'text-red-700 font-extrabold', show: canStaff || canLeads },
  ].filter(i => i.show);

  const snapshotItems = [
    { key: 'checkedInToday', label: 'Checked in today', tab: 'hr', tone: 'text-emerald-700 font-extrabold', show: canAttendance },
    { key: 'newLeadsToday', label: 'New leads today', tab: 'crm', tone: 'text-orange-700 font-extrabold', show: canLeads },
    { key: 'openTickets', label: 'Open tickets', tab: 'tickets', tone: 'text-stone-900 font-extrabold', show: canTickets },
  ].filter(i => i.show);

  const items = [...attentionItems, ...snapshotItems];
  const nonZeroCount = attentionItems.reduce((n, i) => n + ((c[i.key] ?? 0) > 0 ? 1 : 0), 0);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-stone-900 text-xs font-extrabold tracking-wider">NEEDS YOUR ATTENTION</h3>
        {nonZeroCount === 0 && (
          <p className="text-emerald-900 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Everything up to date
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(i => {
          const n = c[i.key] ?? 0;
          const isSnapshot = snapshotItems.some(s => s.key === i.key);
          const dim = !isSnapshot && n === 0;
          return (
            <button key={i.key} onClick={() => onGo(i.tab)}
              className={cardCls + ` text-left transition-all cursor-pointer ` + (dim ? 'opacity-50 hover:opacity-100 hover:border-stone-300' : 'hover:border-orange-400')}>
              <p className={`text-3xl ${dim ? 'text-stone-400 font-bold' : i.tone}`}>{n}</p>
              <p className="text-stone-700 text-xs font-semibold mt-1">{i.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Date-range presets for the Overview filter. `days: null` means all-time
// (no lower bound at all — matches the RPC's old unfiltered behaviour).
const OVERVIEW_RANGES: { key: string; label: string; days: number | null }[] = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'month', label: 'This month', days: null }, // handled specially below
  { key: 'all', label: 'All time', days: null },
];

function rangeToDates(key: string): { from: string | null; to: string | null } {
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  if (key === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (key === '7d') {
    const from = new Date(now); from.setDate(now.getDate() - 7); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (key === '30d') {
    const from = new Date(now); from.setDate(now.getDate() - 30); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (key === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return { from: null, to: null }; // 'all'
}

function Overview({ segments, onAddStaff, onGo }: { segments: Segment[]; onAddStaff: () => void; onGo: (tab: string, filter?: { segFilter?: string; stageFilter?: string; ticketStatus?: string }) => void }) {
  const { user, hasPermission } = useAuth();
  const canOnboard = user?.role === 'super_admin' || hasPermission('manage_staff');
  const [stats, setStats] = useState<Record<string, { tickets: number; openTickets: number; leads: number; won: number; staff: number }>>({});
  const [showSecondary, setShowSecondary] = useState(false);
  const [range, setRange] = useState('all');

  useEffect(() => {
    const t = setTimeout(() => setShowSecondary(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      let summary: Record<string, Record<string, number>> | null = null;
      try {
        const { from, to } = rangeToDates(range);
        const res = await cachedRpc(
          `get_segment_summary:${range}`,
          () => supabase.rpc('get_segment_summary', { p_from: from, p_to: to })
        ) as { data?: Record<string, Record<string, number>>; error?: unknown };
        summary = res.data ?? null;
      } catch {
        summary = null;
      }

      const s: Record<string, { tickets: number; openTickets: number; leads: number; won: number; staff: number }> = {};
      segments.forEach(seg => {
        const row = summary?.[seg.slug] ?? {};
        s[seg.slug] = {
          tickets: row.tickets ?? 0,
          openTickets: row.openTickets ?? 0,
          leads: row.leads ?? 0,
          won: row.won ?? 0,
          staff: row.staff ?? 0,
        };
      });
      setStats(s);
    })();
  }, [segments, range]);

  return (
    <div className="space-y-5">
      <ActionCentre onGo={onGo} />
      {/* Leads assigned directly to a manager/super-admin (not every super
          admin works leads, but managers often do) — same auto-tracked
          to-do the other portals get. */}
      {hasPermission('manage_leads') && <MyLeadsToDoList />}
      {canOnboard && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 rounded-2xl bg-orange-50 border border-orange-200 shadow-sm">
          <p className="text-orange-950 font-bold text-sm">New hire waiting? Onboard them — account, salary and documents, all in one step.</p>
          <button onClick={onAddStaff} className="self-start sm:self-auto shrink-0 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold shadow-md shadow-orange-700/20 whitespace-nowrap">+ Onboard Employee</button>
        </div>
      )}

      {/* Date-range filter — scopes the segment cards (and, via drill-down,
          what you land on in Leads/Tickets) to a window instead of always
          showing all-time totals. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-stone-700 text-xs font-semibold">Show:</span>
        {OVERVIEW_RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${range === r.key ? 'bg-orange-700 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
            {r.label}
          </button>
        ))}
      </div>

      <h3 className="text-stone-900 text-xs font-extrabold tracking-wider flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> SEGMENTS</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {segments.map(seg => {
        const st = stats[seg.slug] || { tickets: 0, openTickets: 0, leads: 0, won: 0, staff: 0 };
        const winRate = st.leads > 0 ? Math.round((st.won / st.leads) * 100) : 0;
        // Each number is a drill-down button — Aadya-style click-to-see-
        // the-records-behind-it instead of a static stat you have to go
        // re-find manually in another tab.
        const numBtn = (value: number, label: string, tone: string, onClick: () => void) => (
          <button onClick={onClick} className="text-left rounded-lg -m-1 p-1 hover:bg-stone-50 transition-colors">
            <p className={`text-2xl font-extrabold ${tone} hover:underline`}>{value}</p>
            <p className="text-stone-700 text-xs">{label}</p>
          </button>
        );
        return (
          <div key={seg.slug} className="rounded-2xl bg-white border border-stone-200/90 shadow-md shadow-stone-200/50 overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: seg.color ?? '#78716c' }} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-stone-900 font-bold">{seg.name}</h3>
                {st.leads > 0 && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${winRate >= 20 ? 'bg-emerald-50 text-emerald-700' : winRate >= 10 ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
                    {winRate}% win rate
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {numBtn(st.openTickets, 'Open tickets', 'text-stone-900', () => onGo('tickets', { segFilter: seg.slug, ticketStatus: 'open' }))}
                {numBtn(st.leads, 'Total leads', 'text-stone-900', () => onGo('crm', { segFilter: seg.slug }))}
                {numBtn(st.won, 'Won deals', 'text-emerald-700', () => onGo('crm', { segFilter: seg.slug, stageFilter: 'won' }))}
                {numBtn(st.staff, 'Staff', 'text-stone-900', () => onGo('access'))}
              </div>
              {st.leads > 0 && (
                <div className="mt-4 pt-3 border-t border-stone-100">
                  <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${winRate}%`, backgroundColor: seg.color ?? '#78716c' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {showSecondary && (
        <>
          {/* Leaderboards — same avatar-card visual language, side by side.
              This is the "who's performing well" section, deliberately
              grouped as one unit instead of scattered among charts. */}
          <div>
            <h3 className="text-stone-900 text-xs font-extrabold tracking-wider mb-2 flex items-center gap-1.5"><Users2 className="w-3.5 h-3.5" /> TEAM PERFORMANCE</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <PunctualityLeaderboard segments={segments} />
              {(user?.role === 'super_admin' || hasPermission('manage_leads')) && (
                <SourcingFunnelWidget segments={segments} />
              )}
            </div>
          </div>

          {/* Trends — historical charts, demoted below the actionable/
              performance sections since they're context, not urgency. */}
          <div>
            <h3 className="text-stone-900 text-xs font-extrabold tracking-wider mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> TRENDS</h3>
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <Suspense fallback={<ChartPlaceholder />}><AttendanceTrendChart /></Suspense>
                <Suspense fallback={<ChartPlaceholder />}><TicketStatusChart /></Suspense>
              </div>
              <Suspense fallback={<ChartPlaceholder />}>
                <LeadsFunnelChart segments={segments} onSegmentClick={slug => onGo('crm', { segFilter: slug })} />
              </Suspense>
            </div>
          </div>

          {/* Housekeeping — least time-sensitive, bottom of the page. */}
          <div>
            <h3 className="text-stone-900 text-xs font-extrabold tracking-wider mb-2 flex items-center gap-1.5"><PartyPopper className="w-3.5 h-3.5" /> HOUSEKEEPING</h3>
            <div className="space-y-5">
              <SetupChecklist segments={segments} />
              <BirthdaysWidget />
            </div>
          </div>
        </>
      )}
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

type OnboardForm = typeof emptyOnboard;
type ManagerLite = Pick<Tables<'app_users'>, 'id' | 'full_name' | 'role'>;

function OnboardingWizard({ segments, onDone, onClose }: { segments: Segment[]; onDone: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardForm>(emptyOnboard);
  const [templates, setTemplates] = useState<Tables<'document_templates'>[]>([]);
  const [shifts, setShifts] = useState<Tables<'shifts'>[]>([]);
  const [managers, setManagers] = useState<ManagerLite[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  // ONB-1: localStorage draft. Real complaint from HR: they'd get halfway
  // through onboarding a new hire, get interrupted (phone call, meeting),
  // close the wizard, and lose everything. Now the form auto-saves on
  // every change and offers to restore on next open.
  //
  // Draft is cleared on successful submit and on explicit "Discard draft".
  // Password is NOT saved to storage (security — see comment on the effect
  // below).
  const DRAFT_KEY = 'nikki:onboarding_draft_v1';
  const [showRestore, setShowRestore] = useState(false);
  const toast = useToast();

  // Check for a stored draft on mount. Don't auto-restore — ask, because
  // an unexpected pre-filled form is worse than a blank one.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw && JSON.parse(raw)?.full_name) setShowRestore(true);
    } catch {
      // localStorage may be disabled in private-browsing modes; that's fine.
    }
  }, []);

  // Auto-save on every form change. Strip the password before writing —
  // even in localStorage it isn't worth the risk of it sitting there in
  // plaintext until someone remembers to clear it.
  useEffect(() => {
    if (busy) return;  // don't save while submitting
    if (form === emptyOnboard) return;
    try {
      const { password, ...safe } = form;
      void password;  // intentionally discarded
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...safe, _step: step }));
    } catch {
      // storage full / disabled — silently skip
    }
  }, [form, step, busy]);

  useEffect(() => {
    supabase.from('document_templates').select('*').eq('active', true).then(({ data }) => { if (data) setTemplates(data); });
    supabase.from('shifts').select('*').eq('is_active', true).order('created_at').then(({ data }) => { if (data) setShifts(data); });
    supabase.from('app_users').select('id, full_name, role').eq('is_active', true)
      .in('role', ['manager', 'hr', 'super_admin']).order('full_name')
      .then(({ data }) => { if (data) setManagers(data); });
  }, []);

  // "all" and individual segment slugs are mutually exclusive — picking one
  // clears the other. Before this fix, both could be selected together
  // (e.g. ['digital_media', 'all']), and since canAccessSegment() treats
  // 'all' anywhere in the array as full access, one accidental click on
  // "ALL SEGMENTS" silently overrode every individual restriction with no
  // visible warning. This is the root cause of "I picked one segment but
  // the employee can still see everything."
  const toggleSeg = (slug: string) => {
    const cur: string[] = form.segments;
    if (slug === 'all') {
      // Selecting ALL clears every individual segment and toggles 'all' alone.
      setForm({ ...form, segments: cur.includes('all') ? [] : ['all'] });
    } else {
      // Selecting an individual segment always drops 'all' first, then toggles.
      const withoutAll = cur.filter(s => s !== 'all');
      setForm({ ...form, segments: withoutAll.includes(slug) ? withoutAll.filter(s => s !== slug) : [...withoutAll, slug] });
    }
  };
  const toggleDoc = (t: string) => {
    const cur: string[] = form.doc_types;
    setForm({ ...form, doc_types: cur.includes(t) ? cur.filter((x: string) => x !== t) : [...cur, t] });
  };

  const primarySegment = segments.find(s => form.segments.includes(s.slug)) || null;
  const availableTemplates = templates.filter(t => !t.segment_slug || t.segment_slug === primarySegment?.slug);

  function previewDoc(t: Tables<'document_templates'>) {
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
      } as never).eq('id', userId);
      updateError = err;
      if (!err) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
    if (updateError) failures.push(`Salary & employment details: ${updateError.message}`);

    // Assign the selected work shift so late tracking works from day one.
    if (form.shift_id) {
      const { error: shiftError } = await supabase.from('staff_shifts').insert({ staff_user_id: userId, shift_id: form.shift_id } as never);
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
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage disabled or full */ }
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

        {showRestore && (
          <div className="space-y-3 mb-4 p-4 rounded-xl border border-amber-300 bg-amber-50">
            <p className="text-stone-900 font-bold text-sm">Unfinished onboarding found</p>
            <p className="text-stone-700 text-xs">
              You started onboarding someone and closed the wizard before finishing.
              Restore the draft, or discard it and start fresh?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage disabled or full */ }
                  setShowRestore(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg">
                Discard
              </button>
              <button
                onClick={() => {
                  try {
                    const raw = localStorage.getItem(DRAFT_KEY);
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      const stepFromDraft = typeof parsed._step === 'number' ? parsed._step : 0;
                      delete parsed._step;
                      setForm({ ...emptyOnboard, ...parsed });
                      setStep(stepFromDraft);
                    }
                  } catch {
                    // draft was corrupt — ignore
                  }
                  setShowRestore(false);
                }}
                className="px-3 py-1.5 bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold rounded-lg">
                Restore draft
              </button>
            </div>
          </div>
        )}

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
              <p className="text-stone-500 text-xs mb-2">Pick one or more specific segments, or "ALL SEGMENTS" for unrestricted access — picking one clears the other.</p>
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

        {step === 4 && (() => {
          // ONB-2: richer review card. Old version showed 6 lines and missed
          // the fields most likely to cause post-onboarding "wait, is this
          // right?" moments — the salary breakdown, all segments (not just
          // the first), the reporting manager, the shift assignment. Show
          // them all here so HR/admin catch typos BEFORE the account is
          // created and the person gets a welcome email with the wrong salary.
          const sal = form.salary_structure || {};
          const manager = managers.find(m => m.id === form.reports_to);
          const shift = shifts.find(sh => sh.id === form.shift_id);
          const segNames = (form.segments || []).map((sl: string) =>
            segments.find(sg => sg.slug === sl)?.name ?? sl
          ).join(', ') || 'none';
          const money = (n: number | string | undefined) =>
            n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
          return (
          <div className="space-y-3 text-sm">
            <div className={cardCls + ' space-y-3'}>
              <div>
                <p className="text-stone-900 font-bold text-base">{form.full_name || <span className="text-red-700">(name missing)</span>}</p>
                <p className="text-stone-700 text-xs mt-0.5">{form.designation || form.role}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2 border-t border-stone-100">
                <div>
                  <p className="text-stone-500 uppercase text-[10px] font-bold">Email</p>
                  <p className="text-stone-800">{form.email || '—'}</p>
                </div>
                <div>
                  <p className="text-stone-500 uppercase text-[10px] font-bold">Phone</p>
                  <p className="text-stone-800">{form.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-stone-500 uppercase text-[10px] font-bold">Role</p>
                  <p className="text-stone-800">{form.role}</p>
                </div>
                <div>
                  <p className="text-stone-500 uppercase text-[10px] font-bold">Employment</p>
                  <p className="text-stone-800">{form.employment_type.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-stone-500 uppercase text-[10px] font-bold">Segments</p>
                  <p className="text-stone-800">{segNames}</p>
                </div>
                <div>
                  <p className="text-stone-500 uppercase text-[10px] font-bold">Joining</p>
                  <p className="text-stone-800">{form.joining_date || '—'}</p>
                </div>
                {manager && (
                  <div>
                    <p className="text-stone-500 uppercase text-[10px] font-bold">Reports to</p>
                    <p className="text-stone-800">{manager.full_name} ({manager.role})</p>
                  </div>
                )}
                {shift && (
                  <div>
                    <p className="text-stone-500 uppercase text-[10px] font-bold">Shift</p>
                    <p className="text-stone-800">{shift.name}</p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-stone-100">
                <p className="text-stone-500 uppercase text-[10px] font-bold mb-1">Salary structure</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <p className="text-stone-700">Basic</p><p className="text-stone-900 text-right">{money(sal.basic)}</p>
                  <p className="text-stone-700">HRA</p><p className="text-stone-900 text-right">{money(sal.hra)}</p>
                  <p className="text-stone-700">Allowances</p><p className="text-stone-900 text-right">{money(sal.allowances)}</p>
                  <p className="text-stone-900 font-bold pt-1 border-t border-stone-100 mt-1">CTC (annual)</p>
                  <p className="text-stone-900 font-bold text-right pt-1 border-t border-stone-100 mt-1">{money(sal.ctc)}</p>
                </div>
              </div>

              {form.doc_types?.length > 0 && (
                <div className="pt-2 border-t border-stone-100">
                  <p className="text-stone-500 uppercase text-[10px] font-bold mb-1">Documents to generate</p>
                  <p className="text-stone-800 text-xs">{form.doc_types.map((d: string) => DOC_TYPE_LABELS[d]).join(', ')}</p>
                </div>
              )}
            </div>
            <p className="text-stone-600 text-xs italic">
              Review each field carefully — the welcome email and offer letter go out with these exact values.
            </p>
            {msg && <p className="text-red-700 text-xs">{msg}</p>}
          </div>
          );
        })()}

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
// The salary_structure column is `Json` in DB types but this app uses a
// consistent narrow shape. Widening once here saves scattered casts.
type SalaryStructure = {
  basic?: number; hra?: number; allowances?: number; deductions?: number;
  performance_bonus?: number; incentives?: number; ctc?: number;
};
type AccessUser = Pick<
  Tables<'app_users'>,
  'id' | 'email' | 'full_name' | 'role' | 'segments' | 'phone' | 'designation'
  | 'is_active' | 'must_change_password' | 'joining_date' | 'employment_type'
  | 'reporting_time' | 'created_at' | 'exit_date' | 'exit_reason'
> & {
  salary_structure: SalaryStructure | null;
  // permission_overrides is stored as jsonb — read as unknown shape and
  // narrowed to boolean-map at write-time. The wrapper still lets the UI
  // treat missing/null as "no overrides".
  permission_overrides: Record<string, boolean> | null;
};

// Color-coded roles overview (Aadya pattern) — each built-in role gets its
// own color and a one-line plain-English summary of what it can do, read
// straight from role_permissions.permissions, so an admin understands a
// role at a glance without opening a specific employee's editor.
const ROLE_THEME: Record<string, { label: string; bg: string; border: string; text: string; chip: string }> = {
  super_admin:          { label: 'Super Admin',         bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-800',   chip: 'bg-teal-600' },
  manager:               { label: 'Manager',             bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', chip: 'bg-indigo-600' },
  hr:                     { label: 'HR',                  bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', chip: 'bg-purple-600' },
  marketing_executive:   { label: 'Marketing Executive',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  chip: 'bg-amber-600' },
  telecaller:             { label: 'Telecaller',          bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-800',chip: 'bg-emerald-600' },
  support_agent:         { label: 'Support Agent',        bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-800',    chip: 'bg-sky-600' },
  employee:               { label: 'Employee',            bg: 'bg-stone-100', border: 'border-stone-300',  text: 'text-stone-700',  chip: 'bg-stone-600' },
};

// Groups raw permission-flag keys into the handful of capability areas an
// admin actually thinks in, so the card reads like "Leads + Staff +
// Approvals" instead of a dump of internal flag names.
const PERMISSION_CATEGORIES: { label: string; keys: string[] }[] = [
  { label: 'Leads',      keys: ['view_leads', 'manage_leads', 'create_leads', 'full_leads_view', 'bulk_assign_leads', 'approve_transfers'] },
  { label: 'Tickets',    keys: ['view_tickets', 'manage_tickets', 'assign_tickets'] },
  { label: 'Staff',      keys: ['view_staff', 'manage_staff'] },
  { label: 'Attendance', keys: ['view_attendance'] },
  { label: 'Approvals',  keys: ['approve_leaves', 'approve_advances'] },
  { label: 'Payroll',    keys: ['view_payroll', 'manage_payroll'] },
  { label: 'Reports',    keys: ['view_reports'] },
];

function summarizePermissions(permissions: Record<string, boolean> | null): string {
  if (!permissions) return 'No permissions granted';
  if (permissions.all) return 'Full system access — every permission';
  const active = PERMISSION_CATEGORIES.filter(c => c.keys.some(k => permissions[k]));
  if (active.length === 0) return 'Self-service only — attendance, leave, payslips';
  const shown = active.slice(0, 4).map(c => c.label);
  const rest = active.length - shown.length;
  return shown.join(' + ') + (rest > 0 ? ` (+${rest} more)` : '');
}

function RolesOverview({ staffCountByRole }: { staffCountByRole: Record<string, number> }) {
  const [roles, setRoles] = useState<{ role_name: string; description: string; permissions: Record<string, boolean> }[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    cachedQuery('role_permissions_overview', async () => {
      const { data, error } = await supabase.from('role_permissions').select('role_name, description, permissions').order('role_name');
      if (error) throw error;
      return data;
    }).then(data => { if (data) setRoles(data as never); }).catch(() => {});
  }, []);

  if (roles.length === 0) return null;

  return (
    <div className="mb-5">
      <button className="flex items-center gap-2 text-stone-700 text-xs uppercase tracking-wider mb-2" onClick={() => setExpanded(!expanded)}>
        <Shield className="w-3.5 h-3.5" /> Roles & Permissions {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {roles.map(r => {
            const theme = ROLE_THEME[r.role_name] || ROLE_THEME.employee;
            return (
              <div key={r.role_name} className={`rounded-2xl border ${theme.border} ${theme.bg} p-3`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`${theme.chip} text-white text-[11px] font-bold px-2 py-0.5 rounded-full`}>{theme.label}</span>
                  <span className="text-stone-700 text-[11px] font-medium">{staffCountByRole[r.role_name] || 0} staff</span>
                </div>
                <p className={`${theme.text} text-xs font-semibold`}>{summarizePermissions(r.permissions)}</p>
                {r.description && <p className="text-stone-700 text-[11px] mt-1">{r.description}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccessControl({ segments, openSignal, focusStaffId }: { segments: Segment[]; openSignal?: number; focusStaffId?: string }) {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [editing, setEditing] = useState<AccessUser | null>(null);
  const [snapshot, setSnapshot] = useState<{ designation: string; ctc: number } | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showOffboard, setShowOffboard] = useState(false);
  const [viewDocsFor, setViewDocsFor] = useState<AccessUser | null>(null);
  const [showChangePwModal, setShowChangePwModal] = useState(false);

  useEffect(() => { if (openSignal) setShowOnboard(true); }, [openSignal]);

  async function doResetPassword() {
    if (!editing) return;
    if (resetPasswordValue.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setResettingPassword(true);

    if (editing.id === currentUser?.id) {
      const { error } = await supabase.auth.updateUser({ password: resetPasswordValue });
      setResettingPassword(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Your password has been updated!');
      setResetPasswordValue('');
      return;
    }

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'reset_password', user_id: editing.id, new_password: resetPasswordValue },
    });
    setResettingPassword(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Failed to reset password'); return; }
    toast.success('Password updated');
    setResetPasswordValue('');
  }

  async function load() {
    // Include exit_date/exit_reason so the "already offboarded" UI branch
    // actually detects offboarded staff. Previously those columns weren't
    // in the select list, editing.exit_date was always undefined, and the
    // ternary at the bottom of the edit modal always rendered "Offboard
    // this employee" even for staff who had already been offboarded.
    const COLS = 'id, email, full_name, role, segments, phone, designation, is_active, must_change_password, permission_overrides, salary_structure, joining_date, employment_type, reporting_time, created_at, exit_date, exit_reason';
    try {
      const data = await cachedQuery('access_control_users', async () => {
        const { data, error } = await supabase.from('app_users').select(COLS).order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      });
      if (data) setUsers(data as AccessUser[]);
    } catch {
      const { data } = await supabase.from('app_users').select(COLS).order('created_at', { ascending: false });
      if (data) setUsers(data as AccessUser[]);
    }
  }

  const owners = users.filter(u => u.role === 'super_admin');
  const staffOnly = users.filter(u => u.role !== 'super_admin');
  const staffCountByRole = users.reduce<Record<string, number>>((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});
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
    } as never).eq('id', editing.id);
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
      } as never);
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

  // Same mutual-exclusivity fix as the onboarding toggleSeg above — see
  // that comment for the full rationale. This version edits any object
  // with a `segments` field (used for both the editing-staff form and
  // manager/HR forms elsewhere on this page).
  const toggleSeg = <T extends { segments: string[] | null }>(obj: T, setObj: (o: T) => void, slug: string) => {
    const cur: string[] = obj.segments || [];
    if (slug === 'all') {
      setObj({ ...obj, segments: cur.includes('all') ? [] : ['all'] });
    } else {
      const withoutAll = cur.filter(s => s !== 'all');
      setObj({ ...obj, segments: withoutAll.includes(slug) ? withoutAll.filter(s => s !== slug) : [...withoutAll, slug] });
    }
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
      <RolesOverview staffCountByRole={staffCountByRole} />
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
              <div className="flex items-center gap-3">
                <button onClick={() => setShowChangePwModal(true)} className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors">
                  <Key className="w-3.5 h-3.5 text-orange-700" /> Change My Password
                </button>
              </div>
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
              <p className="text-stone-500 text-xs mb-2">Pick one or more specific segments, or "ALL SEGMENTS" for unrestricted access — picking one clears the other.</p>
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
                  Offboarded on {new Date(editing.exit_date ?? '').toLocaleDateString()} — {String(editing.exit_reason || '').replace('_', ' ')}
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
      {showChangePwModal && <ChangePasswordModal onClose={() => setShowChangePwModal(false)} />}
    </div>
  );
}

// ─────────────────────────────────────── Tickets composite (queue + SLA overdue)
function TicketsSection({ segments, focusId, initialSegFilter, initialStatus, filterNonce }: { segments: Segment[]; focusId?: string; initialSegFilter?: string; initialStatus?: string; filterNonce?: number }) {
  const [sub, setSub] = useState<'queue' | 'overdue'>('queue');
  useEffect(() => { if (filterNonce) setSub('queue'); }, [filterNonce]);
  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setSub('queue')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'queue' ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>All Tickets</button>
        <button onClick={() => setSub('overdue')} className={`px-3 py-1.5 rounded-lg text-sm border ${sub === 'overdue' ? 'border-red-500 text-red-700' : 'border-stone-200 text-stone-700'}`}>Overdue (SLA)</button>
      </div>
      {sub === 'queue' && <TicketsBoard segments={segments} focusId={focusId} initialSegFilter={initialSegFilter} initialStatus={initialStatus} filterNonce={filterNonce} />}
      {sub === 'overdue' && <OverdueTickets segments={segments} />}
    </div>
  );
}

// ─────────────────────────────────────── HR composite (attendance/leaves + shifts + payslips + summary)
// ─────────────────────────── Leave entitlement policy (HR)
function LeavePolicyManager() {
  const toast = useToast();
  const [rows, setRows] = useState<Tables<'leave_policies'>[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('leave_policies').select('*').is('role_name', null).order('leave_type');
    if (data) setRows(data);
  }
  useEffect(() => { load(); }, []);

  async function save(id: string, annual_days: number) {
    setBusy(true);
    const { error } = await supabase.from('leave_policies').update({ annual_days } as never).eq('id', id);
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
    (data || []).forEach(s => { u[s.slug] = { staff: 0, leads: 0, tickets: 0 }; });
    (staff || []).forEach(s => (s.segments || []).forEach((slug: string) => { if (u[slug]) u[slug].staff++; }));
    (leads || []).forEach(l => { if (l.segment_slug && u[l.segment_slug]) u[l.segment_slug].leads++; });
    (tickets || []).forEach(t => { if (t.segment_slug && u[t.segment_slug]) u[t.segment_slug].tickets++; });
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
    const { error } = await supabase.from('segments').update({ active: !seg.active } as never).eq('id', seg.id);
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
      ({ error } = await supabase.from('segments').insert(editing as never));
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
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color ?? undefined }} />
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
  const [editing, setEditing] = useState<(Partial<Product> & { features?: ProductFeature[] }) | null>(null);
  const toast = useToast();

  async function load() {
    const { data } = await supabase.from('products').select('*').order('order_index');
    if (data) setRows(data as Product[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    const name = (editing.name || '').trim();
    const slug = (editing.slug || '').trim();
    if (!name || !slug) { toast.error('Name and slug are required'); return; }
    const payload = { ...editing, name, slug, tagline: (editing.tagline || '').trim(), features: editing.features || [] };
    let error;
    if (editing.id) {
      const { id, ...patch } = payload;
      ({ error } = await supabase.from('products').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id!));
    } else {
      ({ error } = await supabase.from('products').insert(payload as never));
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
              <button className="text-teal-700 text-sm" onClick={() => setEditing({ ...p, features: (p.features as ProductFeature[] | null) || [] })}>Edit</button>
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
              <input className={inputCls} placeholder="Name *" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <input className={inputCls} placeholder="Slug *" value={editing.slug || ''} onChange={e => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
            </div>
            <input className={inputCls} placeholder="Tagline" value={editing.tagline || ''} onChange={e => setEditing({ ...editing, tagline: e.target.value })} />
            <textarea className={inputCls} rows={3} placeholder="Description" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="External URL (link-out)" value={editing.external_url || ''} onChange={e => setEditing({ ...editing, external_url: e.target.value })} />
              <input className={inputCls} placeholder="Button label" value={editing.demo_cta || ''} onChange={e => setEditing({ ...editing, demo_cta: e.target.value })} />
              <select className={inputCls} value={editing.segment_slug || ''} onChange={e => setEditing({ ...editing, segment_slug: e.target.value })}>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={editing.status || 'active'} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                <option value="active">Active</option><option value="coming_soon">Coming Soon</option><option value="hidden">Hidden</option>
              </select>
            </div>
            <ImageUpload placeholder="Upload Product Logo" value={editing.logo_url || ''} onChange={url => setEditing({ ...editing, logo_url: url })} />
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-stone-700 text-sm font-medium">Feature Cards</p>
                <button className="text-teal-700 text-xs" onClick={() => setEditing({ ...editing, features: [...(editing.features || []), { title: '', description: '', icon: 'CheckCircle2' }] })}>+ Add feature</button>
              </div>
              {(editing.features || []).map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 mb-2">
                  <input className={inputCls} placeholder="Title" value={f.title} onChange={e => {
                    const fs = [...(editing.features || [])]; fs[i] = { ...f, title: e.target.value }; setEditing({ ...editing, features: fs });
                  }} />
                  <input className={inputCls} placeholder="Description" value={f.description} onChange={e => {
                    const fs = [...(editing.features || [])]; fs[i] = { ...f, description: e.target.value }; setEditing({ ...editing, features: fs });
                  }} />
                  <button className="text-red-700 text-xs px-2" onClick={() => setEditing({ ...editing, features: (editing.features || []).filter((_, j) => j !== i) as ProductFeature[] })}>✕</button>
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
  const [services, setServices] = useState<Tables<'services'>[]>([]);
  const [types, setTypes] = useState<Tables<'ticket_types'>[]>([]);
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
    const { error } = await supabase.from('services').insert({ ...newService, segment_slug: seg, order_index: services.filter(x => x.segment_slug === seg).length + 1 } as never);
    if (error) { toast.error(`Couldn't add: ${error.message}`); return; }
    toast.success('Service added');
    setNewService({ title: '', description: '', icon: 'Settings' });
    load();
  }
  async function addType() {
    if (!newType || !seg) { toast.error('Enter a ticket type name'); return; }
    const { error } = await supabase.from('ticket_types').insert({ segment_slug: seg, name: newType, order_index: types.filter(x => x.segment_slug === seg).length + 1 } as never);
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
  const [gallery, setGallery] = useState<Tables<'gallery_items'>[]>([]);
  const [team, setTeam] = useState<Tables<'team_members'>[]>([]);
  const [testimonials, setTestimonials] = useState<Tables<'testimonials'>[]>([]);
  const [logos, setLogos] = useState<Tables<'client_logos'>[]>([]);
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
    const { error } = await supabase.from('client_logos').insert({ ...newLogo, segment_slug: newLogo.segment_slug || null, order_index: logos.length + 1 } as never);
    if (error) { toast.error(error.message); return; }
    toast.success('Client logo added');
    setNewLogo({ name: '', logo_url: '', segment_slug: '' });
    load();
  }

  async function addGallery() {
    if (!newGallery.image_url) { toast.error('Image URL is required'); return; }
    const { error } = await supabase.from('gallery_items').insert({ ...newGallery, segment_slug: newGallery.segment_slug || null, order_index: gallery.length + 1 } as never);
    if (error) { toast.error(error.message); return; }
    toast.success('Added to gallery');
    setNewGallery({ title: '', image_url: '', segment_slug: '' });
    load();
  }
  async function addTeam() {
    if (!newTeam.name) { toast.error('Name is required'); return; }
    const { error } = await supabase.from('team_members').insert({ ...newTeam, segment_slug: newTeam.segment_slug || null, order_index: team.length + 1 } as never);
    if (error) { toast.error(error.message); return; }
    toast.success('Team member added');
    setNewTeam({ name: '', designation: '', photo_url: '', segment_slug: '' });
    load();
  }
  async function addTestimonial() {
    if (!newTestimonial.customer_name || !newTestimonial.content) { toast.error('Name and testimonial text are required'); return; }
    const { error } = await supabase.from('testimonials').insert({ ...newTestimonial, segment_slug: newTestimonial.segment_slug || null, order_index: testimonials.length + 1 } as never);
    if (error) { toast.error(error.message); return; }
    toast.success('Testimonial added');
    setNewTestimonial({ customer_name: '', content: '', rating: 5, segment_slug: '' });
    load();
  }
  async function toggleActive(table: string, id: string, active: boolean | null, setter: () => void) {
    const { error } = await supabase.from(table as never).update({ active: !active } as never).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setter();
  }
  async function remove(table: string, id: string, setter: () => void) {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from(table as never).delete().eq('id', id);
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
                <img src={g.image_url || ''} alt={g.title || ''} className="w-full h-28 object-cover" />
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
                  <p className="text-stone-900 text-sm font-medium">{t.customer_name} <span className="text-amber-700 text-xs">{'★'.repeat(t.rating ?? 0)}</span></p>
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
    supabase.from('site_content').select('*').order('section').then(({ data }) => { if (data) setRows(data); });
  }, []);

  async function save(row: { id: string; value: string }) {
    const { error } = await supabase.from('site_content').update({ value: row.value, updated_at: new Date().toISOString() } as never).eq('id', row.id);
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
  const [templates, setTemplates] = useState<Tables<'document_templates'>[]>([]);
  const [staff, setStaff] = useState<Tables<'app_users'>[]>([]);
  const [editingTpl, setEditingTpl] = useState<Partial<Tables<'document_templates'>> | null>(null);
  const [issueFor, setIssueFor] = useState<Tables<'app_users'> | null>(null);
  const [viewDocsFor, setViewDocsFor] = useState<Tables<'app_users'> | null>(null);
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
      ({ error } = await supabase.from('document_templates').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id));
    } else {
      ({ error } = await supabase.from('document_templates').insert(editingTpl as never));
    }
    if (error) { toast.error(`Couldn't save template: ${error.message}`); return; }
    toast.success(editingTpl.id ? 'Template updated' : 'Template created');
    setEditingTpl(null); load();
  }

  function openIssue(staffMember: Tables<'app_users'>) {
    setIssueFor(staffMember);
    setIssueDocs([]);
  }

  const relevantTemplates = (staffMember: Tables<'app_users'> | null) => templates.filter(t => t.active && (!t.segment_slug || (staffMember?.segments || []).includes(t.segment_slug) || (staffMember?.segments || []).includes('all')));

  async function issue() {
    if (!issueFor || issueDocs.length === 0) { toast.error('Select at least one document'); return; }
    setBusy(true);
    const seg = segments.find(s => (issueFor.segments || []).includes(s.slug));
    const vars = buildOnboardingVars({
      full_name: issueFor.full_name, designation: issueFor.designation, role: issueFor.role,
      segmentName: seg?.name || 'Nikki Technologies', joining_date: issueFor.joining_date,
      salary_structure: (issueFor.salary_structure as { ctc?: number } | null) || {}, employment_type: issueFor.employment_type,
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

type Tab = 'overview' | 'tasks' | 'tickets' | 'crm' | 'hr' | 'access' | 'segments' | 'products' | 'catalog' | 'documents' | 'approvals' | 'announcements' | 'careers' | 'media' | 'content' | 'security' | 'calendar' | 'meeting_types'
  | 'my_attendance' | 'my_documents' | 'my_requests' | 'my_profile' | 'my_swap' | 'my_sessions';

export default function SuperAdminDashboard() {
  const { user, signOut, hasPermission } = useAuth();
  const { segments } = useSegments(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [onboardSignal, setOnboardSignal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [focus, setFocus] = useState<{ kind: 'staff' | 'lead' | 'ticket'; id: string } | null>(null);
  const [showHeaderPwModal, setShowHeaderPwModal] = useState(false);
  // Drill-down from Overview's clickable numbers (Aadya pattern) — carries
  // a nonce so navigating to the same filter twice in a row still re-fires
  // the effect that applies it inside LeadsBoard/TicketsBoard.
  const [leadsFilter, setLeadsFilter] = useState<{ segFilter?: string; stageFilter?: string; nonce: number } | null>(null);
  const [ticketsFilter, setTicketsFilter] = useState<{ segFilter?: string; status?: string; nonce: number } | null>(null);
  // Same due-alert system (sound + banner + Call/WhatsApp/Snooze) the other
  // three portals already have via PortalShell — this dashboard has its own
  // header instead of PortalShell, so it needs its own mount.
  const { activeAlerts, dismiss: dismissAlert, snooze: snoozeAlert, soundEnabled, setSoundEnabled, requestNotificationPermission, notifPermission } = useDueLeadAlerts();

  function navigateWithFocus(t: string, f?: { kind: 'staff' | 'lead' | 'ticket'; id: string }) {
    setTab(t as Tab);
    setFocus(f || null);
  }

  // Overview's segment-card numbers and funnel-chart bars call this with an
  // optional filter — routes to the right tab AND pre-applies the filter,
  // so "12 Open tickets" actually lands you on those 12 tickets instead of
  // just the Tickets tab in general.
  function navigateWithFilter(t: string, filter?: { segFilter?: string; stageFilter?: string; ticketStatus?: string }) {
    setTab(t as Tab);
    if (t === 'crm' && filter) {
      setLeadsFilter({ segFilter: filter.segFilter, stageFilter: filter.stageFilter, nonce: Date.now() });
    } else if (t === 'tickets' && filter) {
      setTicketsFilter({ segFilter: filter.segFilter, status: filter.ticketStatus, nonce: Date.now() });
    }
  }

  const isSuperAdmin = user?.role === 'super_admin';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Admin tabs: each requires the same permission enforced at the database (RLS) level —
  // shown here only when the person can actually use it, not just when they're super_admin.
  // Grouped so the sidebar (and mobile drawer) reads as sections, not one flat list of 20+ items.
  type TabDef = { id: Tab; label: string; icon: LucideIcon; show: boolean };
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
        { id: 'my_sessions', label: 'My Sessions', icon: Shield, show: isSuperAdmin },
      ],
    },
    {
      label: 'Executive Overview',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, show: true },
        { id: 'calendar', label: 'Team Calendar', icon: CalendarDays, show: isSuperAdmin || hasPermission('view_leads') || hasPermission('manage_leads') },
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
        { id: 'meeting_types', label: 'Meeting Types', icon: CalendarDays, show: isSuperAdmin || hasPermission('manage_content') },
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

  function prefetchTab(targetTab: Tab) {
    if (targetTab === 'access') {
      cachedQuery('access_control_users', async () => {
        const { data } = await supabase.from('app_users').select('id, email, full_name, role, segments, phone, designation, is_active, must_change_password, permission_overrides, salary_structure, joining_date, employment_type, reporting_time, created_at').order('created_at', { ascending: false });
        return data || [];
      }).catch(() => {});
    } else if (targetTab === 'crm') {
      cachedQuery('leads::', async () => {
        const { data } = await supabase.from('marketing_leads').select('*').order('created_at', { ascending: false }).limit(400);
        return data || [];
      }).catch(() => {});
    } else if (targetTab === 'hr') {
      cachedQuery('hr_staff_users', async () => {
        const { data } = await supabase.from('app_users').select('id, full_name, role, segments, phone, is_active, email').eq('is_active', true).neq('role', 'super_admin').order('full_name');
        return data || [];
      }).catch(() => {});
    } else if (targetTab === 'tickets') {
      cachedQuery('tickets::', async () => {
        const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300);
        return data || [];
      }).catch(() => {});
    }
  }

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
              <button key={t.id} onClick={() => goTo(t.id)} onMouseEnter={() => prefetchTab(t.id)}
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
      <DueAlertBanner alerts={activeAlerts} onDismiss={dismissAlert} onSnooze={snoozeAlert} />
      <aside className="w-60 shrink-0 border-r border-stone-200 bg-white p-4 hidden md:flex flex-col shadow-sm sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <KiteTailLogo className="w-8 h-8 shrink-0" />
          <div>
            <p className="text-stone-900 font-extrabold text-sm leading-tight">Nikki Technologies</p>
            <p className="text-stone-700 text-[11px] font-semibold">{isSuperAdmin ? 'Super Admin' : 'Admin Console'}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto min-h-0">{navGroups}</nav>
        <button onClick={signOut} className="flex items-center gap-2 px-3 py-2 text-stone-700 hover:text-red-700 text-sm font-semibold border-t border-stone-200 pt-3 shrink-0">
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
            <button
              onClick={() => { setSoundEnabled(!soundEnabled); if (notifPermission === 'default') requestNotificationPermission(); }}
              title={soundEnabled ? 'Sound alerts on for due follow-ups/appointments — tap to mute' : 'Sound alerts muted — tap to enable'}
              className={`p-1.5 rounded-lg transition-colors ${soundEnabled ? 'text-teal-700 hover:bg-teal-50' : 'text-stone-400 hover:bg-stone-100'}`}>
              {soundEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
            <NotificationBell onNavigate={(t) => setTab(t as Tab)} />
            <button onClick={() => setShowHeaderPwModal(true)} title="Click to Change Password" className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-orange-50 border border-stone-200 hover:border-orange-200 text-stone-800 hover:text-orange-900 rounded-xl text-xs font-bold transition-all">
              <Key className="w-3.5 h-3.5 text-orange-700" />
              <span className="hidden sm:inline">{user?.full_name}</span>
            </button>
            <button onClick={signOut} className="md:hidden text-stone-700"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        {tab === 'my_attendance' && <MyAttendance />}
        {tab === 'my_documents' && <MyDocuments />}
        {tab === 'my_requests' && <MyRequests />}
        {tab === 'my_profile' && <MyProfile />}
        {tab === 'my_swap' && <ShiftSwapBoard />}
        {tab === 'overview' && <Overview segments={segments} onGo={navigateWithFilter} onAddStaff={() => { setOnboardSignal(s => s + 1); setTab('access'); }} />}
        {tab === 'tasks' && <TasksBoard segments={segments} />}
        {tab === 'tickets' && <TicketsSection segments={segments} focusId={focus?.kind === 'ticket' ? focus.id : undefined} initialSegFilter={ticketsFilter?.segFilter} initialStatus={ticketsFilter?.status} filterNonce={ticketsFilter?.nonce} />}
        {tab === 'crm' && <LeadsWorkspace segments={segments} focusLeadId={focus?.kind === 'lead' ? focus.id : undefined} initialSegFilter={leadsFilter?.segFilter} initialStageFilter={leadsFilter?.stageFilter} filterNonce={leadsFilter?.nonce} />}
        {tab === 'hr' && <HRSection segments={segments} />}
        {tab === 'access' && <AccessControl segments={segments} openSignal={onboardSignal} focusStaffId={focus?.kind === 'staff' ? focus.id : undefined} />}
        {tab === 'segments' && <SegmentsManager onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'products' && <ProductsManager segments={segments} />}
        {tab === 'catalog' && <CatalogManager segments={segments} />}
        {tab === 'calendar' && <TeamCalendar />}
        {tab === 'meeting_types' && <MeetingTypesManager />}
        {tab === 'documents' && <DocumentsManager segments={segments} />}
        {tab === 'approvals' && <ApprovalsSection />}
        {tab === 'announcements' && <AnnouncementsManager segments={segments} />}
        {tab === 'careers' && <CareersManager segments={segments} />}
        {tab === 'media' && <SiteMediaManager segments={segments} />}
        {tab === 'content' && <ContentManager />}
        {tab === 'security' && <SecurityLogsViewer />}
        {tab === 'my_sessions' && <SessionDevices />}
      </main>
      {showHeaderPwModal && <ChangePasswordModal onClose={() => setShowHeaderPwModal(false)} />}
    </div>
  );
}
