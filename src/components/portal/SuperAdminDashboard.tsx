import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Ticket, Users2, Layers, Boxes, FileText,
  UserCog, LogOut, Wrench, ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSegments } from '../../lib/useSegments';
import type { Segment, Product } from '../../lib/database.types';
import { TicketsBoard, LeadsBoard, HRBoard, inputCls, btnCls, cardCls, SegmentTabs } from './shared';

const PERMISSION_KEYS = [
  'view_leads', 'manage_leads', 'create_leads',
  'view_tickets', 'manage_tickets', 'assign_tickets',
  'view_staff', 'manage_staff',
  'view_attendance', 'approve_leaves', 'approve_advances',
  'view_payroll', 'manage_payroll',
  'manage_content', 'view_reports',
];

// ─────────────────────────────────────── Overview
function Overview({ segments }: { segments: Segment[] }) {
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
  );
}

// ─────────────────────────────────────── Access Control (users × segments × permissions)
function AccessControl({ segments }: { segments: Segment[] }) {
  const [users, setUsers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', full_name: '', phone: '', role: 'employee', segments: [] as string[] });
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('app_users').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
  }
  useEffect(() => { load(); }, []);

  async function createUser() {
    setMsg('');
    if (!createForm.email || !createForm.password || !createForm.full_name) { setMsg('Email, password and name required'); return; }
    const { data, error } = await supabase.functions.invoke('create-user', { body: createForm });
    if (error || data?.error) { setMsg(data?.error || error?.message || 'Failed'); return; }
    setShowCreate(false);
    setCreateForm({ email: '', password: '', full_name: '', phone: '', role: 'employee', segments: [] });
    load();
  }

  async function saveUser() {
    if (!editing) return;
    await supabase.from('app_users').update({
      role: editing.role,
      segments: editing.segments,
      permission_overrides: editing.permission_overrides || {},
      is_active: editing.is_active,
      designation: editing.designation || '',
      monthly_salary: editing.monthly_salary || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', editing.id);
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
        <p className="text-slate-400 text-sm">Assign roles, segment access and function permissions — no code needed.</p>
        <button className={btnCls} onClick={() => setShowCreate(true)}>+ New Staff</button>
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
              {u.role !== 'super_admin' && (
                <button className="text-sky-400 text-sm font-medium" onClick={() => setEditing({ ...u, permission_overrides: u.permission_overrides || {} })}>Manage Access</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg">Create Staff Account</h3>
            <input className={inputCls} placeholder="Full Name *" value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} />
            <input className={inputCls} placeholder="Email *" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} />
            <input className={inputCls} placeholder="Password *" type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} />
            <input className={inputCls} placeholder="Phone" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} />
            <select className={inputCls} value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}>
              {['manager', 'hr', 'marketing_executive', 'telecaller', 'support_agent', 'employee'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              {[...segments.map(s => ({ slug: s.slug, name: s.name })), { slug: 'all', name: 'ALL SEGMENTS' }].map(s => (
                <button key={s.slug} onClick={() => toggleSeg(createForm, setCreateForm, s.slug)}
                  className={`px-3 py-1 rounded-full text-xs border ${createForm.segments.includes(s.slug) ? 'bg-sky-500 text-slate-950 border-sky-500' : 'border-slate-700 text-slate-400'}`}>
                  {s.name}
                </button>
              ))}
            </div>
            {msg && <p className="text-red-400 text-xs">{msg}</p>}
            <button className={btnCls + ' w-full'} onClick={createUser}>Create Account</button>
          </div>
        </div>
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
              <input className={inputCls} type="number" placeholder="Monthly Salary" value={editing.monthly_salary || ''} onChange={e => setEditing({ ...editing, monthly_salary: Number(e.target.value) })} />
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

  async function load() {
    const { data } = await supabase.from('segments').select('*').order('order_index');
    if (data) setRows(data as Segment[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name || !editing?.slug || !editing?.ticket_prefix) return;
    if (editing.id) {
      const { id, ...patch } = editing;
      await supabase.from('segments').update(patch).eq('id', id);
    } else {
      await supabase.from('segments').insert(editing);
    }
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

  async function load() {
    const { data } = await supabase.from('products').select('*').order('order_index');
    if (data) setRows(data as Product[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name || !editing?.slug) return;
    const payload = { ...editing, features: editing.features || [] };
    if (editing.id) {
      const { id, ...patch } = payload;
      await supabase.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    } else {
      await supabase.from('products').insert(payload);
    }
    setEditing(null); load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
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
    if (!newService.title || !seg) return;
    await supabase.from('services').insert({ ...newService, segment_slug: seg, order_index: services.filter(x => x.segment_slug === seg).length + 1 });
    setNewService({ title: '', description: '', icon: 'Settings' });
    load();
  }
  async function addType() {
    if (!newType || !seg) return;
    await supabase.from('ticket_types').insert({ segment_slug: seg, name: newType, order_index: types.filter(x => x.segment_slug === seg).length + 1 });
    setNewType('');
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
                <button className="text-red-400 text-xs" onClick={async () => { await supabase.from('services').delete().eq('id', s.id); load(); }}>Remove</button>
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
                <button className="text-red-400 text-xs" onClick={async () => { await supabase.from('ticket_types').delete().eq('id', t.id); load(); }}>Remove</button>
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

  useEffect(() => {
    supabase.from('site_content').select('*').order('section').then(({ data }) => { if (data) setRows(data as any); });
  }, []);

  async function save(row: { id: string; value: string }) {
    await supabase.from('site_content').update({ value: row.value, updated_at: new Date().toISOString() }).eq('id', row.id);
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
type Tab = 'overview' | 'tickets' | 'crm' | 'hr' | 'access' | 'segments' | 'products' | 'catalog' | 'content';

export default function SuperAdminDashboard() {
  const { user, signOut } = useAuth();
  const { segments } = useSegments();
  const [tab, setTab] = useState<Tab>('overview');
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
            <span className="text-slate-500 text-sm hidden sm:block">{user?.full_name}</span>
            <button onClick={signOut} className="md:hidden text-slate-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        {tab === 'overview' && <Overview segments={segments} />}
        {tab === 'tickets' && <TicketsBoard segments={segments} />}
        {tab === 'crm' && <LeadsBoard segments={segments} />}
        {tab === 'hr' && <HRBoard segments={segments} />}
        {tab === 'access' && <AccessControl segments={segments} />}
        {tab === 'segments' && <SegmentsManager onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'products' && <ProductsManager segments={segments} />}
        {tab === 'catalog' && <CatalogManager segments={segments} />}
        {tab === 'content' && <ContentManager />}
      </main>
    </div>
  );
}
