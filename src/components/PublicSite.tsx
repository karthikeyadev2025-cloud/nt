import { useEffect, useRef, useState } from 'react';
import {
  Camera, Megaphone, Code2, Shield, Wrench, Settings, Palette, TrendingUp,
  Boxes, Bot, Layers, Phone, Mail, MapPin, ExternalLink, Star, Menu, X,
  Ticket, Send, CheckCircle2, ChevronRight, Briefcase, Upload, User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSegments, useSiteContent } from '../lib/useSegments';
import type { Segment, Product } from '../lib/database.types';
import LoadingScreen from './LoadingScreen';
import WhatsAppButton from './WhatsAppButton';
import SEOHead from './SEOHead';
import Reveal from './Reveal';

const iconMap: Record<string, any> = {
  Camera, Megaphone, Code2, Shield, Wrench, Settings, Palette,
  TrendingUp, Boxes, Bot, Layers,
};
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const C = iconMap[name] || Layers;
  return <C className={className} />;
};

// ─────────────────────────────────────────────── Animated Stats (count-up on scroll into view)
function AnimatedNumber({ value }: { value: string }) {
  const [display, setDisplay] = useState('0');
  const ref = useRef<HTMLSpanElement | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const numMatch = value.match(/[\d.]+/);
    const target = numMatch ? parseFloat(numMatch[0]) : 0;
    const suffix = value.replace(/[\d.]+/, '');
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !triggered.current) {
        triggered.current = true;
        const duration = 1200;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(target * eased) + suffix);
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        observer.disconnect();
      }
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display}</span>;
}

function AnimatedStats({ content }: { content: Record<string, Record<string, string>> }) {
  const stats = [
    { label: 'Years in Business', value: content?.stats?.years_in_business || '2+' },
    { label: 'Happy Clients', value: content?.stats?.clients_served || '50+' },
    { label: 'Projects Completed', value: content?.stats?.projects_completed || '100+' },
    { label: 'Divisions', value: '3' },
  ];
  return (
    <section className="py-14 px-4 border-y border-slate-900">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <p className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">
              <AnimatedNumber value={s.value} />
            </p>
            <p className="text-slate-500 text-sm mt-2">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Client Logos (trusted-by marquee)
function ClientLogos() {
  const [logos, setLogos] = useState<{ id: string; name: string; logo_url: string }[]>([]);
  useEffect(() => {
    supabase.from('client_logos').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setLogos(data as any); });
  }, []);
  if (logos.length === 0) return null;
  const track = [...logos, ...logos]; // duplicated for seamless loop

  return (
    <section className="py-12 px-4 overflow-hidden">
      <p className="text-center text-slate-500 text-xs uppercase tracking-[0.2em] mb-8">Trusted By</p>
      <div className="flex gap-16 animate-marquee w-max">
        {track.map((l, i) => (
          <img key={`${l.id}-${i}`} src={l.logo_url} alt={l.name} className="h-10 md:h-12 object-contain opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0" />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Navigation
function Navigation({ content }: { content: Record<string, Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#segments', label: 'What We Do' },
    { href: '#services', label: 'Services' },
    { href: '#products', label: 'Products' },
    { href: '#careers', label: 'Careers' },
    { href: '#testimonials', label: 'Clients' },
    { href: '#raise-ticket', label: 'Support' },
    { href: '#contact', label: 'Contact' },
  ];
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-slate-950/90 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950">N</div>
          <span className="text-white font-bold text-lg">{content?.hero?.title || 'Nikki Technologies'}</span>
        </a>
        <div className="hidden md:flex items-center gap-6">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-slate-300 hover:text-sky-400 text-sm font-medium transition-colors">{l.label}</a>
          ))}
          <a href="/login" className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold transition-colors">Staff Login</a>
        </div>
        <button className="md:hidden text-white" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="md:hidden bg-slate-950 border-t border-slate-800 px-4 py-3 space-y-2">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-slate-300 hover:text-sky-400 py-1.5">{l.label}</a>
          ))}
          <a href="/login" className="block text-sky-400 font-semibold py-1.5">Staff Login</a>
        </div>
      )}
    </nav>
  );
}

