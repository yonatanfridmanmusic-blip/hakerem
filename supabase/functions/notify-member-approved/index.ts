/**
 * notify-member-approved
 * Called from the frontend after an owner approves a pending membership.
 * Sends an approval email to the new team member via Resend.
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY   — your Resend API key (https://resend.com)
 *   SUPABASE_URL     — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function unauth() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Verify caller is an authenticated Supabase user (must be org owner) ──
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
    const { member_id, organization_id } = await req.json() as {
      member_id: string;
      organization_id: string;
    };

    if (!member_id || !organization_id) {
      return new Response(JSON.stringify({ error: "member_id and organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the caller is the org owner
    const { data: callerMem } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!callerMem || !["owner", "admin"].includes(callerMem.role)) {
      return new Response(JSON.stringify({ error: "Only org owner/admin can trigger this" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();

    // Get the approved member's profile
    const { data: member } = await supabase
      .from("organization_members")
      .select("user_id, role, profiles(email, full_name)")
      .eq("id", member_id)
      .maybeSingle();

    const memberEmail = (member?.profiles as { email: string | null; full_name: string | null } | null)?.email;
    const memberName  = (member?.profiles as { email: string | null; full_name: string | null } | null)?.full_name;

    if (!memberEmail) {
      console.warn("Could not find member email for member", member_id);
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

    const displayName = memberName || memberEmail;
    const orgName = org?.name ?? "בית הספר";
    const greeting = memberName ? `שלום ${memberName},` : "שלום,";
    const roleLabel = member?.role === "admin" ? "מנהל/ת" : "צופה";

    const emailBody = `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1A1A1A;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 28px;">🏫</span>
    <strong style="font-size: 18px; margin-right: 10px; color: #1A3D2B;">הכרם</strong>
  </div>

  <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">${greeting}</h2>
  <p style="font-size: 15px; line-height: 1.7; color: #3A3A3A; margin: 0 0 20px;">
    בקשת ההצטרפות שלך לארגון <strong>${orgName}</strong> אושרה! 🎉<br/>
    הנך מצורף/ת לצוות כ<strong>${roleLabel}</strong>.
  </p>

  <a href="https://hakerem.app/dashboard"
     style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #2D6644, #1A3D2B);
            color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
    כניסה למערכת הכרם
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
        to: [memberEmail],
        subject: `ברוך/ה הבא/ה לצוות ${orgName}! הבקשה שלך אושרה`,
        html: emailBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ ok: true, email_error: err }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("notify-member-approved error:", err);
    return new Response(JSON.stringify({ ok: true, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
