// parse-kesafim-report — פענוח דוח 0637 "סטטוס גביה לשיכבה" מתוכנת כספים 2000.
// תבנית: parse-receipt (Anthropic SDK, קלט { file_base64, file_media_type }, tool_use).
// ולידציה אריתמטית בצד הפונקציה — לא סומכים על המודל:
//   שורה:  |charged − paid − balance| ≤ 0.01  → valid
//   עמוד:  |Σשורות − סה"כ| ≤ 0.05 לכל עמודה  → totals_valid
// ולידציה נכשלת → ניסיון פענוח אחד נוסף (מודל חזק יותר); עדיין נכשל → מוחזר עם דגלי false.
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ParsedRow { name_raw: string; charged: number; paid: number; balance: number; pct: number | null }
interface ParsedGrade { grade_label: string; rows: ParsedRow[]; total: ParsedRow | null }
interface ParsedReport {
  report: {
    school_name: string | null; school_id: string | null; report_date: string | null;
    fiscal_year: string | null; report_number: string | null;
  };
  grades: ParsedGrade[];
}

const EXTRACT_TOOL = {
  name: "extract_kesafim_report",
  description: "חילוץ מלא של דוח סטטוס גביה לשיכבה (דוח 0637) מתוכנת כספים 2000",
  input_schema: {
    type: "object" as const,
    properties: {
      report: {
        type: "object",
        properties: {
          school_name:   { type: "string", description: "שם בית הספר כפי שמופיע בכותרת. null אם לא קיים." },
          school_id:     { type: "string", description: "מספר בית הספר (מזהה המוסד ליד השם). null אם לא קיים." },
          report_date:   { type: "string", description: "תאריך הדוח בפורמט YYYY-MM-DD. null אם לא קיים." },
          fiscal_year:   { type: "string", description: "שנת הכספים. null אם לא קיימת." },
          report_number: { type: "string", description: "מספר הדוח (למשל 0637). null אם לא קיים." },
        },
        required: [],
      },
      grades: {
        type: "array",
        description: "עמוד לכל שכבה, בסדר הופעתם בדוח.",
        items: {
          type: "object",
          properties: {
            grade_label: { type: "string", description: "תווית השכבה בדיוק כפי שמופיעה בכותרת העמוד (למשל: שכבה א)." },
            rows: {
              type: "array",
              description: "כל שורות הסעיפים בעמוד, בסדר הופעתן, ללא שורת הסה\"כ.",
              items: {
                type: "object",
                properties: {
                  name_raw: { type: "string", description: "שם הסעיף בדיוק כפי שמופיע בדוח, כולל תחיליות כמו ** או 'הכ'. בלי נרמול." },
                  charged:  { type: "number", description: "עמודת חובה. מספר, כולל אגורות. שלילי נשמר שלילי." },
                  paid:     { type: "number", description: "עמודת זכות. מספר, כולל אגורות. שלילי נשמר שלילי." },
                  balance:  { type: "number", description: "עמודת יתרה לגביה. מספר. שלילי נשמר שלילי." },
                  pct:      { type: "number", description: "עמודת אחוז גביה כמספר (גם מעל 100). null אם ריק." },
                },
                required: ["name_raw", "charged", "paid", "balance"],
              },
            },
            total: {
              type: "object",
              description: "שורת הסה\"כ של העמוד.",
              properties: {
                charged: { type: "number" }, paid: { type: "number" },
                balance: { type: "number" }, pct: { type: "number" },
              },
              required: ["charged", "paid", "balance"],
            },
          },
          required: ["grade_label", "rows", "total"],
        },
      },
    },
    required: ["report", "grades"],
  },
};

const SYSTEM_PROMPT =
  "אתה מפענח דוחות כספיים של בתי ספר ישראליים מתוכנת 'כספים 2000'. " +
  "המסמך הוא דוח 'סטטוס גביה לשיכבה' — עמוד לכל שכבה, טבלה עם עמודות חובה/זכות/יתרה לגביה/אחוז גביה ושורת סה\"כ. " +
  "העתק כל מספר בדיוק כפי שהוא, כולל אגורות וסכומים שליליים (מינוס נשמר). " +
  "העתק שמות סעיפים בדיוק כפי שהם, בלי לתקן שגיאות ובלי להשמיט תחיליות. " +
  "אל תחשב ואל תתקן כלום — רק העתק את מה שכתוב.";

