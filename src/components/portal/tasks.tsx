import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock3, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { cachedQuery } from '../../lib/cachedQuery';
import { inputCls, btnCls, cardCls, SegmentTabs } from './shared';
import type { Segment } from '../../lib/database.types';

const PRIORITY_TONE: Record<string, string> = {
  high: 'text-red-700 border-red-500/40 bg-red-50',
  medium: 'text-amber-700 border-amber-500/40 bg-amber-50',
  low: 'text-stone-700 border-stone-300 bg-stone-100/60',
};

const STATUS_META: Record<string, { label: string; icon: any; tone: string }> = {
  pending: { label: 'Pending', icon: Circle, tone: 'text-stone-700' },
  in_progress: { label: 'In progress', icon: Clock3, tone: 'text-teal-700' },
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'text-emerald-700' },
  cancelled: { label: 'Cancelled', icon: XCircle, tone: 'text-stone-700' },
};

function dueTone(due: string | null, status: string) {
  if (!due || status === 'completed' || status === 'cancelled') return 'text-stone-700';
  const d = new Date(due + 'T23:59:59');
  if (d < new Date()) return 'text-red-700 font-medium';
  if (d.getTime() - Date.now() < 2 * 86400000) return 'text-amber-700';
  return 'text-stone-700';
}

/**
 * One board, two audiences. `mine` renders the assignee's view (progress your
 * own work); the manager view adds creation, reassignment and a scope filter.
 * Which one you get is decided by permission, not by a separate screen, so the
 * two can't drift apart.
 */
