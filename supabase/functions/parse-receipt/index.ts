import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  console.log(`[parse-receipt] ${req.method} from ${req.headers.get("origin") ?? "unknown"}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use CLAUDE_API_KEY — same secret used by ai-agent
    const apiKey = Deno.env.get("CLAUDE_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");
    console.log(`[parse-receipt] apiKey present: ${!!apiKey}`);
    if (!apiKey) throw new Error("Missing CLAUDE_API_KEY secret — set it in Supabase Edge Function secrets");

    let bodyText: string;
    try {
      bodyText = await req.text();
    } catch (e) {
      throw new Error(`Failed to read request body: ${e}`);
    }
    console.log(`[parse-receipt] body length: ${bodyText.length}`);

    let parsed: { file_base64?: string; file_media_type?: string };
    try {
      parsed = JSON.parse(bodyText);
    } catch (e) {
      throw new Error(`Invalid JSON body: ${e}`);
    }

    const { file_base64, file_media_type } = parsed;

    if (!file_base64) throw new Error("Missing file_base64");
    // Default to PDF if browser doesn't set MIME type
    const mediaType = (file_media_type && file_media_type.length > 0) ? file_media_type : "application/pdf";
    console.log(`[parse-receipt] mediaType: ${mediaType}, base64 length: ${file_base64.length}`);

    const isPdf = mediaType === "application/pdf";
    const isImage = mediaType.startsWith("image/");
    if (!isPdf && !isImage) {
      throw new Error(`Unsupported media type: ${mediaType}`);
    }

    const anthropic = new Anthropic({ apiKey });

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
            media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: file_base64,
          },
        };

    console.log(`[parse-receipt] calling Claude (${isPdf ? "PDF" : "image"} document)...`);

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:
        "אתה עוזר חשבונאות לבית ספר ישראלי. תפקידך לחלץ מידע ממסמכים פיננסיים (קבלות, חשבוניות). החזר JSON בלבד ללא שום הסבר נוסף.",
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `חלץ מהמסמך הבא את הפרטים הפיננסיים והחזר JSON בלבד:\n{\n  "amount": <סכום כולל לתשלום כמספר עשרוני - ללא סימן מטבע>,\n  "supplier": "<שם הספק / בית העסק / החברה>",\n  "date": "<תאריך המסמך בפורמט YYYY-MM-DD>",\n  "description": "<תיאור קצר של מה נרכש בעברית>",\n  "invoice_number": "<מספר חשבונית/קבלה אם קיים>"\n}\nשדות שאינם קיימים במסמך — החזר null. החזר JSON בלבד, ללא שום טקסט נוסף.`,
            },
          ],
        },
      ],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
    console.log(`[parse-receipt] Claude raw response: ${raw.slice(0, 200)}`);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    console.log(`[parse-receipt] parsed data: ${JSON.stringify(data)}`);

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[parse-receipt] error:", String(err));
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
