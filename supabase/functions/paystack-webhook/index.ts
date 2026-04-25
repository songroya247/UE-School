// ═══════════════════════════════════════════════════════════════════
// UE School — Supabase Edge Function: paystack-webhook
//
// PURPOSE
//   Keep the user's premium status in sync with what Paystack actually
//   thinks. Without this, a renewal billed by Paystack on day 30
//   would never extend the user's subscription_expiry — they would
//   silently lose access until they logged in and paid again.
//
//   Handles these events (extend later as needed):
//     charge.success            → first payment OR renewal succeeded
//     subscription.disable      → subscription cancelled / ended
//     subscription.not_renew    → user opted out of auto-renew
//     invoice.payment_failed    → recurring charge failed
//     refund.processed          → admin / Paystack issued a refund
//
// REQUIRED ENV
//   SUPABASE_URL                = (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY   = (auto-set)
//   PAYSTACK_SECRET_KEY         = sk_live_... (used to verify signature)
//
// DEPLOY
//   supabase functions deploy paystack-webhook --no-verify-jwt
//   # (--no-verify-jwt is REQUIRED — Paystack does not send a JWT)
//
// CONFIGURE PAYSTACK
//   Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL:
//     https://<project>.functions.supabase.co/paystack-webhook
//   Save. Send a test event to confirm a 200 response.
// ═══════════════════════════════════════════════════════════════════

// @ts-ignore - Deno std
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore - Supabase client
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// @ts-ignore - Deno global
const env = (k: string, fallback = ""): string => {
  // @ts-ignore
  return (typeof Deno !== "undefined" && Deno.env ? Deno.env.get(k) : null) ?? fallback;
};

const SUPABASE_URL              = env("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const PAYSTACK_SECRET_KEY       = env("PAYSTACK_SECRET_KEY");

// Plan registry — MUST match js/payment.js and verify-payment.
interface Plan { amount: number; days: number; }
const PLANS_BY_KEY: Record<string, Plan> = {
  monthly:   { amount:  150000, days:  30 },
  quarterly: { amount:  350000, days:  90 },
  annual:    { amount: 1200000, days: 365 },
};
// Map a Paystack plan code back to our internal key — kept here so
// the webhook can resolve renewals (which only carry plan.plan_code).
const PLAN_CODE_TO_KEY: Record<string, string> = {
  PLN_jctl2fmbtbprn79: "monthly",
  PLN_7k27rm469etnc8y: "quarterly",
  PLN_vg1odwe75m793nk: "annual",
};

// ── Signature verification (HMAC SHA-512 of raw body w/ secret) ────
async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader || !PAYSTACK_SECRET_KEY) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare
  if (hex.length !== signatureHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) {
    mismatch |= hex.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── User lookup helpers ────────────────────────────────────────────
async function findUserId(admin: any, customerEmail: string | null): Promise<string | null> {
  if (!customerEmail) return null;
  // First try the profiles table (cheap, indexed in most setups).
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("email", customerEmail)
    .maybeSingle();
  if (data?.id) return data.id;

  // Fall back to auth.users via the admin API (handles users who
  // paid before their profile row was created).
  // listUsers returns at most ~50 by default — fine for a webhook
  // looking up by exact email match in the first page; if your
  // userbase is huge, switch to a stored procedure that filters
  // auth.users by email server-side.
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 200 });
  const u = usersList?.users?.find((x: any) =>
    (x.email || "").toLowerCase() === customerEmail.toLowerCase()
  );
  return u?.id || null;
}

