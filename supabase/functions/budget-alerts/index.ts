/**
 * budget-alerts
 * Runs daily (via pg_cron) or on demand (from Settings page).
 * For every org with an active school year:
 *   - Checks each budget source for overrun (>100%) or warning (>80%)
 *   - Sends a Hebrew email via Resend to the org owner + admins
 *
 * Auth:
 *   - Cron: x-cron-secret header must match CRON_SECRET env var
 *   - Manual: valid Supabase JWT (any authenticated user of that org)
 *
 * Env vars needed:
 *   RESEND_API_KEY, CRON_SECRET,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto-injected)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY");
const CRON_SECRET  = Deno.env.get("CRON_SECRET");

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
}

function pctBar(pct: number): string {
  const capped = Math.min(pct, 200);
  const color = pct >= 100 ? "#DC2626" : pct >= 80 ? "#D97706" : "#2D6644";
  const width = Math.min(capped / 2, 100); // bar width as % (max 100% visually)
  return `<div style="background:#EEE;border-radius:4px;height:8px;margin-top:4px;">
    <div style="background:${color};width:${width}%;height:8px;border-radius:4px;"></div>
  </div>`;
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_KEY) { console.warn("RESEND_API_KEY not set"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "הכרם <noreply@hakerem.app>", to, subject, html }),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
}

interface SourceRow { source: string; label: string; planned: number; used: number; pct: number; }

async function processOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  orgName: string,
  yearId: string,
  yearName: string,
  adminEmails: string[],
  orgSlug?: string | null,
) {
  if (!adminEmails.length) return;

  // 1. Budget categories (planned per source)
  const { data: cats } = await supabase
    .from("budget_categories")
    .select("source, planned_amount, name")
    .eq("school_year_id", yearId);

  // 2. Expenses (used per source)
  const { data: exps } = await supabase
    .from("expenses")
    .select("source, amount")
    .eq("school_year_id", yearId);

  // 3. Org budget sources
  const { data: orgSources } = await supabase
    .from("org_budget_sources")
    .select("slug, label")
    .eq("org_id", orgId)
    .order("order_index");

  const allSources = orgSources?.length
    ? orgSources
    : [{ slug: "gefen", label: "גפן" }, { slug: "iriyah", label: "עירייה" }, { slug: "horim", label: "הורים" }];

  const sources: SourceRow[] = allSources.map(({ slug, label }) => {
    const planned = (cats ?? []).filter(c => c.source === slug).reduce((s, c) => s + Number(c.planned_amount), 0);
    const used    = (exps ?? []).filter(e => e.source === slug).reduce((s, e) => s + Number(e.amount), 0);
    const pct     = planned > 0 ? Math.round((used / planned) * 100) : 0;
    return { source: slug, label, planned, used, pct };
  });

  // 4. Categorise alerts
  const overruns  = sources.filter(s => s.planned > 0 && s.used > s.planned);
  const warnings  = sources.filter(s => s.planned > 0 && s.pct >= 80 && s.used <= s.planned);

  if (!overruns.length && !warnings.length) {
    console.log(`[budget-alerts] Org ${orgName}: no alerts needed`);
    return;
  }

  const hasOverrun = overruns.length > 0;
  const subject = hasOverrun
    ? `🔴 חריגה תקציבית — ${orgName} (${yearName})`
    : `🟡 אזהרת תקציב — ${orgName} (${yearName})`;

  const overrunRows = overruns.map(s => `
    <tr>
      <td style="padding:10px 12px;font-weight:700;color:#DC2626;">${s.label}</td>
      <td style="padding:10px 12px;text-align:left;">${fmt(s.planned)}</td>
      <td style="padding:10px 12px;text-align:left;font-weight:700;color:#DC2626;">${fmt(s.used)}</td>
      <td style="padding:10px 12px;text-align:left;font-weight:700;color:#DC2626;">
        ${s.pct}%
        ${pctBar(s.pct)}
      </td>
      <td style="padding:10px 12px;text-align:left;color:#DC2626;font-weight:700;">+${fmt(s.used - s.planned)}</td>
    </tr>`).join("");

  const warningRows = warnings.map(s => `
    <tr>
      <td style="padding:10px 12px;font-weight:600;color:#D97706;">${s.label}</td>
      <td style="padding:10px 12px;text-align:left;">${fmt(s.planned)}</td>
      <td style="padding:10px 12px;text-align:left;">${fmt(s.used)}</td>
      <td style="padding:10px 12px;text-align:left;font-weight:700;color:#D97706;">
        ${s.pct}%
        ${pctBar(s.pct)}
      </td>
      <td style="padding:10px 12px;text-align:left;color:#888;">נותר ${fmt(s.planned - s.used)}</td>
    </tr>`).join("");

  const allRows = overrunRows + warningRows;
  const appUrl = orgSlug ? `https://hakerem.app` : "https://hakerem.app";

  const html = `
<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px;color:#1A1A1A;">

  <!-- Header -->
  <div style="margin-bottom:28px;display:flex;align-items:center;gap:12px;">
    <span style="font-size:30px;">🏫</span>
    <strong style="font-size:20px;color:#1A3D2B;">הכרם</strong>
  </div>

  <!-- Alert Banner -->
  <div style="background:${hasOverrun ? "linear-gradient(135deg,#DC2626,#991B1B)" : "linear-gradient(135deg,#D97706,#B45309)"};
              border-radius:12px;padding:20px 24px;margin-bottom:28px;color:#fff;">
    <div style="font-size:22px;font-weight:700;margin-bottom:6px;">
      ${hasOverrun ? "⚠️ חריגה תקציבית" : "⚠️ אזהרת תקציב"}
    </div>
    <div style="font-size:14px;opacity:0.9;">
      ${orgName} · שנת לימודים: ${yearName}
    </div>
  </div>

  <!-- Summary -->
  <p style="font-size:15px;line-height:1.7;margin-bottom:20px;">
    ${hasOverrun
      ? `זוהו <strong>${overruns.length} מקור${overruns.length > 1 ? "ות" : ""}</strong> שחרגו מהתקציב המאושר.`
      : ""}
    ${warnings.length
      ? `<br/>${warnings.length} מקור${warnings.length > 1 ? "ות" : ""} ניצלו מעל 80% מהתקציב.`
      : ""}
  </p>

  <!-- Table -->
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px;">
    <thead>
      <tr style="background:#F5F5F5;">
        <th style="padding:10px 12px;text-align:right;font-weight:600;border-bottom:2px solid #DDD;">מקור</th>
        <th style="padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #DDD;">תקציב מאושר</th>
        <th style="padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #DDD;">בפועל</th>
        <th style="padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #DDD;">ניצול</th>
        <th style="padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #DDD;">פער</th>
      </tr>
    </thead>
    <tbody style="border:1px solid #EEE;">
      ${allRows}
    </tbody>
  </table>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${appUrl}/budget"
       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2D6644,#1A3D2B);
              color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">
      כניסה למסך תקציב ←
    </a>
  </div>

  <!-- Footer -->
  <p style="font-size:12px;color:#AAA;border-top:1px solid #EEE;padding-top:16px;margin:0;">
    התראה זו נשלחה אוטומטית ממערכת הכרם · ${new Date().toLocaleDateString("he-IL")}<br/>
    לביטול קבלת התראות: <a href="mailto:yonatanfridmanmusic@gmail.com" style="color:#2D6644;">צור קשר</a>
  </p>
</div>`;

  await sendEmail(adminEmails, subject, html);
  console.log(`[budget-alerts] Sent alert to ${adminEmails.length} recipient(s) for org ${orgName}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth ─────────────────────────────────────────────────────────────────
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  let orgIdFilter: string | null = null; // null = all orgs (cron), string = specific org (manual)

  if (cronSecret) {
    if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    // cron run — process all orgs
  } else if (authHeader) {
    // Manual trigger from app — verify user and find their org
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await anonClient.auth.getUser();
    if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    // Find their org
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mem } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (!mem) return new Response("Forbidden", { status: 403, headers: corsHeaders });
    orgIdFilter = mem.organization_id;
  } else {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get active school years (filtered to org if manual trigger)
    let yearQuery = supabase
      .from("school_years")
      .select("id, name, organization_id, organizations(id, name)")
      .eq("is_active", true);
    if (orgIdFilter) yearQuery = yearQuery.eq("organization_id", orgIdFilter);

    const { data: years, error: yearErr } = await yearQuery;
    if (yearErr) throw yearErr;

    let processed = 0;
    for (const year of years ?? []) {
      const org = year.organizations as { id: string; name: string } | null;
      if (!org) continue;

      // Get admin + owner emails for this org
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, role, profiles(email, full_name)")
        .eq("organization_id", org.id)
        .eq("status", "active")
        .in("role", ["owner", "admin"]);

      const adminEmails = (members ?? [])
        .map(m => (m.profiles as { email: string | null } | null)?.email)
        .filter((e): e is string => !!e);

      await processOrg(supabase, org.id, org.name, year.id, year.name, adminEmails);
      processed++;
    }

    return new Response(
      JSON.stringify({ ok: true, orgs_processed: processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[budget-alerts] error:", String(err));
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
