import { useEffect, useRef, useState } from 'react';
import { Bell, Megaphone, Repeat, Landmark, Printer, TrendingUp, Flame, Cake, Download, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { inputCls, btnCls, cardCls } from './shared';
import type { Segment } from '../../lib/database.types';

// ─────────────────────────── Notification Bell (header, both portals)
export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    if (data) setItems(data);
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [user]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }
  async function markAllRead() {
    const unread = items.filter(n => !n.read_at).map(n => n.id);
    if (!unread.length) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
    load();
  }

  const unreadCount = items.filter(n => !n.read_at).length;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative text-slate-400 hover:text-white">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-slate-950 border border-slate-700 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
            <p className="text-white text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && <button onClick={markAllRead} className="text-sky-400 text-xs">Mark all read</button>}
          </div>
          {items.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No notifications yet.</p>}
          {items.map(n => (
            <div key={n.id} onClick={() => markRead(n.id)}
              className={`px-4 py-3 border-b border-slate-900 cursor-pointer hover:bg-slate-900 ${!n.read_at ? 'bg-sky-500/5' : ''}`}>
              <p className="text-white text-sm">{n.title}</p>
              {n.body && <p className="text-slate-500 text-xs mt-0.5">{n.body}</p>}
              <p className="text-slate-600 text-[10px] mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Announcements banner + list (StaffPortal)
export function AnnouncementsFeed() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('announcements').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setItems(data.filter((a: any) => !a.expires_at || new Date(a.expires_at) > new Date())); });
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="space-y-2 mb-6">
      {items.map(a => (
        <div key={a.id} className={cardCls + (a.is_pinned ? ' border-sky-600/50' : '')}>
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-sky-400 shrink-0" />
            <p className="text-white text-sm font-medium">{a.title}</p>
            {a.is_pinned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">Pinned</span>}
          </div>
          <p className="text-slate-400 text-sm mt-1.5">{a.body}</p>
          <p className="text-slate-600 text-xs mt-1.5">{new Date(a.created_at).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Super Admin: post announcements
export function AnnouncementsManager({ segments }: { segments: Segment[] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ segment_slug: '', title: '', body: '', is_pinned: false });

  async function load() {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (data) setItems(data);
  }
  useEffect(() => { load(); }, []);

  async function post() {
    if (!form.title || !form.body || !user) { toast.error('Title and message are required'); return; }
    const { error } = await supabase.from('announcements').insert({ ...form, segment_slug: form.segment_slug || null, created_by: user.id });
    if (error) { toast.error(`Couldn't post: ${error.message}`); return; }
    toast.success('Announcement posted and staff notified');
    setForm({ segment_slug: '', title: '', body: '', is_pinned: false });
    load();
  }
  async function remove(id: string) {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) { toast.error(`Couldn't delete: ${error.message}`); return; }
    toast.success('Announcement deleted');
    load();
  }

  return (
    <div>
      <div className={cardCls + ' mb-6 space-y-3'}>
        <h3 className="text-white font-semibold text-sm">Post Announcement</h3>
        <select className={inputCls} value={form.segment_slug} onChange={e => setForm({ ...form, segment_slug: e.target.value })}>
          <option value="">All Staff</option>
          {segments.map(s => <option key={s.slug} value={s.slug}>{s.name} only</option>)}
        </select>
        <input className={inputCls} placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <textarea className={inputCls} rows={3} placeholder="Message" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
          <input type="checkbox" checked={form.is_pinned} onChange={e => setForm({ ...form, is_pinned: e.target.checked })} /> Pin to top
        </label>
        <button className={btnCls} onClick={post}>Post & Notify Staff</button>
      </div>
      <div className="space-y-2">
        {items.map(a => (
          <div key={a.id} className={cardCls + ' flex items-start justify-between'}>
            <div>
              <p className="text-white text-sm font-medium">{a.title} {a.is_pinned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 ml-1">Pinned</span>}</p>
              <p className="text-slate-500 text-xs mt-1">{a.body}</p>
              <p className="text-slate-600 text-[10px] mt-1">{segments.find(s => s.slug === a.segment_slug)?.name || 'All staff'} • {new Date(a.created_at).toLocaleDateString()}</p>
            </div>
            <button className="text-red-400 text-xs" onClick={() => remove(a.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Shift Swap (employee request + manager review)
export function ShiftSwapBoard() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [form, setForm] = useState({ target_id: '', shift_date: '', reason: '' });

  async function load() {
    if (!user) return;
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('shift_swap_requests').select('*').or(`requester_id.eq.${user.id},target_id.eq.${user.id}`).order('created_at', { ascending: false }),
      supabase.from('app_users').select('id, full_name').eq('is_active', true).neq('id', user.id).neq('role', 'super_admin'),
    ]);
    if (m) setMine(m);
    if (c) setColleagues(c);
    if (hasPermission('approve_leaves')) {
      const { data: p } = await supabase.from('shift_swap_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      if (p) setPending(p);
    }
  }
  useEffect(() => { load(); }, [user]);

  async function submit() {
    if (!form.shift_date || !user) { toast.error('Please pick a date'); return; }
    const { error } = await supabase.from('shift_swap_requests').insert({ requester_id: user.id, target_id: form.target_id || null, shift_date: form.shift_date, reason: form.reason });
    if (error) { toast.error(`Couldn't submit request: ${error.message}`); return; }
    toast.success('Shift swap request submitted');
    setForm({ target_id: '', shift_date: '', reason: '' });
    load();
  }
  async function review(id: string, status: string) {
    const { error } = await supabase.from('shift_swap_requests').update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Couldn't update request: ${error.message}`); return; }
    toast.success(`Request ${status}`);
    load();
  }

  const byId = Object.fromEntries(colleagues.map(c => [c.id, c.full_name]));
  const statusColor: Record<string, string> = { pending: 'text-amber-300', approved: 'text-emerald-300', rejected: 'text-red-300' };

  return (
    <div className="space-y-6">
      <div className={cardCls + ' space-y-3'}>
        <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Repeat className="w-4 h-4 text-sky-400" /> Request Shift Swap</h3>
        <input type="date" className={inputCls} value={form.shift_date} onChange={e => setForm({ ...form, shift_date: e.target.value })} />
        <select className={inputCls} value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}>
          <option value="">Swap with (optional)</option>
          {colleagues.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <input className={inputCls} placeholder="Reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
        <button className={btnCls} onClick={submit}>Submit Request</button>
      </div>

      {hasPermission('approve_leaves') && pending.length > 0 && (
        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Pending Approvals</h3>
          <div className="space-y-2">
            {pending.map(p => (
              <div key={p.id} className={cardCls + ' flex items-center justify-between'}>
                <div>
                  <p className="text-white text-sm">{p.shift_date} {p.target_id && `↔ ${byId[p.target_id] || '—'}`}</p>
                  <p className="text-slate-500 text-xs">{p.reason}</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review(p.id, 'approved')}>Approve</button>
                  <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review(p.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-white font-semibold text-sm mb-3">My Requests</h3>
        <div className="space-y-2">
          {mine.map(m => (
            <div key={m.id} className={cardCls + ' flex items-center justify-between'}>
              <p className="text-slate-300 text-sm">{m.shift_date} {m.target_id && `↔ ${byId[m.target_id] || '—'}`}</p>
              <span className={`text-xs ${statusColor[m.status]}`}>{m.status}</span>
            </div>
          ))}
          {mine.length === 0 && <p className="text-slate-500 text-sm">No requests yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Bank Details + change approval (employee)
export function MyBankDetails() {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState<any>({});
  const [pendingReq, setPendingReq] = useState<any | null>(null);
  const [form, setForm] = useState({ account_holder: '', account_number: '', ifsc: '', bank_name: '', upi_id: '' });
  const [editing, setEditing] = useState(false);

  async function load() {
    if (!user) return;
    const { data: u } = await supabase.from('app_users').select('bank_details').eq('id', user.id).maybeSingle();
    if (u?.bank_details) { setCurrent(u.bank_details); setForm((f) => ({ ...f, ...u.bank_details })); }
    const { data: p } = await supabase.from('bank_change_requests').select('*').eq('staff_user_id', user.id).eq('status', 'pending').maybeSingle();
    setPendingReq(p || null);
  }
  useEffect(() => { load(); }, [user]);

  async function submit() {
    if (!user) return;
    if (!form.account_holder || !form.account_number || !form.ifsc || !form.bank_name) { toast.error('Account holder, number, IFSC and bank name are required'); return; }
    const { error } = await supabase.from('bank_change_requests').insert({ staff_user_id: user.id, requested_details: form, previous_details: current });
    if (error) { toast.error(`Couldn't submit: ${error.message}`); return; }
    toast.success('Change submitted for HR approval');
    setEditing(false);
    load();
  }

  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2"><Landmark className="w-4 h-4 text-sky-400" /> Bank Details</h3>
      {pendingReq && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-600/40 text-amber-300 text-xs">
          A change request is pending HR approval.
        </div>
      )}
      {!editing ? (
        <div className="space-y-2 text-sm">
          <p className="text-slate-400">Account Holder: <span className="text-white">{current.account_holder || '—'}</span></p>
          <p className="text-slate-400">Account Number: <span className="text-white">{current.account_number ? '••••' + String(current.account_number).slice(-4) : '—'}</span></p>
          <p className="text-slate-400">IFSC: <span className="text-white">{current.ifsc || '—'}</span></p>
          <p className="text-slate-400">Bank: <span className="text-white">{current.bank_name || '—'}</span></p>
          <p className="text-slate-400">UPI ID: <span className="text-white">{current.upi_id || '—'}</span></p>
          {!pendingReq && <button className="text-sky-400 text-sm mt-2" onClick={() => setEditing(true)}>Request Change</button>}
        </div>
      ) : (
        <div className="space-y-2">
          <input className={inputCls} placeholder="Account Holder Name" value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} />
          <input className={inputCls} placeholder="Account Number" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} />
          <input className={inputCls} placeholder="IFSC Code" value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} />
          <input className={inputCls} placeholder="Bank Name" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
          <input className={inputCls} placeholder="UPI ID (optional)" value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} />
          <p className="text-slate-500 text-xs">Changes require HR approval before taking effect.</p>
          <div className="flex gap-2">
            <button className={btnCls} onClick={submit}>Submit for Approval</button>
            <button className="text-slate-400 text-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Super Admin/HR: review bank change requests
export function BankChangeApprovals() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from('bank_change_requests').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) setItems(data);
    const { data: users } = await supabase.from('app_users').select('id, full_name');
    if (users) setStaffNames(Object.fromEntries(users.map((u: any) => [u.id, u.full_name])));
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, status: string) {
    const { error } = await supabase.from('bank_change_requests').update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(`Bank change ${status}`);
    load();
  }

  return (
    <div className="space-y-2">
      {items.map(r => (
        <div key={r.id} className={cardCls}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-white text-sm font-medium">{staffNames[r.staff_user_id] || '—'}</p>
            <span className={`text-xs ${r.status === 'pending' ? 'text-amber-300' : r.status === 'approved' ? 'text-emerald-300' : 'text-red-300'}`}>{r.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-400">
            <p>Holder: {r.requested_details.account_holder}</p>
            <p>A/C: {r.requested_details.account_number}</p>
            <p>IFSC: {r.requested_details.ifsc}</p>
            <p>Bank: {r.requested_details.bank_name}</p>
          </div>
          {r.status === 'pending' && (
            <div className="flex gap-2 mt-3">
              <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review(r.id, 'approved')}>Approve</button>
              <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review(r.id, 'rejected')}>Reject</button>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No bank change requests.</p>}
    </div>
  );
}

// ─────────────────────────── ID Card (view + print)
export function IDCard() {
  const { user } = useAuth();
  const [seg, setSeg] = useState<Segment | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('segments').select('*').then(({ data }) => {
      const s = (data || []).find((x: any) => (user.segments || []).includes(x.slug));
      setSeg(s || null);
    });
  }, [user]);

  function print() {
    const w = window.open('', '_blank');
    if (!w || !user) return;
    w.document.write(`
      <html><head><title>ID Card - ${user.full_name}</title>
      <style>
        body{font-family:Arial,sans-serif;display:flex;justify-content:center;padding:60px;background:#f1f5f9}
        .card{width:320px;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);border:1px solid #e2e8f0}
        .head{background:${seg?.color || '#0ea5e9'};color:#fff;padding:16px;text-align:center}
        .body{padding:20px;text-align:center;background:#fff}
        .row{display:flex;justify-content:space-between;font-size:12px;color:#475569;border-top:1px solid #e2e8f0;padding:8px 0}
      </style></head>
      <body><div class="card">
        <div class="head"><strong>NIKKI TECHNOLOGIES</strong><div style="font-size:11px">${seg?.name || 'Staff'}</div></div>
        <div class="body">
          <h2 style="margin:8px 0 2px">${user.full_name}</h2>
          <p style="color:#64748b;font-size:13px;margin:0">${user.designation || user.role}</p>
          <div class="row"><span>ID</span><span>${(user as any).staff_code || '—'}</span></div>
          <div class="row"><span>Phone</span><span>${user.phone || '—'}</span></div>
          ${(user as any).blood_group ? `<div class="row"><span>Blood Group</span><span>${(user as any).blood_group}</span></div>` : ''}
          <div class="row"><span>Email</span><span>${user.email}</span></div>
        </div>
      </div></body></html>
    `);
    w.document.close();
    w.print();
  }

  if (!user) return null;
  return (
    <div className={cardCls + ' max-w-sm'}>
      <div className="rounded-xl overflow-hidden border border-slate-800">
        <div className="p-4 text-center text-slate-950 font-bold" style={{ backgroundColor: seg?.color || '#0ea5e9' }}>
          NIKKI TECHNOLOGIES
          <div className="text-xs font-normal">{seg?.name || 'Staff'}</div>
        </div>
        <div className="bg-white text-center p-5">
          <div className="w-16 h-16 rounded-full bg-slate-200 mx-auto mb-2 overflow-hidden flex items-center justify-center text-slate-500 font-bold text-xl">
            {user.profile_photo_url ? <img src={user.profile_photo_url} className="w-full h-full object-cover" /> : user.full_name[0]}
          </div>
          <p className="text-slate-900 font-semibold">{user.full_name}</p>
          <p className="text-slate-500 text-xs mb-3">{user.designation || user.role}</p>
          <div className="text-left text-xs text-slate-600 space-y-1 border-t border-slate-200 pt-2">
            <p>ID: {(user as any).staff_code || '—'}</p>
            <p>Phone: {user.phone || '—'}</p>
            {(user as any).blood_group && <p>Blood Group: {(user as any).blood_group}</p>}
          </div>
        </div>
      </div>
      <button onClick={print} className="flex items-center gap-1.5 text-sky-400 text-sm mt-3"><Printer className="w-4 h-4" /> Print ID Card</button>
    </div>
  );
}

// ─────────────────────────── My Stats (streak, punctuality) — client computed
export function MyStatsCard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ streak: number; presentDays: number; totalDays: number; punctuality: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const from = new Date(); from.setDate(from.getDate() - 30);
    supabase.from('attendance_records').select('*').eq('staff_user_id', user.id)
      .gte('attendance_date', from.toISOString().slice(0, 10)).order('attendance_date', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const present = data.filter((r: any) => r.status === 'present' || r.status === 'half_day');
        let streak = 0;
        const today = new Date().toISOString().slice(0, 10);
        const byDate = new Set(present.map((r: any) => r.attendance_date));
        const d = new Date();
        while (byDate.has(d.toISOString().slice(0, 10)) || d.toISOString().slice(0, 10) === today) {
          if (byDate.has(d.toISOString().slice(0, 10))) streak++;
          else if (d.toISOString().slice(0, 10) !== today) break;
          d.setDate(d.getDate() - 1);
        }
        const onTime = present.filter((r: any) => r.check_in_at && new Date(r.check_in_at).getHours() < 10).length;
        setStats({
          streak,
          presentDays: present.length,
          totalDays: data.length,
          punctuality: present.length ? Math.round((onTime / present.length) * 100) : 0,
        });
      });
  }, [user]);

  if (!stats) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-sky-400" /> My Stats (last 30 days)</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><p className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1"><Flame className="w-5 h-5" />{stats.streak}</p><p className="text-slate-500 text-xs">Day streak</p></div>
        <div><p className="text-2xl font-bold text-white">{stats.presentDays}</p><p className="text-slate-500 text-xs">Days present</p></div>
        <div><p className="text-2xl font-bold text-emerald-400">{stats.punctuality}%</p><p className="text-slate-500 text-xs">On-time rate</p></div>
      </div>
    </div>
  );
}

// ─────────────────────────── Super Admin: punctuality leaderboard + birthdays
export function PunctualityLeaderboard({ segments }: { segments: Segment[] }) {
  const [rows, setRows] = useState<{ name: string; punctuality: number; presentDays: number }[]>([]);
  useEffect(() => {
    (async () => {
      const from = new Date(); from.setDate(from.getDate() - 30);
      const [{ data: staff }, { data: records }] = await Promise.all([
        supabase.from('app_users').select('id, full_name').eq('is_active', true).neq('role', 'super_admin'),
        supabase.from('attendance_records').select('*').gte('attendance_date', from.toISOString().slice(0, 10)),
      ]);
      if (!staff || !records) return;
      const computed = staff.map((s: any) => {
        const mine = records.filter((r: any) => r.staff_user_id === s.id && (r.status === 'present' || r.status === 'half_day'));
        const onTime = mine.filter((r: any) => r.check_in_at && new Date(r.check_in_at).getHours() < 10).length;
        return { name: s.full_name, presentDays: mine.length, punctuality: mine.length ? Math.round((onTime / mine.length) * 100) : 0 };
      }).filter((r: any) => r.presentDays > 0).sort((a: any, b: any) => b.punctuality - a.punctuality).slice(0, 10);
      setRows(computed);
    })();
  }, [segments]);

  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-4">Punctuality Leaderboard (30 days)</h3>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">#{i + 1} {r.name}</span>
            <span className="text-emerald-400 font-medium">{r.punctuality}%</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-slate-500 text-sm">No attendance data yet.</p>}
      </div>
    </div>
  );
}

export function BirthdaysWidget() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('app_users').select('full_name, date_of_birth, joining_date').eq('is_active', true).neq('role', 'super_admin').then(({ data }) => {
      if (!data) return;
      const today = new Date();
      const isToday = (d?: string) => {
        if (!d) return false;
        const dt = new Date(d);
        return dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate();
      };
      setItems(data.filter((u: any) => isToday(u.date_of_birth) || isToday(u.joining_date)));
    });
  }, []);
  if (items.length === 0) return null;
  return (
    <div className={cardCls + ' border-pink-600/40'}>
      <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Cake className="w-4 h-4 text-pink-400" /> Today's Celebrations</h3>
      {items.map((u, i) => <p key={i} className="text-slate-300 text-sm">🎉 {u.full_name}</p>)}
    </div>
  );
}

// ─────────────────────────── Careers: job postings + applications (Super Admin / HR)
const APP_STATUS_COLORS: Record<string, string> = {
  new: 'bg-sky-500/20 text-sky-300',
  shortlisted: 'bg-purple-500/20 text-purple-300',
  interviewed: 'bg-amber-500/20 text-amber-300',
  hired: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
};
const APP_STATUSES = ['new', 'shortlisted', 'interviewed', 'hired', 'rejected'];

export function CareersManager({ segments }: { segments: Segment[] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'jobs' | 'applications'>('jobs');
  const [jobs, setJobs] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [openApp, setOpenApp] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [fileUrls, setFileUrls] = useState<{ resume?: string; photo?: string }>({});

  async function load() {
    const [{ data: j }, { data: a }] = await Promise.all([
      supabase.from('job_postings').select('*').order('created_at', { ascending: false }),
      supabase.from('career_applications').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    if (j) setJobs(j);
    if (a) setApps(a);
  }
  useEffect(() => { load(); }, []);

  async function saveJob() {
    if (!editingJob?.title) { toast.error('Job title is required'); return; }
    const payload = { ...editingJob, questions: editingJob.questions || [] };
    let error;
    if (editingJob.id) {
      const { id, ...patch } = payload;
      ({ error } = await supabase.from('job_postings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
    } else {
      ({ error } = await supabase.from('job_postings').insert({ ...payload, created_by: user?.id }));
    }
    if (error) { toast.error(`Couldn't save job: ${error.message}`); return; }
    toast.success(editingJob.id ? 'Job posting updated' : 'Job posted');
    setEditingJob(null); load();
  }

  async function toggleJobStatus(job: any) {
    const status = job.status === 'open' ? 'closed' : 'open';
    const { error } = await supabase.from('job_postings').update({ status }).eq('id', job.id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(`Job ${status === 'open' ? 'reopened' : 'closed'}`);
    load();
  }

  async function updateAppStatus(id: string, status: string) {
    const { error } = await supabase.from('career_applications').update({ status, reviewed_by: user?.id }).eq('id', id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(`Marked as ${status}`);
    load();
    setOpenApp((prev: any) => prev ? { ...prev, status } : prev);
  }

  async function viewFiles(app: any) {
    setOpenApp(app);
    setFileUrls({});
    const urls: { resume?: string; photo?: string } = {};
    if (app.resume_url) {
      const { data } = await supabase.storage.from('career-uploads').createSignedUrl(app.resume_url, 3600);
      if (data) urls.resume = data.signedUrl;
    }
    if (app.photo_url) {
      const { data } = await supabase.storage.from('career-uploads').createSignedUrl(app.photo_url, 3600);
      if (data) urls.photo = data.signedUrl;
    }
    setFileUrls(urls);
  }

  const jobTitle = (id: string) => jobs.find(j => j.id === id)?.title || 'General Application';
  const filteredApps = statusFilter ? apps.filter(a => a.status === statusFilter) : apps;
  const counts = Object.fromEntries(APP_STATUSES.map(s => [s, apps.filter(a => a.status === s).length]));

  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('jobs')} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === 'jobs' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Job Postings</button>
        <button onClick={() => setTab('applications')} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === 'applications' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>Applications ({apps.length})</button>
      </div>

      {tab === 'jobs' && (
        <div>
          <div className="flex justify-end mb-4">
            <button className={btnCls} onClick={() => setEditingJob({ segment_slug: '', title: '', employment_type: 'full_time', location: 'Hyderabad', description: '', requirements: '', questions: [], positions_open: 1, status: 'open' })}>+ Post Job</button>
          </div>
          <div className="space-y-2">
            {jobs.map(j => {
              const seg = segments.find(s => s.slug === j.segment_slug);
              return (
                <div key={j.id} className={cardCls + ' flex items-center justify-between'}>
                  <div>
                    <p className="text-white text-sm font-medium">{j.title} {seg && <span className="text-xs px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: seg.color + '22', color: seg.color }}>{seg.name}</span>}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{j.location} • {j.employment_type.replace('_', ' ')} • {apps.filter(a => a.job_posting_id === j.id).length} applicants</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${j.status === 'open' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>{j.status}</span>
                    <button className="text-sky-400 text-xs" onClick={() => setEditingJob(j)}>Edit</button>
                    <button className="text-slate-400 text-xs" onClick={() => toggleJobStatus(j)}>{j.status === 'open' ? 'Close' : 'Reopen'}</button>
                  </div>
                </div>
              );
            })}
            {jobs.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No job postings yet.</p>}
          </div>
        </div>
      )}

      {tab === 'applications' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setStatusFilter('')} className={`px-3 py-1 rounded-lg text-xs border ${statusFilter === '' ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>All ({apps.length})</button>
            {APP_STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-lg text-xs border capitalize ${statusFilter === s ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>{s} ({counts[s] || 0})</button>
            ))}
          </div>
          <div className="space-y-2">
            {filteredApps.map(a => (
              <div key={a.id} className={cardCls + ' flex items-center justify-between cursor-pointer hover:border-slate-600'} onClick={() => viewFiles(a)}>
                <div>
                  <p className="text-white text-sm font-medium">{a.name} <span className="text-slate-500 text-xs">— {a.position || jobTitle(a.job_posting_id)}</span></p>
                  <p className="text-slate-500 text-xs mt-0.5">{a.phone} • {a.experience || 'exp not specified'} • {new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded capitalize ${APP_STATUS_COLORS[a.status]}`}>{a.status}</span>
              </div>
            ))}
            {filteredApps.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No applications yet.</p>}
          </div>
        </div>
      )}

      {editingJob && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditingJob(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">{editingJob.id ? 'Edit' : 'New'} Job Posting</h3>
            <input className={inputCls} placeholder="Job Title *" value={editingJob.title} onChange={e => setEditingJob({ ...editingJob, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={editingJob.segment_slug} onChange={e => setEditingJob({ ...editingJob, segment_slug: e.target.value })}>
                <option value="">Company-wide</option>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={editingJob.employment_type} onChange={e => setEditingJob({ ...editingJob, employment_type: e.target.value })}>
                {['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
              <input className={inputCls} placeholder="Location" value={editingJob.location} onChange={e => setEditingJob({ ...editingJob, location: e.target.value })} />
              <input type="number" min={1} className={inputCls} placeholder="Openings" value={editingJob.positions_open} onChange={e => setEditingJob({ ...editingJob, positions_open: Number(e.target.value) })} />
            </div>
            <textarea className={inputCls} rows={3} placeholder="Description" value={editingJob.description} onChange={e => setEditingJob({ ...editingJob, description: e.target.value })} />
            <textarea className={inputCls} rows={2} placeholder="Requirements" value={editingJob.requirements} onChange={e => setEditingJob({ ...editingJob, requirements: e.target.value })} />
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-slate-300 text-sm font-medium">Screening Questions</p>
                <button className="text-sky-400 text-xs" onClick={() => setEditingJob({ ...editingJob, questions: [...(editingJob.questions || []), ''] })}>+ Add question</button>
              </div>
              {(editingJob.questions || []).map((q: string, i: number) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className={inputCls} value={q} onChange={e => {
                    const next = [...editingJob.questions]; next[i] = e.target.value; setEditingJob({ ...editingJob, questions: next });
                  }} placeholder={`Question ${i + 1}`} />
                  <button className="text-red-400 text-xs px-2" onClick={() => setEditingJob({ ...editingJob, questions: editingJob.questions.filter((_: string, j: number) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            <button className={btnCls + ' w-full'} onClick={saveJob}>Save Job Posting</button>
          </div>
        </div>
      )}

      {openApp && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenApp(null)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-white text-lg font-semibold">{openApp.name}</h3>
                <p className="text-slate-400 text-sm">{openApp.phone} {openApp.email && `• ${openApp.email}`}</p>
                <p className="text-slate-500 text-xs mt-0.5">Applied for: {openApp.position || jobTitle(openApp.job_posting_id)} • {openApp.experience || 'exp not specified'}</p>
              </div>
              <button className="text-slate-400 hover:text-white" onClick={() => setOpenApp(null)}>✕</button>
            </div>

            <div className="flex gap-3 mb-4">
              {fileUrls.photo && <a href={fileUrls.photo} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-400 text-xs"><ExternalLink className="w-3.5 h-3.5" /> View Photo</a>}
              {fileUrls.resume && <a href={fileUrls.resume} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-400 text-xs"><Download className="w-3.5 h-3.5" /> Download Resume</a>}
            </div>

            {openApp.message && <p className="text-slate-300 text-sm mb-3">{openApp.message}</p>}

            {(openApp.question_answers || []).length > 0 && (
              <div className="space-y-2 mb-4 border-t border-slate-800 pt-3">
                {openApp.question_answers.map((qa: any, i: number) => (
                  <div key={i}>
                    <p className="text-slate-400 text-xs">{qa.question}</p>
                    <p className="text-white text-sm">{qa.answer || '—'}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              {APP_STATUSES.map(s => (
                <button key={s} onClick={() => updateAppStatus(openApp.id, s)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize border ${openApp.status === s ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Photo change approval (mirrors bank-detail approval pattern)
export function MyPhotoRequest() {
  const { user } = useAuth();
  const toast = useToast();
  const [pendingReq, setPendingReq] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from('photo_change_requests').select('*').eq('staff_user_id', user.id).eq('status', 'pending').maybeSingle();
    setPendingReq(data || null);
  }
  useEffect(() => { load(); }, [user]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = `profile-requests/${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('site-photos').upload(path, file);
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setUploading(false); return; }
    const { data: pub } = supabase.storage.from('site-photos').getPublicUrl(path);
    const { error } = await supabase.from('photo_change_requests').insert({ staff_user_id: user.id, requested_photo_url: pub.publicUrl });
    setUploading(false);
    if (error) { toast.error(`Couldn't submit: ${error.message}`); return; }
    toast.success('Photo submitted for approval');
    load();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-3">Profile Photo</h3>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center text-slate-400 font-bold">
          {user?.profile_photo_url ? <img src={user.profile_photo_url} className="w-full h-full object-cover" /> : user?.full_name?.[0]}
        </div>
        <div>
          {pendingReq ? (
            <p className="text-amber-400 text-xs">Change request pending approval.</p>
          ) : (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} disabled={uploading}
                className="text-slate-300 text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-300 file:text-xs" />
              <p className="text-slate-500 text-[11px] mt-1">Requires HR approval before it updates.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Super Admin/HR: photo change approvals
export function PhotoChangeApprovals() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from('photo_change_requests').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) setItems(data);
    const { data: users } = await supabase.from('app_users').select('id, full_name');
    if (users) setNames(Object.fromEntries(users.map((u: any) => [u.id, u.full_name])));
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, status: string) {
    const { error } = await supabase.from('photo_change_requests').update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Couldn't update: ${error.message}`); return; }
    toast.success(`Photo ${status}`);
    load();
  }

  const pending = items.filter(i => i.status === 'pending');
  if (pending.length === 0) return <p className="text-slate-500 text-sm text-center py-10">No pending photo change requests.</p>;

  return (
    <div className="space-y-2">
      {pending.map(r => (
        <div key={r.id} className={cardCls + ' flex items-center justify-between'}>
          <div className="flex items-center gap-3">
            <img src={r.requested_photo_url} className="w-12 h-12 rounded-full object-cover" />
            <p className="text-white text-sm">{names[r.staff_user_id] || '—'}</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded bg-emerald-600 text-white text-xs" onClick={() => review(r.id, 'approved')}>Approve</button>
            <button className="px-3 py-1 rounded bg-red-600 text-white text-xs" onClick={() => review(r.id, 'rejected')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Promotions / designation-salary history
export function MyPromotionHistory() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from('promotions').select('*').eq('staff_user_id', user.id).order('effective_date', { ascending: false })
      .then(({ data }) => { if (data) setItems(data); });
  }, [user]);
  if (items.length === 0) return null;
  return (
    <div className={cardCls}>
      <h3 className="text-white font-semibold text-sm mb-3">Role & Compensation History</h3>
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="text-xs border-l-2 border-sky-600 pl-3">
            <p className="text-slate-500">{new Date(p.effective_date).toLocaleDateString()}</p>
            {p.new_designation && p.new_designation !== p.previous_designation && (
              <p className="text-white">{p.previous_designation || '—'} → {p.new_designation}</p>
            )}
            {p.new_ctc > 0 && p.new_ctc !== p.previous_ctc && (
              <p className="text-emerald-400">₹{Number(p.previous_ctc).toLocaleString('en-IN')} → ₹{Number(p.new_ctc).toLocaleString('en-IN')}</p>
            )}
            {p.note && <p className="text-slate-400 mt-0.5">{p.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
