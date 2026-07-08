import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const { file_base64, file_media_type } = (await req.json()) as {
      file_base64: string;
      file_media_type: string;
    };

    if (!file_base64 || !file_media_type) {
      throw new Error("Missing file_base64 or file_media_type");
    }

    const isPdf = file_media_type === "application/pdf";
    const isImage = file_media_type.startsWith("image/");
    if (!isPdf && !isImage) {
      throw new Error(`Unsupported media type: ${file_media_type}`);
    }

    const anthropic = new Anthropic({ apiKey });

    // Build the content block (document for PDF, image for raster)
    // deno-lint-ignore no-explicit-any
    const contentBlock: any = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: file_base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: file_media_type as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
            data: file_base64,
          },
        };

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system:
        "אתה עוזר חשבונאות לבית ספר ישראלי. תפקידך לחלץ מידע ממסמכים פיננסיים (קבלות, חשבוניות). החזר JSON בלבד ללא שום הסבר נוסף.",
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `חלץ מהמסמך הבא את הפרטים הפיננסיים והחזר JSON בלבד:
{
  "amount": <סכום כולל לתשלום כמספר עשרוני - ללא סימן מטבע>,
  "supplier": "<שם הספק / בית העסק / החברה>",
  "date": "<תאריך המסמך בפורמט YYYY-MM-DD>",
  "description": "<תיאור קצר של מה נרכש בעברית>",
  "invoice_number": "<מספר חשבונית/קבלה אם קיים>"
}
שדות שאינם קיימים במסמך — החזר null. החזר JSON בלבד, ללא שום טקסט נוסף.`,
            },
          ],
        },
      ],
    });

    const raw =
      message.content[0].type === "text"
        ? message.content[0].text.trim()
        : "{}";

    // Extract JSON even if model adds surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-receipt error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
