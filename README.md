# Nikki Technologies

The staff platform and public website behind [nikkitechnologies.com](https://nikkitechnologies.com).

One backend, one login, one Super Admin panel — running two business
verticals side by side (Digital Media and Software Solutions) with
full role-based access, tenant-style segment scoping, HR/payroll,
CRM, ticketing, and a fully editable public site.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Row-Level Security, Auth, Edge Functions, Realtime)
- **Hosting:** Vercel (frontend), Supabase (backend/DB)
- **Public-form bot check:** Cloudflare Turnstile
- **PWA:** installable web app, service worker kill-switch for cache safety

Runtime dependencies live in `package.json`; the app has no custom
server tier.

## Architecture at a glance

- `src/App.tsx` — path/hash router. Public site renders instantly on
  first paint; auth check only gates `/login`, `/admin`, `/portal`.
- `src/contexts/AuthContext.tsx` — session bootstrap, sign-in / sign-out,
  role + permission loading, session heartbeat / device tracking. One
  bounded 2.5s check on load, no layered timers.
- `src/components/PublicSite.tsx` — the marketing site: hero, segments,
  products, careers, contact, "Raise a Ticket".
- `src/components/portal/SuperAdminDashboard.tsx` — the admin console
  with role-gated tabs (Overview, Tickets, Tasks, CRM, HR, Access, …).
- `src/components/portal/StaffPortal.tsx` — self-service portal for
  non-admin roles (attendance, leaves, documents, payslips).
- `supabase/migrations/` — the entire schema and every RLS policy,
  built up incrementally with named intent per file.
- `supabase/functions/` — edge functions:
  - `bootstrap-super-admin` — one-time first-admin creation (inert once one exists)
  - `create-user` — admin-only staff onboarding (server-side gate on `manage_staff`)
  - `raise-ticket` — Turnstile-verified public ticket creation

## Roles and permissions

Seven roles, all defined in `role_permissions`:

`super_admin` · `manager` · `hr` · `marketing_executive` · `telecaller` · `support_agent` · `employee`

Each role has a default permission set (jsonb). A Super Admin can
override any individual permission per user via `permission_overrides`
without shipping code. Common permission flags:

`view_leads` · `manage_leads` · `create_leads` · `full_leads_view` ·
`bulk_assign_leads` · `approve_transfers` · `view_tickets` ·
`manage_tickets` · `assign_tickets` · `view_staff` · `manage_staff` ·
`view_attendance` · `approve_leaves` · `approve_advances` ·
`view_payroll` · `manage_payroll` · `view_careers` · `manage_careers` ·
`manage_content` · `view_reports`

Segment scoping is orthogonal: every user has a `segments text[]`
column (`{digital-marketing}`, `{software-development}`, or `{all}`
for company-wide roles like HR). RLS policies combine `has_permission(perm)`
with `can_access_segment(seg)` — enforced at the database, not the UI.

## Domain model

- **segments** — verticals are dynamic. Add one from Super Admin →
  tickets, leads, staff scoping, and website sections pick it up
  automatically. Currently: Digital Media, Software Solutions.
- **app_users** — role, segments, permission overrides, salary, employment.
- **support_tickets** — auto-numbered per segment (`NKT-DM-00001`,
  `NKT-SW-00001`), per-segment ticket types, public raise form, staff
  scoped views by segment + `view_tickets` permission.
- **marketing_leads** — CRM pipeline (`new → contacted → qualified →
  quoted → won / lost`), segment-routed from the website form, remarks
  thread, audit trail, duplicate detection, review loop, follow-up reminders.
- **attendance / leaves / salary advances** — shared HR backend with
  segment-grouped views. Server-side late-detection so device-clock
  tampering can't defeat lateness rules.
- **shifts / payslips / promotions** — full payroll cycle with
  segment-scoped RLS.
- **document templates + issued documents** — Offer Letter, Welcome
  Letter, Roles & Responsibilities, custom — per-segment wording, drawn
  or typed e-signatures, printable with signature and timestamp.
- **site_content** — every public headline, subtitle, contact detail
  editable from Super Admin → Website Content.

