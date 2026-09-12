// ─── parse-receipt-v2 — מנוע פענוח קבלות רב-מסמכי (2.3.0) ─────────────────────
//
// צורת parse-kesafim-report (חילוץ → ולידציה → ניסיון חוזר), עם סטייה
// מאושרת מהתבנית (יונתן, 14.9): ניסיון 1 הוא sonnet ולא haiku — בקבלות
// אין אמת-קרקע אריתמטית לשם הספק, ולכן haiku שמחזיר שם משובש-אבל-מלא
// עובר ולידציה והשגיאה עומדת. במעבדת האמת haiku שיבש שמות עבריים
// ("סטטוורטק" במקום גסטטנרטק); sonnet קרא מדויק. ניסיון 2 (בכשל
// ולידציה): sonnet נוסף. מסמכים שעדיין חשודים מסומנים needs_review עם
// issues. לעולם לא success שקט על ערך חשוד.
//
// תשובה: { success, documents: [{amount, supplier, date, description,
//          invoice_number, suggested_category, pages, confidence, issues}],
//          validation: {attempts, all_valid} }
//
// הפונקציה הישנה parse-receipt נשארת ללא שינוי לצידה עד החלפת הפרונט.

import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ParsedDoc {
  amount?: number | null;
  supplier?: string | null;
  date?: string | null;
  description?: string | null;
  invoice_number?: string | null;
  suggested_category?: string | null;
  pages?: number[] | null;
}

interface OutDoc extends ParsedDoc {
  confidence: "ok" | "needs_review";
  issues: string[];
}

// ── טווח תאריכים סביר: 1.7 של שנת פתיחת שנה"ל עד 31.8 של השנה העוקבת ─────────
function schoolYearRange(): { min: string; max: string } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const startYear = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return { min: `${startYear}-07-01`, max: `${startYear + 1}-08-31` };
}

function validateDocs(docs: ParsedDoc[]): { out: OutDoc[]; allValid: boolean } {
  const { min, max } = schoolYearRange();
  const out: OutDoc[] = docs.map((d) => {
    const issues: string[] = [];
    if (d.amount == null || !(Number(d.amount) > 0)) issues.push("amount_missing_or_not_positive");
    if (!d.supplier || String(d.supplier).trim() === "") issues.push("supplier_empty");
    if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) issues.push("date_missing_or_malformed");
    else if (String(d.date) < min || String(d.date) > max) issues.push("date_out_of_school_year_range");
    return { ...d, confidence: issues.length === 0 ? "ok" : "needs_review", issues };
  });
  // ריבוי מסמכים: סכומים זהים = חשד לפיצול שגוי של אותו מסמך
  if (out.length > 1) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = Number(out[i].amount), b = Number(out[j].amount);
        if (a > 0 && b > 0 && Math.abs(a - b) < 0.005) {
          if (!out[j].issues.includes("duplicate_amount_suspected_bad_split")) {
            out[j].issues.push("duplicate_amount_suspected_bad_split");
            out[j].confidence = "needs_review";
          }
        }
      }
    }
  }
  if (out.length === 0) return { out, allValid: false };
  return { out, allValid: out.every((d) => d.confidence === "ok") };
}

