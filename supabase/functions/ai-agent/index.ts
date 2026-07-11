import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-6";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

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
function makeSlug(label: string, hint?: string): string {
  const base = (hint || label)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 28)
    .replace(/^-+|-+$/g, "");
  return (base || "src") + "-" + Date.now().toString().slice(-4);
}

// ── Build budget context ────────────────────────────────────────────────────────
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

// ── System prompt ───────────────────────────────────────────────────────────────
function buildSys(ctx: string, srcs: { slug: string; label: string }[], year: { name: string } | null) {
  const today = todayIL();
  const dayHe = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const srcStr = srcs.map(s => s.slug + "=" + s.label).join(", ");
  return `אתה עוזר פיננסי חכם של בית הספר. אתה מכיר את התקציב לעומק ועוזר לנהל הוצאות, הכנסות, תכנון פעילויות וניתוחים — בצורה חלקה, מהירה ואינטליגנטית. אתה מבין כוונה מהקשר, לא רק מילות מפתח.

היום: ${dayHe} (${today}) | שנת לימודים: ${year?.name ?? "לא קיימת"} | מקורות: ${srcStr}

תקציב נוכחי לפי מקור וסעיפים:
${ctx}

━━━ איך לעבוד ━━━

הבן כוונה — אל תחקור:
כשמישהו אומר "הוסף 500 לאוכל בגפן" — קרא מיד get_budget_categories עבור גפן, מצא את הסעיף הכי קרוב, וצור טיוטה עם תאריך היום. אל תשאל שאלות שאתה יכול להסיק לבד מההקשר.

שאל לכל היותר שאלה אחת, כוללת:
אם חסר מידע קריטי שלא ניתן להסיק (כמו סכום), שאל הכל בהודעה אחת: "כמה ולאיזה מקור?" — לא שתי הודעות נפרדות. אם ניתן לנחש בסבירות גבוהה — נחש וציין את ההנחה.

ברירות מחדל:
תאריך = היום (${today}). ספק = null (אל תשאל). קטגוריה = הסעיף הכי קרוב לתיאור לפי שם.

━━━ כללים קריטיים לכלים ━━━

לפני כל add_expense / add_income:
חובה לקרוא get_budget_categories עם המקור הנכון. השתמש רק ב-id שקיבלת — לעולם אל תכתוב UUID מהדמיון, גם לא כ"דוגמה".

לפני כל תשובה עובדתית על מספרים:
קרא את הכלי המתאים — אל תסמוך על הנתונים שבהקשר הראשוני, הם עשויים להיות לא מעודכנים.

get_expenses / get_income מחזירים id — השתמש בו ל-update/delete בלבד.

━━━ זרימות עיקריות ━━━

הוספת הוצאה/הכנסה — 3 שלבים:
1. קרא get_budget_categories למקור הרלוונטי
2. הצמד את התיאור לסעיף המתאים ביותר, צור טיוטה
3. הצג בקצרה ושאל "בסדר?" — לא להוסיף שלבי שאלות ביניים

ניתוח תקציב:
קרא get_expense_analysis ו-get_monthly_trend יחד → תן תובנה אחת ברורה, לא רשימה.

תכנון פעילות (טיול/אירוע/גיבוש):
שאל שאלה אחת לכל מה שחסר (שכבה + פריטי עלות + מקור) → חשב: עלות לפריט, סה"כ, עלות לתלמיד, יתרה אחרי → שאל "רוצה שאכניס?" → אם כן, קרא add_expenses_batch.

עריכה/מחיקה:
קרא get_expenses / get_income → הצג מה מצאת → שאל מה לשנות → קרא update/delete עם ה-id.

ניהול סעיפים/כיתות/מקורות:
קרא קודם את הרשימה המתאימה (get_budget_categories / get_grades) לקבלת ה-id, ואז צור/עדכן/מחק.

━━━ פורמט תשובות ━━━
עברית טבעית, חמה, קצרה. ללא Markdown (אסור: ##, **, |, ---, רשימות ממוספרות).
לשון ניטרלית. סכומים עם ₪ ופסיקי אלפים (₪12,345).
אחרי אישור — משפט אחד עם הנתון הרלוונטי (יתרה חדשה). לא יותר.`;
}

