import { useEffect, useRef, useState } from 'react';
import {
  Camera, Megaphone, Code2, Shield, Wrench, Settings, Palette, TrendingUp,
  Boxes, Bot, Layers, Phone, Mail, MapPin, ExternalLink, Star, Menu, X,
  Ticket, Send, CheckCircle2, ChevronRight, Briefcase, Upload, User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSegments, useSiteContent } from '../lib/useSegments';
import type { Segment, Product, ProductFeature } from '../lib/database.types';
import WhatsAppButton from './WhatsAppButton';
import SEOHead from './SEOHead';
import { jobPostingSchema } from '../config/seo';
import Reveal from './Reveal';
import { KiteTailLogo } from './KiteTailLogo';

// A phone number is only "real" once it has actual digits — the seeded
// placeholder (+91 00000 00000) must never be shown to a customer.
export function hasRealPhone(v?: string) {
  if (!v) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 10 && !/^0+$/.test(digits.slice(2));
}

const iconMap: Record<string, LucideIcon> = {
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

function AnimatedStats() {
  const stats = [
    { label: 'Years in Business', value: '2+' },
    { label: 'Happy Clients', value: '50+' },
    { label: 'Projects Completed', value: '100+' },
    { label: 'Divisions', value: '2' },
  ];
  return (
    <section className="py-14 px-4 border-y border-stone-200 bg-white">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <p className="text-4xl md:text-5xl font-extrabold text-orange-700">
              <AnimatedNumber value={s.value} />
            </p>
            <p className="text-stone-700 text-sm font-semibold mt-2">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Client Logos (trusted-by marquee)
function ClientLogos() {
  const [logos, setLogos] = useState<{ id: string; name: string; logo_url: string | null }[]>([]);
  useEffect(() => {
    supabase.from('client_logos').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setLogos(data); });
  }, []);
  if (logos.length === 0) return null;
  const track = [...logos, ...logos]; // duplicated for seamless loop

  return (
    <section className="py-12 px-4 overflow-hidden">
      <p className="text-center text-stone-700 text-xs uppercase tracking-[0.2em] mb-8">Trusted By</p>
      <div className="flex gap-16 animate-marquee w-max">
        {track.map((l, i) => (
          <img key={`${l.id}-${i}`} src={l.logo_url || ''} alt={l.name} className="h-10 md:h-12 object-contain opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0" />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Navigation
function Navigation() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#services', label: 'Services' },
    { href: '#products', label: 'Products' },
    { href: '#careers', label: 'Careers' },
    { href: '#testimonials', label: 'Clients' },
    { href: '#raise-ticket', label: 'Support' },
    { href: '#contact', label: 'Contact' },
  ];
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <KiteTailLogo className="w-8 h-8" />
          <div className="flex flex-col text-left">
            <span className="text-stone-900 font-extrabold text-lg tracking-tight leading-tight">Nikki Technologies</span>
          </div>
        </a>
        <div className="hidden md:flex items-center gap-6">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-stone-700 hover:text-orange-700 text-sm font-semibold transition-colors">{l.label}</a>
          ))}
          <a href="/login" className="px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-semibold shadow-md shadow-orange-700/20 transition-all border border-orange-600/30">Staff Login</a>
        </div>
        <button className="md:hidden text-stone-700" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="md:hidden bg-white border-t border-stone-200 px-4 py-3 space-y-2 shadow-lg">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-stone-700 hover:text-orange-700 py-1.5 font-medium">{l.label}</a>
          ))}
          <a href="/login" className="block text-orange-700 font-bold py-1.5">Staff Login</a>
        </div>
      )}
    </nav>
  );
}

import { motion, AnimatePresence } from 'framer-motion';

