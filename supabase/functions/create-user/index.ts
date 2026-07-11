import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // ── Authorize caller: must be an active super_admin (or hold manage_staff)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const { data: callerRow } = await supabaseAdmin
      .from("app_users").select("role, is_active, permission_overrides").eq("id", caller.id).maybeSingle();
    const authorized = callerRow?.is_active &&
      (callerRow.role === "super_admin" || callerRow?.permission_overrides?.manage_staff === true ||
       (callerRow.role === "hr"));
    if (!authorized) return json({ error: "Not authorized" }, 403);

    const body = await req.json();

    // ── Password reset
    if (body.action === "reset_password" && body.user_id && body.new_password) {
      if (String(body.new_password).length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(body.user_id, { password: body.new_password });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ── Create staff
    if (body.email && body.password && body.full_name) {
      if (body.role === "super_admin" && callerRow.role !== "super_admin") {
        return json({ error: "Only a super admin can create another super admin." }, 403);
      }
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      });
      if (authError) return json({ error: authError.message }, 400);

      const { error: insertError } = await supabaseAdmin.from("app_users").insert({
        id: authData.user.id,
        email: body.email,
        full_name: body.full_name,
        role: body.role || "employee",
        segments: Array.isArray(body.segments) ? body.segments : [],
        phone: body.phone || "",
        designation: body.designation || "",
        is_active: true,
        created_by: caller.id,
      });
      if (insertError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return json({ error: insertError.message }, 400);
      }
      return json({ success: true, user_id: authData.user.id });
    }

    return json({ error: "Invalid request" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
