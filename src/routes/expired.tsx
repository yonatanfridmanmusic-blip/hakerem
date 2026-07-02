import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/expired")({
  ssr: false,
  component: ExpiredPage,
});

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

    if (rpcError) {
      setError("אירעה שגיאה, נסה שוב");
      return;
    }

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      setError(result.error ?? "קוד לא תקין");
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1800);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0F1A13 0%, #1A3D2B 50%, #0F1A13 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Rubik, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          padding: "48px 44px",
          width: "100%",
          maxWidth: "420px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "#FEF2F2",
            border: "2px solid #FCA5A5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "28px",
          }}
        >
          🔒
        </div>

        {success ? (
          <>
            <div style={{ fontSize: "28px", marginBottom: "12px" }}>✅</div>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#166534" }}>
              הרישיון הופעל בהצלחה!
            </h2>
            <p style={{ color: "#6B7280", fontSize: "14px", margin: 0 }}>מעביר אותך לאפליקציה…</p>
          </>
        ) : (
          <>
            <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700, color: "#111" }}>
              תקופת הניסיון הסתיימה
            </h1>
            <p style={{ color: "#6B7280", fontSize: "14px", margin: "0 0 28px", lineHeight: 1.6 }}>
              כדי להמשיך להשתמש בהכרם, הכנס את קוד ההפעלה שקיבלת מיונתן.
            </p>

            <form onSubmit={handleRedeem} style={{ textAlign: "right" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "6px",
                }}
              >
                קוד הפעלה
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="לדוגמה: A1B2-C3D4"
                dir="ltr"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  fontSize: "16px",
                  fontFamily: "monospace",
                  letterSpacing: "0.1em",
                  border: error ? "1.5px solid #EF4444" : "1.5px solid #D1D5DB",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                  textAlign: "center",
                  marginBottom: error ? "6px" : "16px",
                }}
              />
              {error && (
                <div
                  style={{
                    fontSize: "12.5px",
                    color: "#EF4444",
                    marginBottom: "12px",
                    textAlign: "right",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !code.trim()}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "15px",
                  fontWeight: 600,
                  fontFamily: "Rubik, sans-serif",
                  background:
                    loading || !code.trim()
                      ? "#D1D5DB"
                      : "linear-gradient(135deg, #2D6644, #1A3D2B)",
                  color: loading || !code.trim() ? "#9CA3AF" : "#fff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: loading || !code.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {loading ? "מאמת…" : "הפעל רישיון"}
              </button>
            </form>

            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #F3F4F6" }}>
              <p style={{ fontSize: "12.5px", color: "#9CA3AF", margin: "0 0 10px" }}>
                אין לך קוד? פנה אל{" "}
                <a
                  href="mailto:yonatanfridmanmusic@gmail.com"
                  style={{ color: "#2D6644", textDecoration: "none", fontWeight: 500 }}
                >
                  יונתן פרידמן
                </a>
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9CA3AF",
                  fontSize: "12px",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontFamily: "Rubik, sans-serif",
                }}
              >
                התנתק
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
