import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

// ─── Logo icon ────────────────────────────────────────────────────────────────

function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`,
      background: "rgba(255,255,255,0.12)",
      borderRadius: `${Math.round(size * 0.28)}px`,
      border: "1px solid rgba(255,255,255,0.18)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 36 36" fill="none">
        <line x1="18" y1="4" x2="18" y2="9" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="12" cy="14" r="5.5" fill="rgba(255,255,255,0.75)"/>
        <circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
        <circle cx="24" cy="14" r="5.5" fill="rgba(255,255,255,0.6)"/>
        <circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
        <circle cx="18" cy="23" r="5.5" fill="rgba(255,255,255,0.45)"/>
        <circle cx="16.2" cy="21.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
      </svg>
    </div>
  );
}

// ─── Left panel mini-dashboard preview ───────────────────────────────────────

function DashboardPreview() {
  return (
    <div style={{
      background: "rgba(0,0,0,0.25)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "14px",
      overflow: "hidden",
      fontSize: "11px",
    }}>
      {/* Window chrome */}
      <div style={{
        padding: "8px 12px",
        background: "rgba(0,0,0,0.2)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", gap: "5px",
      }}>
        {["rgba(255,90,97,0.5)","rgba(255,189,46,0.5)","rgba(39,201,63,0.5)"].map((c,i) => (
          <div key={i} style={{ width: "7px", height: "7px", borderRadius: "50%", background: c }} />
        ))}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "4px", padding: "2px 14px", fontSize: "8px", color: "rgba(255,255,255,0.3)" }}>
            hakerem.app
          </div>
        </div>
      </div>

      {/* Balance hero */}
      <div style={{ padding: "14px 16px 12px" }}>
        <div style={{ fontSize: "8px", color: "rgba(122,170,142,0.7)", marginBottom: "3px", letterSpacing: "0.05em" }}>
          יתרה תקציבית — כל המקורות
        </div>
        <div style={{ fontSize: "26px", fontWeight: "200", color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>
          ₪182,340
        </div>
        <div style={{ fontSize: "9px", color: "#7AAA8E", marginTop: "4px" }}>
          ₪66,160 מתוך ₪248,500 מתוכנן
        </div>
      </div>

      {/* Source cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", padding: "0 12px 12px" }}>
        {[
          { l: "גפן", v: "₪94,200", p: 43, c: "#2D6644" },
          { l: "עירייה", v: "₪52,800", p: 72, c: "#B5472A" },
          { l: "הורים", v: "₪35,340", p: 28, c: "#8B2F6E" },
        ].map(s => (
          <div key={s.l} style={{
            background: "rgba(255,255,255,0.06)", borderRadius: "8px",
            padding: "7px 8px", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.45)", marginBottom: "3px" }}>{s.l}</div>
            <div style={{ fontSize: "10px", fontWeight: "400", color: "#fff" }}>{s.v}</div>
            <div style={{ marginTop: "4px", height: "2px", background: "rgba(255,255,255,0.08)", borderRadius: "99px" }}>
              <div style={{ width: `${s.p}%`, height: "100%", background: s.c, borderRadius: "99px" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent expenses */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        {[
          { cat: "ספרי לימוד", src: "גפן", amt: "₪4,200", bg: "#EDFBF3", tc: "#166534" },
          { cat: "תחזוקה", src: "עירייה", amt: "₪7,500", bg: "#FDF1EA", tc: "#7C3010" },
          { cat: "טיולים", src: "הורים", amt: "₪1,850", bg: "#F4EBF2", tc: "#6B2356" },
        ].map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 14px",
            borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                fontSize: "7px", fontWeight: "600",
                background: r.bg, color: r.tc,
                borderRadius: "99px", padding: "1px 5px",
              }}>{r.src}</span>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)" }}>{r.cat}</span>
            </div>
            <span style={{ fontSize: "9px", fontWeight: "500", color: "#fff" }}>{r.amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const f = "var(--font-sans, 'Rubik', sans-serif)";

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      toast.error("שגיאה בהתחברות עם Google");
      setGoogleLoading(false);
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("פרטי ההתחברות שגויים");
      setLoading(false);
    } else {
      window.location.href = "/dashboard";
    }
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("נא להזין שם מלא"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      await supabase.from("profiles").upsert({ id: data.user.id, full_name: fullName.trim(), email });
      toast.success("החשבון נוצר! עוברים לחיבור בית הספר...");
      window.location.href = "/onboarding";
    }
  };

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%", padding: "12px 14px",
    border: `1.5px solid ${focusedField === field ? "#2D6644" : "#E8E2D9"}`,
    borderRadius: "10px",
    fontSize: "14px", background: focusedField === field ? "#FCFBF9" : "#fff",
    color: "#1A1A1A", outline: "none",
    fontFamily: f,
    boxSizing: "border-box",
    transition: "border-color 0.15s, background 0.15s",
    boxShadow: focusedField === field ? "0 0 0 3px rgba(45,102,68,0.08)" : "none",
  });

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      fontFamily: f, direction: "rtl",
      background: "#F8F5F1",
    }}>
      {/* ── Left panel (dark) ── */}
      <div style={{
        flex: "0 0 480px",
        background: "linear-gradient(160deg, #1C4430 0%, #0F2419 55%, #081510 100%)",
        padding: "48px 40px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
        minHeight: "100vh",
      }}>
        {/* Ambient orbs */}
        <div style={{ position: "absolute", top: "-80px", right: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "radial-gradient(ellipse,rgba(45,102,68,0.25),transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "-60px", width: "220px", height: "220px", borderRadius: "50%", background: "radial-gradient(ellipse,rgba(122,170,142,0.12),transparent 70%)", pointerEvents: "none" }} />

        {/* Logo + brand */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "52px" }}>
            <LogoIcon size={42} />
            <Link to="/" style={{ textDecoration: "none" }}>
              <span style={{ fontSize: "22px", fontWeight: "500", color: "#fff", letterSpacing: "-0.3px" }}>הכרם</span>
            </Link>
          </div>

          <h2 style={{ fontSize: "32px", fontWeight: "300", color: "#fff", letterSpacing: "-1px", lineHeight: 1.2, margin: "0 0 14px" }}>
            ניהול פיננסי<br />
            <span style={{ color: "#7AAA8E" }}>לבתי ספר בישראל</span>
          </h2>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, margin: "0 0 40px" }}>
            גפן, עירייה, הורים, הוצאות ודוחות —<br />הכל במקום אחד, ברור ופשוט.
          </p>

          <DashboardPreview />
        </div>

        {/* Trust badges */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {[
              ["100%", "מאובטח"],
              ["SSL", "הצפנה"],
              ["24/7", "זמינות"],
            ].map(([val, lbl]) => (
              <div key={lbl} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#7AAA8E" }}>{val}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "1px" }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 32px",
      }}>
        <div style={{ width: "100%", maxWidth: "380px" }}>

          {/* Tab switcher */}
          <div style={{
            display: "flex", background: "#EEE8E0", borderRadius: "10px",
            padding: "3px", marginBottom: "32px",
          }}>
            {(["login", "signup"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "8px 0", border: "none",
                borderRadius: "8px", fontSize: "14px", fontWeight: "500",
                fontFamily: f, cursor: "pointer",
                background: mode === m ? "#fff" : "transparent",
                color: mode === m ? "#1A1A1A" : "#AAA099",
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}>
                {m === "login" ? "כניסה" : "הרשמה"}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <>
              <div style={{ marginBottom: "28px" }}>
                <h1 style={{ fontSize: "24px", fontWeight: "400", color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
                  ברוכים הבאים
                </h1>
                <p style={{ fontSize: "14px", color: "#AAA099", margin: 0 }}>
                  כניסה לחשבון בית הספר שלך
                </p>
              </div>

              {/* Google */}
              <button type="button" onClick={signInWithGoogle} disabled={googleLoading} style={{
                width: "100%", padding: "11px 0",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                background: "#fff", border: "1.5px solid #E8E2D9",
                borderRadius: "10px", fontSize: "14px", fontWeight: "500",
                fontFamily: f, color: "#1A1A1A",
                cursor: googleLoading ? "not-allowed" : "pointer",
                marginBottom: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                transition: "box-shadow 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#C8C2BB"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8E2D9"; }}
              >
                <GoogleIcon />
                {googleLoading ? "מתחבר..." : "כניסה עם Google"}
              </button>

              <Divider />

              <form onSubmit={signIn} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label="כתובת אימייל">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr"
                    style={inputStyle("email")}
                    onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
                  />
                </Field>
                <Field label="סיסמה">
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr"
                    style={inputStyle("password")}
                    onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField(null)}
                  />
                </Field>
                <SubmitBtn loading={loading} label="כניסה" />
              </form>
            </>
          ) : (
            <>
              <div style={{ marginBottom: "28px" }}>
                <h1 style={{ fontSize: "24px", fontWeight: "400", color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
                  יצירת חשבון
                </h1>
                <p style={{ fontSize: "14px", color: "#AAA099", margin: 0 }}>
                  הצטרפי לניהול פיננסי חכם לבית הספר שלך
                </p>
              </div>

              <form onSubmit={signUp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label="שם מלא">
                  <input
                    type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                    placeholder="לדוגמה: נורית כהן"
                    style={inputStyle("name")}
                    onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)}
                  />
                </Field>
                <Field label="כתובת אימייל">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr"
                    style={inputStyle("email")}
                    onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
                  />
                </Field>
                <Field label="סיסמה (לפחות 6 תווים)">
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} dir="ltr"
                    style={inputStyle("password")}
                    onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField(null)}
                  />
                </Field>
                <SubmitBtn loading={loading} label="יצירת חשבון" />
              </form>

              {/* Or Google for signup too */}
              <div style={{ margin: "16px 0" }}>
                <Divider />
                <button type="button" onClick={signInWithGoogle} disabled={googleLoading} style={{
                  width: "100%", padding: "11px 0",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                  background: "#fff", border: "1.5px solid #E8E2D9",
                  borderRadius: "10px", fontSize: "14px", fontWeight: "500",
                  fontFamily: f, color: "#1A1A1A",
                  cursor: googleLoading ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}>
                  <GoogleIcon />
                  {googleLoading ? "מתחבר..." : "הרשמה עם Google"}
                </button>
              </div>
            </>
          )}

          {/* Terms note */}
          <p style={{ fontSize: "11px", color: "#C8C2BB", textAlign: "center", marginTop: "24px", lineHeight: 1.6 }}>
            {mode === "signup" ? "בהרשמה את/ה מסכים/ה לתנאי השימוש ולמדיניות הפרטיות של הכרם" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        fontSize: "12px", fontWeight: "600", color: "#6B6560",
        display: "block", marginBottom: "7px", letterSpacing: "0.03em",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
      <div style={{ flex: 1, height: "1px", background: "#EAE5DE" }} />
      <span style={{ fontSize: "11px", color: "#C8C2BB", letterSpacing: "0.02em" }}>או עם אימייל</span>
      <div style={{ flex: 1, height: "1px", background: "#EAE5DE" }} />
    </div>
  );
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading} style={{
      marginTop: "4px", padding: "12px 0",
      background: loading
        ? "#AAA099"
        : "linear-gradient(135deg, #2D6644, #1A3D2B)",
      color: "#fff", border: "none",
      borderRadius: "10px",
      fontSize: "15px", fontWeight: "500",
      fontFamily: "var(--font-sans, 'Rubik', sans-serif)",
      cursor: loading ? "not-allowed" : "pointer",
      width: "100%",
      boxShadow: loading ? "none" : "0 4px 16px rgba(26,61,43,0.3)",
      transition: "box-shadow 0.15s",
    }}>
      {loading ? "מעבד..." : label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