async function extractOnce(anthropic: Anthropic, model: string, fileBase64: string): Promise<ParsedReport> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_kesafim_report" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
          { type: "text", text: "חלץ את הדוח במלואו: המטא-נתונים, וכל שורה בכל שכבה, כולל שורות הסה\"כ." },
        ],
      },
    ],
  });
  const toolBlock = message.content.find((b) => b.type === "tool_use");
  // deno-lint-ignore no-explicit-any
  return ((toolBlock as any)?.input ?? { report: {}, grades: [] }) as ParsedReport;
}

// ─── ולידציה אריתמטית (צד פונקציה) ────────────────────────────────────────────

const ROW_TOL = 0.01;
const PAGE_TOL = 0.05;

interface ValidatedGrade {
  grade_label: string;
  rows: (ParsedRow & { valid: boolean })[];
  total: ParsedRow | null;
  totals_valid: boolean;
}

function validate(parsed: ParsedReport): { grades: ValidatedGrade[]; allValid: boolean } {
  let allValid = true;
  const grades: ValidatedGrade[] = (parsed.grades ?? []).map((g) => {
    const rows = (g.rows ?? []).map((r) => {
      const valid = Math.abs((r.charged ?? NaN) - (r.paid ?? NaN) - (r.balance ?? NaN)) <= ROW_TOL;
      if (!valid) allValid = false;
      return { ...r, valid };
    });
    let totals_valid = false;
    if (g.total && rows.length > 0) {
      const sum = (k: "charged" | "paid" | "balance") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
      totals_valid =
        Math.abs(sum("charged") - g.total.charged) <= PAGE_TOL &&
        Math.abs(sum("paid") - g.total.paid) <= PAGE_TOL &&
        Math.abs(sum("balance") - g.total.balance) <= PAGE_TOL;
    }
    if (!totals_valid) allValid = false;
    return { grade_label: g.grade_label, rows, total: g.total ?? null, totals_valid };
  });
  if (grades.length === 0) allValid = false;
  return { grades, allValid };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  console.log(`[parse-kesafim-report] ${req.method} from ${req.headers.get("origin") ?? "unknown"}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("CLAUDE_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Missing CLAUDE_API_KEY secret — set it in Supabase Edge Function secrets");

    let parsedBody: { file_base64?: string; file_media_type?: string };
    try {
      parsedBody = JSON.parse(await req.text());
    } catch (e) {
      throw new Error(`Invalid JSON body: ${e}`);
    }

    const { file_base64, file_media_type } = parsedBody;
    if (!file_base64) throw new Error("Missing file_base64");
    const mediaType = file_media_type && file_media_type.length > 0 ? file_media_type : "application/pdf";
    if (mediaType !== "application/pdf") {
      throw new Error(`Unsupported media type: ${mediaType} — דוח כספים 2000 נתמך כ-PDF בלבד`);
    }
    console.log(`[parse-kesafim-report] base64 length: ${file_base64.length}`);

    const anthropic = new Anthropic({ apiKey });

    // ניסיון 1 — haiku (מהיר/זול); ולידציה נכשלת → ניסיון 2 עם sonnet (חזק יותר).
    let attempts = 1;
    let parsed = await extractOnce(anthropic, "claude-haiku-4-5-20251001", file_base64);
    let result = validate(parsed);
    if (!result.allValid) {
      console.log("[parse-kesafim-report] validation failed on attempt 1 — retrying with sonnet");
      attempts = 2;
      parsed = await extractOnce(anthropic, "claude-sonnet-5", file_base64);
      result = validate(parsed);
    }
    console.log(`[parse-kesafim-report] attempts=${attempts}, all_valid=${result.allValid}, grades=${result.grades.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          report: parsed.report ?? {},
          grades: result.grades,
          validation: { attempts, all_valid: result.allValid },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[parse-kesafim-report] error:", String(err));
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
