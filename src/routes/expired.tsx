import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/expired")({
  ssr: false,
  component: ExpiredPage,
});

const f = "Rubik, sans-serif";
const INK  = "#1A1A1A";
const INK2 = "#6B6560";
const INK3 = "#AAA099";
const GREEN = "#2D6644";
const DARK  = "#1A3D2B";
const BORDER = "#E8E2D9";

function IconLock() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="3"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M7 12.5l3.5 3.5 6.5-7"/>
    </svg>
  );
}

function LogoMark() {
  return (
    <div style={{
      width: "36px", height: "36px",
      background: `linear-gradient(145deg, ${GREEN}, ${DARK})`,
      borderRadius: "10px",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 10px rgba(26,61,43,0.28)", flexShrink: 0,
    }}>
      <svg width="20" height="20" viewBox="0 0 36 36" fill="none">
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
  );
}

function ExpiredPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("redeem_license_code", {
      p_code: code.trim(),
    });

    setLoading(false);

    if (rpcError) { setError("אירעה שגיאה, נסה שוב"); return; }

    const result = data as { success: boolean; error?: string };
    if (!result.success) { setError(result.error ?? "קוד לא תקין"); return; }

    setSuccess(true);
    setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1800);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div dir="rtl" style={{
      minHeight: "100vh",
      background: "linear-gradient(150deg, #0F1A13 0%, #1A3D2B 60%, #0F1A13 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: f, padding: "24px",
    }}>
      <div style={{
        background: "#fff", borderRadius: "20px",
        padding: "44px 40px", width: "100%", maxWidth: "400px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px" }}>
          <LogoMark />
          <span style={{ fontSize: "17px", fontWeight: "500", color: INK, letterSpacing: "-0.2px" }}>הכרם</span>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{
              width: "60px", height: "60px", borderRadius: "50%",
              background: "#EDFBF3", border: "1.5px solid #B6E8C4",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 18px",
            }}>
              <IconCheckCircle />
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: "500", color: INK }}>
              הרישיון הופעל בהצלחה
            </h2>
            <p style={{ color: INK3, fontSize: "13.5px", margin: 0 }}>מעבירים אותך למערכת…</p>
          </div>
        ) : (
          <>
            {/* Lock icon */}
            <div style={{
              width: "56px", height: "56px", borderRadius: "14px",
              background: "#FEF2F2", border: "1.5px solid #FECACA",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "20px",
            }}>
              <IconLock />
            </div>

            <h1 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "400", color: INK, letterSpacing: "-0.3px" }}>
              תקופת הניסיון הסתיימה
            </h1>
            <p style={{ color: INK2, fontSize: "13.5px", margin: "0 0 28px", lineHeight: 1.65 }}>
              כדי להמשיך להשתמש בהכרם, הכנס/י את קוד ההפעלה שקיבלת מצוות הכרם.
            </p>

            <form onSubmit={handleRedeem}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: INK2, marginBottom: "7px" }}>
                קוד הפעלה
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                placeholder="לדוגמה: A1B2-C3D4"
                dir="ltr"
                style={{
                  width: "100%", padding: "11px 14px",
                  fontSize: "16px", fontFamily: "monospace",
                  letterSpacing: "0.12em",
                  border: `1.5px solid ${error ? "#EF4444" : BORDER}`,
                  borderRadius: "10px", outline: "none",
                  boxSizing: "border-box", textAlign: "center",
                  marginBottom: "6px", transition: "border-color 0.15s",
                  color: INK,
                }}
              />
              {error && (
                <div style={{ fontSize: "12.5px", color: "#EF4444", marginBottom: "12px" }}>
                  {error}
                </div>
              )}
              {!error && <div style={{ height: "12px" }} />}

              <button
                type="submit"
                disabled={loading || !code.trim()}
                style={{
                  width: "100%", padding: "12px 0",
                  fontSize: "14.5px", fontWeight: "500",
                  fontFamily: f,
                  background: loading || !code.trim()
                    ? "#F5F0EA"
                    : `linear-gradient(135deg, ${GREEN}, ${DARK})`,
                  color: loading || !code.trim() ? INK3 : "#fff",
                  border: "none", borderRadius: "10px",
                  cursor: loading || !code.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  boxShadow: !loading && code.trim() ? "0 4px 16px rgba(26,61,43,0.28)" : "none",
                }}
              >
                {loading ? "מאמת..." : "הפעל רישיון"}
              </button>
            </form>

            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: "12.5px", color: INK3, margin: "0 0 10px", textAlign: "center" }}>
                אין לך קוד? פנה אל{" "}
                <a href="mailto:yonatanfridmanmusic@gmail.com"
                  style={{ color: GREEN, textDecoration: "none", fontWeight: "500" }}>
                  יונתן פרידמן
                </a>
              </p>
              <div style={{ textAlign: "center" }}>
                <button type="button" onClick={handleSignOut} style={{
                  background: "none", border: "none",
                  color: INK3, fontSize: "12.5px",
                  cursor: "pointer", padding: "4px 8px",
                  borderRadius: "6px", fontFamily: f,
                  transition: "color 0.12s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = INK2)}
                  onMouseLeave={e => (e.currentTarget.style.color = INK3)}
                >
                  התנתק
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