// ── Tools definition ────────────────────────────────────────────────────────────
function buildTools(srcs: { slug: string; label: string }[]) {
  const sd = srcs.map(s => s.slug + "=" + s.label).join(", ");
  const td = "YYYY-MM-DD";
  return [
    // ── Read tools ──
    {
      name: "get_expenses",
      description: "שאילת הוצאות לפי מקור ותאריך. מחזיר id לשימוש ב-update/delete. השתמש לפני כל עריכה/מחיקה.",
      input_schema: { type: "object", properties: { source: { type: "string", description: sd }, from_date: { type: "string", description: td }, to_date: { type: "string", description: td }, limit: { type: "number" } } },
    },
    {
      name: "get_income",
      description: "שאילת הכנסות לפי מקור ותאריך. מחזיר id לשימוש ב-update/delete.",
      input_schema: { type: "object", properties: { source: { type: "string", description: sd }, from_date: { type: "string", description: td }, to_date: { type: "string", description: td }, limit: { type: "number" } } },
    },
    {
      name: "get_budget_categories",
      description: "סעיפי תקציב לפי מקור עם id ותקציב מתוכנן. חובה לקרוא לפני add/set/rename/delete על סעיפים.",
      input_schema: { type: "object", required: ["source"], properties: { source: { type: "string", description: sd } } },
    },
    {
      name: "get_budget_summary",
      description: "סיכום מפורט של כל הסעיפים: תוכנן, הוצא, נותר, אחוז ניצול.",
      input_schema: { type: "object", properties: { source: { type: "string", description: "מקור לסינון (אופציונלי): " + sd } } },
    },
    {
      name: "get_expense_analysis",
      description: "ניתוח מעמיק: 5 הקטגוריות הגבוהות, חריגות, קרובות ל-100%. קרא לכל שאלה על מגמות.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_monthly_trend",
      description: "הוצאות והכנסות מקובצות לפי חודש — לזיהוי מגמות.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_horim_summary",
      description: "סיכום גביית הורים לפי סעיף: יעד, נגבה, חסר.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_grades",
      description: "כל השכבות/כיתות עם id ומספר תלמידים. קרא לפני set_grade/create_grade ולפני תכנון פעילויות.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_parent_collections",
      description: "פירוט גביית הורים לפי שכבה וסעיף.",
      input_schema: { type: "object", properties: { section_name: { type: "string" } } },
    },
    // ── Add expense / income ──
    {
      name: "add_expense",
      description: "יוצר טיוטת הוצאה לאישור. קרא רק אחרי get_budget_categories וכשיש כל הפרטים.",
      input_schema: { type: "object", required: ["description", "amount", "source", "expense_date"], properties: { description: { type: "string" }, amount: { type: "number" }, source: { type: "string", description: sd }, expense_date: { type: "string", description: td }, budget_category_id: { type: "string", description: "UUID מ-get_budget_categories בלבד" }, supplier: { type: "string" } } },
    },
    {
      name: "add_expenses_batch",
      description: "יוצר מספר הוצאות בבת אחת אחרי תכנון פעילות. קרא רק כשהמשתמש אישר בפירוש.",
      input_schema: {
        type: "object", required: ["expenses"],
        properties: {
          expenses: {
            type: "array", description: "רשימת ההוצאות",
            items: {
              type: "object", required: ["description", "amount", "source", "expense_date"],
              properties: { description: { type: "string" }, amount: { type: "number" }, source: { type: "string", description: sd }, expense_date: { type: "string", description: td }, budget_category_id: { type: "string" }, supplier: { type: "string" } },
            },
          },
        },
      },
    },
    {
      name: "add_income",
      description: "יוצר טיוטת הכנסה לאישור. קרא רק אחרי get_budget_categories וכשיש כל הפרטים.",
      input_schema: { type: "object", required: ["description", "amount", "source", "income_date"], properties: { description: { type: "string" }, amount: { type: "number" }, source: { type: "string", description: sd }, income_date: { type: "string", description: td }, budget_category_id: { type: "string" }, payer: { type: "string" } } },
    },
    // ── Budget category management ──
    {
      name: "set_category_budget",
      description: "עדכון תקציב מתוכנן לסעיף קיים. קרא get_budget_categories קודם לקבלת ה-ID.",
      input_schema: { type: "object", required: ["category_id", "new_amount"], properties: { category_id: { type: "string", description: "UUID מ-get_budget_categories" }, new_amount: { type: "number" } } },
    },
    {
      name: "create_budget_category",
      description: "יצירת סעיף תקציב חדש במקור מסוים.",
      input_schema: { type: "object", required: ["name", "source"], properties: { name: { type: "string" }, source: { type: "string", description: sd }, planned_amount: { type: "number", description: "תקציב מתוכנן (ברירת מחדל 0)" } } },
    },
    {
      name: "rename_budget_category",
      description: "שינוי שם סעיף תקציב. קרא get_budget_categories קודם.",
      input_schema: { type: "object", required: ["category_id", "new_name"], properties: { category_id: { type: "string" }, new_name: { type: "string" } } },
    },
    {
      name: "delete_budget_category",
      description: "מחיקת סעיף תקציב. קרא get_budget_summary קודם — אם יש הוצאות, הזהר ובקש אישור מפורש.",
      input_schema: { type: "object", required: ["category_id"], properties: { category_id: { type: "string" } } },
    },
    // ── Grade management ──
    {
      name: "set_grade",
      description: "עדכון שם ו/או מספר תלמידים בכיתה קיימת. קרא get_grades קודם לקבלת ה-ID.",
      input_schema: { type: "object", required: ["grade_id"], properties: { grade_id: { type: "string" }, new_name: { type: "string" }, new_student_count: { type: "number" } } },
    },
    {
      name: "create_grade",
      description: "הוספת כיתה/שכבה חדשה לשנת הלימודים הנוכחית.",
      input_schema: { type: "object", required: ["name", "student_count"], properties: { name: { type: "string" }, student_count: { type: "number" } } },
    },
    // ── Budget source management ──
    {
      name: "create_budget_source",
      description: "הוספת מקור תקציב חדש לארגון (כמו 'מינהל', 'קרן אינטגרציה'). המזהה נוצר אוטומטית.",
      input_schema: { type: "object", required: ["label"], properties: { label: { type: "string", description: "שם תצוגה, למשל 'מינהל'" }, slug: { type: "string", description: "מזהה אנגלי קצר (אופציונלי), למשל 'minahal'" } } },
    },
    // ── Edit/delete expense & income ──
    {
      name: "update_expense",
      description: "עריכת הוצאה קיימת. קרא get_expenses קודם לקבלת ה-ID. ציין רק השדות שמשתנים.",
      input_schema: { type: "object", required: ["expense_id"], properties: { expense_id: { type: "string" }, description: { type: "string" }, amount: { type: "number" }, expense_date: { type: "string", description: td }, budget_category_id: { type: "string" } } },
    },
    {
      name: "delete_expense",
      description: "מחיקת הוצאה קיימת. קרא get_expenses קודם לאישור הפרטים.",
      input_schema: { type: "object", required: ["expense_id"], properties: { expense_id: { type: "string" } } },
    },
    {
      name: "update_income",
      description: "עריכת הכנסה קיימת. קרא get_income קודם לקבלת ה-ID.",
      input_schema: { type: "object", required: ["income_id"], properties: { income_id: { type: "string" }, description: { type: "string" }, amount: { type: "number" }, income_date: { type: "string", description: td }, budget_category_id: { type: "string" } } },
    },
    {
      name: "delete_income",
      description: "מחיקת הכנסה קיימת. קרא get_income קודם לאישור הפרטים.",
      input_schema: { type: "object", required: ["income_id"], properties: { income_id: { type: "string" } } },
    },
  ];
}

