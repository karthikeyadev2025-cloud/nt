import { useState } from 'react';
import {
  BookOpen, UserPlus, GitBranch, PhoneCall, MousePointerClick, LayoutGrid,
  CalendarClock, Repeat, ListChecks, Bell, MessageCircle, Download,
  Combine, ArrowLeftRight, Upload, Users, History, ShieldCheck,
  Layers, Megaphone, Code2, MessagesSquare, CreditCard, PenLine, Clock, Ticket,
  type LucideIcon,
} from 'lucide-react';
import { cardCls } from './shared';
import { useAuth } from '../../contexts/AuthContext';

type Section = { id: string; label: string; icon: LucideIcon; body: React.ReactNode };

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p className="text-sm text-stone-800 mb-2">
      <span className="font-bold text-stone-900">{name}: </span>{children}
    </p>
  );
}
function Step({ n, title, children }: { n: number; title?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 mb-2.5">
      <span className="shrink-0 w-6 h-6 rounded-full bg-teal-700 text-white text-xs font-bold flex items-center justify-center">{n}</span>
      <p className="text-sm text-stone-800 pt-0.5">{title && <span className="font-bold text-stone-900">{title} — </span>}{children}</p>
    </div>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-amber-400 bg-amber-50 pl-3 py-2 my-3 rounded-r-lg">
      <p className="text-xs text-amber-800 italic"><span className="font-bold not-italic">Note: </span>{children}</p>
    </div>
  );
}
function Bul({ children }: { children: React.ReactNode }) {
  return <li className="text-sm text-stone-800 mb-1.5">{children}</li>;
}
function Script({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-teal-500 bg-stone-50 pl-3 py-2 my-2 rounded-r-lg">
      <p className="text-sm text-stone-800 italic">"{children}"</p>
    </div>
  );
}
function ScriptLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-teal-700 text-xs font-bold uppercase tracking-wide mt-3 mb-1">{children}</p>;
}

type Role = 'telecaller' | 'marketing_executive' | 'manager' | 'super_admin' | string;

const ROLE_LABEL: Record<string, string> = {
  telecaller: 'Telecaller', marketing_executive: 'Marketing Executive',
  manager: 'Manager', super_admin: 'Super Admin',
};
const ROLE_DESC: Record<string, string> = {
  telecaller: 'You work leads over the phone. You have a Call Queue, can add leads, log call outcomes, book appointments, and hand appointments to a Marketing Executive for a visit.',
  marketing_executive: 'You visit leads in the field. You have a field-visit queue with photo and GPS capture, log visit outcomes, and close deals.',
  manager: 'You see every lead in your segment(s), assign and reassign leads, approve transfers, and review team performance.',
  super_admin: 'You see everything across every segment, and manage roles, permissions, and every setting in the system.',
};