// Compute new expiry — renewals stack on top of an active sub.
async function extendExpiry(admin: any, userId: string, days: number): Promise<string> {
  const now = new Date();
  const { data } = await admin.from("profiles")
    .select("subscription_expiry, is_premium")
    .eq("id", userId).maybeSingle();
  let base = now;
  if (data?.is_premium && data?.subscription_expiry) {
    const cur = new Date(data.subscription_expiry);
    if (cur > now) base = cur;
  }
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Main handler ───────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-paystack-signature");

  if (!(await verifySignature(rawBody, sigHeader))) {
    console.warn("[paystack-webhook] Invalid signature, rejecting.");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const event = payload.event as string;
  const data  = payload.data || {};

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (event) {

      // ── 1. First payment OR renewal succeeded ──────────────────
      case "charge.success": {
        const reference = data.reference as string | undefined;
        const amount    = Number(data.amount || 0);
        const email     = (data.customer?.email as string) || null;
        const planCode  = data.plan?.plan_code as string | undefined;

        // Resolve our internal plan key
        let planKey: string | null = null;
        if (planCode && PLAN_CODE_TO_KEY[planCode]) {
          planKey = PLAN_CODE_TO_KEY[planCode];
        } else {
          // No plan code — try to match by exact amount instead.
          for (const [k, p] of Object.entries(PLANS_BY_KEY)) {
            if (p.amount === amount) { planKey = k; break; }
          }
        }
        if (!planKey) {
          console.warn(`[webhook] charge.success with unknown plan (amount=${amount}, code=${planCode})`);
          return new Response("ok-unmatched", { status: 200 });
        }

        const userId = await findUserId(admin, email);
        if (!userId) {
          console.warn(`[webhook] charge.success for unknown user: ${email}`);
          return new Response("ok-no-user", { status: 200 });
        }

        // Idempotency — if we already have this reference as success,
        // skip (verify-payment may have already processed it).
        if (reference) {
          const { data: existing } = await admin.from("payments")
            .select("status").eq("reference", reference).maybeSingle();
          if (existing?.status === "success") {
            return new Response("ok-already", { status: 200 });
          }
        }

        const newExpiry = await extendExpiry(admin, userId, PLANS_BY_KEY[planKey].days);

        await admin.from("profiles").update({
          is_premium:          true,
          subscription_expiry: newExpiry,
          status:              "ACTIVE",
        }).eq("id", userId);

        if (reference) {
          await admin.from("payments").upsert({
            reference,
            user_id: userId,
            amount:  amount || PLANS_BY_KEY[planKey].amount,
            plan:    planKey,
            status:  "success",
            email,
            paid_at: new Date(data.paid_at || Date.now()).toISOString(),
            raw:     data,
          }, { onConflict: "reference" });
        }
        return new Response("ok", { status: 200 });
      }

      // ── 2. Subscription cancelled / disabled ───────────────────
      case "subscription.disable":
      case "subscription.not_renew": {
        const email = (data.customer?.email as string) || null;
        const userId = await findUserId(admin, email);
        if (!userId) return new Response("ok-no-user", { status: 200 });

        // Don't strip premium immediately — let the user enjoy the
        // time they already paid for. Just mark auto-renew off and
        // let the existing subscription_expiry gate them when it
        // lapses naturally.
        await admin.from("profiles").update({
          status: "CANCEL_SCHEDULED",
        }).eq("id", userId);
        return new Response("ok", { status: 200 });
      }

      // ── 3. Recurring charge failed ─────────────────────────────
      case "invoice.payment_failed": {
        const email = (data.customer?.email as string) || null;
        const userId = await findUserId(admin, email);
        if (!userId) return new Response("ok-no-user", { status: 200 });

        // Same logic as cancel — don't yank access mid-cycle. Mark
        // it so the dashboard can show a friendly "update card" prompt.
        await admin.from("profiles").update({
          status: "PAYMENT_FAILED",
        }).eq("id", userId);
        return new Response("ok", { status: 200 });
      }

      // ── 4. Refund issued — revoke immediately ──────────────────
      case "refund.processed": {
        const reference = data.transaction_reference as string | undefined;
        if (!reference) return new Response("ok-no-ref", { status: 200 });

        const { data: pay } = await admin.from("payments")
          .select("user_id").eq("reference", reference).maybeSingle();
        if (!pay?.user_id) return new Response("ok-no-pay", { status: 200 });

        await admin.from("profiles").update({
          is_premium:          false,
          subscription_expiry: null,
          status:              "REFUNDED",
        }).eq("id", pay.user_id);

        await admin.from("payments").update({ status: "refunded" })
          .eq("reference", reference);
        return new Response("ok", { status: 200 });
      }

      // ── Default: acknowledge so Paystack stops retrying ────────
      default:
        return new Response("ok-ignored", { status: 200 });
    }
  } catch (err) {
    console.error("[paystack-webhook] handler error:", err);
    // Return 500 so Paystack retries with backoff.
    return new Response("Server error", { status: 500 });
  }
});