type CC = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type CM = { role: "user" | "assistant"; content: string | CC[] };

// ── Main Claude call loop ───────────────────────────────────────────────────────
async function callClaude(
  key: string, sys: string, msgs: CM[], tools: unknown[],
  uc: ReturnType<typeof createClient>,
  sc: ReturnType<typeof createClient>,
  uid: string, cid: string, yid: string, orgId: string,
  srcs: { slug: string; label: string }[],
): Promise<{ reply: string; draft: { id: string; action_type: string; preview: unknown } | null; batchDraft: { ids: string[]; previews: unknown[]; total: number } | null }> {
  let cur: CM[] = [...msgs];
  let draft: { id: string; action_type: string; preview: unknown } | null = null;
  let batchDraft: { ids: string[]; previews: unknown[]; total: number } | null = null;
  const today = todayIL();

  for (let iter = 0; iter < 14; iter++) {
    const r = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: sys, messages: cur, tools }),
    });
    if (!r.ok) throw new Error("Claude " + r.status + ": " + await r.text());
    const res: { stop_reason: string; content: CC[] } = await r.json();

    if (res.stop_reason === "end_turn") {
      return { reply: res.content.find(b => b.type === "text")?.text ?? "✅", draft, batchDraft };
    }

    if (res.stop_reason === "tool_use") {
      cur.push({ role: "assistant", content: res.content });
      const tr: CC[] = [];

      for (const blk of res.content) {
        if (blk.type !== "tool_use" || !blk.id || !blk.name) continue;
        const inp = (blk.input ?? {}) as Record<string, unknown>;

        // ── get_expenses ──────────────────────────────────────────────────────
        if (blk.name === "get_expenses") {
          let q = uc.from("expenses").select("id,description,amount,source,expense_date,supplier,budget_category_id").eq("school_year_id", yid).order("expense_date", { ascending: false }).limit(Number(inp.limit) || 50);
          if (inp.source) q = q.eq("source", inp.source as string);
          if (inp.from_date) q = q.gte("expense_date", inp.from_date as string);
          if (inp.to_date) q = q.lte("expense_date", inp.to_date as string);
          const { data } = await q;
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(data ?? []) });

        // ── get_income ────────────────────────────────────────────────────────
        } else if (blk.name === "get_income") {
          let q = uc.from("income").select("id,description,amount,source,income_date,payer,budget_category_id").eq("school_year_id", yid).order("income_date", { ascending: false }).limit(Number(inp.limit) || 50);
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

        // ── get_expense_analysis ──────────────────────────────────────────────
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
          const srcLabels = Object.entries(expBySrc).reduce((acc: Record<string, number>, [slug, amt]) => { const lbl = srcs.find(s => s.slug === slug)?.label ?? slug; acc[lbl] = (acc[lbl] ?? 0) + amt; return acc; }, {});
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify({ top_5_by_spend: top5, over_budget: overBudget, near_budget_80pct_plus: near80, potentially_underutilized: underused, total_by_source: srcLabels }) });

        // ── get_monthly_trend ─────────────────────────────────────────────────
        } else if (blk.name === "get_monthly_trend") {
          const [expsR, incsR] = await Promise.all([
            uc.from("expenses").select("source,amount,expense_date").eq("school_year_id", yid).order("expense_date"),
            uc.from("income").select("source,amount,income_date").eq("school_year_id", yid).order("income_date"),
          ]);
          const byMonth: Record<string, { expenses: number; income: number; expense_count: number; income_count: number }> = {};
          for (const e of (expsR.data ?? [])) { const m = String(e.expense_date).slice(0, 7); if (!byMonth[m]) byMonth[m] = { expenses: 0, income: 0, expense_count: 0, income_count: 0 }; byMonth[m].expenses += Number(e.amount); byMonth[m].expense_count += 1; }
          for (const i of (incsR.data ?? [])) { const m = String(i.income_date).slice(0, 7); if (!byMonth[m]) byMonth[m] = { expenses: 0, income: 0, expense_count: 0, income_count: 0 }; byMonth[m].income += Number(i.amount); byMonth[m].income_count += 1; }
          const trend = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v, net: v.income - v.expenses }));
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
          for (const c of (colR.data ?? [])) { const k = c.grade_id + ":" + c.parent_section_id; colMap[k] = (colMap[k] ?? 0) + Number(c.amount); }
          const result = sections.filter(s => !filterSec || s.name.toLowerCase().includes(filterSec)).map(sec => {
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
            const totT85 = gradeRows.reduce((s: number, r) => s + (r as { target_85: number }).target_85, 0);
            return { section: sec.name, total_collected: totColl, total_target_85: totT85, collection_pct: totT85 > 0 ? Math.round((totColl / totT85) * 100) : 0, by_grade: gradeRows };
          }).filter(Boolean);
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(result) });

        // ── add_expense / add_income ──────────────────────────────────────────
        } else if (blk.name === "add_expense" || blk.name === "add_income") {
          const src = normSrc(String(inp.source ?? ""), srcs);
          const lbl = srcs.find(s => s.slug === src)?.label ?? src;
          const rawCatId = inp.budget_category_id ? String(inp.budget_category_id) : null;
          let catId: string | null = isUUID(rawCatId) ? rawCatId : null;
          let catName: string | null = null;
          if (catId) {
            const { data: catR } = await uc.from("budget_categories").select("name").eq("id", catId).maybeSingle();
            if (catR) { catName = catR.name; } else { catId = null; } // UUID doesn't exist — ignore it
          }
          if (blk.name === "add_expense") {
            const d = String(inp.expense_date ?? today);
            const payload = { school_year_id: yid, description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source: src, expense_date: d, bank_account: "school", target_grade_ids: [], budget_category_id: catId, supplier: inp.supplier ? String(inp.supplier) : null, created_by: uid };
            const preview = { type: "add_expense", description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source_slug: src, source_label: lbl, date: d, budget_category_id: catId, category_name: catName, supplier: inp.supplier ? String(inp.supplier) : null };
            const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: blk.name, status: "draft", payload, preview }).select("id,action_type,preview").single();
            if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. סכם ובקש אישור." }); }
          } else {
            const d = String(inp.income_date ?? today);
            const payload = { school_year_id: yid, description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source: src, income_date: d, bank_account: "school", budget_category_id: catId, payer: inp.payer ? String(inp.payer) : null, created_by: uid };
            const preview = { type: "add_income", description: String(inp.description ?? ""), amount: Number(inp.amount ?? 0), source_slug: src, source_label: lbl, date: d, budget_category_id: catId, category_name: catName, payer: inp.payer ? String(inp.payer) : null };
            const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: blk.name, status: "draft", payload, preview }).select("id,action_type,preview").single();
            if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. סכם ובקש אישור." }); }
          }

        // ── add_expenses_batch ────────────────────────────────────────────────
        } else if (blk.name === "add_expenses_batch") {
          const expenses = (inp.expenses ?? []) as Array<{ description: string; amount: number; source: string; expense_date: string; budget_category_id?: string; supplier?: string }>;
          const batchItems: { id: string; action_type: string; preview: unknown }[] = [];
          for (const exp of expenses) {
            const src = normSrc(String(exp.source ?? ""), srcs);
            const lbl = srcs.find(s => s.slug === src)?.label ?? src;
            const rawCatId = exp.budget_category_id ?? null;
            let catId: string | null = isUUID(rawCatId) ? rawCatId : null;
            let catName: string | null = null;
            if (catId) {
              const { data: catR } = await uc.from("budget_categories").select("name").eq("id", catId).maybeSingle();
              if (catR) { catName = catR.name; } else { catId = null; }
            }
            const d = String(exp.expense_date ?? today);
            const payload = { school_year_id: yid, description: String(exp.description ?? ""), amount: Number(exp.amount ?? 0), source: src, expense_date: d, bank_account: "school", target_grade_ids: [], budget_category_id: catId, supplier: exp.supplier ? String(exp.supplier) : null, created_by: uid };
            const preview = { type: "add_expense", description: String(exp.description ?? ""), amount: Number(exp.amount ?? 0), source_slug: src, source_label: lbl, date: d, budget_category_id: catId, category_name: catName, supplier: exp.supplier ? String(exp.supplier) : null };
            const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "add_expense", status: "draft", payload, preview }).select("id,action_type,preview").single();
            if (!de && dd) batchItems.push(dd);
          }
          batchDraft = { ids: batchItems.map(b => b.id), previews: batchItems.map(b => b.preview), total: batchItems.length };
          tr.push({ type: "tool_result", tool_use_id: blk.id, content: `נוצרו ${batchItems.length} טיוטות. ציין שיש ${batchItems.length} הוצאות שמחכות לאישור אחד.` });

        // ── set_category_budget ───────────────────────────────────────────────
        } else if (blk.name === "set_category_budget") {
          const catId = String(inp.category_id ?? "");
          const newAmount = Number(inp.new_amount ?? 0);
          if (!isUUID(catId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין. קרא get_budget_categories קודם." }); continue; }
          const { data: cat } = await sc.from("budget_categories").select("id,name,source,planned_amount").eq("id", catId).eq("school_year_id", yid).maybeSingle();
          if (!cat) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "סעיף לא נמצא." }); continue; }
          const lbl = srcs.find(s => s.slug === cat.source)?.label ?? cat.source;
          const preview = { type: "set_category_budget", category_id: catId, category_name: cat.name, source_label: lbl, old_amount: Number(cat.planned_amount), new_amount: newAmount };
          const payload = { category_id: catId, new_amount: newAmount };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "set_category_budget", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. בקש אישור." }); }

        // ── create_budget_category ────────────────────────────────────────────
        } else if (blk.name === "create_budget_category") {
          const src = normSrc(String(inp.source ?? ""), srcs);
          const lbl = srcs.find(s => s.slug === src)?.label ?? src;
          const name = String(inp.name ?? "");
          const planned = Number(inp.planned_amount ?? 0);
          const { data: maxIdx } = await sc.from("budget_categories").select("order_index").eq("school_year_id", yid).eq("source", src).order("order_index", { ascending: false }).limit(1).maybeSingle();
          const orderIndex = ((maxIdx as { order_index: number } | null)?.order_index ?? 0) + 1;
          const preview = { type: "create_budget_category", name, source_label: lbl, planned_amount: planned };
          const payload = { school_year_id: yid, name, source: src, planned_amount: planned, order_index: orderIndex };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "create_budget_category", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. בקש אישור." }); }

        // ── rename_budget_category ────────────────────────────────────────────
        } else if (blk.name === "rename_budget_category") {
          const catId = String(inp.category_id ?? "");
          const newName = String(inp.new_name ?? "");
          if (!isUUID(catId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין." }); continue; }
          const { data: cat } = await sc.from("budget_categories").select("id,name,source").eq("id", catId).eq("school_year_id", yid).maybeSingle();
          if (!cat) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "סעיף לא נמצא." }); continue; }
          const lbl = srcs.find(s => s.slug === cat.source)?.label ?? cat.source;
          const preview = { type: "rename_budget_category", category_id: catId, old_name: cat.name, new_name: newName, source_label: lbl };
          const payload = { category_id: catId, new_name: newName };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "rename_budget_category", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. בקש אישור." }); }

        // ── delete_budget_category ────────────────────────────────────────────
        } else if (blk.name === "delete_budget_category") {
          const catId = String(inp.category_id ?? "");
          if (!isUUID(catId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין." }); continue; }
          const { data: cat } = await sc.from("budget_categories").select("id,name,source").eq("id", catId).eq("school_year_id", yid).maybeSingle();
          if (!cat) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "סעיף לא נמצא." }); continue; }
          const { count } = await sc.from("expenses").select("id", { count: "exact", head: true }).eq("budget_category_id", catId);
          const lbl = srcs.find(s => s.slug === cat.source)?.label ?? cat.source;
          const preview = { type: "delete_budget_category", category_id: catId, name: cat.name, source_label: lbl, has_expenses: (count ?? 0) > 0, expense_count: count ?? 0 };
          const payload = { category_id: catId, name: cat.name };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "delete_budget_category", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. " + ((count ?? 0) > 0 ? `שים לב: לסעיף זה יש ${count} הוצאות רשומות.` : "") + " בקש אישור." }); }

        // ── set_grade ─────────────────────────────────────────────────────────
        } else if (blk.name === "set_grade") {
          const gradeId = String(inp.grade_id ?? "");
          if (!isUUID(gradeId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין. קרא get_grades קודם." }); continue; }
          const { data: grade } = await sc.from("grades").select("id,name,student_count").eq("id", gradeId).eq("school_year_id", yid).maybeSingle();
          if (!grade) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "כיתה לא נמצאה." }); continue; }
          const newName = inp.new_name ? String(inp.new_name) : null;
          const newCount = inp.new_student_count != null ? Number(inp.new_student_count) : null;
          const preview = { type: "set_grade", grade_id: gradeId, grade_name: grade.name, old_name: grade.name, new_name: newName ?? grade.name, old_count: Number(grade.student_count), new_count: newCount ?? Number(grade.student_count) };
          const payload = { grade_id: gradeId, new_name: newName ?? grade.name, new_student_count: newCount ?? Number(grade.student_count) };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "set_grade", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. בקש אישור." }); }

        // ── create_grade ──────────────────────────────────────────────────────
        } else if (blk.name === "create_grade") {
          const name = String(inp.name ?? "");
          const studentCount = Number(inp.student_count ?? 0);
          const { data: maxIdx } = await sc.from("grades").select("order_index").eq("school_year_id", yid).order("order_index", { ascending: false }).limit(1).maybeSingle();
          const orderIndex = ((maxIdx as { order_index: number } | null)?.order_index ?? 0) + 1;
          const preview = { type: "create_grade", name, student_count: studentCount };
          const payload = { school_year_id: yid, name, student_count: studentCount, order_index: orderIndex };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "create_grade", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. בקש אישור." }); }

        // ── create_budget_source ──────────────────────────────────────────────
        } else if (blk.name === "create_budget_source") {
          const label = String(inp.label ?? "");
          const slug = makeSlug(label, inp.slug ? String(inp.slug) : undefined);
          const { data: maxIdx } = await sc.from("org_budget_sources").select("order_index").eq("org_id", orgId).order("order_index", { ascending: false }).limit(1).maybeSingle();
          const orderIndex = ((maxIdx as { order_index: number } | null)?.order_index ?? 0) + 1;
          const preview = { type: "create_budget_source", label, slug };
          const payload = { org_id: orgId, label, slug, order_index: orderIndex };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "create_budget_source", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה נוצרה. בקש אישור." }); }

        // ── update_expense ────────────────────────────────────────────────────
        } else if (blk.name === "update_expense") {
          const expId = String(inp.expense_id ?? "");
          if (!isUUID(expId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין. קרא get_expenses קודם." }); continue; }
          const { data: exp } = await sc.from("expenses").select("id,description,amount,source,expense_date,budget_category_id").eq("id", expId).eq("school_year_id", yid).maybeSingle();
          if (!exp) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "הוצאה לא נמצאה." }); continue; }
          const lbl = srcs.find(s => s.slug === exp.source)?.label ?? exp.source;
          const newDesc = inp.description ? String(inp.description) : exp.description;
          const newAmount = inp.amount != null ? Number(inp.amount) : Number(exp.amount);
          const newDate = inp.expense_date ? String(inp.expense_date) : exp.expense_date;
          const rawCatId = inp.budget_category_id ? String(inp.budget_category_id) : exp.budget_category_id;
          const catId = isUUID(rawCatId) ? rawCatId : null;
          let catName: string | null = null;
          if (catId) { const { data: catR } = await uc.from("budget_categories").select("name").eq("id", catId).maybeSingle(); catName = catR?.name ?? null; }
          const preview = { type: "update_expense", expense_id: expId, source_label: lbl, old_description: exp.description, new_description: newDesc, old_amount: Number(exp.amount), new_amount: newAmount, old_date: exp.expense_date, new_date: newDate, category_name: catName };
          const payload = { expense_id: expId, description: newDesc, amount: newAmount, expense_date: newDate, budget_category_id: catId };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "update_expense", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה עריכה נוצרה. הצג שינויים ובקש אישור." }); }

        // ── delete_expense ────────────────────────────────────────────────────
        } else if (blk.name === "delete_expense") {
          const expId = String(inp.expense_id ?? "");
          if (!isUUID(expId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין." }); continue; }
          const { data: exp } = await sc.from("expenses").select("id,description,amount,source,expense_date").eq("id", expId).eq("school_year_id", yid).maybeSingle();
          if (!exp) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "הוצאה לא נמצאה." }); continue; }
          const lbl = srcs.find(s => s.slug === exp.source)?.label ?? exp.source;
          const preview = { type: "delete_expense", expense_id: expId, description: exp.description, amount: Number(exp.amount), source_label: lbl, date: exp.expense_date };
          const payload = { expense_id: expId };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "delete_expense", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה מחיקה נוצרה. הצג מה עומד להימחק ובקש אישור." }); }

        // ── update_income ─────────────────────────────────────────────────────
        } else if (blk.name === "update_income") {
          const incId = String(inp.income_id ?? "");
          if (!isUUID(incId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין. קרא get_income קודם." }); continue; }
          const { data: inc } = await sc.from("income").select("id,description,amount,source,income_date,budget_category_id").eq("id", incId).eq("school_year_id", yid).maybeSingle();
          if (!inc) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "הכנסה לא נמצאה." }); continue; }
          const lbl = srcs.find(s => s.slug === inc.source)?.label ?? inc.source;
          const newDesc = inp.description ? String(inp.description) : inc.description;
          const newAmount = inp.amount != null ? Number(inp.amount) : Number(inc.amount);
          const newDate = inp.income_date ? String(inp.income_date) : inc.income_date;
          const rawCatId = inp.budget_category_id ? String(inp.budget_category_id) : inc.budget_category_id;
          const catId = isUUID(rawCatId) ? rawCatId : null;
          let catName: string | null = null;
          if (catId) { const { data: catR } = await uc.from("budget_categories").select("name").eq("id", catId).maybeSingle(); catName = catR?.name ?? null; }
          const preview = { type: "update_income", income_id: incId, source_label: lbl, old_description: inc.description, new_description: newDesc, old_amount: Number(inc.amount), new_amount: newAmount, old_date: inc.income_date, new_date: newDate, category_name: catName };
          const payload = { income_id: incId, description: newDesc, amount: newAmount, income_date: newDate, budget_category_id: catId };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "update_income", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה עריכה נוצרה. הצג שינויים ובקש אישור." }); }

        // ── delete_income ─────────────────────────────────────────────────────
        } else if (blk.name === "delete_income") {
          const incId = String(inp.income_id ?? "");
          if (!isUUID(incId)) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: ID לא תקין." }); continue; }
          const { data: inc } = await sc.from("income").select("id,description,amount,source,income_date").eq("id", incId).eq("school_year_id", yid).maybeSingle();
          if (!inc) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "הכנסה לא נמצאה." }); continue; }
          const lbl = srcs.find(s => s.slug === inc.source)?.label ?? inc.source;
          const preview = { type: "delete_income", income_id: incId, description: inc.description, amount: Number(inc.amount), source_label: lbl, date: inc.income_date };
          const payload = { income_id: incId };
          const { data: dd, error: de } = await sc.from("ai_action_drafts").insert({ user_id: uid, conversation_id: cid, school_year_id: yid, action_type: "delete_income", status: "draft", payload, preview }).select("id,action_type,preview").single();
          if (de) { tr.push({ type: "tool_result", tool_use_id: blk.id, content: "שגיאה: " + de.message }); } else { draft = dd; tr.push({ type: "tool_result", tool_use_id: blk.id, content: "טיוטה מחיקה נוצרה. הצג מה עומד להימחק ובקש אישור." }); }
        }
      }
      cur.push({ role: "user", content: tr });
      continue;
    }
    break;
  }
  return { reply: "✅", draft, batchDraft };
}

