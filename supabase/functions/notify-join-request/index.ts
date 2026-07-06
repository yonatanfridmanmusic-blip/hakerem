/**
 * notify-join-request
 * Called from useRequestJoinOrg after a pending membership is inserted.
 * Looks up the org owner's email and sends a notification via Resend.
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY   — your Resend API key (https://resend.com)
 *   SUPABASE_URL     — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://hakerem.app", "https://hakerem.vercel.app", "http://localhost:5173", "http://localhost:3000"];
let corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://hakerem.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function unauth() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Verify caller is an authenticated Supabase user ──────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return unauth();

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return unauth();
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const { organization_id, requester_name, requester_email } = await req.json() as {
      organization_id: string;
      requester_name: string | null;
      requester_email: string | null;
    };

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to bypass RLS and look up org owner
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();

    // Get org owner's email from profiles
    const { data: ownerMem } = await supabase
      .from("organization_members")
      .select("user_id, profiles(email, full_name)")
      .eq("organization_id", organization_id)
      .eq("role", "owner")
      .eq("status", "active")
      .maybeSingle();

    const ownerEmail = (ownerMem?.profiles as { email: string | null; full_name: string | null } | null)?.email;
    const ownerName  = (ownerMem?.profiles as { email: string | null; full_name: string | null } | null)?.full_name;

    if (!ownerEmail) {
      // No owner email found — log and return gracefully (don't fail the join request)
      console.warn("Could not find owner email for org", organization_id);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not set — skipping email");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayName = requester_name || requester_email || "משתמש חדש";
    const orgName = org?.name ?? "בית הספר שלך";
    const greeting = ownerName ? `שלום ${ownerName},` : "שלום,";

    const emailBody = `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1A1A1A;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 28px;">🏫</span>
    <strong style="font-size: 18px; margin-right: 10px; color: #1A3D2B;">הכרם</strong>
  </div>

  <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">${greeting}</h2>
  <p style="font-size: 15px; line-height: 1.7; color: #3A3A3A; margin: 0 0 20px;">
    <strong>${displayName}</strong> מבקש/ת להצטרף לארגון <strong>${orgName}</strong> במערכת הכרם.
  </p>

  <a href="https://hakerem.app/settings"
     style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #2D6644, #1A3D2B);
            color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
    אשר/י את הבקשה בהגדרות
  </a>

  <p style="font-size: 13px; color: #888; margin-top: 32px; border-top: 1px solid #EEE; padding-top: 16px;">
    הודעה זו נשלחה אוטומטית ממערכת הכרם.<br/>
    לתמיכה: <a href="mailto:yonatanfridmanmusic@gmail.com" style="color: #2D6644;">yonatanfridmanmusic@gmail.com</a>
  </p>
</div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "הכרם <noreply@hakerem.app>",
        to: [ownerEmail],
        subject: `בקשת הצטרפות חדשה — ${displayName} רוצה להצטרף ל-${orgName}`,
        html: emailBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      // Don't fail the user-facing flow — email is best-effort
      return new Response(JSON.stringify({ ok: true, email_error: err }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("notify-join-request error:", err);
    return new Response(JSON.stringify({ ok: true, error: String(err) }), {
      // Return 200 even on error — this is best-effort, don't block the join flow
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
