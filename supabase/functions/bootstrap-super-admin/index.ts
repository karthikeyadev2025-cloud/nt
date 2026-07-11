import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// One-time bootstrap: creates the FIRST super admin.
// Refuses to run if any super_admin already exists.
// Call once after deploying, then it is inert.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { count } = await supabaseAdmin
      .from("app_users").select("id", { count: "exact", head: true }).eq("role", "super_admin");
    if ((count ?? 0) > 0) return json({ error: "Super admin already exists. Bootstrap disabled." }, 403);

    const { email, password, full_name } = await req.json();
    if (!email || !password || !full_name) return json({ error: "email, password, full_name required" }, 400);
    if (String(password).length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authError) return json({ error: authError.message }, 400);

    const { error: insertError } = await supabaseAdmin.from("app_users").insert({
      id: authData.user.id, email, full_name,
      role: "super_admin", segments: ["all"], is_active: true,
    });
    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return json({ error: insertError.message }, 400);
    }
    return json({ success: true, message: "Super admin created. This function is now inert." });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