// ── handleConfirm ────────────────────────────────────────────────────────────
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
    const pl = dr.payload as Record<string, unknown>;
    const p = dr.preview as Record<string, unknown>;
    const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
    let msg = "";

    // ── add_expense / add_income ──────────────────────────────────────────────
    if (dr.action_type === "add_expense" || dr.action_type === "add_income") {
      const payload = { ...pl };
      if (!payload.bank_account) payload.bank_account = "school";
      if (dr.action_type === "add_expense" && !payload.target_grade_ids) payload.target_grade_ids = [];
      const rawCatId = payload.budget_category_id != null ? String(payload.budget_category_id) : null;
      if (!isUUID(rawCatId)) {
        payload.budget_category_id = null;
      } else {
        // Verify the category actually exists (AI sometimes hallucates example UUIDs)
        const { data: catExists } = await sc.from("budget_categories").select("id").eq("id", rawCatId).maybeSingle();
        if (!catExists) payload.budget_category_id = null;
      }
      const tbl = dr.action_type === "add_expense" ? "expenses" : "income";
      const { data: ins, error: ie } = await sc.from(tbl).insert(payload).select("id").single();
      if (ie) throw ie;
      sc.from("ai_activity_log").insert({ user_id: uid, conversation_id: cid, action_draft_id: draftId, action_type: dr.action_type, target_table: tbl, target_id: (ins as { id: string })?.id, after: ins }).then(() => {}).catch(() => {});
      const lbl = dr.action_type === "add_expense" ? "הוצאה" : "הכנסה";
      const catPart = p.category_name ? " בסעיף " + String(p.category_name) : "";
      msg = "נרשמ" + (dr.action_type === "add_expense" ? "ה" : "ה") + " " + lbl + " ₪" + fmt(Number(p.amount ?? 0)) + " — " + String(p.description ?? "") + " (" + String(p.source_label ?? "") + catPart + "). הדף עודכן.";

    // ── set_category_budget ───────────────────────────────────────────────────
    } else if (dr.action_type === "set_category_budget") {
      const { error: ue } = await sc.from("budget_categories").update({ planned_amount: pl.new_amount }).eq("id", pl.category_id as string);
      if (ue) throw ue;
      msg = `עודכן התקציב המתוכנן לסעיף "${p.category_name}" (${p.source_label}) לסכום ₪${fmt(Number(p.new_amount ?? 0))}.`;

    // ── create_budget_category ────────────────────────────────────────────────
    } else if (dr.action_type === "create_budget_category") {
      const { error: ie } = await sc.from("budget_categories").insert(pl);
      if (ie) throw ie;
      msg = `נוצר סעיף תקציב חדש "${p.name}" (${p.source_label}) עם תקציב מתוכנן ₪${fmt(Number(p.planned_amount ?? 0))}.`;

    // ── rename_budget_category ────────────────────────────────────────────────
    } else if (dr.action_type === "rename_budget_category") {
      const { error: ue } = await sc.from("budget_categories").update({ name: pl.new_name }).eq("id", pl.category_id as string);
      if (ue) throw ue;
      msg = `שם הסעיף שונה מ-"${p.old_name}" ל-"${p.new_name}" (${p.source_label}).`;

    // ── delete_budget_category ────────────────────────────────────────────────
    } else if (dr.action_type === "delete_budget_category") {
      const { error: de } = await sc.from("budget_categories").delete().eq("id", pl.category_id as string);
      if (de) throw de;
      msg = `סעיף "${p.name}" נמחק.`;

    // ── set_grade ─────────────────────────────────────────────────────────────
    } else if (dr.action_type === "set_grade") {
      const updates: Record<string, unknown> = {};
      if (pl.new_name) updates.name = pl.new_name;
      if (pl.new_student_count != null) updates.student_count = pl.new_student_count;
      const { error: ue } = await sc.from("grades").update(updates).eq("id", pl.grade_id as string);
      if (ue) throw ue;
      const parts: string[] = [];
      if (p.old_name !== p.new_name) parts.push(`שם: "${p.old_name}" ← "${p.new_name}"`);
      if (p.old_count !== p.new_count) parts.push(`תלמידים: ${p.old_count} ← ${p.new_count}`);
      msg = `כיתה עודכנה: ${parts.join(", ")}.`;

    // ── create_grade ──────────────────────────────────────────────────────────
    } else if (dr.action_type === "create_grade") {
      const { error: ie } = await sc.from("grades").insert(pl);
      if (ie) throw ie;
      msg = `כיתה "${p.name}" נוספה עם ${p.student_count} תלמידים.`;

    // ── create_budget_source ──────────────────────────────────────────────────
    } else if (dr.action_type === "create_budget_source") {
      const { error: ie } = await sc.from("org_budget_sources").insert(pl);
      if (ie) throw ie;
      msg = `מקור תקציב "${p.label}" נוסף. כעת ניתן להשתמש בו בהוצאות והכנסות.`;

    // ── update_expense ────────────────────────────────────────────────────────
    } else if (dr.action_type === "update_expense") {
      const updates: Record<string, unknown> = {
        description: pl.description,
        amount: pl.amount,
        expense_date: pl.expense_date,
        budget_category_id: isUUID(pl.budget_category_id as string) ? pl.budget_category_id : null,
      };
      const { error: ue } = await sc.from("expenses").update(updates).eq("id", pl.expense_id as string);
      if (ue) throw ue;
      msg = `הוצאה "${p.new_description}" עודכנה (₪${fmt(Number(p.new_amount ?? 0))}, ${p.new_date}).`;

    // ── delete_expense ────────────────────────────────────────────────────────
    } else if (dr.action_type === "delete_expense") {
      const { error: de } = await sc.from("expenses").delete().eq("id", pl.expense_id as string);
      if (de) throw de;
      msg = `הוצאה "${p.description}" (₪${fmt(Number(p.amount ?? 0))}) נמחקה.`;

    // ── update_income ─────────────────────────────────────────────────────────
    } else if (dr.action_type === "update_income") {
      const updates: Record<string, unknown> = {
        description: pl.description,
        amount: pl.amount,
        income_date: pl.income_date,
        budget_category_id: isUUID(pl.budget_category_id as string) ? pl.budget_category_id : null,
      };
      const { error: ue } = await sc.from("income").update(updates).eq("id", pl.income_id as string);
      if (ue) throw ue;
      msg = `הכנסה "${p.new_description}" עודכנה (₪${fmt(Number(p.new_amount ?? 0))}, ${p.new_date}).`;

    // ── delete_income ─────────────────────────────────────────────────────────
    } else if (dr.action_type === "delete_income") {
      const { error: de } = await sc.from("income").delete().eq("id", pl.income_id as string);
      if (de) throw de;
      msg = `הכנסה "${p.description}" (₪${fmt(Number(p.amount ?? 0))}) נמחקה.`;

    } else {
      return json({ error: "סוג פעולה לא מוכר: " + dr.action_type }, 400);
    }

    await sc.from("ai_action_drafts").update({ status: "executed", updated_at: new Date().toISOString(), executed_at: new Date().toISOString() }).eq("id", draftId);
    if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: msg });
    return json({ reply: msg, executed: true });

  } catch (err) {
    const errStr = err instanceof Error ? err.message : ((err as { message?: string })?.message ?? JSON.stringify(err));
    console.error("handleConfirm error:", errStr);
    const errMsg = "שגיאה בביצוע: " + errStr;
    if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: errMsg });
    return json({ error: errMsg, executed: false }, 500);
  }
}