// ─────────────────────────────────────────────── Hero
function Hero({ content, segments }: { content: Record<string, Record<string, string>>; segments: Segment[] }) {
  return (
    <section className="relative pt-32 pb-24 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-950/40 via-slate-950 to-slate-950" />
      <div className="absolute top-20 left-1/4 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl animate-float-slow" />
      <div className="absolute top-40 right-1/4 w-72 h-72 bg-cyan-400/10 rounded-full blur-3xl animate-float" />
      <div className="max-w-5xl mx-auto text-center relative z-10 animate-slide-up">
        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-4 tracking-tight">
          {content?.hero?.title || 'Nikki Technologies'}
        </h1>
        <p className="text-xl md:text-2xl bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent font-semibold mb-6 animate-gradient bg-[length:200%_auto]">
          {content?.hero?.subtitle || 'CCTV • Digital Media • Software'}
        </p>
        <p className="text-slate-400 max-w-2xl mx-auto mb-10 text-lg">
          {content?.hero?.description || 'One technology partner for security surveillance, digital growth and software products.'}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          {segments.map((s, i) => (
            <a key={s.slug} href={`#seg-${s.slug}`}
              style={{ animationDelay: `${i * 100}ms` }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-700 bg-slate-900/60 hover:border-sky-500 hover-lift transition-colors text-white animate-zoom-in">
              <Icon name={s.icon} className="w-5 h-5" />
              <span className="font-medium">{s.name}</span>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Segments + Services
interface Service { id: string; segment_slug: string; title: string; description: string; icon: string; }

function SegmentSections({ segments }: { segments: Segment[] }) {
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    supabase.from('services').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setServices(data as Service[]); });
  }, []);

  return (
    <section id="segments" className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-center text-white mb-3">What We Do</h2>
        <p className="text-center text-slate-400 mb-16 max-w-2xl mx-auto">Three specialized divisions. One trusted company.</p>
        <div id="services" className="space-y-16">
          {segments.map(seg => (
            <div key={seg.slug} id={`seg-${seg.slug}`} className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: seg.color + '22', color: seg.color }}>
                  <Icon name={seg.icon} className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{seg.name}</h3>
                  <p className="text-slate-400 text-sm">{seg.tagline}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {services.filter(s => s.segment_slug === seg.slug).map(s => (
                  <div key={s.id} className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-600 hover-lift transition-colors">
                    <Icon name={s.icon} className="w-8 h-8 mb-4" />
                    <h4 className="text-lg font-semibold text-white mb-2">{s.title}</h4>
                    <p className="text-slate-400 text-sm leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Products (link-out)
function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    supabase.from('products').select('*').neq('status', 'hidden').order('order_index')
      .then(({ data }) => { if (data) setProducts(data as Product[]); });
  }, []);
  if (products.length === 0) return null;

  return (
    <section id="products" className="py-20 px-4 bg-slate-900/40">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-center text-white mb-3">Our Products</h2>
        <p className="text-center text-slate-400 mb-14 max-w-2xl mx-auto">Software built by Nikki Technologies, used by real businesses.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {products.map((p, i) => (
            <Reveal key={p.id} delay={i * 100}>
            <div className="flex flex-col h-full p-7 rounded-2xl bg-slate-950 border border-slate-800 hover:border-sky-600 hover-lift transition-colors">
              <div className="flex items-center gap-3 mb-3">
                {p.logo_url
                  ? <img src={p.logo_url} alt={p.name} className="w-11 h-11 rounded-xl object-cover" />
                  : <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950 text-lg">{p.name[0]}</div>}
                <div>
                  <h3 className="text-xl font-bold text-white">{p.name}</h3>
                  <p className="text-sky-400 text-xs font-medium">{p.tagline}</p>
                </div>
              </div>
              <p className="text-slate-400 text-sm mb-5 leading-relaxed">{p.description}</p>
              <div className="space-y-2.5 mb-6">
                {(p.features || []).map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-white text-sm font-medium">{f.title}</span>
                      <span className="text-slate-500 text-sm"> — {f.description}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto">
                {p.status === 'coming_soon' ? (
                  <span className="inline-block px-4 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm font-semibold">Coming Soon</span>
                ) : p.external_url ? (
                  <a href={p.external_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold transition-colors">
                    {p.demo_cta || 'Visit Website'} <ExternalLink className="w-4 h-4" />
                  </a>
                ) : null}
              </div>
            </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Gallery
function GallerySection() {
  const [items, setItems] = useState<{ id: string; title: string; image_url: string }[]>([]);
  useEffect(() => {
    supabase.from('gallery_items').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setItems(data as any); });
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center text-white mb-12">Our Work</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map(g => (
            <div key={g.id} className="rounded-xl overflow-hidden aspect-square bg-slate-900">
              <img src={g.image_url} alt={g.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Team
function TeamSection() {
  const [items, setItems] = useState<{ id: string; name: string; designation: string; photo_url: string }[]>([]);
  useEffect(() => {
    supabase.from('team_members').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setItems(data as any); });
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="py-20 px-4 bg-slate-900/40">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center text-white mb-12">Meet the Team</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map(m => (
            <div key={m.id} className="text-center">
              <div className="w-24 h-24 rounded-full mx-auto mb-3 overflow-hidden bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-2xl">
                {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : m.name[0]}
              </div>
              <p className="text-white font-semibold text-sm">{m.name}</p>
              <p className="text-slate-500 text-xs">{m.designation}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Testimonials
function Testimonials() {
  const [items, setItems] = useState<{ id: string; customer_name: string; content: string; rating: number }[]>([]);
  useEffect(() => {
    supabase.from('testimonials').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setItems(data as any); });
  }, []);
  if (items.length === 0) return null;
  return (
    <section id="testimonials" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center text-white mb-14">What Clients Say</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((t, i) => (
            <Reveal key={t.id} delay={i * 100}>
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover-lift">
              <div className="flex gap-1 mb-3">
                {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-slate-300 text-sm mb-4 leading-relaxed">"{t.content}"</p>
              <p className="text-white font-semibold text-sm">{t.customer_name}</p>
            </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Careers
interface JobPosting {
  id: string; segment_slug: string | null; title: string; employment_type: string;
  location: string; description: string; requirements: string; questions: string[]; positions_open: number;
}

function ApplyModal({ job, segments, onClose }: { job: JobPosting | null; segments: Segment[]; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', experience: '', message: '', position: job?.title || '', segment_slug: job?.segment_slug || '' });
  const [answers, setAnswers] = useState<string[]>((job?.questions || []).map(() => ''));
  const [photo, setPhoto] = useState<File | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:border-sky-500 focus:outline-none';

  async function submit() {
    setError('');
    if (!form.name || !form.phone || !form.position) { setError('Name, phone and position are required'); return; }
    if (!resume) { setError('Please attach your resume'); return; }
    setBusy(true);
    try {
      let resume_url = '';
      let photo_url = '';
      const stamp = Date.now();
      if (resume) {
        const path = `resumes/${stamp}-${resume.name.replace(/\s+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('career-uploads').upload(path, resume);
        if (upErr) throw upErr;
        resume_url = path;
      }
      if (photo) {
        const path = `photos/${stamp}-${photo.name.replace(/\s+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('career-uploads').upload(path, photo);
        if (upErr) throw upErr;
        photo_url = path;
      }
      const question_answers = (job?.questions || []).map((q, i) => ({ question: q, answer: answers[i] || '' }));
      const { error: insErr } = await supabase.from('career_applications').insert({
        job_posting_id: job?.id || null,
        segment_slug: form.segment_slug || null,
        name: form.name, phone: form.phone, email: form.email,
        position: form.position, experience: form.experience, message: form.message,
        resume_url, photo_url, question_answers,
      });
      if (insErr) throw insErr;
      setDone(true);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-7" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-5">
          <div>
            <h3 className="text-white text-lg font-semibold">{job ? `Apply — ${job.title}` : 'General Application'}</h3>
            {job && <p className="text-slate-500 text-xs mt-0.5">{job.location} • {job.employment_type.replace('_', ' ')}</p>}
          </div>
          <button className="text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 text-sky-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">Application submitted!</p>
            <p className="text-slate-400 text-sm">We'll review your profile and get back to you.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {!job && (
              <>
                <select className={inputCls} value={form.segment_slug} onChange={e => setForm({ ...form, segment_slug: e.target.value })}>
                  <option value="">Which division interests you?</option>
                  {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
                <input className={inputCls} placeholder="Position you're applying for *" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} />
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className={inputCls} placeholder="Phone *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <input className={inputCls} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={inputCls} placeholder="Years of Experience" value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })} />

            {(job?.questions || []).map((q, i) => (
              <div key={i}>
                <label className="text-slate-400 text-xs">{q}</label>
                <textarea className={inputCls + ' mt-1'} rows={2} value={answers[i] || ''}
                  onChange={e => setAnswers(prev => { const next = [...prev]; next[i] = e.target.value; return next; })} />
              </div>
            ))}

            <textarea className={inputCls} rows={2} placeholder="Anything else you'd like to share" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />

            <div>
              <label className="text-slate-400 text-xs flex items-center gap-1.5 mb-1"><User className="w-3.5 h-3.5" /> Passport size photo</label>
              <input type="file" accept="image/*" className="text-slate-300 text-sm w-full file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-300 file:text-xs"
                onChange={e => setPhoto(e.target.files?.[0] || null)} />
            </div>
            <div>
              <label className="text-slate-400 text-xs flex items-center gap-1.5 mb-1"><Upload className="w-3.5 h-3.5" /> Resume (PDF/DOC) *</label>
              <input type="file" accept=".pdf,.doc,.docx" className="text-slate-300 text-sm w-full file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-300 file:text-xs"
                onChange={e => setResume(e.target.files?.[0] || null)} />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={submit} disabled={busy}
              className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold transition-colors">
              {busy ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Careers({ segments }: { segments: Segment[] }) {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applyJob, setApplyJob] = useState<JobPosting | 'general' | null>(null);

  useEffect(() => {
    supabase.from('job_postings').select('*').eq('status', 'open').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setJobs(data as JobPosting[]); });
  }, []);

  return (
    <section id="careers" className="py-20 px-4 bg-slate-900/40">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <Briefcase className="w-10 h-10 text-sky-400 mx-auto mb-3" />
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">Careers at Nikki Technologies</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            We're hiring across CCTV, Digital Media and Software. Don't see a role that fits? Send us a general application.
          </p>
        </div>

        {jobs.length === 0 && (
          <p className="text-slate-500 text-center mb-10">No open positions right now — check back soon, or apply generally below.</p>
        )}

        <div className="space-y-3 mb-10">
          {jobs.map(job => {
            const seg = segments.find(s => s.slug === job.segment_slug);
            return (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-sky-600 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold">{job.title}</h3>
                    {seg && <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: seg.color + '22', color: seg.color }}>{seg.name}</span>}
                  </div>
                  <p className="text-slate-500 text-sm">{job.location} • {job.employment_type.replace('_', ' ')} {job.positions_open > 1 && `• ${job.positions_open} openings`}</p>
                </div>
                <button onClick={() => setApplyJob(job)}
                  className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold transition-colors shrink-0">
                  Apply Now
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <button onClick={() => setApplyJob('general')} className="text-sky-400 text-sm font-medium underline">
            Don't see your role? Submit a general application
          </button>
        </div>
      </div>

      {applyJob && (
        <ApplyModal job={applyJob === 'general' ? null : applyJob} segments={segments} onClose={() => setApplyJob(null)} />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────── Raise Ticket
// ─────────────────────────────────────────────── Track Ticket
function TrackTicket({ onBack }: { onBack: () => void }) {
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<any | null | 'not_found'>(null);
  const [busy, setBusy] = useState(false);
  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:border-sky-500 focus:outline-none';

  async function lookup() {
    if (!ticketNo || !phone) return;
    setBusy(true);
    const { data } = await supabase.rpc('track_ticket', { _ticket_no: ticketNo.trim().toUpperCase(), _phone: phone.trim() });
    setBusy(false);
    setResult(data && data.length > 0 ? data[0] : 'not_found');
  }

  const statusColor: Record<string, string> = {
    open: 'text-sky-400', in_progress: 'text-amber-400', waiting_customer: 'text-purple-400',
    resolved: 'text-emerald-400', closed: 'text-slate-400',
  };

  return (
    <div className="p-8 rounded-2xl bg-slate-950 border border-slate-800">
      <button onClick={onBack} className="text-slate-500 text-xs mb-4">← Back to raise a ticket</button>
      {!result ? (
        <div className="space-y-3">
          <input className={inputCls} placeholder="Ticket Number (e.g. NKT-CC-00001)" value={ticketNo} onChange={e => setTicketNo(e.target.value)} />
          <input className={inputCls} placeholder="Phone number used when raising it" value={phone} onChange={e => setPhone(e.target.value)} />
          <button onClick={lookup} disabled={busy || !ticketNo || !phone}
            className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold transition-colors">
            {busy ? 'Looking up…' : 'Check Status'}
          </button>
        </div>
      ) : result === 'not_found' ? (
        <div className="text-center py-6">
          <p className="text-slate-300 text-sm mb-3">No ticket found matching that number and phone.</p>
          <button onClick={() => setResult(null)} className="text-sky-400 text-sm">Try again</button>
        </div>
      ) : (
        <div>
          <p className="font-mono text-sky-400 text-sm mb-1">{result.ticket_no}</p>
          <p className="text-white font-semibold mb-3">{result.subject}</p>
          <div className="space-y-1.5 text-sm">
            <p><span className="text-slate-500">Status: </span><span className={statusColor[result.status]}>{result.status.replace('_', ' ')}</span></p>
            <p><span className="text-slate-500">Priority: </span><span className="text-slate-300">{result.priority}</span></p>
            <p><span className="text-slate-500">Raised: </span><span className="text-slate-300">{new Date(result.created_at).toLocaleDateString()}</span></p>
            {result.resolved_at && <p><span className="text-slate-500">Resolved: </span><span className="text-slate-300">{new Date(result.resolved_at).toLocaleDateString()}</span></p>}
          </div>
          <button onClick={() => setResult(null)} className="text-sky-400 text-sm mt-4">Check another ticket</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── Raise Ticket
function RaiseTicket({ segments }: { segments: Segment[] }) {
  const [mode, setMode] = useState<'raise' | 'track'>('raise');
  const [form, setForm] = useState({ segment_slug: '', ticket_type: '', subject: '', description: '', customer_name: '', customer_phone: '', customer_email: '' });
  const [types, setTypes] = useState<{ id: string; segment_slug: string; name: string }[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('ticket_types').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setTypes(data as any); });
  }, []);

  async function submit() {
    if (!form.segment_slug || !form.subject || !form.customer_name || !form.customer_phone) return;
    setBusy(true);
    const { data, error } = await supabase.from('support_tickets')
      .insert({ ...form, ticket_type: form.ticket_type || 'Other' })
      .select('ticket_no').single();
    setBusy(false);
    if (!error && data) {
      setDone(data.ticket_no);
      setForm({ segment_slug: '', ticket_type: '', subject: '', description: '', customer_name: '', customer_phone: '', customer_email: '' });
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:border-sky-500 focus:outline-none';

  return (
    <section id="raise-ticket" className="py-20 px-4 bg-slate-900/40">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Ticket className="w-10 h-10 text-sky-400 mx-auto mb-3" />
          <h2 className="text-4xl font-bold text-white mb-2">Raise a Support Ticket</h2>
          <p className="text-slate-400">Existing customer? Get help from the right team — CCTV, Digital Media or Software.</p>
          <button onClick={() => setMode(mode === 'raise' ? 'track' : 'raise')} className="text-sky-400 text-sm mt-2 underline">
            {mode === 'raise' ? 'Already raised a ticket? Track its status' : 'Raise a new ticket instead'}
          </button>
        </div>
        {mode === 'track' ? (
          <TrackTicket onBack={() => setMode('raise')} />
        ) : done ? (
          <div className="p-8 rounded-2xl bg-slate-950 border border-sky-700 text-center">
            <CheckCircle2 className="w-12 h-12 text-sky-400 mx-auto mb-3" />
            <p className="text-white text-lg font-semibold mb-1">Ticket created: {done}</p>
            <p className="text-slate-400 text-sm mb-4">Our team will contact you shortly. Save your ticket number.</p>
            <button onClick={() => setDone(null)} className="text-sky-400 text-sm font-medium">Raise another ticket</button>
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <select className={inputCls} value={form.segment_slug}
                onChange={e => setForm({ ...form, segment_slug: e.target.value, ticket_type: '' })}>
                <option value="">Select Department *</option>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={form.ticket_type}
                onChange={e => setForm({ ...form, ticket_type: e.target.value })} disabled={!form.segment_slug}>
                <option value="">Issue Type</option>
                {types.filter(t => t.segment_slug === form.segment_slug).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <input className={inputCls} placeholder="Subject *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            <textarea className={inputCls} rows={3} placeholder="Describe your issue" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid md:grid-cols-3 gap-4">
              <input className={inputCls} placeholder="Your Name *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              <input className={inputCls} placeholder="Phone *" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
              <input className={inputCls} placeholder="Email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} />
            </div>
            <button onClick={submit} disabled={busy}
              className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold flex items-center justify-center gap-2 transition-colors">
              <Send className="w-4 h-4" /> {busy ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Contact (lead capture)
function Contact({ content, segments }: { content: Record<string, Record<string, string>>; segments: Segment[] }) {
  const [form, setForm] = useState({ segment_slug: '', customer_name: '', phone: '', email: '', interested_in: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = content?.contact || {};
  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:border-sky-500 focus:outline-none';

  async function submit() {
    if (!form.segment_slug || !form.customer_name || !form.phone) return;
    setBusy(true);
    const { error } = await supabase.from('marketing_leads').insert({ ...form, source: 'website' });
    setBusy(false);
    if (!error) setSent(true);
  }

  return (
    <section id="contact" className="py-20 px-4">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-4xl font-bold text-white mb-6">Get In Touch</h2>
          <div className="space-y-4 text-slate-300">
            {c.phone && <p className="flex items-center gap-3"><Phone className="w-5 h-5 text-sky-400" /> {c.phone}</p>}
            {c.email && <p className="flex items-center gap-3"><Mail className="w-5 h-5 text-sky-400" /> {c.email}</p>}
            {c.address && <p className="flex items-center gap-3"><MapPin className="w-5 h-5 text-sky-400" /> {c.address}</p>}
          </div>
        </div>
        <div className="p-7 rounded-2xl bg-slate-900/60 border border-slate-800">
          {sent ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-sky-400 mx-auto mb-3" />
              <p className="text-white font-semibold">Thanks! Our team will call you soon.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <select className={inputCls} value={form.segment_slug} onChange={e => setForm({ ...form, segment_slug: e.target.value })}>
                <option value="">Which service do you need? *</option>
                {segments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <input className={inputCls} placeholder="Your Name *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              <input className={inputCls} placeholder="Phone *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              <input className={inputCls} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <textarea className={inputCls} rows={2} placeholder="Tell us what you need" value={form.interested_in} onChange={e => setForm({ ...form, interested_in: e.target.value })} />
              <button onClick={submit} disabled={busy}
                className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold transition-colors">
                {busy ? 'Sending…' : 'Request Free Consultation'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Footer
function Footer({ content, segments }: { content: Record<string, Record<string, string>>; segments: Segment[] }) {
  return (
    <footer className="border-t border-slate-800 py-12 px-4">
      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 text-sm">
        <div>
          <p className="text-white font-bold text-lg mb-2">Nikki Technologies</p>
          <p className="text-slate-500">{content?.footer?.about || 'CCTV, digital media and software solutions under one roof.'}</p>
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Divisions</p>
          {segments.map(s => <a key={s.slug} href={`#seg-${s.slug}`} className="block text-slate-400 hover:text-sky-400 py-0.5">{s.name}</a>)}
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Quick Links</p>
          <a href="#products" className="block text-slate-400 hover:text-sky-400 py-0.5">Products</a>
          <a href="#raise-ticket" className="block text-slate-400 hover:text-sky-400 py-0.5">Support</a>
          <a href="/login" className="block text-slate-400 hover:text-sky-400 py-0.5">Staff Login</a>
        </div>
      </div>
      <p className="text-center text-slate-600 text-xs mt-10">© {new Date().getFullYear()} Nikki Technologies. All rights reserved.</p>
    </footer>
  );
}

// ─────────────────────────────────────────────── Composition
export default function PublicSite() {
  const { content, loading: contentLoading } = useSiteContent();
  const { segments, loading: segLoading } = useSegments();
  const [showLoading, setShowLoading] = useState(true);

  if (showLoading) return <LoadingScreen onLoadingComplete={() => setShowLoading(false)} />;
  if (contentLoading || segLoading) return null;

  return (
    <div className="bg-slate-950 min-h-screen">
      <SEOHead />
      <Navigation content={content} />
      <Hero content={content} segments={segments} />
      <ClientLogos />
      <AnimatedStats content={content} />
      <SegmentSections segments={segments} />
      <Products />
      <Careers segments={segments} />
      <GallerySection />
      <TeamSection />
      <Testimonials />
      <RaiseTicket segments={segments} />
      <Contact content={content} segments={segments} />
      <Footer content={content} segments={segments} />
      <WhatsAppButton />
    </div>
  );
}