// ── קריאת חילוץ אחת מול מודל נתון ────────────────────────────────────────────
async function extractOnce(
  anthropic: Anthropic,
  model: string,
  contentBlock: unknown,
  categoryNames: string[],
): Promise<ParsedDoc[]> {
  const catRule = categoryNames.length
    ? `suggested_category: שם הקטגוריה המתאימה ביותר מהרשימה הבאה בלבד, בשם המדויק כפי שמופיע: ${categoryNames.join(", ")}. null אם אין התאמה טובה.`
    : "suggested_category: תמיד null — אין קטגוריות זמינות.";

  const message = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system: `אתה עוזר חשבונאות לבית ספר ישראלי. אתה מקבל קובץ סרוק שעשוי להכיל מסמך פיננסי אחד או כמה מסמכים שונים (חשבוניות, קבלות, חשבוניות מס), ומחלץ רשומה נפרדת לכל מסמך.

כללי זיהוי מסמכים — קריטי:
- מסמך = חשבונית/קבלה שלמה אחת. קובץ יכול להכיל כמה מסמכים מספקים שונים — החזר רשומה לכל אחד, עם מספרי העמודים שלו (pages, החל מ-1).
- חשבונית ריכוז/מרכזת (המאגדת כמה תעודות משלוח או שורות חיוב) היא מסמך אחד ויחיד — הסכום שלה הוא "סה"כ לתשלום" הכולל, לעולם לא תעודת משלוח פנימית או שורת ביניים. אם תעודות המשלוח שלה מודפסות בעמודים נוספים — כל העמודים האלה שייכים לאותו מסמך וכלולים ב-pages שלו.
- תעודת משלוח שמופיעה כחלק מחשבונית ריכוז אינה מסמך נפרד.
- המסמך עשוי להיות סרוק מסובב ב-90/180 מעלות או הפוך — קרא אותו בכל כיוון.

כללי שדות — קריטי:
- amount: תמיד "סה"כ לתשלום" (או "סה"כ כולל מע"מ") של המסמך כולו. לא שורה פנימית, לא סכום ביניים, לא תעודת משלוח.
- date: התאריך הנכון הוא השדה "תאריך מסמך" או "תאריך ערך" של המסמך — הוא בלבד. לעולם לא "לתשלום עד", לא תאריך פירעון, לא מועד אחרון לתשלום, לא "מועד הדפסה"/"הודפס בתאריך" (תאריך הדפסה שמודפס בדרך כלל בתחתית הדף), ולא תאריכים של תעודות משלוח פנימיות בתוך חשבונית ריכוז. תאריכים במסמכים ישראליים כתובים יום/חודש/שנה (DD/MM/YY או DD/MM/YYYY) — למשל 3/09/26 הוא 3 בספטמבר 2026. שנה דו-ספרתית פירושה 20YY (26 = 2026; לעולם לא 2003 ולא 1926).
- supplier: שם העסק **שהוציא** את המסמך (המוכר/נותן השירות) — מהכותרת הרשמית, הלוגו או פרטי העוסק המורשה. לעולם לא הלקוח המחויב: שם שמופיע אחרי "לכבוד" או כנמען (למשל בית ספר או גן) הוא הלקוח, לא הספק. העתק את שם הספק במדויק, אות-באות, כפי שמודפס — אל תנחש ואל תשלים אותיות. התעלם לחלוטין מפרסומות, סלוגנים, כתובות אתרים ומלל שיווקי המודפסים על הדף.
- description: תיאור קצר בעברית של מה שנרכש בפועל, מתוך שורות החיוב בלבד — לא מתוך פרסומות, לא מתוך כותרות גרפיות. אם השורה היא שכירות/מנוי/שירות חודשי — כתוב זאת.
- ${catRule}`,
    tools: [
      {
        name: "extract_documents",
        description: "חילוץ רשומה נפרדת לכל מסמך פיננסי בקובץ",
        input_schema: {
          type: "object" as const,
          required: ["documents"],
          properties: {
            documents: {
              type: "array",
              description: "רשומה לכל מסמך פיננסי שזוהה בקובץ, לפי סדר הופעתם",
              items: {
                type: "object",
                properties: {
                  amount:             { type: "number", description: "סה\"כ לתשלום של המסמך. null אם לא קיים." },
                  supplier:           { type: "string", description: "שם הספק מהכותרת הרשמית. null אם לא קיים." },
                  date:               { type: "string", description: "תאריך המסמך/תאריך ערך YYYY-MM-DD (לא 'לתשלום עד', לא מועד הדפסה; DD/MM/YY ישראלי, YY=20YY). null אם לא קיים." },
                  description:        { type: "string", description: "תיאור קצר בעברית של הרכישה. null אם לא קיים." },
                  invoice_number:     { type: "string", description: "מספר חשבונית/קבלה. null אם לא קיים." },
                  suggested_category: { type: "string", description: "קטגוריה מהרשימה או null." },
                  pages:              { type: "array", items: { type: "number" }, description: "מספרי העמודים של המסמך בקובץ (מ-1)." },
                },
                required: [],
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_documents" },
    messages: [
      {
        role: "user",
        content: [
          // deno-lint-ignore no-explicit-any
          contentBlock as any,
          { type: "text", text: "חלץ רשומה נפרדת לכל מסמך פיננסי בקובץ, לפי הכללים." },
        ],
      },
    ],
  });

  const toolBlock = message.content.find((b) => b.type === "tool_use");
  // deno-lint-ignore no-explicit-any
  const input = (toolBlock as any)?.input ?? {};
  const docs = Array.isArray(input.documents) ? (input.documents as ParsedDoc[]) : [];
  return docs.slice(0, 20);
}

Deno.serve(async (req: Request) => {
  console.log(`[parse-receipt-v2] ${req.method} from ${req.headers.get("origin") ?? "unknown"}`);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("CLAUDE_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Missing CLAUDE_API_KEY secret");

    const body = await req.json() as { file_base64?: string; file_media_type?: string; category_names?: string[] };
    const { file_base64 } = body;
    if (!file_base64) throw new Error("Missing file_base64");
    const mediaType = body.file_media_type?.length ? body.file_media_type : "application/pdf";
    const categoryNames = Array.isArray(body.category_names) ? body.category_names : [];

    const isPdf = mediaType === "application/pdf";
    const isImage = mediaType.startsWith("image/");
    if (!isPdf && !isImage) throw new Error(`Unsupported media type: ${mediaType}`);

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: file_base64 } };

    const anthropic = new Anthropic({ apiKey });

    // ניסיון 1 — sonnet (סטייה מאושרת מתבנית haiku-קודם: ראו הערת הכותרת);
    // ולידציה נכשלת → ניסיון 2 — sonnet נוסף (דגימה טרייה).
    let attempts = 1;
    let docs = await extractOnce(anthropic, "claude-sonnet-5", contentBlock, categoryNames);
    let result = validateDocs(docs);
    if (!result.allValid) {
      console.log("[parse-receipt-v2] validation failed on attempt 1 — retrying with sonnet (fresh sample)");
      attempts = 2;
      docs = await extractOnce(anthropic, "claude-sonnet-5", contentBlock, categoryNames);
      result = validateDocs(docs);
    }

    console.log(`[parse-receipt-v2] attempts=${attempts} all_valid=${result.allValid} docs=${result.out.length}`);
    return new Response(
      JSON.stringify({
        success: true,
        documents: result.out,
        validation: { attempts, all_valid: result.allValid },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[parse-receipt-v2] error:", String(err));
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
