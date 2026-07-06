import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

// Standard Supabase CORS — function is protected by JWT auth inside the handler
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}
function todayIL() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}
function normSrc(raw: string, srcs: { slug: string; label: string }[]) {
  const low = raw.toLowerCase().trim();
  const ex = srcs.find(s => s.slug === low || s.label === raw);
  if (ex) return ex.slug;
  const SYN: Record<string, string[]> = {
    gefen: ["גפן", "גן"],
    iriyah: ["עירייה", "עיר", "עיריה"],
    horim: ["הורים", "הורי"],
  };
  for (const [slug, syns] of Object.entries(SYN))
    if (syns.some(s => low.includes(s.toLowerCase()))) return slug;
  return low;
}
function isUUID(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function buildCtx(uc: ReturnType<typeof createClient>, yearId: string, srcs: { slug: string; label: string }[]) {
  const [pR, eR, iR, cR] = await Promise.all([
    uc.from("budget_categories").select("id,name,source,planned_amount").eq("school_year_id", yearId).order("source").order("order_index"),
    uc.from("expenses").select("source,amount,budget_category_id").eq("school_year_id", yearId),
    uc.from("income").select("source,amount").eq("school_year_id", yearId),
    uc.from("parent_collections").select("amount").eq("school_year_id", yearId),
  ]);
  const m: Record<string, { b: number; e: number; i: number }> = {};
  for (const s of srcs) m[s.slug] = { b: 0, e: 0, i: 0 };
  for (const r of (pR.data ?? [])) { if (!m[r.source]) m[r.source] = { b: 0, e: 0, i: 0 }; m[r.source].b += Number(r.planned_amount); }
  for (const r of (eR.data ?? [])) { if (!m[r.source]) m[r.source] = { b: 0, e: 0, i: 0 }; m[r.source].e += Number(r.amount); }
  for (const r of (iR.data ?? [])) { if (!m[r.source]) m[r.source] = { b: 0, e: 0, i: 0 }; m[r.source].i += Number(r.amount); }
  const colTot = (cR.data ?? []).reduce((s: number, c: { amount: string | number }) => s + Number(c.amount), 0);
  if (m["horim"]) m["horim"].i += colTot;

  const expByCat: Record<string, number> = {};
  for (const e of (eR.data ?? [])) {
    if (e.budget_category_id) expByCat[e.budget_category_id] = (expByCat[e.budget_category_id] ?? 0) + Number(e.amount);
  }
  const catsBySrc: Record<string, { id: string; name: string; planned_amount: string | number }[]> = {};
  for (const c of (pR.data ?? [])) {
    if (!catsBySrc[c.source]) catsBySrc[c.source] = [];
    catsBySrc[c.source].push(c);
  }

  return Object.entries(m).map(([slug, v]) => {
    const lbl = srcs.find(s => s.slug === slug)?.label ?? slug;
    const header = lbl + ": תקציב ₪" + v.b.toLocaleString() + " | הכנסות ₪" + v.i.toLocaleString() + " | הוצאות ₪" + v.e.toLocaleString() + " | יתרה ₪" + (v.b - v.e).toLocaleString();
    const srcCats = catsBySrc[slug] ?? [];
    if (srcCats.length === 0) return header;
    const catLines = srcCats.map(c => {
      const spent = expByCat[c.id] ?? 0;
      const rem = Number(c.planned_amount) - spent;
      const pct = Number(c.planned_amount) > 0 ? Math.round((spent / Number(c.planned_amount)) * 100) : 0;
      return "  • " + c.name + ": תוכנן ₪" + Number(c.planned_amount).toLocaleString() + " | הוצאה ₪" + spent.toLocaleString() + " | נותר ₪" + rem.toLocaleString() + " (" + pct + "%)";
    }).join("\n");
    return header + "\n" + catLines;
  }).join("\n");
}

function buildSys(ctx: string, srcs: { slug: string; label: string }[], year: { name: string } | null) {
  const today = todayIL();
  const dayHe = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const srcStr = srcs.map(s => s.slug + "=" + s.label).join(", ");
  return [
    "אתה מנהל כלכלי דיגיטלי חכם של בית הספר במערכת הכרם. אתה מביא ערך אמיתי בשלושה תחומים: הכנסת נתונים, ניתוח תקציב מעמיק, ותכנון פעילויות בית ספריות.",
    "היום: " + dayHe + " (" + today + ") | שנת לימודים: " + (year?.name ?? "לא קיימת") + " | מקורות: " + srcStr,
    "\nסיכום תקציב שוטף (כולל פירוט סעיפים):\n" + ctx,

    "\n=== יכולת 1: הכנסת הוצאות והכנסות ===",
    "כשמישהו רוצה להכניס הוצאה או הכנסה:",
    "א. אסוף: תיאור ברור, סכום, מקור תקציב, תאריך. אם חסר — שאל שאלה אחת בכל פעם. אל תציין דוגמאות כשאתה שואל על תיאור ההוצאה/הכנסה.",
    "ב. קרא get_budget_categories לפי המקור — הצג את הסעיפים ושאל לאיזה שייך.",
    "ג. אל תשאל על: ספק, אישורים, מי ביצע, חשבון בנק.",
    "ד. כשיש כל הפרטים — צור טיוטה עם add_expense/add_income ובקש אישור קצר.",
    "ה. אחרי אישור — ציין את היתרה החדשה בסעיף ובמקור.",

    "\n=== יכולת 2: ניתוח תקציב, מגמות וחריגות ===",
    "כשמישהו שואל על מצב התקציב, מגמות, חריגות, המלצות, 'מה הכי גבוה', 'איפה אפשר לקצץ':",
    "א. קרא get_expense_analysis — מחזיר: 5 הקטגוריות הגבוהות, קטגוריות בחריגה (>100%), קטגוריות ב-80%+, קטגוריות מנוצלות חלקית.",
    "ב. קרא get_monthly_trend — מחזיר: הוצאות/הכנסות לפי חודש, לזיהוי חודשים בעייתיים.",
    "ג. הצג ממצאים ברורים: מה הכי גבוה (עם ₪), מה חרג (כמה ₪ מעל), מה מדאיג, איפה אפשר לחסוך.",
    "ד. תן המלצות ספציפיות המבוססות על הנתונים — לא עצות כלליות.",
    "ה. סכומים תמיד עם ₪ מוחלטים, לא רק אחוזים.",

    "\n=== יכולת 3: תכנון פעילויות בית ספריות ===",
    "כשמישהו מתכנן טיול, אירוע, כנס, ימי גיבוש, חגיגה, תחרות, קייטנה, סיור, הצגה, פעילות חינוכית וכו':",
    "שלב א — הבנת הפעילות (שאל שאלה אחת בכל פעם):",
    "  1. מה הפעילות ולאיזה שכבה/כיתה? (קרא get_grades אחרי שתדע — לקבל מספר תלמידים)",
    "  2. ממה מורכבת ההוצאה? הצע רשימת פריטים רלוונטיים ושאל מה רלוונטי:",
    "     • הסעה/אוטובוס — כמה? עלות משוערת?",
    "     • כניסה לאטרקציה/שמירה/מוזיאון — עלות לתלמיד?",
    "     • לינה — כמה לילות? עלות ללילה?",
    "     • ארוחות — מי אחראי? עלות?",
    "     • מדריך/מנחה — עלות?",
    "     • ציוד/חומרים — עלות?",
    "     • הוצאות נוספות?",
    "  3. מאיזה מקור תקציב? (קרא get_budget_summary לאחר שתדע את המקור)",
    "שלב ב — חישוב ותקצוב:",
    "  • הצג טבלת עלויות: פריט | עלות כוללת | עלות לתלמיד",
    "  • סה\"כ פעילות + עלות לתלמיד",
    "  • יתרת תקציב לפני הפעילות ← אחרי הפעילות",
    "  • אם התקציב מספיק — אמור זאת בבירור",
    "  • אם לא מספיק — הצע חלופות (קיצוץ פריט, מקור נוסף, חלוקה לשנים)",
    "שלב ג — הצע רישום:",
    "  • שאל: 'רוצה שאכניס את ההוצאות למערכת?' ואם כן — עבור על כל פריט ורשום עם אישור.",

    "\n=== כללי שימוש בכלים ===",
    "ALWAYS call tools before answering. Never invent numbers.",
    "ניתוח תקציב: קרא get_expense_analysis + get_monthly_trend",
    "תכנון פעילות: קרא get_grades (מספר תלמידים) + get_budget_summary (יתרות)",
    "גבייה מהורים: קרא get_horim_summary + get_parent_collections",
    "הכנסת נתונים: קרא get_budget_categories לפני add_expense/add_income",
    "budget_category_id חייב להיות UUID מ-get_budget_categories — אסור להשתמש בשם",

    "\n=== פורמט תשובות ===",
    "עברית טבעית וחמה, ישירה, ללא Markdown (אסור: ##, **, |, ---, מספרים ממוספרים עם נקודה)",
    "לשון ניטרלית — לא נקבה, לא זכר",
    "שאלות: אחת בכל הודעה בלבד",
    "בתכנון פעילות: הצג סיכום מפורט ומסודר עם כל הפריטים אחרי איסוף הנתונים",
    "סכומים תמיד עם ₪ ופסיקי אלפים (₪12,345)",
  ].join("\n");
}

function buildTools(srcs: { slug: string; label: string }[]) {
  const sd = srcs.map(s => s.slug + "=" + s.label).join(", ");
  const td = "YYYY-MM-DD";
  return [
    {
      name: "get_expenses",
      description: "שאילת הוצאות לפי מקור ותאריך. השתמש לפני כל ניתוח הוצאות ספציפי.",
      input_schema: { type: "object", properties: { source: { type: "string", description: sd }, from_date: { type: "string", description: td }, to_date: { type: "string", description: td }, limit: { type: "number" } } },
    },
    {
      name: "get_income",
      description: "שאילת הכנסות לפי מקור ותאריך.",
      input_schema: { type: "object", properties: { source: { type: "string", description: sd }, from_date: { type: "string", description: td }, to_date: { type: "string", description: td }, limit: { type: "number" } } },
    },
    {
      name: "get_budget_categories",
      description: "סעיפי תקציב לפי מקור עם תקציב מתוכנן. חובה לקרוא לפני add_expense/add_income. מחזיר id (UUID), name, planned_amount.",
      input_schema: { type: "object", required: ["source"], properties: { source: { type: "string", description: sd } } },
    },
    {
      name: "get_budget_summary",
      description: "סיכום מפורט של כל הסעיפים: תוכנן, הוצא, נותר, אחוז ניצול. קרא לפני כל שאלה על יתרות תקציב, כמה אפשר להוציא, תכנון הוצאות עתידיות.",
      input_schema: { type: "object", properties: { source: { type: "string", description: "מקור לסינון (אופציונלי): " + sd } } },
    },
    {
      name: "get_expense_analysis",
      description: "ניתוח מעמיק של ההוצאות: 5 הקטגוריות הגבוהות ביותר, קטגוריות בחריגה (>100%), קטגוריות ב-80%+, קטגוריות מנוצלות חלקית. קרא לכל שאלה על מגמות, חריגות, המלצות לחיסכון, 'מה הכי גבוה'.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_monthly_trend",
      description: "הוצאות והכנסות מקובצות לפי חודש — לזיהוי מגמות עונתיות וחודשים עם הוצאות גבוהות. קרא לניתוח מגמות וזמן.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_horim_summary",
      description: "סיכום גבייית הורים לפי סעיף: יעד 100% ו-85%, נגבה, חסר, אחוז גבייה.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_grades",
      description: "כל השכבות/כיתות עם מספר תלמידים. קרא לפני תכנון פעילויות, שאלות על שכבות/כיתות, חישוב עלות לתלמיד.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_parent_collections",
      description: "פירוט גבייית הורים לפי שכבה וסעיף.",
      input_schema: { type: "object", properties: { section_name: { type: "string", description: "סינון לפי שם סעיף (אופציונלי)" } } },
    },
    {
      name: "add_expense",
      description: "יוצר טיוטת הוצאה לאישור. קרא רק אחרי get_budget_categories וכשיש כל הפרטים.",
      input_schema: { type: "object", required: ["description", "amount", "source", "expense_date"], properties: { description: { type: "string" }, amount: { type: "number" }, source: { type: "string", description: sd }, expense_date: { type: "string", description: td }, budget_category_id: { type: "string", description: "UUID מ-get_budget_categories בלבד" }, supplier: { type: "string" } } },
    },
    {
      name: "add_income",
      description: "יוצר טיוטת הכנסה לאישור. קרא רק אחרי get_budget_categories וכשיש כל הפרטים.",
      input_schema: { type: "object", required: ["description", "amount", "source", "income_date"], properties: { description: { type: "string" }, amount: { type: "number" }, source: { type: "string", description: sd }, income_date: { type: "string", description: td }, budget_category_id: { type: "string", description: "UUID מ-get_budget_categories בלבד" }, payer: { type: "string" } } },
    },
  ];
}

type CC = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type CM = { role: "user" | "assistant"; content: string | CC[] };

async function callClaude(
  key: string, sys: string, msgs: CM[], tools: unknown[],
  uc: ReturnType<typeof createClient>,
  sc: ReturnType<typeof createClient>,
  uid: string, cid: string, yid: string,
  srcs: { slug: string; label: string }[],
): Promise<{ reply: string; draft: { id: string; action_type: string; preview: unknown } | null }> {
  let cur: CM[] = [...msgs];
  let draft: { id: string; action_type: string; preview: unknown } | null = null;
  const today = todayIL();

  for (let iter = 0; iter < 12; iter++) {
    const r = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: sys, messages: cur, tools }),
    });
    if (!r.ok) throw new Error("Claude " + r.status + ": " + await r.text());
    const res: { stop_reason: string; content: CC[] } = await r.json();

    if (res.stop_reason === "end_turn") {
      return { reply: res.content.find(b => b.type === "text")?.text ?? "✅", draft };
    }

    if (res.stop_reason === "tool_use") {
      cur.push({ role: "assistant", content: res.content });
      const tr: CC[] = [];

      for (const blk of res.content) {
        if (blk.type !== "tool_use" || !blk.id || !blk.name) continue;
        const inp = (blk.input ?? {}) as Record<string, unknown>;

        // ── get_expenses ──────────────────────────────────────────────────────
        if (blk.name === "get_expenses") {
          let q = uc.from("expenses").select("description,amount,source,expense_date,supplier,budget_category_id").eq("school_year_id", yid).order("expense_date", { ascending: false }).limit(Number(inp.limit) || 100);
          if (inp.source) q = q.eq("source", inp.source as string);
          if (inp.from_date) q = q.gte("expense_date", inp.from_date as string);
          if (inp.to_date) q = q.lte("expense_date", inp.to_date as string);
          const { data } = await q;
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(data ?? []) });

        // ── get_income ────────────────────────────────────────────────────────
        } else if (blk.name === "get_income") {
          let q = uc.from("income").select("description,amount,source,income_date,payer").eq("school_year_id", yid).order("income_date", { ascending: false }).limit(Number(inp.limit) || 100);
          if (inp.source) q = q.eq("source", inp.source as string);
          if (inp.from_date) q = q.gte("income_date", inp.from_date as string);
          if (inp.to_date) q = q.lte("income_date", inp.to_date as string);
          const { data } = await q;
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(data ?? []) });

        // ── get_budget_categories ─────────────────────────────────────────────
        } else if (blk.name === "get_budget_categories") {
          const src = normSrc(String(inp.source ?? ""), srcs);
          const { data } = await uc.from("budget_categories").select("id,name,planned_amount").eq("school_year_id", yid).eq("source", src).order("order_index");
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(data ?? []) });

        // ── get_budget_summary ────────────────────────────────────────────────
        } else if (blk.name === "get_budget_summary") {
          let catQ = uc.from("budget_categories").select("id,name,source,planned_amount").eq("school_year_id", yid).order("source").order("order_index");
          if (inp.source) catQ = catQ.eq("source", normSrc(String(inp.source), srcs));
          const { data: cats } = await catQ;
          let expQ = uc.from("expenses").select("source,amount,budget_category_id").eq("school_year_id", yid);
          if (inp.source) expQ = expQ.eq("source", normSrc(String(inp.source), srcs));
          const { data: exps } = await expQ;
          const expBycat: Record<string, number> = {};
          for (const e of (exps ?? [])) {
            if (e.budget_category_id) expBycat[e.budget_category_id] = (expBycat[e.budget_category_id] ?? 0) + Number(e.amount);
          }
          const summary = (cats ?? []).map(c => ({
            id: c.id, name: c.name, source: c.source,
            source_label: srcs.find(s => s.slug === c.source)?.label ?? c.source,
            planned: Number(c.planned_amount),
            spent: expBycat[c.id] ?? 0,
            remaining: Number(c.planned_amount) - (expBycat[c.id] ?? 0),
            pct_used: Number(c.planned_amount) > 0 ? Math.round(((expBycat[c.id] ?? 0) / Number(c.planned_amount)) * 100) : 0,
          }));
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(summary) });

        // ── get_expense_analysis (NEW) ────────────────────────────────────────
        } else if (blk.name === "get_expense_analysis") {
          const [catsR, expsR] = await Promise.all([
            uc.from("budget_categories").select("id,name,source,planned_amount").eq("school_year_id", yid),
            uc.from("expenses").select("budget_category_id,amount,source").eq("school_year_id", yid),
          ]);
          const expByCat: Record<string, number> = {};
          const expBySrc: Record<string, number> = {};
          for (const e of (expsR.data ?? [])) {
            if (e.budget_category_id) expByCat[e.budget_category_id] = (expByCat[e.budget_category_id] ?? 0) + Number(e.amount);
            expBySrc[e.source] = (expBySrc[e.source] ?? 0) + Number(e.amount);
          }
          const analysis = (catsR.data ?? []).map(c => ({
            name: c.name,
            source_label: srcs.find(s => s.slug === c.source)?.label ?? c.source,
            planned: Number(c.planned_amount),
            spent: expByCat[c.id] ?? 0,
            remaining: Number(c.planned_amount) - (expByCat[c.id] ?? 0),
            pct_used: Number(c.planned_amount) > 0 ? Math.round(((expByCat[c.id] ?? 0) / Number(c.planned_amount)) * 100) : 0,
          }));
          const top5 = [...analysis].sort((a, b) => b.spent - a.spent).slice(0, 5);
          const overBudget = analysis.filter(c => c.pct_used > 100).sort((a, b) => (b.spent - b.planned) - (a.spent - a.planned));
          const near80 = analysis.filter(c => c.pct_used >= 80 && c.pct_used <= 100).sort((a, b) => b.pct_used - a.pct_used);
          const underused = analysis.filter(c => c.pct_used < 30 && c.planned > 0).sort((a, b) => b.remaining - a.remaining).slice(0, 5);
          const srcLabels = Object.entries(expBySrc).reduce((acc: Record<string, number>, [slug, amt]) => {
            const lbl = srcs.find(s => s.slug === slug)?.label ?? slug;
            acc[lbl] = (acc[lbl] ?? 0) + amt;
            return acc;
          }, {});
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify({
            top_5_by_spend: top5,
            over_budget: overBudget,
            near_budget_80pct_plus: near80,
            potentially_underutilized: underused,
            total_by_source: srcLabels,
            total_categories: analysis.length,
          }) });

        // ── get_monthly_trend (NEW) ───────────────────────────────────────────
        } else if (blk.name === "get_monthly_trend") {
          const [expsR, incsR] = await Promise.all([
            uc.from("expenses").select("source,amount,expense_date").eq("school_year_id", yid).order("expense_date"),
            uc.from("income").select("source,amount,income_date").eq("school_year_id", yid).order("income_date"),
          ]);
          const byMonth: Record<string, { expenses: number; income: number; expense_count: number; income_count: number }> = {};
          for (const e of (expsR.data ?? [])) {
            const m = String(e.expense_date).slice(0, 7);
            if (!byMonth[m]) byMonth[m] = { expenses: 0, income: 0, expense_count: 0, income_count: 0 };
            byMonth[m].expenses += Number(e.amount);
            byMonth[m].expense_count += 1;
          }
          for (const i of (incsR.data ?? [])) {
            const m = String(i.income_date).slice(0, 7);
            if (!byMonth[m]) byMonth[m] = { expenses: 0, income: 0, expense_count: 0, income_count: 0 };
            byMonth[m].income += Number(i.amount);
            byMonth[m].income_count += 1;
          }
          const trend = Object.entries(byMonth)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, v]) => ({ month, ...v, net: v.income - v.expenses }));
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify({ monthly_trend: trend }) });

        // ── get_horim_summary ─────────────────────────────────────────────────
        } else if (blk.name === "get_horim_summary") {
          const [secR, gradeR, gsaR, colR] = await Promise.all([
            uc.from("parent_sections").select("id,name,order_index").eq("school_year_id", yid).eq("is_active", true).order("order_index"),
            uc.from("grades").select("id,name,student_count").eq("school_year_id", yid).order("order_index"),
            uc.from("grade_section_amounts").select("grade_id,parent_section_id,amount_per_student").eq("school_year_id", yid),
            uc.from("parent_collections").select("parent_section_id,amount").eq("school_year_id", yid),
          ]);
          const grades = (gradeR.data ?? []) as { id: string; name: string; student_count: number }[];
          const sections = (secR.data ?? []) as { id: string; name: string }[];
          const gsaMap: Record<string, number> = {};
          for (const g of (gsaR.data ?? [])) gsaMap[g.grade_id + ":" + g.parent_section_id] = Number(g.amount_per_student);
          const colMap: Record<string, number> = {};
          for (const c of (colR.data ?? [])) colMap[c.parent_section_id] = (colMap[c.parent_section_id] ?? 0) + Number(c.amount);
          const result = sections.map(s => {
            let total100 = 0;
            for (const g of grades) total100 += (gsaMap[g.id + ":" + s.id] ?? 0) * g.student_count;
            const total85 = total100 * 0.85;
            const collected = colMap[s.id] ?? 0;
            return { section: s.name, total_100_percent: total100, total_85_percent: Math.round(total85), collected, remaining_to_85: Math.round(Math.max(0, total85 - collected)), collection_rate_pct: total85 > 0 ? Math.round((collected / total85) * 100) : 0 };
          }).filter(s => s.total_100_percent > 0);
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(result) });

        // ── get_grades ────────────────────────────────────────────────────────
        } else if (blk.name === "get_grades") {
          const { data } = await uc.from("grades").select("id,name,student_count,order_index").eq("school_year_id", yid).order("order_index");
          const total = (data ?? []).reduce((s: number, g: { student_count: number }) => s + Number(g.student_count), 0);
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify({ grades: data ?? [], total_students: total }) });

        // ── get_parent_collections ────────────────────────────────────────────
        } else if (blk.name === "get_parent_collections") {
          const [secR, gradeR, gsaR, colR] = await Promise.all([
            uc.from("parent_sections").select("id,name,order_index").eq("school_year_id", yid).eq("is_active", true).order("order_index"),
            uc.from("grades").select("id,name,student_count,order_index").eq("school_year_id", yid).order("order_index"),
            uc.from("grade_section_amounts").select("grade_id,parent_section_id,amount_per_student").eq("school_year_id", yid),
            uc.from("parent_collections").select("grade_id,parent_section_id,amount,collection_date").eq("school_year_id", yid),
          ]);
          const grades = (gradeR.data ?? []) as { id: string; name: string; student_count: number }[];
          const sections = (secR.data ?? []) as { id: string; name: string }[];
          const filterSec = inp.section_name ? String(inp.section_name).toLowerCase() : null;
          const gsaMap: Record<string, number> = {};
          for (const g of (gsaR.data ?? [])) gsaMap[g.grade_id + ":" + g.parent_section_id] = Number(g.amount_per_student);
          const colMap: Record<string, number> = {};
          for (const c of (colR.data ?? [])) {
            const k = c.grade_id + ":" + c.parent_section_id;
            colMap[k] = (colMap[k] ?? 0) + Number(c.amount);
          }
          const result = sections
            .filter(s => !filterSec || s.name.toLowerCase().includes(filterSec))
            .map(sec => {
              const gradeRows = grades.map(g => {
                const amt = gsaMap[g.id + ":" + sec.id] ?? 0;
                if (amt === 0) return null;
                const t100 = amt * g.student_count;
                const t85 = Math.round(t100 * 0.85);
                const coll = colMap[g.id + ":" + sec.id] ?? 0;
                return { grade: g.name, students: g.student_count, amount_per_student: amt, target_100: t100, target_85: t85, collected: coll, remaining: Math.max(0, t85 - coll), pct_of_85: t85 > 0 ? Math.round((coll / t85) * 100) : 0 };
              }).filter(Boolean);
              if (gradeRows.length === 0) return null;
              const totColl = gradeRows.reduce((s: number, r) => s + (r as { collected: number }).collected, 0);
              const totT85  = gradeRows.reduce((s: number, r) => s + (r as { target_85: number }).target_85, 0);
              return { section: sec.name, total_collected: totColl, total_target_85: totT85, collection_pct: totT85 > 0 ? Math.round((totColl / totT85) * 100) : 0, by_grade: gradeRows };
            }).filter(Boolean);
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(result) });

        // ── add_expense / add_income ──────────────────────────────────────────
        } else if (blk.name === "add_expense" || blk.name === "add_income") {
          const src = normSrc(String(inp.source ?? ""), srcs);
          const lbl = srcs.find(s => s.slug === src)?.label ?? src;
          const rawCatId = inp.budget_category_id ? String(inp.budget_category_id) : null;
          const catId = isUUID(rawCatId) ? rawCatId : null;
          if (rawCatId && !catId) console.warn("non-UUID budget_category_id:", rawCatId);
          let catName: string | null = null;
          if (catId) {
            const { data: catR } = await uc.from("budget_categories").select("name").eq("id", catId).maybeSingle();
            catName = catR?.name ?? null;
          }
          if (blk.name === "add_expense") {
            const d = String(inp.expense_date ?? today);
            const payload = { school_year_id: yid, description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source: src, expense_date: d, bank_account: "school", target_grade_ids: [], budget_category_id: catId, supplier: inp.supplier ? String(inp.supplier) : null, created_by: uid };
            const preview = { type: "add_expense", description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source_slug: src, source_label: lbl, date: d, budget_category_id: catId, category_name: catName, supplier: inp.supplier ? String(inp.supplier) : null };
            const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: blk.name, status: "draft", payload, preview }).select("id,action_type,preview").single();
            if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); }
            else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. סכם ובקש אישור." }); }
          } else {
            const d = String(inp.income_date ?? today);
            const payload = { school_year_id: yid, description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source: src, income_date: d, bank_account: "school", budget_category_id: catId, payer: inp.payer ? String(inp.payer) : null, created_by: uid };
            const preview = { type: "add_income", description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source_slug: src, source_label: lbl, date: d, budget_category_id: catId, category_name: catName, payer: inp.payer ? String(inp.payer) : null };
            const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: blk.name, status: "draft", payload, preview }).select("id,action_type,preview").single();
            if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); }
            else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. סכם ובקש אישור." }); }
          }
        }
      }
      cur.push({ role: "user", content: tr });
      continue;
    }
    break;
  }
  return { reply: "✅", draft };
}