## Setup — new environment

1. Create a Supabase project. Copy URL and anon key into `.env`
   (see [`.env.example`](./.env.example)).
2. Run the migrations in `supabase/migrations/` in order via
   `supabase db push`, or paste them into the SQL Editor.
3. Deploy the edge functions:
   ```bash
   supabase functions deploy bootstrap-super-admin
   supabase functions deploy create-user
   supabase functions deploy raise-ticket
   ```
4. Create the first super admin (one-time; the function locks itself
   after any super admin exists):
   ```bash
   curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/bootstrap-super-admin \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR-ANON-KEY" \
     -d '{"email":"you@nikkitechnologies.com","password":"STRONG-PASSWORD","full_name":"Your Name"}'
   ```
5. Configure Cloudflare Turnstile (for the public ticket form):
   - Cloudflare dashboard → Turnstile → new widget for your domain
   - Frontend: put the site key in `VITE_TURNSTILE_SITE_KEY` (Vercel env)
   - Server: put the secret key in Supabase Edge Function secrets as
     `TURNSTILE_SECRET_KEY`
6. Local dev:
   ```bash
   npm install
   npm run dev          # http://localhost:5173
   npm run typecheck    # tsc --noEmit
   npm run lint         # eslint .
   npm run build        # production build
   ```

## Routes

- `/` — public site (hero, segments, products, careers, contact, raise ticket)
- `/login` — unified staff login (routes to Super Admin dashboard or Staff Portal by permissions)
- `/admin`, `/portal` — authenticated dashboards (same URL space; view is decided by role)

## Deployment

Frontend is a Vite SPA hosted on Vercel. Every non-asset request is
rewritten to `index.html` (see [`vercel.json`](./vercel.json)) and the
app handles routing client-side. The service worker (`public/sw.js`)
is intentionally a minimal kill-switch — it takes over from any prior
cached SW, clears caches, unregisters itself, and reloads open tabs.

Cache headers in `vercel.json` are aggressive on `/assets/*`
(1 year immutable) and no-cache on everything else. `public/build-version.json`
is checked every 60 seconds by open tabs and triggers a self-refresh
when a new build is deployed, so nobody needs to manually clear cache.

## Security posture

- All privileged DB operations are gated by RLS policies that check
  both role permission (`has_permission`) and segment access
  (`can_access_segment` or `can_access_staff`).
- The `app_users` table has a `BEFORE UPDATE` trigger blocking any
  privileged-column change (role, segments, permission_overrides,
  salary_structure, is_active, staff_code, designation, employment_type)
  by anyone other than a `manage_staff` holder — defence in depth
  behind the RLS policy.
- Super-admin password resets are guarded server-side: a `manage_staff`
  holder cannot reset another super admin's password.
- Public ticket submission is gated by Cloudflare Turnstile via the
  `raise-ticket` edge function; the function whitelists insert columns
  so a crafted client can't set `status`, `assigned_to`, or `ticket_no`.
- Session tracking (`user_sessions` table + heartbeat + revocation)
  lets any user see and revoke their other devices; two consecutive
  heartbeat failures force a client-side sign-out.
- Sensitive audit trail (login attempts, permission overrides,
  document acknowledgements) lives in `security_audit_logs`.

## Contributing

The layout is deliberately conventional:
- New DB changes go in a new file under `supabase/migrations/` named
  `<YYYYMMDDhhmmss>_<slug>.sql`, wrapped in `BEGIN;` / `COMMIT;` when
  multiple statements should be atomic.
- New role permissions go in the `role_permissions` seed and are then
  referenceable everywhere via `has_permission('your_perm')`.
- New portal tabs go in `SuperAdminDashboard.tsx` (or `StaffPortal.tsx`)
  gated on the appropriate permission — never on role alone.

## Changelog

The full narrative history — every ported feature, every bug found,
every gap plugged during the retirement of the CCTV segment, every
audit round — lives in [CHANGELOG.md](./CHANGELOG.md). It's long
because that's how it was written; it also documents *why* many of
the current migrations exist.
