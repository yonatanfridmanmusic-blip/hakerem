import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback" as string)({
  ssr: false, // Must run client-side — PKCE verifier lives in localStorage
  component: AuthCallback,
});

function AuthCallback() {
  useEffect(() => {
    async function handleCallback() {
      // PKCE flow: Supabase sends ?code=xxx
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth/callback] exchange error:", error.message);
          window.location.href = "/auth";
        } else {
          window.location.href = "/dashboard";
        }
        return;
      }

      // Implicit / hash flow fallback
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.href = "/dashboard";
        return;
      }

      // Nothing — bail
      window.location.href = "/auth";
    }

    handleCallback();
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#FAFAF7", fontFamily: "'Rubik', sans-serif", direction: "rtl",
    }}>
      <div style={{ textAlign: "center", color: "#6B6560", fontSize: "14px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "50%",
          border: "2px solid #E8E2D9", borderTopColor: "#2D6644",
          animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        מתחבר...
      </div>
    </div>
  );
}
