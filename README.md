# Nikki Technologies — nikkitechnologies.com

Multi-segment business platform: **CCTV Installation | Digital Media | Software Solutions** — one backend, one login, full no-code Super Admin control.

## Stack
React 18 + Vite + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS, Edge Functions).

## Architecture
- **segments** table — verticals are dynamic. Add a 4th segment from Super Admin → tickets, leads, staff scoping, website sections all pick it up automatically.
- **app_users** — role + `segments[]` (`{cctv}`, `{software}`, `{all}`) + per-user `permission_overrides` (jsonb). RLS enforces segment scoping at DB level.
- **products** — Software Solutions catalog (MyStore OS, Punchly, Jovio pre-seeded). Add/edit from panel, link-out model.
- **support_tickets** — auto-numbered per segment (NKT-CC-00001 / NKT-DM / NKT-SW), per-segment ticket types, public "Raise a Ticket" form, staff scoped views.
- **marketing_leads** — CRM pipeline (new→contacted→qualified→quoted→won/lost), segment-routed from website form, remarks thread.
- **HR/Payroll** — attendance (GPS check-in/out), leaves, salary advances. One central HR (`segments={all}`) sees everyone grouped by segment.
- **site_content** — every public text editable from panel.

## Roles
`super_admin` (full control + Access Control panel) · `manager` · `hr` · `marketing_executive` · `telecaller` · `support_agent` · `employee`.
Super Admin can override any function permission per user (view_leads, manage_tickets, approve_advances, manage_content, …) without code.

## Setup (new Supabase project)
1. Create project at supabase.com → copy URL + anon key into `.env` (see `.env.example`).
2. Run the single migration: `supabase/migrations/20260709000001_nikki_technologies_init.sql` (SQL Editor → paste → run). Seeds 3 segments, services, ticket types and the 3 products.
3. Deploy edge functions:
   ```
   supabase functions deploy create-user
   supabase functions deploy bootstrap-super-admin
   ```
4. Create the first super admin (one-time; function locks itself after):
   ```
   curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/bootstrap-super-admin \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR-ANON-KEY" \
     -d '{"email":"you@nikkitechnologies.com","password":"STRONG-PASSWORD","full_name":"Karthikeya"}'
   ```
5. `npm install && npm run dev` — login at `/login`.
6. Deploy: push to GitHub → import in Vercel → add the two env vars → set domain nikkitechnologies.com.

## Routes
- `/` — public site (segments, products, raise ticket, lead form)
- `/login` — unified staff login → Super Admin dashboard or Staff Portal (tabs appear per permissions)

## Onboarding & Documents
- **Super Admin → Documents & Onboarding**: create/edit templates (Offer Letter, Welcome Letter, Roles & Responsibilities, custom) per segment. Placeholders: `{{name}} {{designation}} {{role}} {{segment}} {{joining_date}} {{ctc}} {{employment_type}} {{company}}`.
- **Super Admin → Access Control → Onboard Employee**: 5-step wizard — basic info, role/segment, salary structure (basic/HRA/allowances/deductions/CTC), pick documents to auto-issue, review & create. Account + salary + documents all created together.
- Existing staff can be issued additional documents anytime from Documents & Onboarding → Issue Documents.
- **Employee → My Documents** tab: view/print/download every issued document, see full salary breakdown, and acknowledge documents (timestamped, visible to HR) — full transparency, builds trust.

## Post-launch
- Regenerate strict DB types: `supabase gen types typescript --project-id XXX > src/lib/database.types.ts` and re-add `<Database>` generic in `src/lib/supabase.ts`.
- Replace placeholder contact number/email in Super Admin → Website Content.
- Add real logo/og-image/icons in `public/`.

## E-Signature Flow
- Templates (Super Admin → Documents & Onboarding) have a **"Requires employee signature"** toggle. Default: on for Offer Letter/Welcome Letter, off (acknowledge-only) for Roles & Responsibilities/Policy.
- Employee opens a document in **My Documents** → draws a signature on a canvas pad or types their legal name (rendered in cursive) → confirms. The signature image (or typed name) + timestamp is stored permanently on that document row.
- Documents not requiring a signature get a lighter "I acknowledge I've read this" confirmation instead.
- Every staff row in **Access Control** and **Documents & Onboarding** shows a live badge: `X/Y signed` or `Onboarding complete` — so you can see at a glance who still needs to finish onboarding.
- Print/Save-as-PDF includes the captured signature image and signing timestamp on the printed document.

## Ported from Punchly (smart-timekeeper)
Safe-checked and adapted to Nikki's schema (no tenants — segment-scoped instead):
- **In-app Notifications** — bell icon in both portal headers, unread badge, mark-as-read, auto-fires on: ticket/lead activity via triggers, shift swap requests, bank change approval/rejection, announcements.
- **Announcements** — Super Admin posts to all staff or one segment; pinned + auto-expiry; shows as a feed on the employee home tab and notifies everyone instantly.
- **Shift Swap Requests** — employee requests a swap (optionally with a named colleague), manager/HR approves from the same board; both sides get notified.
- **Bank Details + Change Approval** — employee submits new bank details from **My Profile**; nothing changes until HR approves from **Bank Approvals** — protects payroll from silent/fraudulent edits. Approved changes apply automatically via a DB trigger.
- **Digital ID Card** — auto-generated per employee (segment-branded colors), viewable and printable from **My Profile**. Auto-numbered staff codes (`NKT-EMP-0001…`) assigned on creation.
- **My Stats** — day streak, days present, on-time % over the last 30 days, shown on the employee's attendance tab.
- **Punctuality Leaderboard** — Super Admin Overview, top 10 staff by on-time %, last 30 days.
- **Birthdays & Anniversaries widget** — Super Admin Overview shows anyone with a birthday or work-anniversary today (no cron needed — computed on page load).

