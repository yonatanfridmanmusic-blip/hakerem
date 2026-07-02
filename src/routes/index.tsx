import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: LandingPage,
});

// ─── Logo SVG ────────────────────────────────────────────────────────────────

function Logo({ size = 36 }: { size?: number }) {
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`,
      background: "linear-gradient(145deg, #2D6644, #1A3D2B)",
      borderRadius: `${Math.round(size * 0.3)}px`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 12px rgba(26,61,43,0.3)", flexShrink: 0,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 36 36" fill="none">
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

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "💰",
    title: "תקציב לפי מקורות",
    desc: "הפרדה ברורה בין כספי גפן, עירייה והורים — כל שקל מזוהה ועקוב.",
  },
  {
    icon: "📊",
    title: "לוח בקרה בזמן אמת",
    desc: "ראי בשניה אחת כמה יצא, כמה נכנס ומה נשאר — ללא גליונות אקסל.",
  },
  {
    icon: "🧾",
    title: "מעקב הוצאות והכנסות",
    desc: "הכנסי כל הוצאה והכנסה בשניות. חפשי, סנני, ערכי — הכל במקום אחד.",
  },
  {
    icon: "📋",
    title: "תכנון תקציבי שנתי",
    desc: "בני תכנית תקציבית, שייכי קטגוריות ובדקי כל רגע מה מנוצל מהתקציב.",
  },
  {
    icon: "👥",
    title: "עבודה בצוות",
    desc: "הזמיני רכזות ומזכירות עם גישה מותאמת תפקיד — ללא שיתוף סיסמאות.",
  },
  {
    icon: "📄",
    title: "דוחות מוכנים להדפסה",
    desc: "הפקי דוח חודשי, שנתי או לפי מקור — מוכן להצגה להורים ולפיקוח.",
  },
];

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const f = "var(--font-sans, 'Rubik', sans-serif)";

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: f, direction: "rtl" }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(250,250,247,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #EAE5DE",
        padding: "0 clamp(20px, 5vw, 80px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "60px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Logo size={34} />
          <span style={{ fontSize: "18px", fontWeight: "600", color: "#1A1A1A", letterSpacing: "-0.3px" }}>הכרם</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link to="/auth" style={{
            padding: "7px 18px", borderRadius: "8px",
            border: "1px solid #E8E2D9", background: "#fff",
            color: "#1A1A1A", fontSize: "14px", fontWeight: "500",
            textDecoration: "none", fontFamily: f,
          }}>כניסה</Link>
          <Link to="/auth" style={{
            padding: "7px 18px", borderRadius: "8px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            color: "#fff", fontSize: "14px", fontWeight: "500",
            textDecoration: "none", fontFamily: f,
            boxShadow: "0 2px 8px rgba(26,61,43,0.3)",
          }}>התחל בחינם</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        padding: "clamp(60px, 10vh, 120px) clamp(20px, 5vw, 80px) clamp(40px, 8vh, 100px)",
        maxWidth: "1100px", margin: "0 auto", textAlign: "center",
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "7px",
          padding: "5px 14px", borderRadius: "99px",
          background: "#EDFBF3", border: "1px solid #B6E8C8",
          fontSize: "12px", fontWeight: "600", color: "#166534",
          marginBottom: "28px", letterSpacing: "0.02em",
        }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2D6644", display: "inline-block" }} />
          מערכת ניהול פיננסי לבתי ספר בישראל
        </div>

        <h1 style={{
          fontSize: "clamp(36px, 6vw, 72px)", fontWeight: "300",
          color: "#1A1A1A", letterSpacing: "-2px", lineHeight: 1.1,
          margin: "0 0 20px",
        }}>
          כל כסף בית הספר שלך<br />
          <span style={{ color: "#2D6644", fontWeight: "500" }}>במקום אחד.</span>
        </h1>

        <p style={{
          fontSize: "clamp(16px, 2.2vw, 20px)", color: "#6B6560",
          lineHeight: 1.65, maxWidth: "600px", margin: "0 auto 40px",
          fontWeight: "300",
        }}>
          הכרם מחליף את הגיליונות הסבוכים בלוח בקרה נקי ופשוט —
          גפן, עירייה, הורים, הוצאות, הכנסות ודוחות.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/auth" style={{
            padding: "14px 32px", borderRadius: "12px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            color: "#fff", fontSize: "16px", fontWeight: "500",
            textDecoration: "none", fontFamily: f,
            boxShadow: "0 6px 24px rgba(26,61,43,0.35)",
            display: "inline-flex", alignItems: "center", gap: "8px",
          }}>
            התחל בחינם — אין צורך בכרטיס אשראי
          </Link>
          <a href="#features" style={{
            padding: "14px 28px", borderRadius: "12px",
            border: "1px solid #E8E2D9", background: "#fff",
            color: "#1A1A1A", fontSize: "16px", fontWeight: "400",
            textDecoration: "none", fontFamily: f,
          }}>
            ראה/י איך זה עובד
          </a>
        </div>

        {/* Hero visual — abstract dashboard mockup */}
        <div style={{
          marginTop: "60px",
          borderRadius: "20px",
          background: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 60%, #460C0C 100%)",
          padding: "28px 32px 0",
          boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
          maxWidth: "820px", margin: "60px auto 0",
          overflow: "hidden",
          position: "relative",
        }}>
          {/* Fake nav */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
          </div>
          {/* Fake hero row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "8px" }}>סה״כ הוצאות 2024/25</div>
              <div style={{ fontSize: "40px", fontWeight: "200", color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>₪248,500</div>
            </div>
            <div style={{ display: "flex", gap: "24px" }}>
              {[["גפן","#7AAA8E","₪140k","57%"], ["עירייה","#E88A6A","₪68k","27%"], ["הורים","#C98AC4","₪40k","16%"]].map(([label, color, amt, pct]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center", marginBottom: "4px" }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)" }}>{label}</span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "300", color: "#fff" }}>{amt}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>{pct}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Fake table rows */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "12px 12px 0 0", overflow: "hidden" }}>
            {[
              { date: "15/6", amt: "₪4,200", src: "גפן", cat: "ספרות ולמידה", color: "#EDFBF3", tc: "#166534" },
              { date: "12/6", amt: "₪1,850", src: "הורים", cat: "טיולים", color: "#F4EBF2", tc: "#6B2356" },
              { date: "08/6", amt: "₪7,500", src: "עירייה", cat: "תחזוקה", color: "#FDF1EA", tc: "#7C3010" },
              { date: "05/6", amt: "₪2,300", src: "גפן", cat: "ציוד משרדי", color: "#EDFBF3", tc: "#166534" },
            ].map((row, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "50px 80px 70px 1fr",
                padding: "10px 16px", gap: "12px", alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{row.date}</span>
                <span style={{ fontSize: "12px", fontWeight: "500", color: "#fff", textAlign: "right" }}>{row.amt}</span>
                <span style={{
                  display: "inline-flex", padding: "2px 8px", borderRadius: "99px",
                  fontSize: "10px", fontWeight: "600", background: row.color, color: row.tc, width: "fit-content",
                }}>{row.src}</span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>{row.cat}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{
        padding: "clamp(60px, 10vh, 100px) clamp(20px, 5vw, 80px)",
        maxWidth: "1100px", margin: "0 auto",
      }}>
        <div style={{ textAlign: "center", marginBottom: "56px" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-1px", margin: "0 0 14px" }}>
            כל מה שמנהלת צריכה
          </h2>
          <p style={{ fontSize: "16px", color: "#6B6560", maxWidth: "500px", margin: "0 auto", lineHeight: 1.65 }}>
            פותח במיוחד לצרכים הייחודיים של בתי ספר בישראל
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "16px",
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: "#fff", border: "1px solid #EAE5DE",
              borderRadius: "16px", padding: "28px 24px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              transition: "box-shadow 0.2s, transform 0.2s",
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.1)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "14px" }}>{f.icon}</div>
              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section style={{
        margin: "0 clamp(20px, 5vw, 80px) clamp(60px, 10vh, 100px)",
        borderRadius: "24px",
        background: "linear-gradient(135deg, #1A3D2B 0%, #0F2419 100%)",
        padding: "clamp(40px, 6vw, 72px) clamp(24px, 5vw, 64px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "32px", flexWrap: "wrap",
        boxShadow: "0 16px 60px rgba(15,36,25,0.35)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-60px", left: "-60px", width: "220px", height: "220px", borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{ fontSize: "clamp(24px, 3.5vw, 38px)", fontWeight: "300", color: "#fff", margin: "0 0 10px", letterSpacing: "-0.8px" }}>
            מוכנה להתחיל?
          </h2>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.6 }}>
            הצטרפי לבתי ספר שכבר מנהלים את תקציבם בהכרם
          </p>
        </div>
        <Link to="/auth" style={{
          padding: "14px 32px", borderRadius: "12px",
          background: "#fff", color: "#1A3D2B",
          fontSize: "15px", fontWeight: "600", textDecoration: "none",
          fontFamily: "var(--font-sans)", whiteSpace: "nowrap", flexShrink: 0,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          התחל עכשיו — בחינם →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "1px solid #EAE5DE",
        padding: "28px clamp(20px, 5vw, 80px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Logo size={26} />
          <span style={{ fontSize: "14px", fontWeight: "500", color: "#1A1A1A" }}>הכרם</span>
        </div>
        <div style={{ fontSize: "13px", color: "#AAA099" }}>
          © {new Date().getFullYear()} הכרם — מערכת ניהול פיננסי לבתי ספר
        </div>
        <Link to="/auth" style={{ fontSize: "13px", color: "#2D6644", fontWeight: "500", textDecoration: "none" }}>
          כניסה למערכת
        </Link>
      </footer>
    </div>
  );
}
