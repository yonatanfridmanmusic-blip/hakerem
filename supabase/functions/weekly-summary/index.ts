/**
 * weekly-summary v13
 * Hebrew fonts (NotoSansHebrew) loaded from Supabase edge_assets table at runtime.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib";

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

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
}
function fmtPdf(n: number): string {
  return `ILS ${Math.round(n).toLocaleString("en-US")}`;
}
function safeText(str: string): string {
  return str.replace(/[^\x20-\x7E]/g, "").trim() || "-";
}
function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}
function statusRgb(p: number) {
  if (p >= 100) return rgb(0.86, 0.15, 0.15);
  if (p >= 80)  return rgb(0.85, 0.47, 0.04);
  return rgb(0.18, 0.40, 0.27);
}
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
const SOURCE_EN: Record<string, string> = {
  gefen: "Edu. Ministry", iriyah: "Municipality", horim: "Parents",
};
function sourceLabelEn(slug: string, hebrewLabel: string): string {
  return SOURCE_EN[slug] ?? safeText(hebrewLabel);
}

async function sendEmail(
  to: string[], subject: string, html: string,
  pdfBytes?: Uint8Array, pdfFilename?: string,
): Promise<string> {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY secret is not set");
  const body: Record<string, unknown> = { from: "הכרם <noreply@hakerem.app>", to, subject, html };
  if (pdfBytes && pdfFilename) body.attachments = [{ filename: pdfFilename, content: toBase64(pdfBytes) }];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const resBody = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${resBody}`);
  const { id } = JSON.parse(resBody);
  console.log(`[weekly-summary] Resend accepted — ID: ${id}, to: ${to.join(", ")}`);
  return id;
}

async function generateAiSummary(dataContext: string, orgName: string): Promise<string> {
  if (!CLAUDE_KEY) return "";
  try {
    const anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: `אתה יועץ פיננסי לבית ספר ישראלי. כתוב סיכום שבועי קצר ומקצועי (3-4 משפטים) בעברית עבור מנהל בית הספר "${orgName}".\nהמידע הפיננסי:\n${dataContext}\n\nהסיכום צריך להדגיש: מצב כללי, נקודות לתשומת לב, המלצה אחת קצרה. ללא כותרות, ללא כוכביות. רק פסקה אחת רציפה.` }],
    });
    const block = msg.content.find(b => b.type === "text");
    return (block as { type: "text"; text: string } | undefined)?.text ?? "";
  } catch (e) {
    console.warn("[weekly-summary] AI summary failed:", String(e));
    return "";
  }
}

interface SourceSummary { label: string; slug: string; planned: number; used: number; pct: number; }
interface ExpRow { supplier?: string | null; description?: string | null; amount: number; expense_date: string; }
interface PdfParams {
  orgName: string; yearName: string; todayEn: string; todayHe: string;
  totalPlanned: number; totalUsed: number; totalPct: number;
  sources: SourceSummary[];
  totalCollected: number; totalTarget: number; horimPct: number;
  weekTotal: number; weekCount: number;
  top3: ExpRow[];
  aiSummary: string;
}

async function generatePdf(p: PdfParams, sb: ReturnType<typeof createClient>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // v13: fonts loaded from edge_assets DB (no embedded base64)
  const [regChunks, boldChunks] = await Promise.all([
    sb.from("edge_assets").select("chunk_index, data").eq("key", "noto_regular").order("chunk_index"),
    sb.from("edge_assets").select("chunk_index, data").eq("key", "noto_bold").order("chunk_index"),
  ]);
  if (!regChunks.data?.length || !boldChunks.data?.length) throw new Error("Font chunks missing from edge_assets");
  const regB64 = regChunks.data.map((r: {data: string}) => r.data).join("");
  const boldB64 = boldChunks.data.map((r: {data: string}) => r.data).join("");
  const regFont  = await pdfDoc.embedFont(b64ToBytes(regB64).buffer);
  const boldFont = await pdfDoc.embedFont(b64ToBytes(boldB64).buffer);
  console.log("[weekly-summary] v13: Hebrew fonts loaded from edge_assets DB ✓");

  const page = pdfDoc.addPage([595.28, 841.89]);
  const W = 595.28, H = 841.89, ML = 45, MR = 45, CW = W - ML - MR, RE = W - MR;

  const darkGreen = rgb(0.10, 0.24, 0.17), midGreen = rgb(0.18, 0.40, 0.27);
  const greenBarBg = rgb(0.28, 0.45, 0.35), white = rgb(1, 1, 1);
  const textDark = rgb(0.10, 0.10, 0.10), textGray = rgb(0.50, 0.50, 0.50);
  const rowBg = rgb(0.96, 0.96, 0.96), lineColor = rgb(0.85, 0.85, 0.85);
  const yellowBg = rgb(1.00, 0.98, 0.90), yellowBorder = rgb(0.96, 0.78, 0.26);
  const brownText = rgb(0.57, 0.25, 0.05), lightGreenText = rgb(0.70, 0.88, 0.78);

  // deno-lint-ignore no-explicit-any
  const drawR = (t: string, rx: number, ry: number, f: any, sz: number, col = textDark) => {
    const tw = f.widthOfTextAtSize(t, sz);
    page.drawText(t, { x: rx - tw, y: ry, font: f, size: sz, color: col });
  };
  // deno-lint-ignore no-explicit-any
  const drawL = (t: string, lx: number, ly: number, f: any, sz: number, col = textDark) => {
    page.drawText(t, { x: lx, y: ly, font: f, size: sz, color: col });
  };
  // deno-lint-ignore no-explicit-any
  const drawC = (t: string, bx: number, bw: number, cy: number, f: any, sz: number, col = textDark) => {
    const tw = f.widthOfTextAtSize(t, sz);
    page.drawText(t, { x: bx + (bw - tw) / 2, y: cy, font: f, size: sz, color: col });
  };

  let y = H - ML;

  page.drawRectangle({ x: 0, y: y - 52, width: W, height: 62, color: darkGreen });
  drawR("הכרם", W - 28, y - 36, boldFont, 20, white);
  drawL(p.todayHe, ML, y - 36, regFont, 9, lightGreenText);
  y -= 66;

  drawR(`דוח שבועי — ${p.yearName}`, RE, y, boldFont, 15, darkGreen);
  y -= 17;
  drawR(p.orgName, RE, y, regFont, 11, textGray);
  y -= 30;

  const cardH = 64;
  page.drawRectangle({ x: ML, y: y - cardH, width: CW, height: cardH, color: midGreen });
  drawR(fmt(p.totalUsed), RE - 14, y - 22, boldFont, 21, white);
  drawR(`מתוך ${fmt(p.totalPlanned)} · ${p.totalPct}% נוצל`, RE - 14, y - 40, regFont, 9, rgb(0.85, 0.95, 0.90));
  const barX = ML + 16, barW2 = CW - 32, barY = y - cardH + 11;
  page.drawRectangle({ x: barX, y: barY, width: barW2, height: 5, color: greenBarBg });
  page.drawRectangle({ x: barX, y: barY, width: Math.max(2, Math.min(p.totalPct / 100, 1) * barW2), height: 5, color: white });
  y -= cardH + 18;

  drawR("מצב תקציב לפי מקור", RE, y, boldFont, 11, darkGreen);
  y -= 17;

  const ROW_H = 20, C_PCT = CW * 0.18, C_USD = CW * 0.27, C_PLN = CW * 0.27;
  const x0 = ML, x1 = x0 + C_PCT, x2 = x1 + C_USD, x3 = x2 + C_PLN;

  page.drawRectangle({ x: ML, y: y - ROW_H, width: CW, height: ROW_H, color: rowBg });
  drawR("מקור",    RE, y - 14, boldFont, 8.5, textDark);
  drawR("מאושר",   x3, y - 14, boldFont, 8.5, textDark);
  drawR("בפועל",   x2, y - 14, boldFont, 8.5, textDark);
  drawR("ניצול %", x1, y - 14, boldFont, 8.5, textDark);
  y -= ROW_H;

  for (let ri = 0; ri < p.sources.length; ri++) {
    const s = p.sources[ri];
    page.drawRectangle({ x: ML, y: y - ROW_H, width: CW, height: ROW_H, color: ri % 2 === 0 ? white : rowBg });
    const sc = statusRgb(s.pct);
    drawR(s.label,        RE, y - 14, regFont,  8.5, sc);
    drawR(fmt(s.planned), x3, y - 14, regFont,  8.5, textDark);
    drawR(fmt(s.used),    x2, y - 14, regFont,  8.5, sc);
    drawR(`${s.pct}%`,   x1, y - 14, boldFont, 8.5, sc);
    y -= ROW_H;
  }
  y -= 16;

  if (p.totalTarget > 0) {
    const horimH = 48;
    page.drawRectangle({ x: ML, y: y - horimH, width: CW, height: horimH, color: yellowBg });
    page.drawRectangle({ x: RE - 4, y: y - horimH, width: 4, height: horimH, color: yellowBorder });
    drawR("גבייה מהורים", RE - 10, y - 14, boldFont, 10, brownText);
    drawR(`${fmt(p.totalCollected)} / ${fmt(p.totalTarget)} · ${p.horimPct}%`, RE - 10, y - 29, regFont, 8.5, brownText);
    const hBarX = ML + 8, hBarW = CW - 16, hBarY = y - horimH + 10;
    page.drawRectangle({ x: hBarX, y: hBarY, width: hBarW, height: 4, color: rgb(0.95, 0.88, 0.68) });
    page.drawRectangle({ x: hBarX, y: hBarY, width: Math.max(2, Math.min(p.horimPct / 100, 1) * hBarW), height: 4, color: statusRgb(p.horimPct) });
    y -= horimH + 16;
  }

  drawR(`הוצאות השבוע · ${fmt(p.weekTotal)} · ${p.weekCount} עסקאות`, RE, y, boldFont, 11, darkGreen);
  y -= 15;

  const EH = 18, E_DATE = CW * 0.22, E_AMT = CW * 0.26, E_NAME = CW * 0.52;

  if (p.top3.length === 0) {
    page.drawRectangle({ x: ML, y: y - EH, width: CW, height: EH, color: rowBg });
    drawC("אין הוצאות השבוע", ML, CW, y - 13, regFont, 8.5, textGray);
    y -= EH;
  } else {
    page.drawRectangle({ x: ML, y: y - EH, width: CW, height: EH, color: rowBg });
    drawR("ספק / תיאור", RE, y - 13, boldFont, 8, textDark);
    drawC("סכום", ML + E_DATE, E_AMT, y - 13, boldFont, 8, textDark);
    drawL("תאריך", ML, y - 13, boldFont, 8, textDark);
    y -= EH;
    for (let ri = 0; ri < p.top3.length; ri++) {
      const e = p.top3[ri];
      page.drawRectangle({ x: ML, y: y - EH, width: CW, height: EH, color: ri % 2 === 0 ? white : rowBg });
      let name = (e.supplier ?? e.description ?? "—").slice(0, 30);
      while (name.length > 3 && regFont.widthOfTextAtSize(name, 8.5) > E_NAME) name = name.slice(0, -1);
      drawR(name, RE, y - 12, regFont, 8.5, textDark);
      drawC(fmt(e.amount), ML + E_DATE, E_AMT, y - 12, boldFont, 8.5, textDark);
      drawL(e.expense_date, ML, y - 12, regFont, 8, textGray);
      y -= EH;
    }
  }
  y -= 16;

  if (p.aiSummary && y > 110) {
    page.drawRectangle({ x: RE - 3, y: y - 72, width: 3, height: 72, color: midGreen });
    drawR("תובנות AI", RE - 10, y - 13, boldFont, 10, midGreen);
    const maxW = CW - 20;
    const lines: string[] = []; let cur = "";
    for (const w of p.aiSummary.split(" ")) {
      const test = cur ? `${cur} ${w}` : w;
      if (regFont.widthOfTextAtSize(test, 8.5) > maxW && cur) { lines.push(cur); cur = w; } else { cur = test; }
    }
    if (cur) lines.push(cur);
    let aiY = y - 28;
    for (const line of lines.slice(0, 4)) { drawR(line, RE - 10, aiY, regFont, 8.5, darkGreen); aiY -= 14; }
  }

  page.drawLine({ start: { x: ML, y: 40 }, end: { x: W - MR, y: 40 }, color: lineColor, thickness: 0.5 });
  drawR(`דוח שבועי אוטומטי ממערכת הכרם · ${p.todayHe}`, RE, 26, regFont, 7.5, textGray);
  drawL("hakerem.app", ML, 26, regFont, 7.5, midGreen);

  return pdfDoc.save();
}

async function processOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string, orgName: string, yearId: string, yearName: string, adminEmails: string[],
): Promise<boolean> {
  if (!adminEmails.length) { console.warn(`[weekly-summary] No emails for org ${orgName}`); return false; }

  const [catsRes, expsRes, _incomeRes, parentCollRes, orgSourcesRes, horimRes] = await Promise.all([
    supabase.from("budget_categories").select("source, name, planned_amount").eq("school_year_id", yearId),
    supabase.from("expenses").select("source, amount, expense_date, supplier, description").eq("school_year_id", yearId),
    supabase.from("income").select("source, amount").eq("school_year_id", yearId),
    supabase.from("parent_collections").select("amount, grade").eq("school_year_id", yearId),
    supabase.from("org_budget_sources").select("slug, label").eq("org_id", orgId).order("order_index"),
    supabase.from("parent_collection_sections").select("name, target_amount").eq("school_year_id", yearId),
  ]);

  const cats = catsRes.data ?? [], exps = expsRes.data ?? [], horimSections = horimRes.data ?? [];
  const allSources = orgSourcesRes.data?.length
    ? orgSourcesRes.data
    : [{ slug: "gefen", label: "גפן" }, { slug: "iriyah", label: "עירייה" }, { slug: "horim", label: "הורים" }];

  const sources: SourceSummary[] = allSources.map(({ slug, label }) => ({
    label, slug,
    planned: cats.filter(c => c.source === slug).reduce((s, c) => s + Number(c.planned_amount), 0),
    used:    exps.filter(e => e.source === slug).reduce((s, e) => s + Number(e.amount), 0),
    pct:     pct(
      exps.filter(e => e.source === slug).reduce((s, e) => s + Number(e.amount), 0),
      cats.filter(c => c.source === slug).reduce((s, c) => s + Number(c.planned_amount), 0),
    ),
  }));

  const parentColl = parentCollRes.data ?? [];
  const totalCollected = parentColl.reduce((s, r) => s + Number(r.amount), 0);
  const totalTarget = horimSections.reduce((s, r) => s + Number(r.target_amount), 0);
  const horimPctVal = pct(totalCollected, totalTarget);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().slice(0, 10);
  const weeklyExps = exps.filter(e => e.expense_date >= weekStr);
  const weekTotal = weeklyExps.reduce((s, e) => s + Number(e.amount), 0);
  const top3 = [...weeklyExps].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 3);
  const totalPlanned = sources.reduce((s, x) => s + x.planned, 0);
  const totalUsed = sources.reduce((s, x) => s + x.used, 0);
  const totalPctVal = pct(totalUsed, totalPlanned);

  const dataContext = [
    `סה"כ תקציב שנתי: ${fmt(totalPlanned)}`,
    `סה"כ הוצאות: ${fmt(totalUsed)} (${totalPctVal}%)`,
    ...sources.map(s => `${s.label}: תוכנן ${fmt(s.planned)}, בוצע ${fmt(s.used)} (${s.pct}%)${s.pct >= 100 ? " — חריגה!" : s.pct >= 80 ? " — אזהרה" : ""}`),
    `גבייה מהורים: ${fmt(totalCollected)} מתוך ${fmt(totalTarget)} (${horimPctVal}%)`,
    `הוצאות השבוע: ${fmt(weekTotal)} (${weeklyExps.length} עסקאות)`,
    top3.length ? `הוצאות הגדולות: ${top3.map(e => `${e.supplier ?? e.description ?? "?"} – ${fmt(Number(e.amount))}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const aiSummary = await generateAiSummary(dataContext, orgName);
  const todayEn = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const todayHe = new Date().toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  let pdfBytes: Uint8Array | undefined;
  try {
    pdfBytes = await generatePdf({
      orgName, yearName, todayEn, todayHe,
      totalPlanned, totalUsed, totalPct: totalPctVal, sources,
      totalCollected, totalTarget, horimPct: horimPctVal,
      weekTotal, weekCount: weeklyExps.length,
      top3: top3.map(e => ({ supplier: e.supplier, description: e.description, amount: Number(e.amount), expense_date: e.expense_date })),
      aiSummary,
    }, supabase);
    console.log(`[weekly-summary] PDF generated — ${pdfBytes.length} bytes`);
  } catch (e) {
    console.error("[weekly-summary] PDF generation failed:", String(e));
  }

  const html = `
<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#1A1A1A;">
  <div style="background:linear-gradient(135deg,#2D6644,#1A3D2B);border-radius:12px;padding:24px 28px;margin-bottom:28px;color:#fff;text-align:right;">
    <div style="font-size:12px;opacity:0.7;margin-bottom:6px;">🏫 הכרם</div>
    <div style="font-size:22px;font-weight:700;margin-bottom:4px;">הדוח השבועי שלך מוכן 📎</div>
    <div style="font-size:13px;opacity:0.8;">${orgName} · ${yearName} · ${todayHe}</div>
  </div>
  <p style="font-size:15px;line-height:1.85;color:#1A3D2B;margin:0 0 20px;">
    הדוח השבועי של <strong>${orgName}</strong> מצורף כקובץ PDF.<br/>
    הוא כולל סיכום מצב תקציבי, גבייה מהורים, הוצאות השבוע ותובנות AI.
  </p>
  ${!pdfBytes ? `<div style="background:#FEF3C7;border-right:4px solid #D97706;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;font-size:13px;color:#92400E;">לא הצלחנו לצרף PDF הפעם — אנא כנס למערכת לצפייה בנתונים.</div>` : ""}
  <div style="text-align:center;margin:28px 0;">
    <a href="https://hakerem.app" style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#2D6644,#1A3D2B);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;">כניסה למערכת הכרם ←</a>
  </div>
  <p style="font-size:11px;color:#AAA;border-top:1px solid #EEE;padding-top:14px;margin:0;line-height:1.8;">
    דוח שבועי אוטומטי ממערכת הכרם · ${todayHe}<br/>
    לתמיכה: <a href="mailto:yonatanfridmanmusic@gmail.com" style="color:#2D6644;">yonatanfridmanmusic@gmail.com</a>
  </p>
</div>`;

  const now = new Date();
  const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
  const pdfFilename = `kerem-weekly-${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}.pdf`;
  const emailId = await sendEmail(adminEmails, `📊 דוח שבועי — ${orgName} · ${yearName}`, html, pdfBytes, pdfFilename);
  console.log(`[weekly-summary] ✓ Sent to ${adminEmails.join(", ")} — ID: ${emailId}`);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  let orgIdFilter: string | null = null;
  if (cronSecret) {
    if (!CRON_SECRET || cronSecret !== CRON_SECRET) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  } else if (authHeader) {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await anonClient.auth.getUser();
    if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mem } = await supabase.from("organization_members").select("organization_id, role")
      .eq("user_id", user.id).eq("status", "active").in("role", ["owner", "admin"]).maybeSingle();
    if (!mem) return new Response("Forbidden", { status: 403, headers: corsHeaders });
    orgIdFilter = mem.organization_id;
  } else {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    let yearQuery = supabase.from("school_years").select("id, name, organization_id, organizations(id, name)").eq("is_active", true);
    if (orgIdFilter) yearQuery = yearQuery.eq("organization_id", orgIdFilter);
    const { data: years, error: yearErr } = await yearQuery;
    if (yearErr) throw yearErr;
    let processed = 0, emails_sent = 0;
    for (const year of years ?? []) {
      const org = year.organizations as { id: string; name: string } | null;
      if (!org) continue;
      const { data: members } = await supabase.from("organization_members").select("user_id, role")
        .eq("organization_id", org.id).eq("status", "active").in("role", ["owner", "admin"]);
      const userIds = (members ?? []).map(m => m.user_id).filter(Boolean);
      const { data: profileRows } = userIds.length
        ? await supabase.from("profiles").select("id, email").in("id", userIds)
        : { data: [] };
      const adminEmails = (profileRows ?? []).map(p => p.email).filter((e): e is string => !!e);
      console.log(`[weekly-summary] Org ${org.name}: ${adminEmails.length} recipient(s): ${adminEmails.join(", ")}`);
      const sent = await processOrg(supabase, org.id, org.name, year.id, year.name, adminEmails);
      processed++; if (sent) emails_sent++;
    }
    return new Response(JSON.stringify({ ok: true, orgs_processed: processed, emails_sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[weekly-summary] error:", String(err));
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