function buildAddLeadSteps(role: Role) {
  const isField = role === 'marketing_executive';
  const isManagerish = role === 'manager' || role === 'super_admin';
  let n = 0;
  const next = () => ++n;
  const steps: React.ReactNode[] = [];
  steps.push(<Step key="open" n={next()} title="Open the form">Tap "+ Add Lead" from wherever you're working.</Step>);
  steps.push(<Step key="name" n={next()} title="Customer's name">Required — how the lead is identified everywhere. If it's missing when you tap Save, the field turns red with a message right under it.</Step>);
  steps.push(<Step key="phone" n={next()} title="Phone number">As you finish a 10-digit number, the system checks for an existing lead with that number in the same segment. If found, you'll see a warning with the existing lead's name, stage, and owner — you can still "Add Anyway" if it's genuinely different.</Step>);
  steps.push(<Step key="altphone" n={next()} title="Alternate phone (optional)">Tap "+ Add alternate number" if they gave a second number.</Step>);
  steps.push(<Step key="email" n={next()} title="Email (optional)">If they gave one.</Step>);
  steps.push(<Step key="segment" n={next()} title="Segment">Digital Media or Software Solutions. Required (turns red if left blank) — pre-filled if you only work one segment.</Step>);
  steps.push(<Step key="source" n={next()} title="Source">Where this lead came from: field, telecall, referral, whatsapp, website, or other.</Step>);
  steps.push(<Step key="interested" n={next()} title="Interested In">A short line, e.g. "MyStore OS billing setup" or "Instagram ads package".</Step>);
  steps.push(<Step key="address" n={next()} title="Address">Type it directly.{isField ? ' Capturing GPS (next step) also fills this in automatically, but you can still edit it by hand.' : ''}</Step>);
  steps.push(<Step key="photos" n={next()} title="Photos (optional)">Tap "Add photo" for a picture of the customer, shop, or site — you can add more than one, each shown as its own removable thumbnail.</Step>);
  if (isField) {
    steps.push(<Step key="gps" n={next()} title="Location">Tap "Add location" to capture GPS + address. If permission was already granted before, this happens silently in the background.</Step>);
    steps.push(<Step key="card" n={next()} title="Scan a business card">Photograph a card and the system reads off the name, phone, and email for you to review — tap "Use this" to fill the form or "Discard" if it misread something. Never fills the form without you confirming first.</Step>);
  }
  steps.push(<Step key="priority" n={next()} title="Priority">Low, Medium, or High — defaults to Medium.</Step>);
  steps.push(<Step key="tags" n={next()} title="Tags (optional)">Tap a suggestion (Hot Lead, Referral, VIP, Repeat Customer) or type your own and press Enter — free-form labels, not a fixed list.</Step>);
  steps.push(<Step key="appt" n={next()} title="Appointment (optional)">Tap "Schedule Appointment" to book the first appointment right now instead of as a separate step later.</Step>);
  if (isManagerish) {
    steps.push(<Step key="assign" n={next()} title="Assignment">"Assign to me" or "Unassigned pool" — telecallers and executives don't get this choice, their own leads auto-assign to themselves.</Step>);
  }
  steps.push(<Step key="save" n={next()} title="Save">Tap "Create Lead".</Step>);
  return steps;
}

function buildSections(role: Role): Section[] {
  const isManagerish = role === 'manager' || role === 'super_admin';
  const roleLabel = ROLE_LABEL[role] || 'Staff';
  const roleDesc = ROLE_DESC[role] || 'What you see in the app is based on your permissions.';

  const sections: Section[] = [
    {
      id: 'intro', label: 'Introduction', icon: BookOpen,
      body: <>
        <p className="text-sm text-stone-700 mb-4">This manual explains the Leads and CRM system — how to add a lead, how to work it through to a sale, and every tool built to help you do that faster.</p>
        <div className="px-3 py-2.5 rounded-lg bg-teal-50 border border-teal-200 mb-3">
          <p className="text-teal-800 text-xs font-bold uppercase tracking-wide mb-1">Your role: {roleLabel}</p>
          <p className="text-sm text-stone-800">{roleDesc}</p>
        </div>
        <Note>Everything below is shown the way it actually looks for you — if a step mentions a button and you don't see it, that's expected, not a mistake.</Note>
      </>,
    },
    {
      id: 'lifecycle', label: 'The Lead Lifecycle', icon: GitBranch,
      body: <>
        <p className="text-sm text-stone-700 mb-4">Every lead moves through a set of stages, so everyone can tell where things stand at a glance.</p>
        <Field name="New">Just added — nobody has spoken to the customer yet.</Field>
        <Field name="Contacted">Someone has spoken to the customer at least once.</Field>
        <Field name="Qualified">The customer is genuinely interested — a real prospect.</Field>
        <Field name="Quoted">A price or proposal has been given.</Field>
        <Field name="Won">The deal is closed and paid for — the finish line.</Field>
        <Field name="Lost">The customer said no, or went elsewhere.</Field>
        <Field name="Not Answered">You tried calling and couldn't reach them — not a dead end, just try again.</Field>
        <Note>A lead's stage changes automatically when you log an outcome or use the one-click status buttons — you never update it separately.</Note>
      </>,
    },
    {
      id: 'products', label: 'Our Products & Segments', icon: Layers,
      body: <>
        <p className="text-sm text-stone-700 mb-4">Every lead belongs to one of two segments. Knowing which one changes what you pitch and how.</p>
        <Field name="Digital Media (Kite & Tail)">We grow other businesses' brands online — ads, content, SEO. The customer is buying marketing services.</Field>
        <Field name="Software Solutions">We build and sell our own SaaS products, plus custom software. The customer is buying a tool or a build.</Field>

        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mt-4 mb-2 flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" /> Digital Media — what we offer</p>
        <ul className="list-disc pl-5 mb-2">
          <Bul>Targeted Meta (Instagram/Facebook) & Google PPC campaigns</Bul>
          <Bul>Social media management & creative reels production</Bul>
          <Bul>SEO & brand identity design</Bul>
          <Bul>High-converting lead funnel strategy & analytics</Bul>
        </ul>
        <Field name="Numbers worth knowing">10M+ impression reach, 4.8x average ad ROAS, 50,000+ leads generated for clients to date — real figures, safe to quote as "our average," never as a guarantee for a specific customer.</Field>

        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mt-4 mb-2 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" /> Software Solutions — products</p>
        <Field name="MyStore OS — Retail POS & Billing ERP">Cloud billing, barcode inventory, GST invoicing, multi-store management. Fast GST billing, real-time stock sync. Best fit: retail shops and supermarkets.</Field>
        <Field name="Punchly — Face & Geo Attendance ERP">Selfie + GPS attendance verification, leave approvals, automated payroll. Best fit: businesses with field staff or multiple locations.</Field>
        <Field name="Hey Nikki — AI Voice & Chatbot Agent">24/7 automated voice calls and WhatsApp replies for lead qualification and appointment booking. Best fit: businesses where enquiries outpace callback capacity.</Field>
        <Field name="Custom Software">Web apps, mobile apps, internal business systems built to spec. 100% on-time delivery track record.</Field>
      </>,
    },
    {
      id: 'add-lead', label: 'Adding a New Lead', icon: UserPlus,
      body: <>
        <p className="text-sm text-stone-700 mb-4">The "+ Add Lead" button opens the same form everywhere you see it{isManagerish ? '' : ' — the Leads board, your call queue, and as a home-screen quick action'}.</p>
        {buildAddLeadSteps(role)}
        <Note>Quick Add: tap "Quick add" at the top of the form to collapse it to just Name, Phone, and Segment — fill in the rest later from the lead's own screen. After saving, "Add Another" opens a fresh form ready for the next one.</Note>
      </>,
    },
    {
      id: 'log-outcome', label: 'Log Outcome', icon: PhoneCall,
      body: <>
        <p className="text-sm text-stone-700 mb-4">"Log Outcome" records what happened on a call or visit — the single most important habit in this system. Every follow-up, every reminder, and your manager's visibility all depend on this being logged, not just remembered.</p>
        <Step n={1} title="Open the lead">From the board, your queue, or the To-Do list.</Step>
        <Step n={2} title="Tap Log Outcome">Or use one-click stage buttons for a faster, no-note update.</Step>
        <Step n={3} title="Choose what happened">See the outcome list below.</Step>
        <Step n={4} title="Fill in extra fields">A callback date, appointment date, whatever that outcome needs.</Step>
        <Step n={5} title="Write a note">Required — what was actually said or agreed. Your manager and the next caller will read this.</Step>
        <Step n={6} title="Save">The stage updates automatically and the note joins that lead's history.</Step>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mt-4 mb-2">What each outcome means</p>
        <Field name="Spoke — Interested">Reached them, they're interested. Moves to Contacted.</Field>
        <Field name="Appointment Booked">They agreed to a visit — you'll enter a date, time, and note. Your manager is notified to assign a field executive.</Field>
        <Field name="Not Answered">No pickup — moves to Not Answered.</Field>
        <Field name="Not Interested">They said no — moves to Lost.</Field>
        <Field name="Callback Requested">They asked for a specific callback time — becomes a Callback item on your To-Do list.</Field>
        <Field name="Converted / Closed">Deal done — moves to Won.</Field>
        <Note>Won and Lost leads drop off your active queue and To-Do list automatically.</Note>
      </>,
    },
  ];

  sections.push({
    id: 'scripts', label: 'Telecalling Scripts', icon: MessagesSquare,
    body: <>
      <p className="text-sm text-stone-700 mb-3">A script is a starting point, not a word-for-word rule — sound like yourself, not like you're reading. Swap in the real name and details every time.</p>
      <ScriptLabel>Opening (any segment)</ScriptLabel>
      <Script>Hi, am I speaking with [Name]? This is [Your Name] calling from Nikki Technologies — you'd enquired about [interested_in] with us. Have you got two minutes?</Script>
      <ScriptLabel>If they say it's not a good time</ScriptLabel>
      <Script>No problem at all — when would be a better time for me to call back, later today or tomorrow?</Script>
      <Note>Log that as a Callback Requested outcome with the time they give you — it'll show up on your To-Do automatically.</Note>
      <ScriptLabel>Discovery questions (ask before pitching)</ScriptLabel>
      <ul className="list-disc pl-5 mb-2">
        <Bul>What made you enquire with us — what are you looking to solve?</Bul>
        <Bul>Are you currently using anything for this, or starting from scratch?</Bul>
        <Bul>What's your rough timeline — urgent, or exploring for later?</Bul>
      </ul>
      <ScriptLabel>Pitching Digital Media</ScriptLabel>
      <Script>We run your ads, socials, and SEO as one connected strategy — not just posting content, but driving leads. Across our client base we're averaging about 4.8x return on ad spend. Would it help if I walked you through what that could look like for your business?</Script>
      <ScriptLabel>Pitching MyStore OS</ScriptLabel>
      <Script>MyStore OS is our retail billing and inventory system — GST invoices print in seconds, and stock updates in real time. If you've got more than one store, it all syncs together. How are you currently handling billing?</Script>
      <ScriptLabel>Pitching Punchly</ScriptLabel>
      <Script>Punchly handles attendance and payroll — staff check in with a selfie and their GPS location, so there's no buddy-punching, and payroll runs off that data automatically. How are you tracking attendance right now?</Script>
      <ScriptLabel>Pitching Hey Nikki</ScriptLabel>
      <Script>Hey Nikki is an AI voice and WhatsApp agent that answers calls and chats 24/7 — qualifying leads and booking appointments even when your team's not available. Are enquiries ever slipping through because nobody could call back in time?</Script>
      <ScriptLabel>Objection: "I need to think about it"</ScriptLabel>
      <Script>Totally fair — what specifically would help you decide? If it's price, timeline, or fit, I'm happy to walk through that now.</Script>
      <ScriptLabel>Objection: "It's too expensive"</ScriptLabel>
      <Script>I hear you — what are you comparing it to? A lot of the time it's less about the number and more about what's included. Let me break down what you'd actually get.</Script>
      <ScriptLabel>Closing — booking an appointment</ScriptLabel>
      <Script>Would it make sense to have someone from our team meet you and walk through this properly? What does your week look like?</Script>
      <ScriptLabel>Ending a call that isn't going anywhere yet</ScriptLabel>
      <Script>No worries — I'll leave it with you. If anything changes, we're just a call away. Thanks for your time, [Name].</Script>
      <Note>Whatever happens on the call, log it before you move to the next lead — Log Outcome takes twenty seconds and it's what makes the To-Do list, reminders, and your manager's visibility all work correctly.</Note>
    </>,
  });

  sections.push(
    {
      id: 'quick-actions', label: 'One-Click Buttons', icon: MousePointerClick,
      body: <p className="text-sm text-stone-700">On the Leads Management board, every card has a row of small stage buttons — New, Called, Interested, Quoted, Won, Lost, Callback later. Tapping one instantly moves the lead there with no form. Use this when you just need to update where things stand with nothing else to note — "Log Outcome" is still on the same card for whenever you do want to leave one.</p>,
    },
    {
      id: 'views', label: 'List vs Kanban', icon: LayoutGrid,
      body: <>
        <Field name="List view">One row per lead with full detail — phone, address, follow-up badge, action buttons. Best for working through leads one at a time.</Field>
        <Field name="Kanban view">One column per stage — drag a card between columns to change its stage, same effect as the one-click buttons. Best for seeing your whole pipeline shape at a glance.</Field>
      </>,
    },
    {
      id: 'appointments', label: 'Appointments', icon: CalendarClock,
      body: <>
        <p className="text-sm text-stone-700 mb-3">Book an appointment three ways: while adding a lead, via "Appointment Booked" in Log Outcome, or with the dedicated Reschedule button.</p>
        <Step n={1} title="Find Reschedule">On a lead card ("Schedule" if none yet, "Reschedule" if one exists) or inside the lead's detail view.</Step>
        <Step n={2} title="Pick date and time"> </Step>
        <Step n={3} title="Add a note (optional)">What to bring, a landmark, etc.</Step>
        <Step n={4} title="Save">The assignee and segment managers are notified automatically. Use "Remove appointment" to clear one entirely.</Step>
        <Note>Every appointment change is recorded automatically in that lead's history.</Note>
      </>,
    },
    {
      id: 'followups', label: 'Follow-ups vs Callbacks', icon: Repeat,
      body: <>
        <Field name="Follow-up">A general "check back on this lead" date — not a promise to call at an exact time.</Field>
        <Field name="Callback">A specific time the customer asked you to call — a commitment, not just a reminder.</Field>
        <p className="text-sm text-stone-700 mt-2">Both show up on your To-Do list and trigger the sound alert when their time arrives.</p>
      </>,
    },
    {
      id: 'todo', label: 'My To-Do List', icon: ListChecks,
      body: <>
        <p className="text-sm text-stone-700 mb-3">Every home screen has a "My To-Do" card. It automatically gathers every follow-up, callback, and appointment across all your leads — nothing to set up.</p>
        <Field name="Overdue">Past due — shown in red, needs attention first.</Field>
        <Field name="Today">Due sometime today — shown in amber.</Field>
        <Field name="Upcoming">Due later — shown in grey.</Field>
        <ul className="list-disc pl-5 mt-2">
          <Bul>Tap the phone icon to call directly.</Bul>
          <Bul>Tap the WhatsApp icon to open a pre-filled chat.</Bul>
          <Bul>Follow-up/callback: tap the check icon to mark done.</Bul>
          <Bul>Appointment: tap the calendar icon to reschedule.</Bul>
        </ul>
      </>,
    },
    {
      id: 'alerts', label: 'Sound Alerts', icon: Bell,
      body: <>
        <p className="text-sm text-stone-700 mb-3">The bell icon in the header turns sound alerts on or off. When on, a banner pops up with a chime 15 minutes before a follow-up, callback, or appointment's scheduled time — while you have the app open — so you get an actual heads-up, not a notice after the moment's already passed.</p>
        <ul className="list-disc pl-5 mb-3">
          <Bul><b>Call</b> — opens your dialer.</Bul>
          <Bul><b>WhatsApp</b> — opens a chat, if a real number is on file.</Bul>
          <Bul><b>Snooze 1h</b> — hides it, comes back in an hour.</Bul>
          <Bul><b>Dismiss</b> — clears it for good.</Bul>
        </ul>
        <Note>First time you turn sound on, your browser asks for desktop-notification permission too — allow it for alerts even when the tab isn't in front of you.</Note>
        <p className="text-sm text-stone-700">If nobody acts in time, the system escalates automatically: an overdue follow-up/callback notifies managers after 2 days; a missed appointment escalates after 4 hours.</p>
      </>,
    },
    {
      id: 'whatsapp', label: 'WhatsApp Quick-Send', icon: MessageCircle,
      body: <p className="text-sm text-stone-700">Anywhere you see a phone number — the leads board, the call queue, the To-Do list, the alert banner — a green WhatsApp icon sits next to it. Tapping it opens WhatsApp with that customer's chat already open and a short pre-filled greeting, ready to edit and send.</p>,
    },
    {
      id: 'export', label: 'Exporting to Excel', icon: Download,
      body: <p className="text-sm text-stone-700">Both the Leads board and the Telecaller call queue have an "Export" button, downloading an Excel file of whatever's currently in view. It includes every field: both phone numbers, email, segment, stage, priority, source, interest, address, assignee, and every scheduled date.</p>,
    },
    {
      id: 'merge', label: 'Merging Duplicates', icon: Combine,
      body: <>
        <p className="text-sm text-stone-700 mb-3">Sometimes the same customer ends up as two lead records in the same segment. "Duplicate Leads" (under More, for managers and above) finds every such group automatically.</p>
        <Step n={1} title="Open Duplicate Leads">Lists every group sharing a phone number within the same segment.</Step>
        <Step n={2} title="Review the group">Stage, assignee, note count, and date added for each record.</Step>
        <Step n={3} title="Pick which to keep">Defaults to the oldest — change it if a different one should be the main record.</Step>
        <Step n={4} title="Tap Merge">History moves onto the kept lead, blank fields get filled in from the others, then the duplicates are deleted.</Step>
        <Note>Can't be undone — you'll confirm first. Leads with the same phone in different segments are never treated as duplicates.</Note>
      </>,
    },
    {
      id: 'reassign', label: 'Reassign & Transfer', icon: ArrowLeftRight,
      body: <p className="text-sm text-stone-700">Managers can move a batch of leads from one staff member to another under "Reassign Leads" — useful when someone's on leave or has left. A telecaller handing a lead to a Marketing Executive for a field visit goes through "Handoff Approvals" instead, which a manager reviews.</p>,
    },
    {
      id: 'bulk', label: 'Bulk Upload', icon: Upload,
      body: <p className="text-sm text-stone-700">Got a spreadsheet of leads — an exhibition sign-up sheet, a purchased list? "Bulk Upload" under More lets you import an Excel or CSV file in one go, with the same duplicate checking applied to every row.</p>,
    },
    {
      id: 'pool', label: 'Unassigned Pool', icon: Users,
      body: <p className="text-sm text-stone-700">Leads with nobody assigned sit in the Unassigned Pool, visible to anyone with access to that segment. Any eligible staff member can claim one from here.</p>,
    },
    {
      id: 'timeline', label: 'Lead History & Timeline', icon: History,
      body: <>
        <p className="text-sm text-stone-700 mb-3">Tap "View history" on any lead to open its full detail view.</p>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">What's Next</p>
        <p className="text-sm text-stone-700 mb-3">A banner at the top shows the single next thing due — whichever of the follow-up, callback, or appointment is soonest. Teal if upcoming, red if overdue, or a plain note if nothing's scheduled.</p>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Full History</p>
        <p className="text-sm text-stone-700 mb-2">A complete timeline, newest first, icon-coded by event type:</p>
        <ul className="list-disc pl-5">
          <Bul>Stage changed — whenever the lead moved stages.</Bul>
          <Bul>Reassigned — whenever it changed hands.</Bul>
          <Bul>Appointment — booked, rescheduled, or cancelled.</Bul>
          <Bul>Call / note / visit / WhatsApp / email — whatever you logged manually.</Bul>
        </ul>
      </>,
    },
    {
      id: 'admin', label: 'For Managers & Admins', icon: ShieldCheck,
      body: <>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Overview dashboard</p>
        <p className="text-sm text-stone-700 mb-3">"Needs Your Attention" surfaces everything needing a decision — approvals, overdue follow-ups/callbacks/appointments, duplicate leads, unassigned leads. Grey numbers mean nothing's waiting; coloured numbers need action. Tap any tile to jump to it. The Segments panel shows each segment's key numbers with a date-range filter. Team Performance, Trends, and Housekeeping are collapsed by default — tap to expand.</p>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Access Control</p>
        <p className="text-sm text-stone-700">Shows every role as a colour-coded card with a plain-English summary of what it can do, and how many staff hold it. Individual permissions can still be fine-tuned per person.</p>
      </>,
    },
  );

  sections.push(
    {
      id: 'attendance', label: 'Attendance', icon: Clock,
      body: <>
        <p className="text-sm text-stone-700 mb-4">Check in when you start work, check out when you finish — both from My Attendance.</p>
        <Step n={1} title="Check In">Tap Check In, choose your work mode (Office, Work From Home, or Field Visit), and take a selfie when prompted. Your location is captured automatically alongside it.</Step>
        <Step n={2} title="Check Out">Same idea, at the end of the day — tap Check Out and take a second selfie.</Step>
        <Note>Whether you're marked late is decided by the server against your assigned shift, not by your phone's clock — so there's nothing to "adjust" on your end to avoid it. If a late mark looks wrong, raise it with HR rather than trying to fix the time yourself.</Note>
        <p className="text-sm text-stone-700">Your last 14 days show below the check-in button, so you can spot a missed day before it becomes a problem.</p>
      </>,
    },
    {
      id: 'leaves-advances', label: 'Leaves & Advances', icon: CalendarClock,
      body: <>
        <p className="text-sm text-stone-700 mb-4">Request time off or a salary advance from Leaves & Advances — both need approval before they're final.</p>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Requesting Leave</p>
        <Step n={1} title="Pick your dates">From date, to date.</Step>
        <Step n={2} title="Choose the leave type">Casual, sick, etc. — whatever your company's policy defines.</Step>
        <Step n={3} title="Add a reason">Short is fine.</Step>
        <Step n={4} title="Submit">It goes to your manager/HR for approval — you'll see it move from Pending to Approved (or Rejected) once they act on it.</Step>
        <Note>Your leave balance (entitled, used, remaining per type) shows right on this page — check it before you request, so you're not caught out by a type that's already used up.</Note>
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Requesting a Salary Advance</p>
        <p className="text-sm text-stone-700">Same idea — enter an amount and a reason, submit, and it goes to approval. You can see the status of every request you've made, past and pending, on the same page.</p>
      </>,
    },
    {
      id: 'tasks-module', label: 'Tasks', icon: ListChecks,
      body: <>
        <p className="text-sm text-stone-700 mb-4">Anything assigned to you — by a manager, or as part of a workflow — shows up in My Tasks.</p>
        <Field name="Pending">Not started yet.</Field>
        <Field name="In Progress">You've started it — mark it this way so others can see it's moving.</Field>
        <Field name="Completed">Done — tap the checkmark to mark it complete.</Field>
        <Field name="Cancelled">No longer needed — a manager can mark a task this way if plans changed.</Field>
        <Note>A task past its due date and not yet completed is flagged as overdue right on the card — no separate place to check for that.</Note>
      </>,
    },
    {
      id: 'tickets-module', label: 'Support Tickets', icon: Ticket,
      body: <>
        <p className="text-sm text-stone-700 mb-4">Customer support requests move through five stages.</p>
        <Field name="Open">Just came in — nobody's picked it up yet.</Field>
        <Field name="In Progress">Someone's actively working it.</Field>
        <Field name="Waiting on Customer">You're blocked on a reply from them — the clock is effectively paused on your end.</Field>
        <Field name="Resolved">Fixed, waiting to be confirmed closed.</Field>
        <Field name="Closed">Done.</Field>
        <Note>Every ticket has an SLA — a resolution-time target based on its priority. One that's blown past that target is flagged as overdue on the Overview dashboard's "Needs Your Attention" panel, so it doesn't just quietly sit there.</Note>
      </>,
    },
  );

  sections.push({
    id: 'my-profile', label: 'My Profile & Documents', icon: CreditCard,
    body: <>
      <p className="text-sm text-stone-700 mb-4">Everyone has these in My Profile, regardless of role.</p>
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">ID Card</p>
      <p className="text-sm text-stone-700 mb-3">Auto-generated from your profile — name, designation, staff code, phone, email, blood group. Nothing to upload; it updates itself whenever your profile does. A Print button opens a print-ready version.</p>
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">ID Proof Documents</p>
      <p className="text-sm text-stone-700 mb-3">Upload your Aadhaar, PAN, passport, driving license, or voter ID as a photo or PDF. Pick the document type, tap Upload. HR/Admin can also upload on your behalf and mark a document "Verified" — you'll see that badge once they do. Files are private — only you and HR/Admin can ever view them.</p>
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">My Documents</p>
      <p className="text-sm text-stone-700 mb-3">Offer letters, NDAs, policies, and other paperwork HR/Admin issues to you show up here. Open one and either draw a signature or type your name to sign it, or just acknowledge it if no signature's required. If it's already marked "Company signed," that means Nikki Technologies countersigned it before it was even sent to you.</p>
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Session Devices</p>
      <p className="text-sm text-stone-700">Shows every browser you're currently signed into. Revoke any device with one click, or "Sign out all other devices" at once — useful if you signed in somewhere you shouldn't have, like a shared computer. A revoked device is signed out within about two minutes, since it needs two consecutive failed checks (not just one network blip) before it's forced out.</p>
    </>,
  });

  if (isManagerish) {
    sections.push({
      id: 'my-signature', label: 'My Signature', icon: PenLine,
      body: <>
        <p className="text-sm text-stone-700 mb-3">Draw and save your signature once in My Profile — after that, it's stamped automatically onto every document you issue (offer letters, NDAs, policies), before the employee ever opens it. No need to sign each one by hand.</p>
        <Step n={1} title="Open My Profile">Find "My Signature."</Step>
        <Step n={2} title="Draw your signature">On the pad, using your mouse or finger on a touchscreen.</Step>
        <Step n={3} title="Save">That's it — every document you issue from now on carries it automatically.</Step>
        <Note>You can replace your saved signature any time — it only affects documents issued after the change, not ones already sent.</Note>
      </>,
    });
  }

  const managerOnlyIds = new Set(['merge', 'bulk', 'admin']);
  return isManagerish ? sections : sections.filter(s => !managerOnlyIds.has(s.id));
}

export default function TrainingManual() {
  const { user } = useAuth();
  const [active, setActive] = useState('intro');
  const sections = buildSections(user?.role || '');
  const section = sections.find(s => s.id === active) ?? sections[0];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-stone-900 font-extrabold text-lg">Leads & CRM Training Manual</h2>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">Internal use only</span>
      </div>
      <p className="text-stone-700 text-sm mb-4">Everything you need to know to work leads in this system — pick a topic.</p>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {sections.map(s => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setActive(s.id)}
                  className={`shrink-0 md:shrink flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold whitespace-nowrap md:whitespace-normal transition-colors ${active === s.id ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                  <Icon className="w-3.5 h-3.5 shrink-0" /> {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={cardCls + ' flex-1 min-w-0'}>
          <h3 className="text-stone-900 font-bold text-base mb-3 flex items-center gap-2">
            <section.icon className="w-5 h-5 text-teal-700" /> {section.label}
          </h3>
          {section.body}
        </div>
      </div>
    </div>
  );
}