// ── handleConfirmBatch ────────────────────────────────────────────────────────
async function handleConfirmBatch(
  sc: ReturnType<typeof createClient>, uc: ReturnType<typeof createClient>,
  uid: string, cid: string | null, draftIds: string[], approved: boolean,
) {
  if (!approved) {
    await sc.from("ai_action_drafts").update({ status: "cancelled", updated_at: new Date().toISOString() }).in("id", draftIds).eq("user_id", uid);
    const msg = "ביטלתי את כל ההוצאות.";
    if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: msg });
    return json({ reply: msg, executed: false });
  }
  let success = 0, failed = 0;
  for (const draftId of draftIds) {
    const { data: dr } = await sc.from("ai_action_drafts").select("*").eq("id", draftId).eq("user_id", uid).in("status", ["draft", "failed"]).maybeSingle();
    if (!dr) continue;
    try {
      const pl = { ...(dr.payload as Record<string, unknown>) };
      if (!pl.bank_account) pl.bank_account = "school";
      if (!pl.target_grade_ids) pl.target_grade_ids = [];
      const rawCatId = pl.budget_category_id != null ? String(pl.budget_category_id) : null;
      if (!isUUID(rawCatId)) pl.budget_category_id = null;
      const { error: ie } = await sc.from("expenses").insert(pl);
      if (ie) throw ie;
      await sc.from("ai_action_drafts").update({ status: "executed", updated_at: new Date().toISOString(), executed_at: new Date().toISOString() }).eq("id", draftId);
      success++;
    } catch { failed++; }
  }
  const msg = `נרשמו ${success} הוצאות בהצלחה${failed > 0 ? ` (${failed} נכשלו)` : ""}. הדף עודכן.`;
  if (cid) await uc.from("ai_messages").insert({ conversation_id: cid, user_id: uid, role: "assistant", content: msg });
  return json({ reply: msg, executed: true, count: success });
}

