// ═══════════════════════════════════════════════════════════════════
// UE School — Supabase Edge Function: admin-action
//
// Performs privileged admin actions:
//   - grant_premium    (with N days)
//   - revoke_premium
//   - extend           (add N days to current expiry)
//   - mark_refunded    (flips a payment row + revokes premium)
//
// Every action requires:
//   1. A valid Supabase JWT in Authorization: Bearer <token>
//   2. The caller's profiles.is_admin = TRUE
//
// Every action is written to admin_audit_log.
//
// DEPLOY
//   supabase functions deploy admin-action
// ═══════════════════════════════════════════════════════════════════

// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// @ts-ignore
const env = (k: string, fallback = ""): string => {
  // @ts-ignore
  return (typeof Deno !== "undefined" && Deno.env ? Deno.env.get(k) : null) ?? fallback;
};

const SUPABASE_URL              = env("SUPABASE_URL");
const SUPABASE_ANON_KEY         = env("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

interface ActionBody {
  action:      "grant_premium" | "revoke_premium" | "extend" | "mark_refunded";
  target_email?: string;
  target_id?:    string;
  days?:         number;
  reference?:    string;        // for mark_refunded
  reason?:       string;        // free-text, stored in audit
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // ── 1. Authenticate caller ────────────────────────────────────────
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
  const caller = userData.user;

  // ── 2. Verify caller is admin (server-side, can't be spoofed) ────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("is_admin, email")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile?.is_admin) {
    return json({ error: "Not authorized — admin only" }, 403);
  }

  // ── 3. Parse body ─────────────────────────────────────────────────
  let body: ActionBody;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.action) return json({ error: "action required" }, 400);

  // ── 4. Resolve target user ────────────────────────────────────────
  let targetId   = body.target_id || "";
  let targetEmail: string | null = body.target_email || null;

  if (!targetId && body.target_email) {
    const { data: tp } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", body.target_email.trim())
      .maybeSingle();
    if (tp?.id) { targetId = tp.id; targetEmail = tp.email; }
  }
  if (targetId && !targetEmail) {
    const { data: tp } = await admin
      .from("profiles").select("email").eq("id", targetId).maybeSingle();
    targetEmail = tp?.email || null;
  }

  // mark_refunded resolves target via the payment row instead.
  if (body.action !== "mark_refunded" && !targetId) {
    return json({ error: "target_email or target_id required" }, 400);
  }

  // ── 5. Perform the action ─────────────────────────────────────────
  let resultDetails: any = {};
  try {
    switch (body.action) {

      case "grant_premium": {
        const days = Math.max(1, Math.min(3650, Number(body.days || 30)));
        const expiry = new Date(Date.now() + days * 86400000).toISOString();
        const { error } = await admin.from("profiles").update({
          is_premium:          true,
          subscription_expiry: expiry,
          status:              "ACTIVE",
        }).eq("id", targetId);
        if (error) throw error;
        resultDetails = { days, new_expiry: expiry };
        break;
      }

      case "extend": {
        const days = Math.max(1, Math.min(3650, Number(body.days || 30)));
        const { data: cur } = await admin.from("profiles")
          .select("subscription_expiry, is_premium")
          .eq("id", targetId).maybeSingle();
        const now = new Date();
        let base = now;
        if (cur?.is_premium && cur?.subscription_expiry) {
          const c = new Date(cur.subscription_expiry);
          if (c > now) base = c;
        }
        const expiry = new Date(base.getTime() + days * 86400000).toISOString();
        const { error } = await admin.from("profiles").update({
          is_premium:          true,
          subscription_expiry: expiry,
          status:              "ACTIVE",
        }).eq("id", targetId);
        if (error) throw error;
        resultDetails = { days, new_expiry: expiry };
        break;
      }

      case "revoke_premium": {
        const { error } = await admin.from("profiles").update({
          is_premium:          false,
          subscription_expiry: null,
          status:              "EXPIRED",
        }).eq("id", targetId);
        if (error) throw error;
        resultDetails = { revoked: true };
        break;
      }

      case "mark_refunded": {
        if (!body.reference) return json({ error: "reference required" }, 400);
        const { data: pay } = await admin.from("payments")
          .select("user_id, status").eq("reference", body.reference).maybeSingle();
        if (!pay) return json({ error: "Payment not found" }, 404);

        targetId = pay.user_id;
        const { data: tp } = await admin.from("profiles")
          .select("email").eq("id", targetId).maybeSingle();
        targetEmail = tp?.email || null;

        await admin.from("payments").update({ status: "refunded" })
          .eq("reference", body.reference);
        await admin.from("profiles").update({
          is_premium:          false,
          subscription_expiry: null,
          status:              "REFUNDED",
        }).eq("id", targetId);
        resultDetails = { reference: body.reference };
        break;
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }

    // ── 6. Audit log ────────────────────────────────────────────────
    await admin.from("admin_audit_log").insert({
      admin_id:     caller.id,
      admin_email:  callerProfile.email || caller.email,
      target_id:    targetId || null,
      target_email: targetEmail,
      action:       body.action,
      details:      { ...resultDetails, reason: body.reason || null },
    });

    return json({ ok: true, ...resultDetails });

  } catch (err: any) {
    console.error("[admin-action] error:", err);
    return json({ error: err?.message || "Action failed" }, 500);
  }
});
