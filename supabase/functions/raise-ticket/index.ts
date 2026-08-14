import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * raise-ticket
 *
 * Public ticket-creation endpoint fronted by Cloudflare Turnstile.
 *
 * Why this exists
 * ───────────────
 * The old flow was a raw `.insert()` on `support_tickets` from the browser
 * using the anon key, permitted by an `INSERT ... WITH CHECK (true)` RLS
 * policy. That works, but it means anyone with 15 seconds of curl practice
 * can fill the tickets table forever, and every one of those bogus rows
 * ends up as a notification / dashboard-badge / assignment burden for the
 * team on the other side.
 *
 * This function is the new front door for public ticket creation:
 *   1. Verify a Turnstile token with Cloudflare (rejects bots).
 *   2. Do server-side field validation.
 *   3. Insert with the service-role client so the RLS anon policy can
 *      eventually be dropped once every client uses this endpoint.
 *
 * Env
 * ───
 *   TURNSTILE_SECRET_KEY — Cloudflare Turnstile server-side secret.
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — standard.
 *
 * If TURNSTILE_SECRET_KEY is unset (e.g. running against a fresh Supabase
 * project before secrets are configured) the function refuses to run
 * rather than silently letting spam through — a broken deploy should fail
 * closed, not open.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Minimal validation — mirrors what the DB CHECK constraints would reject
// anyway but returns a friendly error instead of a 500.
function validate(body: Record<string, unknown>): string | null {
  const required = ["segment_slug", "subject", "customer_name", "customer_phone"];
  for (const k of required) {
    if (!body[k] || String(body[k]).trim() === "") return `Missing ${k}`;
  }
  if (String(body.subject).length > 500) return "Subject too long";
  if (String(body.description ?? "").length > 5000) return "Description too long";
  const phone = String(body.customer_phone).replace(/\D/g, "");
  if (phone.length < 10) return "Phone number too short";
  const email = String(body.customer_email ?? "").trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return "Invalid email";
  const priority = String(body.priority ?? "medium");
  if (!["low", "medium", "high", "urgent"].includes(priority)) return "Invalid priority";
  return null;
}

async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    // Fail closed — see file header.
    console.error("[raise-ticket] TURNSTILE_SECRET_KEY not configured");
    return false;
  }
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return false;
    const data = await res.json() as { success?: boolean };
    return data.success === true;
  } catch (e) {
    console.error("[raise-ticket] turnstile verify failed:", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Everything below can throw in ways none of the individual try/catches
  // below anticipate (a bad env var, an unexpected Supabase client error
  // shape, etc.) — previously an uncaught exception anywhere in here fell
  // through to Deno's default handler, which returns a bare 500 with no
  // body and nothing in the function logs to explain why. That's exactly
  // what showed up in the browser console with zero diagnostic value.
  // Wrapping the rest in one try/catch guarantees every failure path logs
  // a real stack trace server-side and returns a JSON body instead.
  try {
    const token = String(body.turnstile_token ?? "");
    if (!token) return json({ error: "Missing bot-check token" }, 400);

    const remoteIp = req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? null;

    const ok = await verifyTurnstile(token, remoteIp);
    if (!ok) return json({ error: "Bot check failed. Please refresh and try again." }, 403);

    const validationError = validate(body);
    if (validationError) return json({ error: validationError }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Whitelist segment_slug against the real segments table.
    //    Without this, any string sneaks through — a curl user could
    //    insert segment_slug = "arbitrary" and pollute support_tickets
    //    with rows that no dashboard, RPC, or assignee pool maps to,
    //    and they'd sit forever as orphaned queue.
    {
      const slug = String(body.segment_slug);
      const { data: seg, error: segErr } = await supabaseAdmin
        .from("segments").select("slug").eq("slug", slug).eq("is_active", true).maybeSingle();
      if (segErr) {
        console.error("[raise-ticket] segment lookup failed:", segErr.message);
        return json({ error: "Could not verify segment. Please try again." }, 500);
      }
      if (!seg) return json({ error: "Unknown segment." }, 400);
    }
    // Same length cap on ticket_type — no whitelist because the business
    // may add types, but 100 chars is far more than any real label.
    if (String(body.ticket_type ?? "").length > 100) return json({ error: "Ticket type too long" }, 400);

    // ── Rate limit (Turnstile stops bots; this stops a legit human on a
    //    script from flooding the queue). Two buckets so we throttle
    //    both source machine and target account:
    //      • by IP:    10 tickets / hour  — noticeable-but-usable ceiling
    //      • by phone:  5 tickets / hour  — one phone shouldn't file more
    //
    //    Both checks skip on service-side failure (rateErr) — we refuse to
    //    fail-open on the bot check but allow submissions through if the
    //    limiter itself is broken. The alternative (fail-closed) means one
    //    Postgres blip stops every customer from filing a ticket, which is
    //    worse than briefly-unmetered submissions.
    const RATE_LIMIT_IP_MAX = 10;
    const RATE_LIMIT_PHONE_MAX = 5;
    const RATE_LIMIT_WINDOW_SEC = 3600;

    async function checkLimit(bucket: string, identifier: string, max: number): Promise<{ allowed: boolean; error?: string }> {
      const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
        p_bucket: bucket,
        p_identifier: identifier,
        p_max: max,
        p_window_seconds: RATE_LIMIT_WINDOW_SEC,
      });
      if (error) {
        console.error(`[raise-ticket] rate limit check failed (${bucket}):`, error.message);
        return { allowed: true };  // fail-open on infra error, see comment above
      }
      return { allowed: data === true };
    }

    if (remoteIp) {
      const ipCheck = await checkLimit("ticket_raise_ip", remoteIp, RATE_LIMIT_IP_MAX);
      if (!ipCheck.allowed) {
        return json({ error: "Too many tickets from your network in the last hour. Please try again later or call us." }, 429);
      }
    }
    const phoneCheck = await checkLimit("ticket_raise_phone", String(body.customer_phone).replace(/\D/g, ""), RATE_LIMIT_PHONE_MAX);
    if (!phoneCheck.allowed) {
      return json({ error: "This phone number has raised several tickets recently. Please wait an hour or call us." }, 429);
    }

    // Whitelist columns to prevent a client from sneaking in fields we
    // don't want it to control (assigned_to, status, ticket_no, etc.)
    const insertRow = {
      segment_slug: String(body.segment_slug),
      ticket_type: String(body.ticket_type ?? "General Support"),
      subject: String(body.subject),
      description: String(body.description ?? ""),
      priority: String(body.priority ?? "medium"),
      customer_name: String(body.customer_name),
      customer_phone: String(body.customer_phone),
      customer_email: String(body.customer_email ?? ""),
      product_slug: body.product_slug ? String(body.product_slug) : null,
    };

    const { data, error } = await supabaseAdmin
      .from("support_tickets")
      .insert(insertRow)
      .select("ticket_no")
      .single();

    if (error || !data) {
      console.error("[raise-ticket] insert failed:", error?.message);
      return json({ error: "Could not create ticket. Please try again." }, 500);
    }

    return json({ ticket_no: data.ticket_no });
  } catch (e) {
    console.error("[raise-ticket] unhandled error:", e instanceof Error ? e.stack ?? e.message : e);
    return json({ error: "Something went wrong creating your ticket. Please try again or call us." }, 500);
  }
});
