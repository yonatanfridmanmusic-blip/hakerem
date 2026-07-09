/**
 * weekly-summary
 * Runs every Sunday morning (via pg_cron) or on demand from Settings.
 * For each org with an active school year:
 *   - Fetches full budget/expenses/income/horim data
 *   - Asks Claude Haiku to write a concise Hebrew executive summary
 *   - Sends a beautiful HTML email via Resend to org owner + admins
 *
 * Auth: same as budget-alerts — x-cron-secret OR valid JWT
 * Env vars: RESEND_API_KEY, CRON_SECRET, CLAUDE_API_KEY,
 *            SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

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
const CLAUDE_KEY   = Deno.env.get("CLAUDE_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
}
function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

function statusColor(pctVal: number) {
  if (pctVal >= 100) return "#DC2626";
  if (pctVal >= 80)  return "#D97706";
  return "#2D6644";
}
function statusEmoji(pctVal: number) {
  if (pctVal >= 100) return "🔴";
  if (pctVal >= 80)  return "🟡";
  return "🟢";
}

async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY secret is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "הכרם <noreply@hakerem.app>", to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

async function generateAiSummary(dataContext: string, orgName: string): Promise<string> {
  if (!CLAUDE_KEY) return "לא זמין — נדרש מפתח API";

  const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `אתה יועץ פיננסי לבית ספר ישראלי. כתוב סיכום שבועי קצר ומקצועי (3-4 משפטים) בעברית עבור מנהל בית הספר "${orgName}".
המידע הפיננסי:
${dataContext}

הסיכום צריך להדגיש: מצב כללי, נקודות לתשומת לב, המלצה אחת קצרה. ללא כותרות, ללא כוכביות. רק פסקה אחת רציפה.`,
    }],
  });

  const block = msg.content.find(b => b.type === "text");
  return (block as { type: "text"; text: string } | undefined)?.text ?? "";
}

async function processOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  orgName: string,
  yearId: string,
  yearName: string,
  adminEmails: string[],
) {
  if (!adminEmails.length) return;

  // Fetch all data in parallel
  const [catsRes, expsRes, incomeRes, parentCollRes, orgSourcesRes, horimRes] = await Promise.all([
    supabase.from("budget_categories").select("source, name, planned_amount").eq("school_year_id", yearId),
    supabase.from("expenses").select("source, amount, expense_date, supplier, description").eq("school_year_id", yearId),
    supabase.from("income").select("source, amount").eq("school_year_id", yearId),
    supabase.from("parent_collections").select("amount, grade").eq("school_year_id", yearId),
    supabase.from("org_budget_sources").select("slug, label").eq("org_id", orgId).order("order_index"),
    supabase.from("parent_collection_sections").select("name, target_amount").eq("school_year_id", yearId),
  ]);

  const cats         = catsRes.data ?? [];
  const exps         = expsRes.data ?? [];
  const incomeRows   = incomeRes.data ?? [];
  const parentColl   = parentCollRes.data ?? [];
  const horimSections = horimRes.data ?? [];

  const allSources = orgSourcesRes.data?.length
    ? orgSourcesRes.data
    : [{ slug: "gefen", label: "גפן" }, { slug: "iriyah", label: "עירייה" }, { slug: "horim", label: "הורים" }];

  // Per-source summaries
  const sources = allSources.map(({ slug, label }) => {
    const planned = cats.filter(c => c.source === slug).reduce((s, c) => s + Number(c.planned_amount), 0);
    const used    = exps.filter(e => e.source === slug).reduce((s, e) => s + Number(e.amount), 0);
    const income  = incomeRows.filter(i => i.source === slug).reduce((s, i) => s + Number(i.amount), 0);
    const p       = pct(used, planned);
    return { slug, label, planned, used, income, pct: p };
  });

  // Parent collections
  const totalCollected = parentColl.reduce((s, r) => s + Number(r.amount), 0);
  const totalTarget    = horimSections.reduce((s, r) => s + Number(r.target_amount), 0);
  const horimPct       = pct(totalCollected, totalTarget);

  // This week's expenses (last 7 days)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().slice(0, 10);
  const weeklyExps = exps.filter(e => e.expense_date >= weekStr);
  const weekTotal  = weeklyExps.reduce((s, e) => s + Number(e.amount), 0);

  // Top 3 expenses this week
  const top3 = [...weeklyExps]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 3);

  // Totals
  const totalPlanned = sources.reduce((s, x) => s + x.planned, 0);
  const totalUsed    = sources.reduce((s, x) => s + x.used, 0);
  const totalPct     = pct(totalUsed, totalPlanned);

  // AI summary context
  const dataContext = [
    `סה"כ תקציב שנתי: ${fmt(totalPlanned)}`,
    `סה"כ הוצאות: ${fmt(totalUsed)} (${totalPct}%)`,
    ...sources.map(s => `${s.label}: תוכנן ${fmt(s.planned)}, בוצע ${fmt(s.used)} (${s.pct}%)${s.pct >= 100 ? " — חריגה!" : s.pct >= 80 ? " — אזהרה" : ""}`),
    `גבייה מהורים: ${fmt(totalCollected)} מתוך ${fmt(totalTarget)} (${horimPct}%)`,
    `הוצאות השבוע: ${fmt(weekTotal)} (${weeklyExps.length} עסקאות)`,
    top3.length ? `הוצאות הגדולות השבוע: ${top3.map(e => `${e.supplier ?? e.description ?? "?"} – ${fmt(Number(e.amount))}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const aiSummary = await generateAiSummary(dataContext, orgName);

  // Source rows HTML
  const sourceRows = sources.map(s => `
    <tr>
      <td style="padding:12px;font-weight:600;">${statusEmoji(s.pct)} ${s.label}</td>
      <td style="padding:12px;text-align:left;">${fmt(s.planned)}</td>
      <td style="padding:12px;text-align:left;">${fmt(s.used)}</td>
      <td style="padding:12px;text-align:left;">
        <span style="font-weight:700;color:${statusColor(s.pct)}">${s.pct}%</span>
        <div style="background:#EEE;border-radius:4px;height:6px;margin-top:4px;min-width:80px;">
          <div style="background:${statusColor(s.pct)};width:${Math.min(s.pct, 100)}%;height:6px;border-radius:4px;"></div>
        </div>
      </td>
    </tr>`).join("");

  const top3Rows = top3.length
    ? top3.map((e, i) => `
      <tr style="background:${i % 2 === 0 ? "#FAFAFA" : "#FFF"}">
        <td style="padding:10px 12px;">${e.supplier ?? e.description ?? "—"}</td>
        <td style="padding:10px 12px;text-align:left;font-weight:700;">${fmt(Number(e.amount))}</td>
        <td style="padding:10px 12px;text-align:left;color:#888;">${e.expense_date}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:12px;color:#AAA;text-align:center;">אין הוצאות השבוע</td></tr>`;

  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const html = `
<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:32px 20px;color:#1A1A1A;">

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
    <span style="font-size:32px;">🏫</span>
    <div>
      <div style="font-size:20px;font-weight:700;color:#1A3D2B;">הכרם</div>
      <div style="font-size:13px;color:#888;">דוח שבועי · ${today}</div>
    </div>
  </div>

  <!-- Hero -->
  <div style="background:linear-gradient(135deg,#2D6644,#1A3D2B);border-radius:14px;padding:24px 28px;margin-bottom:28px;color:#fff;">
    <div style="font-size:13px;opacity:0.75;margin-bottom:6px;">${orgName} · ${yearName}</div>
    <div style="font-size:28px;font-weight:700;margin-bottom:4px;">${fmt(totalUsed)}</div>
    <div style="font-size:14px;opacity:0.85;">מתוך תקציב שנתי של ${fmt(totalPlanned)} · ${totalPct}% נוצל</div>
    <div style="background:rgba(255,255,255,0.2);border-radius:6px;height:8px;margin-top:14px;">
      <div style="background:#FFF;width:${Math.min(totalPct, 100)}%;height:8px;border-radius:6px;opacity:0.9;"></div>
    </div>
  </div>

  <!-- AI Summary -->
  ${aiSummary ? `
  <div style="background:#F0FAF5;border-right:4px solid #2D6644;border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:28px;">
    <div style="font-size:12px;font-weight:700;color:#2D6644;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">תובנות AI</div>
    <div style="font-size:14px;line-height:1.75;color:#1A3D2B;">${aiSummary}</div>
  </div>` : ""}

  <!-- Budget by Source -->
  <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;color:#1A3D2B;">מצב תקציב לפי מקור</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px;">
    <thead>
      <tr style="background:#F5F5F5;border-bottom:2px solid #DDD;">
        <th style="padding:10px 12px;text-align:right;">מקור</th>
        <th style="padding:10px 12px;text-align:left;">מאושר</th>
        <th style="padding:10px 12px;text-align:left;">בפועל</th>
        <th style="padding:10px 12px;text-align:left;">ניצול</th>
      </tr>
    </thead>
    <tbody>${sourceRows}</tbody>
  </table>

  <!-- This week's expenses -->
  <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;color:#1A3D2B;">
    הוצאות השבוע הנוכחי
    <span style="font-weight:400;font-size:13px;color:#888;">· ${fmt(weekTotal)} סה"כ · ${weeklyExps.length} עסקאות</span>
  </h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px;border:1px solid #EEE;border-radius:10px;overflow:hidden;">
    <thead>
      <tr style="background:#F5F5F5;border-bottom:2px solid #DDD;">
        <th style="padding:10px 12px;text-align:right;">ספק / תיאור</th>
        <th style="padding:10px 12px;text-align:left;">סכום</th>
        <th style="padding:10px 12px;text-align:left;">תאריך</th>
      </tr>
    </thead>
    <tbody>${top3Rows}</tbody>
  </table>

  <!-- Horim collection -->
  ${totalTarget > 0 ? `
  <div style="background:#FFFBEB;border:1px solid #F5C842;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
    <div style="font-size:14px;font-weight:700;color:#92400E;margin-bottom:4px;">👨‍👩‍👧 גבייה מהורים</div>
    <div style="font-size:13px;color:#78350F;">
      נגבה ${fmt(totalCollected)} מתוך יעד ${fmt(totalTarget)} · <strong>${horimPct}%</strong>
    </div>
    <div style="background:#FEF3C7;border-radius:4px;height:6px;margin-top:8px;">
      <div style="background:${statusColor(horimPct)};width:${Math.min(horimPct, 100)}%;height:6px;border-radius:4px;"></div>
    </div>
  </div>` : ""}

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="https://hakerem.app"
       style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#2D6644,#1A3D2B);
              color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">
      כניסה למערכת הכרם ←
    </a>
  </div>

  <!-- Footer -->
  <p style="font-size:12px;color:#AAA;border-top:1px solid #EEE;padding-top:16px;margin:0;line-height:1.8;">
    דוח שבועי אוטומטי ממערכת הכרם · ${today}<br/>
    לתמיכה: <a href="mailto:yonatanfridmanmusic@gmail.com" style="color:#2D6644;">yonatanfridmanmusic@gmail.com</a>
  </p>
</div>`;

  await sendEmail(adminEmails, `📊 דוח שבועי — ${orgName} · ${yearName}`, html);
  console.log(`[weekly-summary] Sent to ${adminEmails.length} recipients for org ${orgName}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth ─────────────────────────────────────────────────────────────────
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  let orgIdFilter: string | null = null;

  if (cronSecret) {
    if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  } else if (authHeader) {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await anonClient.auth.getUser();
    if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
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
    console.error("[weekly-summary] error:", String(err));
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
