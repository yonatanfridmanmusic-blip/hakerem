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

    // Use tool_use (structured output) — avoids JSON.parse failures on strings
    // containing Hebrew gershayim (") like "בע\"מ", which break raw JSON parsing.
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: "אתה עוזר חשבונאות לבית ספר ישראלי. חלץ מידע פיננסי ממסמכים.",
      tools: [
        {
          name: "extract_receipt",
          description: "חילוץ פרטים פיננסיים מקבלה או חשבונית",
          input_schema: {
            type: "object" as const,
            properties: {
              amount:         { type: "number",  description: "סכום כולל לתשלום כמספר (ללא סימן מטבע). null אם לא קיים." },
              supplier:       { type: "string",  description: "שם הספק / בית העסק / החברה. null אם לא קיים." },
              date:           { type: "string",  description: "תאריך המסמך בפורמט YYYY-MM-DD. null אם לא קיים." },
              description:    { type: "string",  description: "תיאור קצר של מה נרכש בעברית. null אם לא קיים." },
              invoice_number: { type: "string",  description: "מספר חשבונית/קבלה. null אם לא קיים." },
            },
            required: [],
          },
        },
      ],
      tool_choice: { type: "tool", name: "extract_receipt" },
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: "חלץ את הפרטים הפיננסיים מהמסמך." },
          ],
        },
      ],
    });

    // tool_use block contains an already-parsed object — no JSON.parse needed
    const toolBlock = message.content.find((b) => b.type === "tool_use");
    // deno-lint-ignore no-explicit-any
    const data: Record<string, unknown> = (toolBlock as any)?.input ?? {};
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
