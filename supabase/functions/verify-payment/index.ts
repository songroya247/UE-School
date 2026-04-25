// ═══════════════════════════════════════════════════════════════════
// UE School — Supabase Edge Function: verify-payment
//
// PURPOSE
//   Verify a Paystack transaction reference SERVER-SIDE using the
//   Paystack secret key, then mark the user as premium and the
//   payment row as 'success'. The browser MUST NOT flip is_premium
//   on its own — a malicious user could call the success callback
//   with a fake reference. This function is the single source of
//   truth for "the user paid".
//
// REQUIRED ENV (Supabase → Edge Functions → Secrets)
//   SUPABASE_URL                = https://<project>.supabase.co  (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY   = <service role key>             (auto-set)
//   PAYSTACK_SECRET_KEY         = sk_live_xxx OR sk_test_xxx
//
// DEPLOY
//   supabase functions deploy verify-payment
//   supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
//
// REQUEST
//   POST /functions/v1/verify-payment
//   Authorization: Bearer <user-access-token>
//   Body: { "reference": "UE_…", "plan": "monthly" | "quarterly" | "annual" }
//
// RESPONSE
//   200 { success:true,  expiry:"2026-05-24T…Z" }
//   400 { success:false, message:"Plan amount mismatch" }
//   401 { success:false, message:"Unauthorized" }
//   402 { success:false, message:"Payment not successful" }
// ═══════════════════════════════════════════════════════════════════

// @ts-ignore - Deno std import (resolved at runtime)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore - Supabase client
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ── env helpers ─────────────────────────────────────────────────────
// @ts-ignore - Deno global
const env = (k: string, fallback = ""): string => {
  // @ts-ignore
  return (typeof Deno !== "undefined" && Deno.env ? Deno.env.get(k) : null) ?? fallback;
};

const SUPABASE_URL              = env("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const PAYSTACK_SECRET_KEY       = env("PAYSTACK_SECRET_KEY");

// Plan registry — MUST match js/payment.js exactly. The amount is
// the source of truth; the client cannot tell the server "I paid
// only ₦100 for the annual plan".
interface Plan { amount: number; days: number; }
const PLANS: Record<string, Plan> = {
  monthly:   { amount:  150000, days:  30 },
  quarterly: { amount:  350000, days:  90 },
  annual:    { amount: 1200000, days: 365 },
};

// CORS — adjust ALLOWED_ORIGIN to your production domain(s).
// Use "*" only during development.
const ALLOWED_ORIGIN = env("CORS_ORIGIN", "*");
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age":       "86400",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { success: false, message: "Method not allowed" });
  }

  // Sanity: required envs
  if (!PAYSTACK_SECRET_KEY) {
    return json(500, { success: false, message: "Server misconfigured: PAYSTACK_SECRET_KEY missing" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { success: false, message: "Server misconfigured: Supabase env missing" });
  }

  // ── 1. Identify the caller from their user JWT ────────────────────
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return json(401, { success: false, message: "Missing bearer token" });

  // Use a service-role client to read auth + write profiles/payments
  // bypassing RLS. We still authenticate the caller via getUser(token).
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return json(401, { success: false, message: "Invalid or expired session" });
  }
  const userId    = userRes.user.id;
  const userEmail = userRes.user.email || "";

  // ── 2. Parse and validate the request body ────────────────────────
  let body: { reference?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { success: false, message: "Invalid JSON body" });
  }
  const reference = (body.reference || "").trim();
  const planKey   = (body.plan      || "").trim();
  if (!reference) return json(400, { success: false, message: "reference is required" });
  const plan = PLANS[planKey];
  if (!plan)      return json(400, { success: false, message: "Unknown plan" });

  // ── 3. Verify with Paystack ───────────────────────────────────────
  let paystackData: any;
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    paystackData = await psRes.json();
  } catch (err) {
    console.error("[verify-payment] Paystack call failed:", err);
    return json(502, { success: false, message: "Could not reach Paystack" });
  }
  if (!paystackData?.status) {
    return json(402, {
      success: false,
      message: paystackData?.message || "Paystack rejected the reference",
    });
  }
  const tx = paystackData.data || {};
  if (tx.status !== "success") {
    return json(402, { success: false, message: `Transaction status: ${tx.status}` });
  }

  // ── 4. Anti-tamper checks ─────────────────────────────────────────
  if (Number(tx.amount) !== plan.amount) {
    return json(400, {
      success: false,
      message: `Amount mismatch: expected ${plan.amount}, got ${tx.amount}`,
    });
  }
  // The pending row was inserted by the browser; its user_id MUST
  // match the caller's id. Otherwise user A could claim user B's
  // legitimate payment.
  const { data: pendingRow } = await admin
    .from("payments")
    .select("id, user_id, status")
    .eq("reference", reference)
    .maybeSingle();

  if (pendingRow && pendingRow.user_id !== userId) {
    return json(403, { success: false, message: "Reference does not belong to caller" });
  }

  // Idempotency: if we've already processed this reference, just
  // re-return the current expiry instead of extending again.
  if (pendingRow?.status === "success") {
    const { data: prof } = await admin
      .from("profiles").select("subscription_expiry").eq("id", userId).maybeSingle();
    return json(200, {
      success: true,
      expiry:  prof?.subscription_expiry ?? null,
      already_processed: true,
    });
  }

  // ── 5. Compute new expiry (extend if user is still inside an
  //       active subscription) ──────────────────────────────────────
  const now = new Date();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("subscription_expiry, is_premium")
    .eq("id", userId)
    .maybeSingle();

  let baseDate = now;
  if (existingProfile?.is_premium && existingProfile?.subscription_expiry) {
    const cur = new Date(existingProfile.subscription_expiry);
    if (cur > now) baseDate = cur;
  }
  const newExpiry = new Date(baseDate.getTime() + plan.days * 24 * 60 * 60 * 1000);

  // ── 6. Persist: update profile + mark payment success ─────────────
  const { error: profErr } = await admin
    .from("profiles")
    .update({
      is_premium:          true,
      subscription_expiry: newExpiry.toISOString(),
      status:              "ACTIVE",
    })
    .eq("id", userId);
  if (profErr) {
    console.error("[verify-payment] profile update failed:", profErr);
    return json(500, { success: false, message: "Could not update profile" });
  }

  // Upsert the payment row (covers the case where the browser
  // failed to insert the pending row but Paystack still succeeded).
  await admin.from("payments").upsert({
    reference,
    user_id:    userId,
    amount:     plan.amount,
    plan:       planKey,
    status:     "success",
    paid_at:    new Date(tx.paid_at || Date.now()).toISOString(),
    email:      userEmail,
    raw:        tx,
  }, { onConflict: "reference" });

  return json(200, { success: true, expiry: newExpiry.toISOString() });
});