async function handleConfirm(
  sc: ReturnType<typeof createClient>, uc: ReturnType<typeof createClient>,
  uid: string, cid: string | null, draftId: string, approved: boolean,
) {
  const { data: dr, error } = await sc.from("ai_action_drafts").select("*").eq("id", draftId).eq("user_id", uid).in("status", ["draft", "failed"]).maybeSingle();
  if (error || !dr) return json({ error: "טיוט לא נמצא" }, 404);
  if (!approved) {
    await sc.from("ai_action_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", draftId);
    const msg = "ביטלתי את הפעולה.";
    if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: msg });
    return json({ reply: msg, executed: false });
  }
  try {
    const pl = { ...(dr.payload as Record<string, unknown>) };
    if (!pl.bank_account) pl.bank_account = "school";
    if (dr.action_type === "add_expense" && !pl.target_grade_ids) pl.target_grade_ids = [];
    if (!pl.school_year_id) {
      const memR = await uc.from("organization_members").select("organization_id").eq("user_id", uid).eq("status", "active").maybeSingle();
      if (memR.data) {
        const yrR = await uc.from("school_years").select("id").eq("organization_id", memR.data.organization_id).eq("is_active", true).maybeSingle();
        pl.school_year_id = yrR.data?.id ?? null;
      }
    }
    const rawCatId = pl.budget_category_id != null ? String(pl.budget_category_id) : null;
    if (!isUUID(rawCatId)) pl.budget_category_id = null;
    const tbl = dr.action_type === "add_expense" ? "expenses" : "income";
    const sel = dr.action_type === "add_expense" ? "id,description,amount,source,expense_date,budget_category_id" : "id,description,amount,source,income_date,budget_category_id";
    const { data: ins, error: ie } = await sc.from(tbl).insert(pl).select(sel).single();
    if (ie) { console.error("Insert error:", JSON.stringify(ie)); throw ie; }
    await sc.from("ai_action_drafts").update({ status: "executed", updated_at: new Date().toISOString(), executed_at: new Date().toISOString() }).eq("id", draftId);
    sc.from("ai_activity_log").insert({ user_id: uid, conversation_id: cid, action_draft_id: draftId, action_type: dr.action_type, target_table: tbl, target_id: (ins as Record<string, unknown>)?.id, after: ins }).then(() => {}).catch(() => {});
    const p = dr.preview as Record<string, unknown>;
    const lbl = dr.action_type === "add_expense" ? "הוצאה" : "הכנסה";
    const catPart = p.category_name ? " בסעיף " + String(p.category_name) : "";
    const msg = "נרשם " + lbl + " ₪" + new Intl.NumberFormat("he-IL").format(Number(p.amount ?? 0)) + " — " + String(p.description ?? "") + " (" + String(p.source_label ?? "") + catPart + "). הדף עודכן.";
    if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: msg });
    return json({ reply: msg, executed: true, result: ins });
  } catch (err) {
    const errMsg = "שגיאה: " + String(err);
    if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: errMsg });
    return json({ error: errMsg, executed: false }, 500);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const U = Deno.env.get("SUPABASE_URL")!;
    const A = Deno.env.get("SUPABASE_ANON_KEY")!;
    const S = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const uc = createClient(U, A, { global: { headers: { Authorization: auth } } });
    const sc = createClient(U, S);
    const { data: { user }, error: ae } = await uc.auth.getUser();
    if (ae || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json() as { type?: string; message?: string; conversation_id?: string; action_draft_id?: string; approved?: boolean };
    if (body.type === "confirm" && body.action_draft_id)
      return handleConfirm(sc, uc, user.id, body.conversation_id ?? null, body.action_draft_id, body.approved ?? false);
    if (!body.message) return json({ error: "message required" }, 400);

    const memR = await uc.from("organization_members").select("organization_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!memR.data) return json({ error: "No org" }, 403);
    const orgId = memR.data.organization_id as string;
    const apiKey = Deno.env.get("CLAUDE_API_KEY") ?? null;

    const [yearR, srcR] = await Promise.all([
      uc.from("school_years").select("id,name").eq("organization_id", orgId).eq("is_active", true).maybeSingle(),
      uc.from("org_budget_sources").select("slug,label").eq("org_id", orgId).order("order_index"),
    ]);
    const year = yearR.data as { id: string; name: string } | null;
    const yid = year?.id;
    if (!yid) return json({ error: "אין שנת לימודים פעילה" }, 400);
    const srcs: { slug: string; label: string }[] = srcR.data?.length
      ? (srcR.data as { slug: string; label: string }[])
      : [{ slug: "gefen", label: "גפן" }, { slug: "iriyah", label: "עירייה" }, { slug: "horim", label: "הורים" }];

    if (!apiKey) {
      const msg = "סוכן ה-AI אינו זמין כרגע. צרו קשר עם מנהל המערכת.";
      let cid = body.conversation_id ?? null;
      if (!cid) { const { data: nc } = await uc.from("ai_conversations").insert({ user_id: user.id, school_year_id: yid, title: body.message.slice(0, 50) }).select("id").single(); cid = nc?.id ?? null; }
      if (cid) await uc.from("ai_messages").insert([{ conversation_id: cid, user_id: user.id, role: "user", content: body.message }, { conversation_id: cid, user_id: user.id, role: "assistant", content: msg }]);
      return json({ conversation_id: cid, reply: msg, action_draft: null });
    }

    let cid = body.conversation_id ?? null;
    const [ctx, histR, ncR] = await Promise.all([
      buildCtx(uc, yid, srcs),
      cid ? uc.from("ai_messages").select("role,content").eq("conversation_id", cid).order("created_at", { ascending: true }).limit(40) : Promise.resolve({ data: [] as { role: string; content: string }[] }),
      !cid ? uc.from("ai_conversations").insert({ user_id: user.id, school_year_id: yid, title: body.message.slice(0, 50) }).select("id").single() : Promise.resolve({ data: null }),
    ]);
    if (!cid) cid = (ncR as { data: { id: string } | null }).data?.id ?? null;
    if (!cid) return json({ error: "conv failed" }, 500);

    const hist = ((histR as { data: { role: string; content: string }[] }).data ?? []).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    hist.push({ role: "user", content: body.message });

    const [_save, { reply, draft }] = await Promise.all([
      uc.from("ai_messages").insert({ conversation_id: cid, user_id: user.id, role: "user", content: body.message }),
      callClaude(apiKey, buildSys(ctx, srcs, year), hist, buildTools(srcs), uc, sc, user.id, cid, yid, srcs),
    ]);

    const [savedR] = await Promise.all([
      uc.from("ai_messages").insert({ conversation_id: cid, user_id: user.id, role: "assistant", content: reply, metadata: draft ? { action_draft_id: draft.id } : null }).select("id").single(),
      uc.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid),
    ]);

    return json({ conversation_id: cid, message_id: (savedR as { data: { id: string } | null }).data?.id, reply, action_draft: draft ? { id: draft.id, action_type: draft.action_type, preview: draft.preview } : null });
  } catch (err) {
    console.error("top-level:", String(err));
    return json({ error: "שגיאה." }, 500);
  }
});
