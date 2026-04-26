// ═══════════════════════════════════════════════════════════════════
// UE School — Supabase Edge Function: send-weekly-reports
// Runs every Saturday morning (Africa/Lagos) via pg_cron and e-mails
// every opted-in profile a snapshot of their performance report.
//
// Required env (Supabase \u2192 Project Settings \u2192 Edge Functions \u2192 Secrets):
//   SUPABASE_URL                = https://<project>.supabase.co       (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY   = <service role key>                   (auto-set)
//   RESEND_API_KEY              = re_xxx... (from https://resend.com)
//   EMAIL_FROM                  = "UE School <reports@your-domain>"
//   PUBLIC_SITE_URL             = https://www.your-deploy-url.com
//   CRON_SHARED_SECRET          = a long random string (any value)
//
// Trigger: HTTP POST. Authentication is by the X-Cron-Secret header.
// ═══════════════════════════════════════════════════════════════════
//
// Local deploy:
//   supabase functions deploy send-weekly-reports --no-verify-jwt
//
// Test by hand once deployed:
//   curl -X POST \
//     -H "X-Cron-Secret: $CRON_SHARED_SECRET" \
//     "https://<project>.functions.supabase.co/send-weekly-reports?dry=1"
// ═══════════════════════════════════════════════════════════════════

// @ts-ignore - Deno std import (resolved at runtime by the Edge runtime)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore - Supabase client (resolved at runtime)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ── env helpers ─────────────────────────────────────────────────────
// @ts-ignore - Deno global, available in the Edge runtime
const env = (k: string, fallback = ""): string => {
  // @ts-ignore
  return (typeof Deno !== "undefined" && Deno.env ? Deno.env.get(k) : null) ?? fallback;
};

const SUPABASE_URL              = env("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY            = env("RESEND_API_KEY");
const EMAIL_FROM                = env("EMAIL_FROM", "UE School <noreply@ueschool.com>");
const PUBLIC_SITE_URL           = env("PUBLIC_SITE_URL", "https://ueschool.example.com").replace(/\/+$/, "");
const CRON_SHARED_SECRET        = env("CRON_SHARED_SECRET");

const SUBJ_LABELS: Record<string, string> = {
  mathematics: "Mathematics", english: "English Language", physics: "Physics",
  chemistry: "Chemistry",     biology: "Biology",          economics: "Economics",
  government: "Government",   literature: "Literature",    geography: "Geography",
  commerce: "Commerce",       accounts: "Accounts",        crk: "CRK",
};

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  exam_types: string[] | null;
  exam_subjects: string[] | null;
  target_score: number | null;
  target_grade: string | null;
  total_xp: number | null;
  email_unsub_token: string | null;
  weekly_report_optin: boolean | null;
  report_share_token: string | null;
}

interface MasteryRow { topic_id: string; mastery_level: number | null }
interface SessionRow { exam_type: string; score: number; total_questions: number; accuracy: number; created_at: string }

// ── helpers ─────────────────────────────────────────────────────────
function escape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function masteryToGrade(m: number | null) {
  if (m === null || m === undefined) return { label: "NIL", color: "#6b7280", bg: "#f3f4f6" };
  const p = m * 100;
  if (p >= 75) return { label: "A1", color: "#065f46", bg: "#d1fae5" };
  if (p >= 65) return { label: "B2", color: "#1d4ed8", bg: "#dbeafe" };
  if (p >= 60) return { label: "B3", color: "#3730a3", bg: "#e0e7ff" };
  if (p >= 55) return { label: "C4", color: "#b45309", bg: "#fef3c7" };
  if (p >= 50) return { label: "C5", color: "#b45309", bg: "#fef3c7" };
  if (p >= 45) return { label: "C6", color: "#b45309", bg: "#fef3c7" };
  if (p >= 40) return { label: "D7", color: "#991b1b", bg: "#fee2e2" };
  return                    { label: "F9", color: "#7f1d1d", bg: "#fef2f2" };
}

