import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      toast.error("שגיאה בהתחברות עם Google");
      setGoogleLoading(false);
    }
    // on success Supabase redirects the browser — no need to do anything
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("פרטי ההתחברות שגויים");
    } else {
      window.location.href = "/dashboard";
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--hk-bg)",
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{
        background: "var(--hk-card)",
        border: "1px solid var(--hk-border)",
        borderRadius: "var(--hk-radius-lg)",
        padding: "40px 36px",
        width: "100%",
        maxWidth: "380px",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{
            width: "40px", height: "40px",
            background: "linear-gradient(145deg, #2D6644, #1A3D2B)",
            borderRadius: "11px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(26,61,43,0.3)",
          }}>
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(122,170,142,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/>
              <circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
              <circle cx="24" cy="14" r="5.5" fill="#5AA674"/>
              <circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
              <circle cx="18" cy="23" r="5.5" fill="#4A8C62"/>
              <circle cx="16.2" cy="21.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
            </svg>
          </div>
          <span style={{ fontSize: "20px", fontWeight: "600", color: "var(--hk-ink)", letterSpacing: "-0.3px" }}>הכרם</span>
        </div>

        <h1 style={{ fontSize: "18px", fontWeight: "500", color: "var(--hk-ink)", margin: "0 0 6px" }}>ברוכים הבאים</h1>
        <p style={{ fontSize: "13px", color: "var(--hk-ink-3)", margin: "0 0 24px" }}>כניסה לחשבון בית הספר שלך</p>

        {/* Google sign-in */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={googleLoading}
          style={{
            width: "100%",
            padding: "10px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: "#fff",
            border: "1px solid var(--hk-border)",
            borderRadius: "var(--hk-radius)",
            fontSize: "14px",
            fontWeight: "500",
            fontFamily: "var(--font-sans)",
            color: "var(--hk-ink)",
            cursor: googleLoading ? "not-allowed" : "pointer",
            marginBottom: "20px",
          }}
        >
          {/* Google logo */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? "מתחבר..." : "כניסה עם Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--hk-border)" }} />
          <span style={{ fontSize: "12px", color: "var(--hk-ink-3)" }}>או עם אימייל</span>
          <div style={{ flex: 1, height: "1px", background: "var(--hk-border)" }} />
        </div>

        <form onSubmit={signIn} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "var(--hk-ink-2)", display: "block", marginBottom: "6px" }}>
              כתובת אימייל
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              dir="ltr"
              style={{
                width: "100%", padding: "9px 12px",
                border: "1px solid var(--hk-border)",
                borderRadius: "var(--hk-radius)",
                fontSize: "14px", background: "var(--hk-card)",
                color: "var(--hk-ink)", outline: "none",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "var(--hk-ink-2)", display: "block", marginBottom: "6px" }}>
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
              style={{
                width: "100%", padding: "9px 12px",
                border: "1px solid var(--hk-border)",
                borderRadius: "var(--hk-radius)",
                fontSize: "14px", background: "var(--hk-card)",
                color: "var(--hk-ink)", outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "2px",
              padding: "10px 0",
              background: loading ? "#888" : "var(--hk-green-dark)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--hk-radius)",
              fontSize: "14px",
              fontWeight: "500",
              fontFamily: "var(--font-sans)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "מתחבר..." : "כניסה"}
          </button>
        </form>
      </div>
    </div>
  );
}