Not ported (native-mobile-only, needs Capacitor/device APIs): face-verification selfie matching, native push notifications, PIN quick-login. These only make sense in the Capacitor mobile build; Nikki is web-only for now.

## Dashboard Polish (best practices pass)
Audit found the app had **zero user feedback on failure** — every save/create/delete/approve either succeeded silently or failed silently with no indication. Fixed:
- **Toast system** (`src/lib/toast.tsx`) — success/error/info notifications, auto-dismiss, wired into every mutation across both portals: tickets, leads, HR approvals, onboarding, access control, segments, products, catalog, templates, document issuance, content, announcements, shift swaps, bank approvals.
- **Error Boundary** — a component crash now shows a recovery screen with reload button instead of a blank white page.
- Every Supabase mutation now checks `{ error }` and reports it instead of assuming success.
- Destructive actions (delete product, delete announcement) confirm before executing.

## Careers / Hiring
- **Public "Careers" section** on the homepage — lists open job postings (segment-tagged), each with an "Apply Now" that opens a form: name, phone, email, experience, passport-size photo upload, resume upload (PDF/DOC), plus any custom screening questions the job defines. A "Don't see your role?" link lets people submit a general application too.
- Files upload to a **private** storage bucket (`career-uploads`) — public can upload, only staff with `view_careers`/`manage_careers` can read them (via short-lived signed URLs, not public links).
- **Super Admin/HR → Careers / Hiring** tab: post/edit/close job postings per segment with custom screening questions; review applications in a pipeline (New → Shortlisted → Interviewed → Hired/Rejected), view photo and download resume from the same panel.
- `view_careers` / `manage_careers` are granted to the `hr` role by default and can be granted to anyone else via Access Control → Manage Access, same as every other permission.

## Where to add staff
Super Admin → **Overview** now has a banner shortcut "+ Onboard Employee" at the top, or go directly to **Access Control → + Onboard Employee**. That single wizard creates the account, salary, and documents together.

## NIKKI Intro Animation
Replaced the static loading spinner with a letter-by-letter reveal of "N-I-K-K-I" on every page load before the site/portal appears (`LoadingScreen.tsx`).

## Telecaller Workflow (Excel bulk assign, click-to-call, counts-only dashboard, callback retention, executive handoff approval)
- **Bulk Upload** (Super Admin CRM tab, or Manager's own portal if granted `bulk_assign_leads`): upload an Excel/CSV of leads (Name, Phone, Email, Notes columns), pick a segment, optionally assign the whole batch to one telecaller in one shot.
- **Telecaller experience** is now fundamentally different from Manager/Admin — controlled by a new `full_leads_view` permission (on by default for manager/hr/executive, off for telecaller, overridable per-user in Access Control):
  - **Off** → she sees a **counts-only dashboard** (queue size, calls made today, callbacks pending, converted this month, transfers awaiting approval — no raw data grid) plus her **own Call Queue**: only leads currently assigned to her.
  - Each queue row has a **click-to-call** button (`tel:` link — opens the phone dialer directly).
  - Logging an outcome is mandatory before a lead leaves her queue. **Callback Requested** keeps the lead in her queue (with the callback date shown, sorted to the top). Every other outcome (interested/not interested/no answer/converted) **releases the lead back to the pool** — it disappears from her queue and only a manager/admin can reassign it.
  - She can also **request a handoff to a Field Executive** once an appointment is fixed — this doesn't move the lead directly; it creates a pending request that a **Manager or Super Admin must approve** before the executive actually receives it. Same mechanism across all three segments (CCTV/Digital Media/Software) since it's segment-agnostic on the shared `marketing_leads` table.
- **Manager/Super Admin → CRM → Handoff Approvals**: review and approve/reject pending telecaller→executive requests; both sides get notified automatically.
- All of this is permission-gated (`full_leads_view`, `bulk_assign_leads`, `approve_transfers`), so you decide per person — not hardcoded by role — via Access Control → Manage Access.

## Confirmed / Fixed from cross-check
- **Selfie attendance** — check-in and check-out now open the device camera (works in any browser, desktop or mobile) and capture a photo before submitting. Stored to the private `selfies` bucket, viewable by HR/managers via "Photo" link (signed URL) next to each attendance record. **Important distinction:** this is photographic proof-of-presence, not biometric face-matching verification — that requires ML/device-native APIs and remains out of scope for the web app (see Punchly cross-check note).
- **Offer Letter & Welcome Letter are now segment-specific** (previously generic/company-wide) — CCTV, Digital Media and Software each get their own tailored wording, matching how Roles & Responsibilities already worked.
- **Reporting Time / Shift** is now captured during onboarding and appears on the Offer Letter and Welcome Letter automatically (`{{reporting_time}}` placeholder).
- **Job Description** added as its own document type, with a starter template per segment (Field Technician / Digital Media Executive / Software Developer) — Super Admin can add more per specific role from Documents & Onboarding → New Template.
- Confirmed already working: documents auto-filter to the employee's segment, e-signature capture (draw or type) on every generated document.