function predictJambBand(rows: MasteryRow[]): { low: number; high: number } | null {
  const valid = rows.filter(r => r.mastery_level !== null);
  if (valid.length < 3) return null;
  const avg = valid.reduce((a, r) => a + (r.mastery_level || 0), 0) / valid.length;
  // Map 0..1 mastery to 100..360 JAMB-ish band, then \u00b115 spread
  const mid = Math.round(120 + avg * 240);
  return { low: Math.max(100, mid - 15), high: Math.min(400, mid + 15) };
}

function buildEmailHtml(p: Profile, mastery: MasteryRow[], sessions: SessionRow[]): string {
  const exams      = p.exam_types || [];
  const hasJamb    = exams.includes("JAMB") || exams.includes("Post-UTME");
  const hasGrade   = exams.includes("WAEC") || exams.includes("NECO");

  const subjMap: Record<string, number[]> = {};
  for (const r of mastery) {
    if (r.mastery_level === null) continue;
    const s = r.topic_id.split(".")[0];
    (subjMap[s] = subjMap[s] || []).push(r.mastery_level);
  }

  const gradeRows = (p.exam_subjects || []).map(s => {
    const arr = subjMap[s];
    const avg = arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const g   = masteryToGrade(avg);
    return `<tr><td style="padding:6px 0;font-size:14px;color:#0f1c3f;">${escape(SUBJ_LABELS[s] || s)}</td>
      <td align="right"><span style="display:inline-block;background:${g.bg};color:${g.color};padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;">${g.label}</span></td></tr>`;
  }).join("");

  const jambBand = hasJamb ? predictJambBand(mastery) : null;
  const jambBlock = hasJamb ? `
    <tr><td style="padding:18px 0 6px;font-size:13px;font-weight:700;color:#6b82b0;text-transform:uppercase;letter-spacing:.06em;">Predicted JAMB score</td></tr>
    <tr><td style="font-size:28px;font-family:'Syne',Arial,sans-serif;color:#1a56ff;font-weight:800;">
      ${jambBand ? `${jambBand.low}\u2013${jambBand.high} <span style="font-size:14px;color:#98aed4;">/ 400</span>`
                 : `<span style="font-size:16px;color:#98aed4;font-family:Arial,sans-serif;font-weight:500;">Need a few more sessions to predict.</span>`}
    </td></tr>` : "";

  const top3Weak = [...mastery]
    .filter(r => r.mastery_level !== null)
    .sort((a, b) => (a.mastery_level || 0) - (b.mastery_level || 0))
    .slice(0, 3);

  const weakRows = top3Weak.length ? top3Weak.map(r => {
    const parts = r.topic_id.split(".");
    const subj  = SUBJ_LABELS[parts[0]] || parts[0];
    const topic = parts.slice(1).join(" ") || r.topic_id;
    const pct   = Math.round((r.mastery_level || 0) * 100);
    return `<tr>
      <td style="padding:8px 0;font-size:13px;color:#0f1c3f;">${escape(topic)}<br><span style="color:#6b82b0;font-size:11px;">${escape(subj)}</span></td>
      <td align="right" style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#b45309;font-weight:700;">${pct}%</td>
    </tr>`;
  }).join("") : `<tr><td style="font-size:13px;color:#6b82b0;padding:8px 0;">No topic data yet \u2014 take a CBT session this week.</td></tr>`;

  const sessRows = sessions.length ? sessions.slice(0, 5).map(s => {
    const dt  = new Date(s.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
    const acc = Math.round((s.accuracy || 0) * 100);
    return `<tr>
      <td style="padding:6px 0;font-size:13px;color:#0f1c3f;">${escape(dt)} \u00b7 ${escape(s.exam_type)}</td>
      <td align="right" style="font-size:13px;color:#0f1c3f;font-weight:700;">${s.score}/${s.total_questions} <span style="color:#6b82b0;font-weight:500;">(${acc}%)</span></td>
    </tr>`;
  }).join("") : `<tr><td style="font-size:13px;color:#6b82b0;padding:8px 0;">No sessions this week \u2014 a 10-minute drill counts.</td></tr>`;

  const reportUrl = p.report_share_token
    ? `${PUBLIC_SITE_URL}/report.html?token=${encodeURIComponent(p.report_share_token)}`
    : `${PUBLIC_SITE_URL}/dashboard.html`;
  const unsubUrl  = `${PUBLIC_SITE_URL}/unsubscribe.html?token=${encodeURIComponent(p.email_unsub_token || "")}&confirm=1`;
  const prefsUrl  = `${PUBLIC_SITE_URL}/dashboard.html`;
  const firstName = (p.full_name || p.email.split("@")[0]).split(/\s+/)[0];

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Your weekly UE School report</title></head>
<body style="margin:0;padding:0;background:#f0f5ff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f5ff;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid rgba(59,130,246,.18);">
    <tr><td style="background:linear-gradient(135deg,#1a56ff,#1d4ed8);padding:26px 28px;color:#fff;">
      <div style="font-family:'Inter',Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;opacity:.8;">UE School \u00b7 Weekly Report</div>
      <div style="font-family:'Syne',Arial,sans-serif;font-size:24px;font-weight:800;margin-top:6px;">Hi ${escape(firstName)}, here&rsquo;s your week.</div>
      <div style="margin-top:6px;font-size:13px;opacity:.85;">${exams.length ? escape(exams.join(" / ")) : "Your study summary"} \u00b7 ${escape(p.total_xp ?? 0)} XP total</div>
    </td></tr>

    <tr><td style="padding:24px 28px 8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        ${jambBlock}
        ${gradeRows ? `<tr><td style="padding:18px 0 6px;font-size:13px;font-weight:700;color:#6b82b0;text-transform:uppercase;letter-spacing:.06em;">${hasGrade ? "WAEC / NECO grade estimates" : "Subject readiness"}</td></tr>
        <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${gradeRows}</table></td></tr>` : ""}
      </table>
    </td></tr>

    <tr><td style="padding:18px 28px 8px;">
      <div style="font-size:13px;font-weight:700;color:#6b82b0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Top 3 to revise</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${weakRows}</table>
    </td></tr>

    <tr><td style="padding:18px 28px 8px;">
      <div style="font-size:13px;font-weight:700;color:#6b82b0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Recent sessions</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${sessRows}</table>
    </td></tr>

    <tr><td align="center" style="padding:22px 28px 28px;">
      <a href="${reportUrl}" style="display:inline-block;background:#1a56ff;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:10px;">Open full report</a>
    </td></tr>

    <tr><td style="padding:18px 28px;background:#f4f8ff;border-top:1px solid rgba(59,130,246,.10);font-size:11px;color:#6b82b0;text-align:center;line-height:1.55;">
      You&rsquo;re receiving this because you&rsquo;re an active UE School student.<br>
      <a href="${prefsUrl}" style="color:#1a56ff;text-decoration:underline;">Manage preferences</a>
      &nbsp;\u00b7&nbsp;
      <a href="${unsubUrl}" style="color:#1a56ff;text-decoration:underline;">Unsubscribe from weekly emails</a><br>
      <span style="color:#98aed4;">UE School \u00a9 ${new Date().getFullYear()}</span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function buildEmailText(p: Profile, mastery: MasteryRow[], sessions: SessionRow[]): string {
  const firstName = (p.full_name || p.email.split("@")[0]).split(/\s+/)[0];
  const exams     = (p.exam_types || []).join(" / ");
  const sess      = sessions.slice(0, 5).map(s =>
    `- ${new Date(s.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })} ${s.exam_type}: ${s.score}/${s.total_questions} (${Math.round((s.accuracy||0)*100)}%)`
  ).join("\n") || "  (none this week)";
  const top3 = [...mastery].filter(r => r.mastery_level !== null)
    .sort((a, b) => (a.mastery_level||0) - (b.mastery_level||0)).slice(0, 3)
    .map(r => `- ${r.topic_id}: ${Math.round((r.mastery_level||0)*100)}%`).join("\n") || "  (no topic data yet)";

  const reportUrl = p.report_share_token
    ? `${PUBLIC_SITE_URL}/report.html?token=${encodeURIComponent(p.report_share_token)}`
    : `${PUBLIC_SITE_URL}/dashboard.html`;
  const unsubUrl  = `${PUBLIC_SITE_URL}/unsubscribe.html?token=${encodeURIComponent(p.email_unsub_token || "")}&confirm=1`;

  return [
    `Hi ${firstName},`,
    ``,
    `Your weekly UE School report (${exams || "study summary"}):`,
    `Total XP: ${p.total_xp ?? 0}`,
    ``,
    `Top 3 to revise:`,
    top3,
    ``,
    `Recent sessions:`,
    sess,
    ``,
    `Open the full report: ${reportUrl}`,
    ``,
    `---`,
    `Unsubscribe from weekly emails: ${unsubUrl}`,
    `Manage preferences: ${PUBLIC_SITE_URL}/dashboard.html`,
  ].join("\n");
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  unsubToken: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  // Per-recipient one-click unsubscribe URL.
  // RFC 8058 + Gmail/Yahoo bulk-sender rules require BOTH headers.
  const unsubUrl = `${PUBLIC_SITE_URL}/unsubscribe.html?token=${encodeURIComponent(unsubToken)}&confirm=1`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    EMAIL_FROM,
      to:      [to],
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe":      `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
}

// ── handler ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const provided = req.headers.get("x-cron-secret") || "";
  if (!CRON_SHARED_SECRET || provided !== CRON_SHARED_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const limit  = parseInt(url.searchParams.get("limit") || "1000", 10);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "missing supabase env" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  if (!dryRun && !RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "missing RESEND_API_KEY" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull every opted-in profile that hasn't been emailed in the last 5 days
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error: profErr } = await sb
    .from("profiles")
    .select("id,email,full_name,exam_types,exam_subjects,target_score,target_grade,total_xp,email_unsub_token,weekly_report_optin,report_share_token,last_weekly_email_at")
    .eq("weekly_report_optin", true)
    .not("email", "is", null)
    .or(`last_weekly_email_at.is.null,last_weekly_email_at.lt.${fiveDaysAgo}`)
    .limit(limit);

  if (profErr) {
    return new Response(JSON.stringify({ error: profErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  let sent = 0, failed = 0, skipped = 0;
  const errors: { id: string; reason: string }[] = [];

  for (const p of (profiles || []) as Profile[]) {
    if (!p.email) { skipped++; continue; }

    const [{ data: mastery }, { data: sessions }] = await Promise.all([
      sb.from("topic_mastery").select("topic_id,mastery_level").eq("user_id", p.id),
      sb.from("session_scores").select("exam_type,score,total_questions,accuracy,created_at")
        .eq("user_id", p.id).order("created_at", { ascending: false }).limit(10),
    ]);

    const html    = buildEmailHtml(p, (mastery || []) as MasteryRow[], (sessions || []) as SessionRow[]);
    const text    = buildEmailText(p, (mastery || []) as MasteryRow[], (sessions || []) as SessionRow[]);
    const subject = "Your UE School weekly report";

    if (dryRun) { sent++; continue; }

    const r = await sendEmail(p.email, subject, html, text, p.email_unsub_token || "");
    if (!r.ok) {
      failed++;
      errors.push({ id: p.id, reason: `resend ${r.status}: ${r.body.slice(0, 200)}` });
      continue;
    }
    sent++;
    await sb.from("profiles").update({ last_weekly_email_at: new Date().toISOString() }).eq("id", p.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    dryRun,
    candidates: (profiles || []).length,
    sent, failed, skipped,
    errors: errors.slice(0, 10),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
