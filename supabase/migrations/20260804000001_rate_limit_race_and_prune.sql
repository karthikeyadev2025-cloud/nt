/*
  # Rate-limit hardening (2026-08-04)

  Two follow-ups to 20260803130000_rate_limit_infrastructure.sql found in
  end-to-end review:

  ─────────────────────────────────────────────────────────────────
  1. TOCTOU race in check_rate_limit
  ─────────────────────────────────────────────────────────────────
  Original logic:
      SELECT count(*) ...             -- read
      IF count >= max: return false   -- decide
      INSERT ...                      -- write
      return true

  Two concurrent hits at count = max-1 both see "allowed", both insert,
  and the effective ceiling becomes max*N-concurrent instead of max. On
  the ticket-raise flow that's the difference between "10 tickets an
  hour" and "bursts of 20-30 from one IP that happens to hit us
  concurrently" — Turnstile still fronts it, but the limiter is meant
  to be the second wall and shouldn't be leaky.

  Fix: insert first, then count. A single INSERT ... RETURNING gives us
  an atomic write; the follow-up count now includes our own row, so two
  concurrent callers at count = max-1 both insert (now count = max+1
  for both), both see count > max, both return false. A tiny amount of
  "we logged the request but rejected it" wastage on the boundary, but
  the ceiling holds.

  Also adds an explicit advisory lock keyed by (bucket, identifier) so
  the count-check itself is serialized per-key. This is what actually
  makes the ceiling exact — the insert-first change on its own would
  still allow one over-limit request per concurrent pair.

  ─────────────────────────────────────────────────────────────────
  2. prune_rate_limit_log() never scheduled
  ─────────────────────────────────────────────────────────────────
  The prune function existed but nothing called it, so rate_limit_log
  grew unbounded — every ticket submission, every future rate-limited
  endpoint, forever. With pg_cron available on Supabase, schedule it
  daily at 02:30 IST (21:00 UTC previous day). Guarded so re-running
  this migration on a project without pg_cron installed doesn't fail.
*/

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. Atomic check_rate_limit
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket text,
  p_identifier text,
  p_max integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_lock_key bigint;
BEGIN
  -- Advisory lock scoped to (bucket, identifier). Any two concurrent
  -- callers with the same key serialize here; different keys run in
  -- parallel. Session-scoped (auto-released at transaction end).
  v_lock_key := hashtextextended(p_bucket || ':' || p_identifier, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Count first, THEN insert only if allowed. Because we hold the
  -- advisory lock, no concurrent caller can slip an insert in between.
  SELECT count(*) INTO v_count
    FROM public.rate_limit_log
    WHERE bucket = p_bucket
      AND identifier = p_identifier
      AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_log (bucket, identifier)
    VALUES (p_bucket, p_identifier);
  RETURN true;
END;
$$;

-- Grants unchanged; re-asserted for safety.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- 2. Schedule the prune job
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any previous version (idempotent re-run).
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'prune_rate_limit_log_daily';

    PERFORM cron.schedule(
      'prune_rate_limit_log_daily',
      '30 21 * * *',  -- 21:30 UTC = 03:00 IST, off-peak for this SMB
      $cron$ SELECT public.prune_rate_limit_log(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule prune_rate_limit_log() manually or install pg_cron.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