// ── Serve ─────────────────────────────────────────────────────────────────────
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

    const body = await req.json() as { type?: string; message?: string; conversation_id?: string; action_draft_id?: string; draft_ids?: string[]; approved?: boolean };

    if (body.type === "confirm" && body.action_draft_id)
      return handleConfirm(sc, uc, user.id, body.conversation_id ?? null, body.action_draft_id, body.approved ?? false);
    if (body.type === "confirm_batch" && Array.isArray(body.draft_ids))
      return handleConfirmBatch(sc, uc, user.id, body.conversation_id ?? null, body.draft_ids, body.approved ?? false);
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
      cid ? uc.from("ai_messages").select("role,content").eq("conversation_id", cid).order("created_at", { ascending: true }).limit(60) : Promise.resolve({ data: [] as { role: string; content: string }[] }),
      !cid ? uc.from("ai_conversations").insert({ user_id: user.id, school_year_id: yid, title: body.message.slice(0, 50) }).select("id").single() : Promise.resolve({ data: null }),
    ]);
    if (!cid) cid = (ncR as { data: { id: string } | null }).data?.id ?? null;
    if (!cid) return json({ error: "conv failed" }, 500);

    const hist = ((histR as { data: { role: string; content: string }[] }).data ?? []).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    hist.push({ role: "user", content: body.message });

    const [_save, { reply, draft, batchDraft }] = await Promise.all([
      uc.from("ai_messages").insert({ conversation_id: cid, user_id: user.id, role: "user", content: body.message }),
      callClaude(apiKey, buildSys(ctx, srcs, year), hist, buildTools(srcs), uc, sc, user.id, cid, yid, orgId, srcs),
    ]);

    const [savedR] = await Promise.all([
      uc.from("ai_messages").insert({ conversation_id: cid, user_id: user.id, role: "assistant", content: reply, metadata: draft ? { action_draft_id: draft.id } : (batchDraft ? { batch_draft_ids: batchDraft.ids } : null) }).select("id").single(),
      uc.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid),
    ]);

    return json({ conversation_id: cid, message_id: (savedR as { data: { id: string } | null }).data?.id, reply, action_draft: draft ? { id: draft.id, action_type: draft.action_type, preview: draft.preview } : null, batch_draft: batchDraft ? { ids: batchDraft.ids, previews: batchDraft.previews, total: batchDraft.total } : null });
  } catch (err) {
    console.error("top-level:", String(err));
    return json({ error: "שגיאה." }, 500);
  }
});
