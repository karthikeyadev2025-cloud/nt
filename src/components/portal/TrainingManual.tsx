import { useState } from 'react';
import {
  BookOpen, UserPlus, GitBranch, PhoneCall, MousePointerClick, LayoutGrid,
  CalendarClock, Repeat, ListChecks, Bell, MessageCircle, Download,
  Combine, ArrowLeftRight, Upload, Users, History, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cardCls } from './shared';

type Section = { id: string; label: string; icon: LucideIcon; body: React.ReactNode };

// Small building blocks so every section reads the same way — a field/
// definition list style, a numbered step list, or a callout note.
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

const SECTIONS: Section[] = [
  {
    id: 'intro', label: 'Introduction & Roles', icon: BookOpen,
    body: <>
      <p className="text-sm text-stone-700 mb-4">This manual explains every part of the Leads and CRM system: how to add a lead, how to work it through to a sale, and every tool built to help you do that faster. Read the part for your role first, then use the rest as a reference.</p>
      <Field name="Telecaller">Works leads over the phone. Has a Call Queue, can add leads, log call outcomes, book appointments, and hand appointments to a Marketing Executive.</Field>
      <Field name="Marketing Executive">Visits leads in the field. Has a field-visit queue with photo and GPS capture, logs visit outcomes, closes deals.</Field>
      <Field name="Manager">Sees every lead in their segment(s), assigns and reassigns leads, approves transfers, reviews team performance.</Field>
      <Field name="Super Admin">Sees everything across every segment. Manages roles, permissions, and every setting in the system.</Field>
      <Note>What you see depends on your role. If something here doesn't appear on your screen, you likely don't have permission for it — ask your manager.</Note>
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
    id: 'add-lead', label: 'Adding a New Lead', icon: UserPlus,
    body: <>
      <p className="text-sm text-stone-700 mb-4">The "+ Add Lead" button opens the same form everywhere — the Leads board, the Telecaller call queue, and as a home-screen quick action.</p>
      <Step n={1} title="Open the form">Tap "+ Add Lead" from wherever you're working.</Step>
      <Step n={2} title="Customer's name">Required — how the lead is identified everywhere. If it's missing when you tap Save, the field turns red with a message right under it.</Step>
      <Step n={3} title="Phone number">As you finish a 10-digit number, the system checks for an existing lead with that number in the same segment. If found, you'll see a warning with the existing lead's name, stage, and owner — you can still "Add Anyway" if it's genuinely different.</Step>
      <Step n={4} title="Alternate phone (optional)">Tap "+ Add alternate number" if they gave a second number.</Step>
      <Step n={5} title="Email (optional)" >If they gave one.</Step>
      <Step n={6} title="Segment">Digital Media or Software Solutions. Required (turns red if left blank) — pre-filled if you only work one segment.</Step>
      <Step n={7} title="Source">Where this lead came from: field, telecall, referral, whatsapp, website, or other.</Step>
      <Step n={8} title="Interested In">A short line, e.g. "MyStoreOS billing setup" or "Instagram ads package".</Step>
      <Step n={9} title="Address">Type it directly — always available on every role. Marketing Executives also get it auto-filled from GPS (next step), still editable by hand.</Step>
      <Step n={10} title="Photos (optional)">Tap "Add photo" for a picture of the customer, shop, or site — you can add more than one, each shown as its own removable thumbnail.</Step>
      <Step n={11} title="Location — Marketing Executives only">Tap "Add location" to capture GPS + address. If permission was already granted before, this happens silently in the background. Telecallers and Managers don't see this button — you're not physically where the customer is, so GPS has nothing to capture.</Step>
      <Step n={12} title="Scan a business card — Marketing Executives only">Photograph a card and the system reads off the name, phone, and email for you to review — tap "Use this" to fill the form or "Discard" if it misread something. Never fills the form without you confirming first.</Step>
      <Step n={13} title="Priority">Low, Medium, or High — defaults to Medium.</Step>
      <Step n={14} title="Tags (optional)">Tap a suggestion (Hot Lead, Referral, VIP, Repeat Customer) or type your own and press Enter — free-form labels, not a fixed list.</Step>
      <Step n={15} title="Appointment (optional)">Tap "Schedule Appointment" to book the first appointment right now instead of as a separate step later.</Step>
      <Step n={16} title="Assignment (managers only)">"Assign to me" or "Unassigned pool". Telecallers/Executives don't see this — their own leads auto-assign to themselves.</Step>
      <Step n={17} title="Save">Tap "Create Lead".</Step>
      <Note>Quick Add: tap "Quick add" at the top of the form to collapse it to just Name, Phone, and Segment — fill in the rest later from the lead's own screen. After saving, "Add Another" opens a fresh form with segment, source, and location already filled in for fast back-to-back entry.</Note>
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
      <Step n={2} title="Pick date and time" > </Step>
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
      <p className="text-sm text-stone-700 mb-3">The bell icon in the header turns sound alerts on or off. When on, and something's time actually arrives while you have the app open, a banner pops up with a chime — you don't have to be watching the To-Do list.</p>
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
];

export default function TrainingManual() {
  const [active, setActive] = useState('intro');
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-stone-900 font-extrabold text-lg">Leads & CRM Training Manual</h2>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">Internal use only</span>
      </div>
      <p className="text-stone-700 text-sm mb-4">Everything you need to know to work leads in this system — pick a topic.</p>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Section nav — horizontal scroll chips on mobile, sidebar on desktop */}
        <div className="md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {SECTIONS.map(s => {
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
