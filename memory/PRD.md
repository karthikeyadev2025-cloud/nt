# Nikki Technologies — Enterprise Staff Portal

## Original problem statement
User reported: "check code all lot of issues logics misses hanging sign in errors and all".
Concrete complaints: sign-in button stays in loading state forever; multiple code gaps.

## Stack
React 18 + Vite 5 + TypeScript + Tailwind + Supabase (Auth, Postgres, RLS, Edge Functions). No custom backend. Runs on port 3000. Supabase project id: `ohprabgcstqwswbcthjs`.

## Architecture (as-shipped)
- `src/lib/supabase.ts` — single Supabase client. Exposes `isSupabaseConfigured` flag so UI can degrade gracefully when creds are missing.
- `src/contexts/AuthContext.tsx` — session bootstrap, sign-in, sign-out, permission loading. All Supabase calls wrapped in a 15s `withTimeout` so a broken network never hangs the UI. localStorage is used only as a fast-path hint — the actual source of truth is the Supabase session.
- `src/App.tsx` — hash- and path-based routing between public site, `/login`, and `/admin`/`/portal` dashboards.
- `src/components/UnifiedLogin.tsx` — login + password recovery UI. Shows a config-warning banner when Supabase isn't configured, and disables submit in that state.
- `src/components/portal/SuperAdminDashboard.tsx` — admin console with role-gated tabs (Overview, Tickets, Tasks, CRM, HR, Access, Segments, Products, Documents, Approvals, Announcements, Careers, Media, Content, Security).
- `src/components/portal/StaffPortal.tsx` — self-service portal for non-admin staff.

## Core requirements (static)
- Sign-in must never hang; must give a clear error on failure.
- Auth must be strict: no super-admin fallback based on email pattern; no localStorage-only sessions.
- Role-based routing: super_admin (or holders of key admin perms) → SuperAdminDashboard; everyone else → StaffPortal.
- Force password change flow when `app_users.must_change_password = true`.
- Password reset via Supabase `resetPasswordForEmail`; UI never leaks whether an email exists.

## What's been implemented (this session — 2026-01-30)
- **[FIX] Hanging sign-in** — every Supabase call in the auth flow is now wrapped in `withTimeout(15s)`. Button will never spin forever.
- **[FIX / CRITICAL SECURITY]** Removed insecure `createFallbackUser` path that promoted ANY email containing "admin/nikki/tech/owner/karthikeya" to `super_admin` without password verification whenever Supabase errored.
- **[FIX]** Post-login permissions now loaded from `role_permissions` table (super_admin still gets `all: true`); previously every logged-in user got `{ all: true }`.
- **[FIX]** localStorage session is only trusted after a live Supabase session confirms the user; tampering with it no longer grants access.
- **[FIX]** Login redirect uses the actual authenticated role (via App.tsx routing) instead of matching substrings of the entered email.
- **[FIX]** Reset-password button now protected by a 15s timeout so it can't hang forever.
- **[FIX]** Runtime crash in `SuperAdminDashboard` (`canApprovals is not defined`) — variable added, gated on `approve_advances || manage_staff`.
- **[FIX]** Type mismatch on `QuickSearch` navigate callback — normalized to `(tab, { kind, id })`.
- **[FIX]** `useSegments.ts` fallback objects updated to match `Segment` schema (`description`, `ticket_prefix`); replaced `.catch` on non-Promise thenables with proper `Promise.resolve(...)` wrapping.
- **[FIX]** Removed duplicate `cleanEmail` declaration in `handleSubmit`.
- **[FIX]** Cleaned up unused imports (`Rocket`, `Award`, `ShieldCheck`, `Clock3`, `CalendarClock`, `UserCircle`, `RefreshCcw`, `selfServiceTabs`, `segments` prop, unused index `i`) so `tsc --noEmit` passes clean.
- **[FIX]** Vite server config — added `host: 0.0.0.0`, `port: 3000`, `allowedHosts: true` for the preview proxy; removed `optimizeDeps.exclude: ['lucide-react']` (was causing 1000+ 429-rate-limited icon requests in dev).
- **[SETUP]** Created `.env` with the provided Supabase URL and anon key.
- **[SETUP]** Added `data-testid`s on email, password, submit, error banner, config-warning banner for reliable E2E testing.
- **[SETUP]** Created supervisor launcher shims at `/app/frontend` (vite launcher on :3000) and `/app/backend` (no-op FastAPI on :8001) so the supervised services stay green.

## Verified in this session
- Sign-in with `nikkitechlabs@gmail.com / Karthi@2025` → Super Admin dashboard in ~2s. ✅
- Sign-in with wrong password → clean "Incorrect email or password." error, stays on login. ✅
- localStorage tampering with a fake `super_admin` payload → rejected on next load, redirected to login. ✅
- `npx tsc --noEmit -p tsconfig.app.json` — passes clean. ✅

## Prioritized backlog (not touched this session)
- **P1** — Broader RLS/permission audit across all portal features (this session only touched auth/routing wiring, not per-table policies).
- **P1** — `AttendanceTrendChart`, `LeadsFunnelChart`, `TicketStatusChart` — verify they cope with empty datasets on brand-new projects (currently show "No data" cards, likely OK).
- **P2** — `PWAInstallBanner` uses a purple gradient not matching the rest of the blue palette — cosmetic.
- **P2** — Service worker at `public/sw.js` caches the SPA shell but `main.tsx` immediately unregisters any SW on load. Decide: keep PWA offline support, or remove `sw.js`. Right now the code contradicts itself.
- **P2** — `securityLogger.ts` will fire-and-forget inserts even when Supabase isn't configured (already swallowed by try/catch, but noisy in the network tab).
- **P3** — README mentions a `bootstrap-super-admin` edge function; if a fresh Supabase project is ever used, run this once (documented in README).

## Test credentials
See `/app/memory/test_credentials.md`.