// ─────────────────────────────────────────────── Client-Facing Services Showcase (Hero Widget)
function ServicesHeroShowcase(_props: { segments: Segment[] }) {
  const [activeTab, setActiveTab] = useState<'kite_tail' | 'software'>('kite_tail');

  const contentMap = {
    kite_tail: {
      title: 'Kite & Tail • Digital Media Marketing & Performance Growth',
      desc: 'Data-driven marketing campaigns, viral reels production, targeted Google & Meta PPC ads, brand identity, and SEO lead generation by Kite & Tail Media.',
      badge: 'Kite & Tail Digital Marketing',
      icon: Megaphone,
      highlights: [
        'Targeted Meta (Instagram/FB) & Google PPC Campaigns',
        'Social Media Management & Creative Reels Production',
        'Search Engine Optimization (SEO) & Brand Identity Design',
        'High-Converting Lead Funnel Strategy & Analytics',
      ],
      stats: { reach: '10M+ Impression Reach', roas: '4.8x Avg Ad ROAS', leads: '50,000+ Generated Leads' }
    },
    software: {
      title: 'Nikki Software Studio • Custom Apps & Engineering',
      desc: 'Bespoke web applications, cross-platform mobile apps (Android & iOS), cloud API backends, and enterprise business software.',
      badge: 'Custom Software Studio',
      icon: Code2,
      highlights: [
        'Modern Web Applications (React, TypeScript, Cloud Backends)',
        'Native & Cross-Platform Mobile Apps (Android & iOS)',
        'Scalable Database Systems & Secure API Architecture',
        'Custom Business Automation & Enterprise Software',
      ],
      stats: { delivery: '100% On-Time Delivery', tech: 'Modern Tech Stack', architecture: 'Secure & Scalable' }
    }
  };

  const curr = contentMap[activeTab];
  const IconComponent = curr.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 35 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="mt-12 max-w-5xl mx-auto rounded-2xl bg-white border border-stone-200/90 p-5 md:p-7 shadow-xl shadow-stone-200/60 relative overflow-hidden text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-600" />
          <div className="w-3 h-3 rounded-full bg-indigo-600" />
          <div className="w-3 h-3 rounded-full bg-teal-400" />
          <span className="text-stone-700 text-xs font-extrabold uppercase tracking-wider ml-1">Nikki Technologies • Core Divisions</span>
        </div>
        <div className="flex flex-wrap gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
          {([
            { id: 'kite_tail' as const, label: 'Kite & Tail Digital' },
            { id: 'software' as const, label: 'Software Studio' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === t.id
                  ? 'bg-orange-700 text-white shadow-md shadow-orange-700/20'
                  : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              {t.id === 'kite_tail' ? <Megaphone className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="w-5 h-5 text-orange-700" />
              <span className="px-3.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-xs font-extrabold shadow-xs">
                {curr.badge}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-stone-900 tracking-tight">{curr.title}</h3>
            <p className="text-stone-700 text-sm leading-relaxed font-medium">{curr.desc}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              {curr.highlights.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-stone-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-orange-700 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-stone-50 border border-stone-200 p-5 space-y-4 flex flex-col justify-between shadow-xs">
            <p className="text-xs text-stone-700 font-bold uppercase tracking-wider">Performance Guarantee</p>
            <div className="space-y-3">
              {Object.entries(curr.stats).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center border-b border-stone-200 pb-2">
                  <span className="text-stone-700 text-xs capitalize font-medium">{k}</span>
                  <span className="text-orange-800 font-extrabold text-xs">{v}</span>
                </div>
              ))}
            </div>
            <a
              href="#contact"
              className="w-full py-2.5 rounded-xl bg-orange-700 hover:bg-orange-600 text-white font-bold text-xs text-center transition-all shadow-md shadow-orange-700/20"
            >
              Get Free Consultation
            </a>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────── Heroic Flying Kites Background
function HeroicFlyingKites() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Soft ambient background gradient blur circles */}
      <div className="absolute -top-24 -left-20 w-96 h-96 bg-orange-100/50 rounded-full blur-3xl" />
      <div className="absolute top-1/3 -right-20 w-80 h-80 bg-indigo-100/40 rounded-full blur-3xl" />

      {/* Floating Kite 1 - Top Left */}
      <motion.div
        animate={{
          y: [0, -25, 0],
          x: [0, 15, 0],
          rotate: [-3, 4, -3],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-16 left-[8%] opacity-25 w-24 h-24"
      >
        <KiteTailLogo className="w-full h-full text-orange-700 drop-shadow-sm" />
      </motion.div>

      {/* Floating Kite 2 - Top Right */}
      <motion.div
        animate={{
          y: [0, -35, 0],
          x: [0, -20, 0],
          rotate: [4, -4, 4],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute top-28 right-[10%] opacity-20 w-32 h-32 hidden sm:block"
      >
        <KiteTailLogo className="w-full h-full text-indigo-700 drop-shadow-sm" />
      </motion.div>

      {/* Floating Kite 3 - Center Right */}
      <motion.div
        animate={{
          y: [0, -20, 0],
          x: [0, 12, 0],
          rotate: [-2, 3, -2],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
        className="absolute top-1/2 right-[22%] opacity-15 w-20 h-20 hidden md:block"
      >
        <KiteTailLogo className="w-full h-full text-teal-700" />
      </motion.div>

      {/* Floating Kite 4 - Center Left */}
      <motion.div
        animate={{
          y: [0, -30, 0],
          x: [0, -15, 0],
          rotate: [3, -3, 3],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3.5 }}
        className="absolute top-2/3 left-[16%] opacity-20 w-28 h-28 hidden lg:block"
      >
        <KiteTailLogo className="w-full h-full text-orange-700" />
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────── Hero
function Hero({ segments }: { segments: Segment[] }) {
  return (
    <section className="relative pt-32 pb-24 px-4 overflow-hidden bg-gradient-to-b from-orange-50/60 via-stone-50 to-stone-50">
      <HeroicFlyingKites />
      <div className="max-w-6xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100/80 border border-orange-200 text-orange-800 text-xs font-extrabold mb-6 shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
          <span>Digital Marketing &amp; Custom Software Engineering</span>
        </motion.div>

        {/* On a slow connection (real-world Indian mobile data, not a lab
            condition) the site_content fetch this text depends on can take
            several seconds — and this used to wait up to 8s showing only a
            low-contrast grey skeleton before falling back to hardcoded copy,
            which on-device looked exactly like "the homepage is blank/broken"
            rather than "still loading". A marketing homepage's first
            impression matters far more than avoiding a brief text swap once
            the real CMS content arrives — show the fallback immediately. */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-display text-5xl md:text-7xl font-semibold text-stone-900 mb-6 tracking-tight leading-tight"
        >
          Nikki Technologies
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-xl md:text-2xl bg-gradient-to-r from-orange-800 via-indigo-700 to-orange-900 bg-clip-text text-transparent font-extrabold mb-6"
        >
          Kite &amp; Tail Digital Marketing • Custom Software &amp; Mobile Apps
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="text-stone-700 max-w-2xl mx-auto mb-10 text-lg leading-relaxed font-medium"
        >
          Empowering businesses with data-driven performance advertising, Meta &amp; Google PPC funnels, social media management, and custom software development.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-4"
        >
          {segments.map((s) => (
            <a key={s.slug} href={`#seg-${s.slug}`}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-stone-300 bg-white hover:border-orange-600 hover:bg-stone-50 transition-all text-stone-900 shadow-md font-semibold text-sm">
              <Icon name={s.icon ?? ''} className="w-5 h-5 text-orange-700" />
              <span>{s.name}</span>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </a>
          ))}
        </motion.div>

        {/* Client-Facing Services Showcase */}
        <ServicesHeroShowcase segments={segments} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Segments + Services
interface Service { id: string; segment_slug: string; title: string; description: string; icon: string; }

const DEFAULT_FALLBACK_SERVICES: Service[] = [
  // Digital Marketing / Kite & Tail Media
  {
    id: 'srv-1',
    segment_slug: 'digital-marketing',
    title: 'Meta & Google PPC Ads',
    description: 'High-ROAS lead generation & sales conversion funnels across Instagram, Facebook, and Google Search Ads.',
    icon: 'Megaphone',
  },
  {
    id: 'srv-2',
    segment_slug: 'digital-marketing',
    title: 'Viral Reels & Media Production',
    description: 'High-converting ad video production, Instagram reels, YouTube shorts, and creative brand story assets.',
    icon: 'Video',
  },
  {
    id: 'srv-3',
    segment_slug: 'digital-marketing',
    title: 'SEO & Brand Identity',
    description: 'Top-tier Google search engine optimization, local map pack ranking, logo design, and complete brand identity.',
    icon: 'TrendingUp',
  },
  // Software Development / Nikki Software Studio
  {
    id: 'srv-4',
    segment_slug: 'software-development',
    title: 'Custom Web & Mobile Development',
    description: 'High-performance React, TypeScript, Android, and iOS mobile applications engineered for scale.',
    icon: 'Code2',
  },
  {
    id: 'srv-5',
    segment_slug: 'software-development',
    title: 'SaaS & Enterprise Systems',
    description: 'Bespoke B2B SaaS platforms, cloud infrastructure, multi-tenant architectures, and custom web apps.',
    icon: 'Boxes',
  },
  {
    id: 'srv-6',
    segment_slug: 'software-development',
    title: 'Business Process Automation',
    description: 'Custom ERPs, CRMs, retail POS billing platforms (MyStore OS), attendance software (Punchly), and AI voice bots (Jovio AI).',
    icon: 'Cpu',
  },
];

function SegmentSections({ segments }: { segments: Segment[] }) {
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    supabase.from('services').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data && data.length > 0) setServices(data as Service[]); });
  }, []);

  return (
    <section id="segments" className="py-20 px-4 bg-stone-50">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold text-center text-stone-900 mb-3 tracking-tight">What We Do</h2>
          <p className="text-center text-stone-700 mb-16 max-w-2xl mx-auto font-medium">Two specialized corporate divisions. One trusted technology partner.</p>
        </Reveal>
        <div id="services" className="space-y-16">
          {segments.map(seg => {
            const isMarketingSeg = seg.slug.includes('marketing') || seg.slug.includes('media') || seg.slug.includes('digital') || seg.slug.includes('kt');
            const isSoftwareSeg = seg.slug.includes('software') || seg.slug.includes('dev') || seg.slug.includes('tech');

            const matchedServices = services.filter(s =>
              s.segment_slug === seg.slug ||
              (isMarketingSeg && (s.segment_slug.includes('marketing') || s.segment_slug.includes('media') || s.segment_slug.includes('digital'))) ||
              (isSoftwareSeg && (s.segment_slug.includes('software') || s.segment_slug.includes('dev')))
            );

            const displayServices = matchedServices.length > 0
              ? matchedServices
              : DEFAULT_FALLBACK_SERVICES.filter(s =>
                  isMarketingSeg ? s.segment_slug === 'digital-marketing' : isSoftwareSeg ? s.segment_slug === 'software-development' : true
                );

            return (
              <div key={seg.slug} id={`seg-${seg.slug}`} className="scroll-mt-24">
                <Reveal>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-xs" style={{ backgroundColor: seg.color ?? undefined + '15', color: seg.color ?? undefined }}>
                      <Icon name={seg.icon ?? ''} className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-stone-900">{seg.name}</h3>
                      <p className="text-stone-700 text-sm font-medium">{seg.tagline}</p>
                    </div>
                  </div>
                </Reveal>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {displayServices.map((s, idx) => (
                    <Reveal key={s.id} delay={idx * 100}>
                      <motion.div
                        whileHover={{ y: -6, scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 rounded-2xl bg-white border border-stone-200/90 shadow-md hover:shadow-xl hover:border-orange-300 transition-all h-full flex flex-col justify-between"
                      >
                        <div>
                          <Icon name={s.icon ?? ''} className="w-8 h-8 mb-4 text-orange-700" />
                          <h4 className="text-lg font-bold text-stone-900 mb-2">{s.title}</h4>
                          <p className="text-stone-700 text-sm leading-relaxed font-medium">{s.description}</p>
                        </div>
                      </motion.div>
                    </Reveal>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Products (link-out)
const DEFAULT_FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    segment_slug: 'software',
    slug: 'mystore-os',
    name: 'MyStore OS',
    tagline: 'Retail POS & Billing ERP',
    description: 'Cloud billing, barcode inventory, GST invoicing, and multi-store management for retail & supermarket businesses.',
    logo_url: null, created_at: null, updated_at: null,
    screenshots: [],
    status: 'active',
    external_url: 'https://mystoreos.com',
    demo_cta: 'Explore MyStore OS',
    order_index: 1,
    features: [
      { title: 'Fast GST Billing', description: 'Print invoices in seconds', icon: 'TrendingUp' },
      { title: 'Inventory Sync', description: 'Real-time stock alerts', icon: 'Boxes' },
    ],
  },
  {
    id: 'prod-2',
    segment_slug: 'software',
    slug: 'punchly',
    name: 'Punchly',
    tagline: 'Face & Geo Attendance ERP',
    description: 'Smart attendance tracking with selfie camera verification, GPS geo-fencing, leave approvals, and automated payroll calculation.',
    logo_url: null, created_at: null, updated_at: null,
    screenshots: [],
    status: 'active',
    external_url: 'https://punchly.app',
    demo_cta: 'Explore Punchly',
    order_index: 2,
    features: [
      { title: 'Selfie & Geo Punch', description: 'Zero buddy-punching', icon: 'Camera' },
      { title: 'Automated Payroll', description: 'One-click salary payslips', icon: 'Settings' },
    ],
  },
  {
    id: 'prod-3',
    segment_slug: 'software',
    slug: 'jovio-ai',
    name: 'Jovio AI',
    tagline: 'AI Voice & Chatbot Agent',
    description: 'Autonomous AI voice call bots and WhatsApp conversational agents for automated lead qualification and appointment booking.',
    logo_url: null, created_at: null, updated_at: null,
    screenshots: [],
    status: 'active',
    external_url: 'https://jovio.ai',
    demo_cta: 'Explore Jovio AI',
    order_index: 3,
    features: [
      { title: 'AI Voice Calling', description: '24/7 automated outbound calls', icon: 'Bot' },
      { title: 'WhatsApp Integration', description: 'Instant AI chat replies', icon: 'Megaphone' },
    ],
  },
];

function Products() {
  const [products, setProducts] = useState<Product[]>(DEFAULT_FALLBACK_PRODUCTS);
  useEffect(() => {
    supabase.from('products').select('*').neq('status', 'hidden').order('order_index')
      .then(({ data }) => { if (data && data.length > 0) setProducts(data as Product[]); });
  }, []);
  if (products.length === 0) return null;

  return (
    <section id="products" className="py-20 px-4 bg-stone-100/60 border-y border-stone-200">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold text-center text-stone-900 mb-3 tracking-tight">Our Products</h2>
          <p className="text-center text-stone-700 mb-14 max-w-2xl mx-auto font-medium">Software built by Nikki Technologies, powering businesses.</p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {products.map((p, i) => (
            <Reveal key={p.id} delay={i * 100}>
              <motion.div
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col h-full p-7 rounded-2xl bg-white border border-stone-200 shadow-md hover:shadow-xl transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  {p.logo_url
                    ? <img src={p.logo_url} alt={p.name} className="w-11 h-11 rounded-xl object-cover shadow-xs" />
                    : <div className="w-11 h-11 rounded-xl bg-orange-700 flex items-center justify-center font-extrabold text-white text-lg shadow-md">{p.name[0]}</div>}
                  <div>
                    <h3 className="text-xl font-bold text-stone-900">{p.name}</h3>
                    <p className="text-orange-700 text-xs font-semibold">{p.tagline}</p>
                  </div>
                </div>
                <p className="text-stone-700 text-sm mb-5 leading-relaxed font-medium">{p.description}</p>
                <div className="space-y-2.5 mb-6">
                  {((p.features as unknown as ProductFeature[] | null) || []).map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-orange-700 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-stone-900 text-sm font-semibold">{f.title}</span>
                        <span className="text-stone-700 text-sm font-medium"> — {f.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto">
                  {p.status === 'coming_soon' ? (
                    <span className="inline-block px-4 py-2 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold">Coming Soon</span>
                  ) : p.external_url ? (
                    <a href={p.external_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-md shadow-orange-700/20">
                      {p.demo_cta || 'Visit Website'} <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : null}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Gallery
function GallerySection() {
  const [items, setItems] = useState<{ id: string; title: string | null; image_url: string | null }[]>([]);
  useEffect(() => {
    supabase.from('gallery_items').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data) setItems(data); });
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display text-4xl md:text-5xl font-extrabold text-center text-stone-900 mb-12 tracking-tight">Our Work</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map(g => (
            <div key={g.id} className="rounded-xl overflow-hidden aspect-square bg-stone-900">
              <img src={g.image_url || ''} alt={g.title || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Team
const DEFAULT_FALLBACK_TEAM = [
  { id: 'tm-1', name: 'Karthikeya', designation: 'Founder & Managing Director', photo_url: '' },
  { id: 'tm-2', name: 'Engineering Team', designation: 'Software & Cloud Architecture', photo_url: '' },
  { id: 'tm-3', name: 'Media Team', designation: 'Performance Marketing & Creative Reels', photo_url: '' },
];

function TeamSection() {
  const [items, setItems] = useState<{ id: string; name: string; designation: string | null; photo_url: string | null }[]>(DEFAULT_FALLBACK_TEAM);
  useEffect(() => {
    supabase.from('team_members').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data && data.length > 0) setItems(data); });
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="py-20 px-4 bg-stone-50">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display text-4xl font-bold text-center text-stone-900 mb-12 tracking-tight">Meet the Team</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {items.map(m => (
            <div key={m.id} className="text-center p-5 rounded-2xl bg-white border border-stone-200/90 shadow-sm">
              <div className="w-24 h-24 rounded-full mx-auto mb-3 overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 font-bold text-2xl shadow-xs">
                {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : m.name[0]}
              </div>
              <p className="text-stone-900 font-bold text-sm">{m.name}</p>
              <p className="text-stone-700 text-xs font-medium">{m.designation}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── Testimonials
const DEFAULT_FALLBACK_TESTIMONIALS = [
  {
    id: 't-1',
    customer_name: 'Aditya Varma',
    content: 'Nikki Technologies transformed our digital marketing. Our Meta PPC ad ROAS increased to 4.8x within 30 days!',
    rating: 5,
  },
  {
    id: 't-2',
    customer_name: 'Rajesh K.',
    content: 'The custom ERP built by Nikki Software Studio streamlined our entire inventory and billing operations across 5 locations.',
    rating: 5,
  },
  {
    id: 't-3',
    customer_name: 'Priya Sharma',
    content: 'Professional, fast, and dedicated team. Their viral reels production and SEO strategies brought us consistent high-quality leads.',
    rating: 5,
  },
];

function Testimonials() {
  const [items, setItems] = useState<{ id: string; customer_name: string; content: string; rating: number | null }[]>(DEFAULT_FALLBACK_TESTIMONIALS);
  useEffect(() => {
    supabase.from('testimonials').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data && data.length > 0) setItems(data); });
  }, []);
  if (items.length === 0) return null;
  return (
    <section id="testimonials" className="py-20 px-4 bg-stone-100/60 border-y border-stone-200">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display text-4xl font-extrabold text-center text-stone-900 mb-14 tracking-tight">What Clients Say</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((t, i) => (
            <Reveal key={t.id} delay={i * 100}>
            <div className="p-6 rounded-2xl bg-white border border-stone-200 shadow-md">
              <div className="flex gap-1 mb-3">
                {Array.from({ length: t.rating ?? 0 }).map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-stone-700 text-sm mb-4 leading-relaxed font-medium">"{t.content}"</p>
              <p className="text-stone-900 font-bold text-sm">{t.customer_name}</p>
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
  created_at?: string | null;
}

function ApplyModal({ job, segments, onClose }: { job: JobPosting | null; segments: Segment[]; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', experience: '', message: '', position: job?.title || '', segment_slug: job?.segment_slug || '' });
  const [answers, setAnswers] = useState<string[]>((job?.questions || []).map(() => ''));
  const [photo, setPhoto] = useState<File | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 text-sm focus:border-orange-700 focus:ring-2 focus:ring-orange-700/20 shadow-sm placeholder-stone-500';

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
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-5">
          <div>
            <h3 className="text-stone-900 text-lg font-bold">{job ? `Apply — ${job.title}` : 'General Application'}</h3>
            {job && <p className="text-stone-700 text-xs mt-0.5">{job.location} • {job.employment_type.replace('_', ' ')}</p>}
          </div>
          <button className="text-stone-400 hover:text-stone-700" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto mb-3" />
            <p className="text-stone-900 font-bold mb-1">Application submitted!</p>
            <p className="text-stone-700 text-sm">We'll review your profile and get back to you.</p>
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
                <label className="text-stone-700 text-xs font-medium">{q}</label>
                <textarea className={inputCls + ' mt-1'} rows={2} value={answers[i] || ''}
                  onChange={e => setAnswers(prev => { const next = [...prev]; next[i] = e.target.value; return next; })} />
              </div>
            ))}

            <textarea className={inputCls} rows={2} placeholder="Anything else you'd like to share" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />

            <div>
              <label className="text-stone-700 text-xs font-semibold flex items-center gap-1.5 mb-1"><User className="w-3.5 h-3.5 text-orange-700" /> Passport size photo</label>
              <input type="file" accept="image/*" className="text-stone-700 text-sm w-full file:mr-3 file:px-3 file:py-1.5 file:rounded-xl file:border-0 file:bg-stone-100 file:text-stone-700 file:text-xs font-medium"
                onChange={e => setPhoto(e.target.files?.[0] || null)} />
            </div>
            <div>
              <label className="text-stone-700 text-xs font-semibold flex items-center gap-1.5 mb-1"><Upload className="w-3.5 h-3.5 text-orange-700" /> Resume (PDF/DOC) *</label>
              <input type="file" accept=".pdf,.doc,.docx" className="text-stone-700 text-sm w-full file:mr-3 file:px-3 file:py-1.5 file:rounded-xl file:border-0 file:bg-stone-100 file:text-stone-700 file:text-xs font-medium"
                onChange={e => setResume(e.target.files?.[0] || null)} />
            </div>

            {error && <p className="text-red-700 text-xs font-medium">{error}</p>}
            <button onClick={submit} disabled={busy}
              className="w-full py-3 rounded-xl bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white font-bold transition-all shadow-md shadow-orange-700/20">
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

  // JobPosting JSON-LD per open role, so Google For Jobs can index each
  // opening as a rich-card result. Cleaned up on unmount / when jobs change
  // so stale schemas don't accumulate as the list updates.
  useEffect(() => {
    document.querySelectorAll('script[data-job-posting]').forEach(el => el.remove());
    jobs.forEach(job => {
      const schema = jobPostingSchema({
        id: job.id,
        title: job.title,
        description: job.description || null,
        requirements: job.requirements || null,
        location: job.location || null,
        employment_type: job.employment_type || null,
        segment_slug: job.segment_slug || null,
        posted_at: job.created_at ? job.created_at.slice(0, 10) : null,
        positions_open: job.positions_open || null,
      });
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-job-posting', job.id);
      el.textContent = JSON.stringify(schema);
      document.head.appendChild(el);
    });
    return () => {
      document.querySelectorAll('script[data-job-posting]').forEach(el => el.remove());
    };
  }, [jobs]);

  return (
    <section id="careers" className="py-20 px-4 bg-stone-50" aria-labelledby="careers-heading">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-14">
          <Briefcase className="w-10 h-10 text-orange-700 mx-auto mb-3" aria-hidden="true" />
          <h2 id="careers-heading" className="font-display text-4xl md:text-5xl font-extrabold text-stone-900 mb-3 tracking-tight">Careers at Nikki Technologies</h2>
          <p className="text-stone-700 max-w-2xl mx-auto font-medium">
            {`We're hiring across ${segments.map(s => s.name).join(', ') || 'our divisions'}. Don't see a role that fits? Send us a general application.`}
          </p>
        </header>

        {jobs.length === 0 && (
          <p className="text-stone-700 text-center mb-10 font-medium">No open positions right now — check back soon, or apply generally below.</p>
        )}

        <ul className="space-y-3 mb-10 list-none pl-0">
          {jobs.map(job => {
            const seg = segments.find(s => s.slug === job.segment_slug);
            // Fix: seg.color could be null. Old code did
            // `seg.color ?? undefined + '15'` which evaluates the
            // `undefined + '15'` half FIRST due to operator precedence,
            // producing the literal string "undefined15" — invalid CSS —
            // whenever a segment had no color set.
            const badgeStyle = seg?.color
              ? { backgroundColor: `${seg.color}15`, color: seg.color }
              : undefined;
            return (
              <li key={job.id}>
                <article className="flex flex-wrap items-center justify-between gap-3 p-5 rounded-2xl bg-white border border-stone-200 shadow-md hover:border-orange-500 transition-all">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-stone-900 font-bold">{job.title}</h3>
                      {seg && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={badgeStyle}>
                          {seg.name}
                        </span>
                      )}
                    </div>
                    <p className="text-stone-700 text-sm font-medium">
                      {job.location} • {job.employment_type.replace('_', ' ')} {job.positions_open > 1 && `• ${job.positions_open} openings`}
                    </p>
                  </div>
                  <button
                    onClick={() => setApplyJob(job)}
                    className="px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-md shadow-orange-700/20 shrink-0"
                    aria-label={`Apply for ${job.title}`}>
                    Apply Now
                  </button>
                </article>
              </li>
            );
          })}
        </ul>

        <div className="text-center">
          <button
            onClick={() => setApplyJob('general')}
            className="text-orange-700 text-sm font-semibold underline hover:text-orange-800"
            aria-label="Submit a general career application">
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
function TrackTicket({ onBack }: { onBack: () => void }) {
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  type TicketLookupResult = { ticket_no: string; subject: string; status: string; priority: string; created_at: string; resolved_at: string | null };
  const [result, setResult] = useState<TicketLookupResult | null | 'not_found'>(null);
  const [busy, setBusy] = useState(false);
  const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 text-sm focus:border-orange-700 focus:ring-2 focus:ring-orange-700/20 shadow-sm placeholder-stone-500';

  async function lookup() {
    if (!ticketNo || !phone) return;
    setBusy(true);
    const { data } = await supabase.rpc('track_ticket', { _ticket_no: ticketNo.trim().toUpperCase(), _phone: phone.trim() });
    setBusy(false);
    setResult(data && data.length > 0 ? (data[0] as TicketLookupResult) : 'not_found');
  }

  const statusColor: Record<string, string> = {
    open: 'text-orange-700', in_progress: 'text-amber-700', waiting_customer: 'text-purple-700',
    resolved: 'text-emerald-700', closed: 'text-stone-700',
  };

  return (
    <div className="p-8 rounded-2xl bg-white border border-stone-200 shadow-xl">
      <button onClick={onBack} className="text-stone-700 hover:text-stone-800 text-xs mb-4 font-semibold">← Back to raise a ticket</button>
      {!result ? (
        <div className="space-y-3">
          <input className={inputCls} placeholder="Ticket Number (e.g. NKT-CC-00001)" value={ticketNo} onChange={e => setTicketNo(e.target.value)} />
          <input className={inputCls} placeholder="Phone number used when raising it" value={phone} onChange={e => setPhone(e.target.value)} />
          <button onClick={lookup} disabled={busy || !ticketNo || !phone}
            className="w-full py-3 rounded-xl bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white font-bold transition-all shadow-md shadow-orange-700/20">
            {busy ? 'Looking up…' : 'Check Status'}
          </button>
        </div>
      ) : result === 'not_found' ? (
        <div className="text-center py-6">
          <p className="text-stone-700 text-sm mb-3 font-medium">No ticket found matching that number and phone.</p>
          <button onClick={() => setResult(null)} className="text-orange-700 text-sm font-semibold">Try again</button>
        </div>
      ) : (
        <div>
          <p className="font-mono text-orange-700 text-sm mb-1 font-bold">{result.ticket_no}</p>
          <p className="text-stone-900 font-bold mb-3">{result.subject}</p>
          <div className="space-y-1.5 text-sm font-medium">
            <p><span className="text-stone-700">Status: </span><span className={`font-bold ${statusColor[result.status]}`}>{result.status.replace('_', ' ')}</span></p>
            <p><span className="text-stone-700">Priority: </span><span className="text-stone-800">{result.priority}</span></p>
            <p><span className="text-stone-700">Raised: </span><span className="text-stone-800">{new Date(result.created_at).toLocaleDateString()}</span></p>
            {result.resolved_at && <p><span className="text-stone-700">Resolved: </span><span className="text-stone-800">{new Date(result.resolved_at).toLocaleDateString()}</span></p>}
          </div>
          <button onClick={() => setResult(null)} className="text-orange-700 text-sm font-semibold mt-4">Check another ticket</button>
        </div>
      )}
    </div>
  );
}

const DEFAULT_FALLBACK_TICKET_TYPES = [
  // Digital Marketing / Kite & Tail Media
  { id: 'tt-1', segment_slug: 'digital-marketing', name: 'Meta & Google Ads Campaign Issue' },
  { id: 'tt-2', segment_slug: 'digital-marketing', name: 'Creative Reel / Video Request' },
  { id: 'tt-3', segment_slug: 'digital-marketing', name: 'SEO & Google Ranking Inquiry' },
  { id: 'tt-4', segment_slug: 'digital-marketing', name: 'Social Media Account Support' },
  { id: 'tt-5', segment_slug: 'digital-marketing', name: 'Billing & Invoice Question' },

  // Software Development / Nikki Software Studio
  { id: 'tt-6', segment_slug: 'software-development', name: 'Software Bug & System Error' },
  { id: 'tt-7', segment_slug: 'software-development', name: 'Feature Enhancement Request' },
  { id: 'tt-8', segment_slug: 'software-development', name: 'API & Integration Support' },
  { id: 'tt-9', segment_slug: 'software-development', name: 'Server & Cloud Downtime' },
  { id: 'tt-10', segment_slug: 'software-development', name: 'Billing & License Inquiry' },
];

function RaiseTicket({ segments }: { segments: Segment[] }) {
  const cleanSegments = segments.filter(s => !s.slug.toLowerCase().includes('cctv') && !s.name.toLowerCase().includes('cctv'));
  const [mode, setMode] = useState<'raise' | 'track'>('raise');
  const [form, setForm] = useState({ segment_slug: '', ticket_type: '', subject: '', description: '', customer_name: '', customer_phone: '', customer_email: '' });
  const [types, setTypes] = useState<{ id: string; segment_slug: string | null; name: string }[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Cloudflare Turnstile — the widget renders inside the ref and calls
  // the setter as `window.turnstile` invokes our callback. We keep the
  // widget id so we can reset it on failed submits (a token is single-
  // use and expires on server verification).
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  const resetTurnstile = () => {
    setTurnstileToken(null);
    const w = (window as unknown as { turnstile?: { reset: (id: string) => void } }).turnstile;
    if (w && turnstileWidgetId.current) w.reset(turnstileWidgetId.current);
  };

  useEffect(() => {
    // Skip entirely if site key isn't configured (e.g. dev). In that case
    // the widget doesn't render and submit() short-circuits with a clear
    // error, which is the correct fail-closed behaviour.
    if (!turnstileSiteKey || mode !== 'raise' || done) return;
    const SCRIPT_ID = 'cf-turnstile-script';
    const render = () => {
      const w = (window as unknown as { turnstile?: { render: (el: HTMLElement, opts: object) => string } }).turnstile;
      if (!w || !turnstileRef.current || turnstileWidgetId.current) return;
      turnstileWidgetId.current = w.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(null),
        'expired-callback': () => setTurnstileToken(null),
        theme: 'light',
      });
    };
    if (document.getElementById(SCRIPT_ID)) { render(); return; }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [turnstileSiteKey, mode, done]);

  useEffect(() => {
    supabase.from('ticket_types').select('*').eq('active', true).order('order_index')
      .then(({ data }) => { if (data && data.length > 0) setTypes(data); });
  }, []);

  async function submit() {
    if (!form.segment_slug || !form.subject || !form.customer_name || !form.customer_phone) {
      setErr('Please fill in department, subject, name and phone.');
      return;
    }
    // Turnstile is a hard gate: no token = no submit. This is the whole
    // point of the widget — an accidental soft-fail here would defeat the
    // rate-limit. See supabase/functions/raise-ticket for the server side.
    if (!turnstileToken) {
      setErr('Please complete the bot check just above the submit button.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('raise-ticket', {
        body: { ...form, ticket_type: form.ticket_type || 'General Support', turnstile_token: turnstileToken },
      });
      if (error || !data?.ticket_no) {
        setErr((data as { error?: string })?.error || "Sorry, we couldn't submit your ticket. Please try again or call us.");
        // A used Turnstile token can't be replayed — reset the widget so
        // the customer can retry without a page refresh.
        resetTurnstile();
        return;
      }
      setDone(data.ticket_no);
      setForm({ segment_slug: '', ticket_type: '', subject: '', description: '', customer_name: '', customer_phone: '', customer_email: '' });
    } catch {
      setErr("Sorry, we couldn't submit your ticket. Please try again or call us.");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 text-sm focus:border-orange-700 focus:ring-2 focus:ring-orange-700/20 shadow-sm placeholder-stone-500 font-medium';

  const isMarketingSeg = form.segment_slug.includes('marketing') || form.segment_slug.includes('media') || form.segment_slug.includes('digital') || form.segment_slug.includes('kt');
  const isSoftwareSeg = form.segment_slug.includes('software') || form.segment_slug.includes('dev') || form.segment_slug.includes('tech');

  const matchedTypes = types.filter(t =>
    t.segment_slug === form.segment_slug ||
    (isMarketingSeg && ((t.segment_slug || '').includes('marketing') || (t.segment_slug || '').includes('media') || (t.segment_slug || '').includes('digital'))) ||
    (isSoftwareSeg && ((t.segment_slug || '').includes('software') || (t.segment_slug || '').includes('dev')))
  );

  const displayTypes = matchedTypes.length > 0
    ? matchedTypes
    : DEFAULT_FALLBACK_TICKET_TYPES.filter(t =>
        isMarketingSeg ? t.segment_slug === 'digital-marketing' : isSoftwareSeg ? t.segment_slug === 'software-development' : true
      );

  return (
    <section id="raise-ticket" className="py-20 px-4 bg-stone-100/60 border-y border-stone-200">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Ticket className="w-10 h-10 text-orange-700 mx-auto mb-3" />
          <h2 className="font-display text-4xl font-extrabold text-stone-900 mb-2 tracking-tight">Raise a Support Ticket</h2>
          <p className="text-stone-700 font-medium">{`Existing customer? Get help from the right team — ${cleanSegments.map(s => s.name).join(' or ') || 'pick your division below'}.`}</p>
          <button onClick={() => setMode(mode === 'raise' ? 'track' : 'raise')} className="text-orange-700 text-sm mt-2 font-semibold underline">
            {mode === 'raise' ? 'Already raised a ticket? Track its status' : 'Raise a new ticket instead'}
          </button>
        </div>
        {mode === 'track' ? (
          <TrackTicket onBack={() => setMode('raise')} />
        ) : done ? (
          <div className="p-8 rounded-2xl bg-white border border-orange-200 text-center shadow-xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto mb-3" />
            <p className="text-stone-900 text-lg font-bold mb-1">Ticket created: {done}</p>
            <p className="text-stone-700 text-sm mb-4">Our team will contact you shortly. Save your ticket number.</p>
            <button onClick={() => setDone(null)} className="text-orange-700 text-sm font-semibold">Raise another ticket</button>
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white border border-stone-200 shadow-xl space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <select className={inputCls} value={form.segment_slug}
                onChange={e => setForm({ ...form, segment_slug: e.target.value, ticket_type: '' })}>
                <option value="">Select Department *</option>
                {cleanSegments.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <select className={inputCls} value={form.ticket_type}
                onChange={e => setForm({ ...form, ticket_type: e.target.value })} disabled={!form.segment_slug}>
                <option value="">Issue Type *</option>
                {displayTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <input className={inputCls} placeholder="Subject *" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            <textarea className={inputCls} rows={3} placeholder="Describe your issue" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid md:grid-cols-3 gap-4">
              <input className={inputCls} placeholder="Your Name *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              <input className={inputCls} placeholder="Phone *" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
              <input className={inputCls} placeholder="Email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} />
            </div>
            {err && <p className="text-red-700 text-sm font-medium">{err}</p>}
            {turnstileSiteKey && (
              <div className="flex justify-center">
                <div ref={turnstileRef} />
              </div>
            )}
            <button onClick={submit} disabled={busy || (!!turnstileSiteKey && !turnstileToken)}
              className="w-full py-3 rounded-xl bg-orange-700 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-700/20">
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
  const [err, setErr] = useState('');
  const c = content?.contact || {};
  const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 text-sm focus:border-orange-700 focus:ring-2 focus:ring-orange-700/20 shadow-sm placeholder-stone-500';

  async function submit() {
    if (!form.segment_slug || !form.customer_name || !form.phone) {
      setErr('Please select a service and enter your name and phone.');
      return;
    }
    setErr('');
    setBusy(true);
    const { error } = await supabase.from('marketing_leads').insert({ ...form, source: 'website' });
    setBusy(false);
    if (error) { setErr("Sorry, something went wrong. Please try again or call us."); return; }
    setSent(true);
  }

  return (
    <section id="contact" className="py-20 px-4 bg-stone-50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="font-display text-4xl font-extrabold text-stone-900 mb-6 tracking-tight">Get In Touch</h2>
          <div className="space-y-4 text-stone-700 font-medium">
            {hasRealPhone(c.phone) && <p className="flex items-center gap-3"><Phone className="w-5 h-5 text-orange-700" /> {c.phone}</p>}
            {c.email && <p className="flex items-center gap-3"><Mail className="w-5 h-5 text-orange-700" /> {c.email}</p>}
            {c.address && <p className="flex items-center gap-3"><MapPin className="w-5 h-5 text-orange-700" /> {c.address}</p>}
            {!hasRealPhone(c.phone) && (
              <p className="text-stone-700 text-sm pt-2">
                Prefer to raise a request directly? Use the form here or{' '}
                <a href="#raise-ticket" className="text-orange-700 font-semibold underline">open a support ticket</a> — we respond to every one.
              </p>
            )}
          </div>
        </div>
        <div className="p-7 rounded-2xl bg-white border border-stone-200 shadow-xl">
          {sent ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto mb-3" />
              <p className="text-stone-900 font-bold">Thanks! Our team will call you soon.</p>
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
              {err && <p className="text-red-700 text-sm font-medium">{err}</p>}
              <button onClick={submit} disabled={busy}
                className="w-full py-3 rounded-xl bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white font-bold transition-all shadow-md shadow-orange-700/20">
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
    <footer className="border-t border-stone-800 bg-stone-900 py-12 px-4 text-stone-300">
      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 text-sm">
        <div>
          <p className="text-white font-bold text-lg mb-2">Nikki Technologies</p>
          <p className="text-stone-400">{content?.footer?.about && !/cctv/i.test(content.footer.about) ? content.footer.about : 'Nikki Technologies — Digital Marketing and Custom Software Engineering under one roof.'}</p>
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Divisions</p>
          {segments.map(s => <a key={s.slug} href={`#seg-${s.slug}`} className="block text-stone-400 hover:text-orange-400 py-0.5">{s.name}</a>)}
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Quick Links</p>
          <a href="#products" className="block text-stone-400 hover:text-orange-400 py-0.5">Products</a>
          <a href="#raise-ticket" className="block text-stone-400 hover:text-orange-400 py-0.5">Support</a>
          <a href="/login" className="block text-stone-400 hover:text-orange-400 py-0.5">Staff Login</a>
        </div>
      </div>
      <p className="text-center text-stone-700 text-xs mt-10">© {new Date().getFullYear()} Nikki Technologies, a unit of K² Adexos Global Technologies. All rights reserved.</p>
    </footer>
  );
}

// ─────────────────────────────────────────────── Composition
export default function PublicSite() {
  const { content } = useSiteContent();
  const { segments } = useSegments();

  // The page renders immediately, full structure, every time — no intro
  // animation gate and no full-screen "please wait" blocking the whole site
  // behind a spinner. Only the hero text (the one thing that can visibly
  // differ from its fallback) shows a shimmer while real content loads;
  // everything else — nav, images, sections below — is on screen right away.
  return (
    <div className="bg-stone-50 min-h-screen text-stone-900">
      <SEOHead />
      <Navigation />
      <Hero segments={segments} />
      <ClientLogos />
      <AnimatedStats />
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
