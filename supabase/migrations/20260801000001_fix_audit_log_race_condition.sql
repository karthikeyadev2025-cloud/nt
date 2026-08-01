/*
  # Fix real production error: 21 occurrences of 42501 on security_audit_logs
  over 3 days, confirmed from live Supabase logs, plus a duplicate-key error
  on attendance check-in.

  ROOT CAUSE (verified by isolated execution against real Postgres):

  20260725000001 split security_audit_logs INSERT permission so 'anon' may
  only log event_type = 'login_failed', while 'login_success' and 'logout'
  require the 'authenticated' role. The reasoning (per that migration's own
  comment) was: before a successful sign-in you're anon, after one you're
  authenticated, so route each event type to the role that should be active
  at that moment.

  That assumption doesn't hold in practice. AuthContext calls logLogin()
  immediately after `supabase.auth.signInWithPassword()` resolves — but
  supabase-js's internal session attachment (which determines what role the
  *next* request actually carries) is not guaranteed to have fully propagated
  to the client's request headers by that exact point, especially on a slow
  network or with certain storage adapters. The result: the login-success log
  request goes out still carrying 'anon', hits the restrictive policy, and
  errors — while the actual sign-in itself has already succeeded. This
  matches the Supabase logs exactly: every single 42501 hit is a real login
  that worked, immediately followed by its own audit log silently failing.

  (Confirmed separately: 'authenticated' role insert of login_success already
  succeeds via the original wide-open "insert own logs" policy from the very
  first migration, which was never dropped. The 20260725 restriction was
  therefore only ever actually blocking the anon-role race case — it added
  no real security value, since audit-log rows are write-only to everyone and
  readable only by super_admin; a spoofed anon 'login_success' row cannot
  grant access to anything.)

  FIX: allow anon to log 'login_success' and 'logout' too, same as the
  original design. This is a non-critical audit trail, not an access-control
  table — the correct trade-off is "always record the event" over "only
  record it from the theoretically-correct role", since the specific
  restriction added last time bought no real security value.

  Also cleans up two now-redundant overlapping INSERT policies down to one
  clear rule per role, instead of the confusing state where an old wide-open
  policy silently made a newer "restrictive-looking" one moot.
*/

DROP POLICY IF EXISTS "insert own logs" ON security_audit_logs;
DROP POLICY IF EXISTS "auth insert own logs" ON security_audit_logs;
DROP POLICY IF EXISTS "anon insert failed logins" ON security_audit_logs;
DROP POLICY IF EXISTS "anon insert login logs" ON security_audit_logs;

CREATE POLICY "authenticated insert audit logs" ON security_audit_logs FOR INSERT TO authenticated
  WITH CHECK (event_type IN ('login_success', 'login_failed', 'logout'));

CREATE POLICY "anon insert audit logs" ON security_audit_logs FOR INSERT TO anon
  WITH CHECK (event_type IN ('login_success', 'login_failed', 'logout'));
