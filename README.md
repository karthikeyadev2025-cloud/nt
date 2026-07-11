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

## Post-launch
- Regenerate strict DB types: `supabase gen types typescript --project-id XXX > src/lib/database.types.ts` and re-add `<Database>` generic in `src/lib/supabase.ts`.
- Replace placeholder contact number/email in Super Admin → Website Content.
- Add real logo/og-image/icons in `public/`.
