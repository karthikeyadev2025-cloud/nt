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
  "Access-Control-Allow-Headers": "Content-Type, X-Client-Info, Apikey",
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
});