export function TasksBoard({ segments, mineOnly = false }: { segments?: Segment[]; mineOnly?: boolean }) {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const canAssign = user?.role === 'super_admin' || hasPermission('view_staff') || hasPermission('manage_staff');
  const showManagerView = canAssign && !mineOnly;

  const [tasks, setTasks] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [segFilter, setSegFilter] = useState('');
  const [scope, setScope] = useState<'open' | 'mine' | 'done'>(mineOnly ? 'mine' : 'open');
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', due_date: '',
    priority: 'medium', segment_slug: '', category: '',
  });

  async function load() {
    const cacheKey = `office_tasks:${scope}:${segFilter}:${user?.id}`;
    try {
      const data = await cachedQuery(cacheKey, async () => {
        let q = supabase.from('office_tasks').select('*')
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }).limit(200);
        if (scope === 'done') q = q.in('status', ['completed', 'cancelled']);
        else q = q.in('status', ['pending', 'in_progress']);
        if (scope === 'mine' && user) q = q.eq('assigned_to', user.id);
        if (segFilter) q = q.eq('segment_slug', segFilter);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      });
      setTasks(data);
    } catch (err: any) {
      toast.error(`Couldn't load tasks: ${err.message}`);
    }
  }

  useEffect(() => { load(); }, [scope, segFilter, user]);

  useEffect(() => {
    if (!canAssign) return;
    cachedQuery('active_staff_users_full', async () => {
      const { data, error } = await supabase.from('app_users').select('id, full_name, role, segments')
        .eq('is_active', true).order('full_name');
      if (error) throw error;
      return data || [];
    }).then(data => { if (data) setStaff(data); }).catch(() => {});
    supabase.rpc('remind_overdue_tasks');
  }, [canAssign]);

  async function createTask() {
    if (!form.title.trim()) { toast.error('Give the task a title'); return; }
    if (!user) return;
    setBusy('new');
    const { error } = await supabase.from('office_tasks').insert({
      ...form,
      assigned_to: form.assigned_to || null,
      segment_slug: form.segment_slug || null,
      due_date: form.due_date || null,
      created_by: user.id,
    });
    setBusy('');
    if (error) { toast.error(`Couldn't create task: ${error.message}`); return; }
    toast.success(form.assigned_to ? 'Task assigned — they have been notified' : 'Task created');
    setShowNew(false);
    setForm({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium', segment_slug: '', category: '' });
    load();
  }

  async function setStatus(t: any, status: string, note?: string) {
    setBusy(t.id);
    const patch: any = { status };
    if (note !== undefined) patch.completion_note = note;
    const { error } = await supabase.from('office_tasks').update(patch).eq('id', t.id);
    setBusy('');
    if (error) { toast.error(error.message); return; }
    toast.success(status === 'completed' ? 'Marked complete' : `Moved to ${STATUS_META[status]?.label || status}`);
    load();
  }

  async function reassign(t: any, to: string) {
    setBusy(t.id);
    const { error } = await supabase.from('office_tasks').update({ assigned_to: to || null }).eq('id', t.id);
    setBusy('');
    if (error) { toast.error(error.message); return; }
    toast.success('Task reassigned');
    load();
  }

  const nameOf = (id: string) => staff.find(s => s.id === id)?.full_name;

  return (
    <div>
      {showManagerView && segments && segments.length > 0 && (
        <SegmentTabs segments={segments} value={segFilter} onChange={setSegFilter} />
      )}

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2">
          {([['open', 'Open'], ['mine', 'Assigned to me'], ['done', 'Completed']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setScope(v)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${scope === v ? 'border-teal-500 text-teal-700' : 'border-stone-200 text-stone-700'}`}>
              {label}
            </button>
          ))}
        </div>
        {canAssign && (
          <button className={btnCls} onClick={() => setShowNew(true)}>+ New Task</button>
        )}
      </div>

      {tasks.length === 0 && (
        <p className="text-stone-700 text-sm text-center py-10">
          {scope === 'done' ? 'Nothing completed yet.' : scope === 'mine' ? 'No tasks assigned to you.' : 'No open tasks.'}
        </p>
      )}

      <div className="space-y-2">
        {tasks.map(t => {
          const meta = STATUS_META[t.status] || STATUS_META.pending;
          const Icon = meta.icon;
          const isMine = t.assigned_to === user?.id;
          const canEditAll = canAssign || t.created_by === user?.id;
          return (
            <div key={t.id} className={cardCls}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`w-4 h-4 shrink-0 ${meta.tone}`} />
                    <p className="text-stone-900 text-sm font-medium">{t.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${PRIORITY_TONE[t.priority]}`}>
                      {t.priority}
                    </span>
                  </div>
                  {t.description && <p className="text-stone-700 text-xs mt-1">{t.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                    {t.due_date && (
                      <span className={dueTone(t.due_date, t.status)}>
                        Due {new Date(t.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        {new Date(t.due_date + 'T23:59:59') < new Date() && t.status !== 'completed' && t.status !== 'cancelled' ? ' — overdue' : ''}
                      </span>
                    )}
                    <span className="text-stone-700">
                      {t.assigned_to ? (isMine ? 'You' : nameOf(t.assigned_to) || 'Assigned') : 'Unassigned'}
                    </span>
                    {t.category && <span className="text-stone-700">{t.category}</span>}
                    {t.completion_note && <span className="text-emerald-700/80">“{t.completion_note}”</span>}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {(isMine || canEditAll) && t.status !== 'completed' && t.status !== 'cancelled' && (
                    <div className="flex gap-2">
                      {t.status === 'pending' && (
                        <button className="px-2.5 py-1 rounded-lg border border-stone-300 text-stone-700 text-xs"
                          disabled={busy === t.id} onClick={() => setStatus(t, 'in_progress')}>Start</button>
                      )}
                      <button className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                        disabled={busy === t.id}
                        onClick={() => {
                          const note = window.prompt('Anything to note about how it went? (optional)');
                          if (note === null) return;
                          setStatus(t, 'completed', note);
                        }}>Done</button>
                    </div>
                  )}
                  {canEditAll && t.status !== 'completed' && (
                    <select className={inputCls + ' w-auto text-xs py-1'} value={t.assigned_to || ''}
                      disabled={busy === t.id} onChange={e => reassign(t, e.target.value)}>
                      <option value="">Unassigned</option>
                      {staff
                        .filter(s => !t.segment_slug || (s.segments || []).includes(t.segment_slug) || (s.segments || []).includes('all'))
                        .map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  )}
                  {canEditAll && t.status !== 'completed' && t.status !== 'cancelled' && (
                    <button className="text-stone-700 hover:text-red-700 text-xs"
                      onClick={() => setStatus(t, 'cancelled')}>Cancel task</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-stone-900 font-semibold">New Task</h3>
            <input className={inputCls} placeholder="What needs doing? *"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <textarea className={inputCls} rows={2} placeholder="Details (optional)"
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
              <input type="date" className={inputCls} value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <select className={inputCls} value={form.segment_slug}
              onChange={e => setForm({ ...form, segment_slug: e.target.value, assigned_to: '' })}>
              <option value="">No specific department</option>
              {(segments || []).map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Assign later</option>
              {staff
                .filter(s => !form.segment_slug || (s.segments || []).includes(form.segment_slug) || (s.segments || []).includes('all'))
                .map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.role.replace('_', ' ')}</option>)}
            </select>
            <input className={inputCls} placeholder="Category (optional) — e.g. Payment, Compliance"
              value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            <button className={btnCls + ' w-full'} disabled={busy === 'new'} onClick={createTask}>
              {busy === 'new' ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
