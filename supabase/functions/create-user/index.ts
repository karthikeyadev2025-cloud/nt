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

    // Resolve manage_staff the same way the DB has_permission() does:
    // per-user override wins, otherwise fall back to the role's defaults.
    // This keeps the edge function in agreement with the UI (which shows the
    // onboarding button based on the role-default grant too).
    let hasManageStaff = false;
    if (callerRow?.is_active) {
      if (callerRow.role === "super_admin") {
        hasManageStaff = true;
      } else if (callerRow.permission_overrides && "manage_staff" in callerRow.permission_overrides) {
        hasManageStaff = callerRow.permission_overrides.manage_staff === true;
      } else {
        const { data: rolePerms } = await supabaseAdmin
          .from("role_permissions").select("permissions").eq("role_name", callerRow.role).maybeSingle();
        hasManageStaff = rolePerms?.permissions?.manage_staff === true;
      }
    }
    if (!hasManageStaff) return json({ error: "Not authorized" }, 403);

    const body = await req.json();

    // ── Password reset
    if (body.action === "reset_password" && body.user_id && body.new_password) {
      if (String(body.new_password).length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      // Guard: only a super admin may reset another super admin's password —
      // otherwise an HR / manage_staff holder could take over the root account.
      const { data: targetRow } = await supabaseAdmin
        .from("app_users").select("role").eq("id", body.user_id).maybeSingle();
      if (targetRow?.role === "super_admin" && callerRow.role !== "super_admin") {
        return json({ error: "Only a super admin can reset a super admin's password." }, 403);
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(body.user_id, { password: body.new_password });
      if (error) return json({ error: error.message }, 400);
      // Admin knows this password — force the user to pick their own next login.
      await supabaseAdmin.from("app_users").update({ must_change_password: true }).eq("id", body.user_id);
      return json({ success: true });
    }

    // ── Create staff
    if (body.email && body.password && body.full_name) {
      // Validation floor — was previously enforced only on reset (≥6) and
      // bootstrap (≥8). Create path had none, which meant an HR user
      // could onboard someone with password "a". Match bootstrap's ≥8.
      if (String(body.password).length < 8) {
        return json({ error: "Password must be at least 8 characters." }, 400);
      }
      // Email format check up-front — auth.admin.createUser will reject
      // garbage anyway, but with a less clear error and after a round-trip.
      const emailStr = String(body.email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(emailStr)) {
        return json({ error: "Invalid email address." }, 400);
      }
      // Role must be a known UserRole. Unknown roles have no
      // role_permissions row, so has_permission() returns false for
      // everything and the account silently can't do anything.
      const VALID_ROLES = ["super_admin", "manager", "hr", "marketing_executive", "telecaller", "support_agent", "employee"] as const;
      const requestedRole = body.role || "employee";
      if (!VALID_ROLES.includes(requestedRole)) {
        return json({ error: `Invalid role: ${requestedRole}` }, 400);
      }
      if (requestedRole === "super_admin" && callerRow.role !== "super_admin") {
        return json({ error: "Only a super admin can create another super admin." }, 403);
      }
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: emailStr,
        password: body.password,
        email_confirm: true,
      });
      if (authError) return json({ error: authError.message }, 400);

      const { error: insertError } = await supabaseAdmin.from("app_users").insert({
        id: authData.user.id,
        email: emailStr,
        full_name: body.full_name,
        role: requestedRole,
        segments: Array.isArray(body.segments) ? body.segments : [],
        phone: body.phone || "",
        designation: body.designation || "",
        is_active: true,
        must_change_password: true,
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
