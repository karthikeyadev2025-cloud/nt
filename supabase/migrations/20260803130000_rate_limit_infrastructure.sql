/*
  # Rate-limit infrastructure (2026-08-03)

  Reusable rate-limit primitive so any public-facing endpoint can throttle
  by IP, phone, email, or any other identifier. First user: the public
  ticket-raise flow (Turnstile stops bots, but a legit human on a curl
  loop can still flood the queue).

  Design
  ──────
  A single append-only log table keyed by (bucket, identifier, created_at).
  `check_rate_limit(bucket, identifier, max, window_seconds)` counts the
  entries in the window, records the current attempt, and returns
  true/false. Called from edge functions using the service_role client so
  it bypasses the "no execute" grant to public — the whole point is that
  the function must run server-side, not from the anon browser.

  Trade-offs
  ──────────
  Not the fastest possible rate limiter (a real one uses a fixed-size
  Redis window per key). For this app's traffic — a few thousand ticket
  submissions a day at peak — a Postgres table with a partial index on
  the hot window is fine. Old entries get pruned by prune_rate_limit_log()
  which anything scheduled can call.

  Buckets used so far
  ───────────────────
    ticket_raise_ip     — 10 per hour per IP
    ticket_raise_phone  — 5 per hour per submitted phone number
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  identifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON public.rate_limit_log(bucket, identifier, created_at DESC);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- No policies: nothing but service_role should touch this table.

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
BEGIN
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

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_rate_limit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_log
    WHERE created_at < now() - interval '24 hours';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_rate_limit_log() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prune_rate_limit_log() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';