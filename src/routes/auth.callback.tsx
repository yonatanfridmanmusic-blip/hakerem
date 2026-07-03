import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  useEffect(() => {
    // Supabase v2 with detectSessionInUrl (default: true) automatically
    // exchanges the PKCE code on client init. We just wait for SIGNED_IN.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        window.location.href = "/dashboard";
      }
    });

    // Fallback: maybe already signed in by the time we get here
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.href = "/dashboard";
      }
    });

    // Safety timeout — if nothing happens in 5s, bail to /auth
    const timeout = setTimeout(() => {
      window.location.href = "/auth";
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
