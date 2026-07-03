import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: LandingPage,
});

// ─── Logo ─────────────────────────────────────────────────────────────────────

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

// ─── Mini App Mockups (SVG previews of the actual UI) ─────────────────────────

function MockupDashboard() {
  return (
    <div style={{ background: "linear-gradient(135deg,#2D6644 0%,#1A3D2B 55%,#0D2118 100%)", borderRadius: "12px", padding: "16px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-20px", left: "-20px", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ fontSize: "9px", color: "rgba(122,170,142,0.8)", marginBottom: "4px", letterSpacing: "0.06em" }}>יתרה תקציבית — כל המקורות</div>
      <div style={{ fontSize: "28px", fontWeight: "200", color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>₪182,340</div>
      <div style={{ marginTop: "6px", fontSize: "10px", color: "#7AAA8E" }}>
        <span>₪66,160 </span><span style={{ color: "rgba(122,170,142,0.5)" }}>מתוך </span><span>₪248,500 מתוכנן</span>
      </div>
      <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
        {[["גפן","#7AAA8E","67%"], ["עירייה","#E88A6A","27%"], ["הורים","#C98AC4","15%"]].map(([l,c,p]) => (
          <div key={l as string} style={{ flex: 1 }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", marginBottom: "3px" }}>{l as string}</div>
            <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "99px" }}>
              <div style={{ width: p as string, height: "100%", background: c as string, borderRadius: "99px" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupSources() {
  const cards = [
    { label: "גפן", color: "#2D6644", light: "#EDFBF3", bal: "₪94,200", pct: "43%", w: "43%" },
    { label: "עירייה", color: "#B5472A", light: "#FDF1EA", bal: "₪52,800", pct: "72%", w: "72%" },
    { label: "הורים", color: "#8B2F6E", light: "#F4EBF2", bal: "₪35,340", pct: "28%", w: "28%" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "10px", padding: "8px 10px", borderRight: `3px solid ${c.color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontSize: "10px", fontWeight: "500", color: "#1A1A1A" }}>{c.label}</span>
            <span style={{ fontSize: "10px", fontWeight: "600", color: c.color }}>{c.bal}</span>
          </div>
          <div style={{ height: "3px", background: "#EAE5DE", borderRadius: "99px" }}>
            <div style={{ width: c.w, height: "100%", background: c.color, borderRadius: "99px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupExpenses() {
  const rows = [
    { cat: "ספרי לימוד", src: "גפן", bg: "#EDFBF3", tc: "#166534", amt: "₪4,200" },
    { cat: "טיולים", src: "הורים", bg: "#F4EBF2", tc: "#6B2356", amt: "₪1,850" },
    { cat: "תחזוקה", src: "עירייה", bg: "#FDF1EA", tc: "#7C3010", amt: "₪7,500" },
    { cat: "ציוד משרדי", src: "גפן", bg: "#EDFBF3", tc: "#166534", amt: "₪920" },
  ];
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "10px", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", padding: "6px 10px", borderBottom: "1px solid #EAE5DE", fontSize: "8px", fontWeight: "600", color: "#AAA099", letterSpacing: "0.05em" }}>
        <span>קטגוריה</span><span style={{ textAlign: "center" }}>מקור</span><span style={{ textAlign: "right" }}>סכום</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", padding: "5px 10px", borderBottom: i < rows.length - 1 ? "1px solid #F3EEE8" : "none", alignItems: "center" }}>
          <span style={{ fontSize: "9px", color: "#1A1A1A" }}>{r.cat}</span>
          <span style={{ fontSize: "8px", fontWeight: "600", background: r.bg, color: r.tc, borderRadius: "99px", padding: "1px 5px", textAlign: "center" }}>{r.src}</span>
          <span style={{ fontSize: "9px", fontWeight: "500", color: "#1A1A1A", textAlign: "right" }}>{r.amt}</span>
        </div>
      ))}
    </div>
  );
}

function MockupBudget() {
  const cats = [
    { name: "ספרי לימוד", planned: "₪20k", pct: 68, color: "#2D6644" },
    { name: "ציוד טכנולוגי", planned: "₪35k", pct: 42, color: "#2D6644" },
    { name: "תחזוקה", planned: "₪28k", pct: 91, color: "#B5472A" },
  ];
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "10px", overflow: "hidden" }}>
      {cats.map((c, i) => (
        <div key={i} style={{ padding: "7px 10px", borderBottom: i < cats.length - 1 ? "1px solid #F3EEE8" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
            <span style={{ fontSize: "9px", color: "#1A1A1A" }}>{c.name}</span>
            <span style={{ fontSize: "8px", fontWeight: "600", color: c.color }}>{c.pct}%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ flex: 1, height: "4px", background: "#EAE5DE", borderRadius: "99px" }}>
              <div style={{ width: `${c.pct}%`, height: "100%", background: c.pct > 80 ? "#B5472A" : "#2D6644", borderRadius: "99px" }} />
            </div>
            <span style={{ fontSize: "8px", color: "#AAA099" }}>{c.planned}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupTeam() {
  const members = [
    { name: "נורית כהן", role: "מנהלת", initial: "נ", color: "#2D6644" },
    { name: "שירה לוי", role: "רכזת", initial: "ש", color: "#8B2F6E" },
    { name: "דנה אבי", role: "מזכירה", initial: "ד", color: "#B5472A" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {members.map((m, i) => (
        <div key={i} style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "10px", padding: "7px 10px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#fff" }}>{m.initial}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", fontWeight: "500", color: "#1A1A1A" }}>{m.name}</div>
            <div style={{ fontSize: "8px", color: "#AAA099" }}>{m.role}</div>
          </div>
          <div style={{ fontSize: "8px", background: "#EDFBF3", color: "#166534", border: "1px solid #B6E8C4", borderRadius: "4px", padding: "2px 6px", fontWeight: "500" }}>פעיל</div>
        </div>
      ))}
    </div>
  );
}

function MockupReports() {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "10px", padding: "10px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "10px", fontWeight: "600", color: "#1A1A1A" }}>דוח חודשי — יוני</span>
        <span style={{ fontSize: "8px", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", borderRadius: "4px", padding: "2px 7px" }}>PDF</span>
      </div>
      {[["גפן", "₪12,400", "#2D6644"], ["עירייה", "₪8,200", "#B5472A"], ["הורים", "₪3,600", "#8B2F6E"]].map(([l,a,c]) => (
        <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #F3EEE8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: c as string }} />
            <span style={{ fontSize: "9px", color: "#6B6560" }}>{l as string}</span>
          </div>
          <span style={{ fontSize: "9px", fontWeight: "600", color: "#1A1A1A" }}>{a as string}</span>
        </div>
      ))}
      <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "9px", fontWeight: "600", color: "#1A1A1A" }}>סה״כ</span>
        <span style={{ fontSize: "9px", fontWeight: "600", color: "#2D6644" }}>₪24,200</span>
      </div>
    </div>
  );
}

// ─── Feature definitions ──────────────────────────────────────────────────────

const FEATURES = [
  {
    mockup: <MockupDashboard />,
    label: "לוח בקרה",
    bg: "linear-gradient(135deg,#0F2419,#1A3D2B)",
    title: "לוח בקרה בזמן אמת",
    desc: "ראה/י בשנייה אחת כמה יצא, כמה נכנס ומה נשאר — ללא גיליונות אקסל, ללא בלבול.",
  },
  {
    mockup: <MockupSources />,
    label: "מקורות",
    bg: "#F8F5F1",
    title: "תקציב לפי מקורות",
    desc: "הפרדה ברורה בין גפן, עירייה והורים — כל שקל מזוהה, עקוב, ולא מתבלבל.",
  },
  {
    mockup: <MockupExpenses />,
    label: "הוצאות",
    bg: "#FDF5F3",
    title: "מעקב הוצאות והכנסות",
    desc: "הכנס/י כל הוצאה תוך שניות. חפש/י, סנן/י, ערוך/י — הכל במקום אחד, תמיד מסודר.",
  },
  {
    mockup: <MockupBudget />,
    label: "תכנון",
    bg: "#F5F8F6",
    title: "תכנון תקציבי שנתי",
    desc: "בנה/י תכנית, שייך/י קטגוריות ובדוק/י כל רגע אם חרגת מהתקציב — לפני שזה מאוחר.",
  },
  {
    mockup: <MockupTeam />,
    label: "צוות",
    bg: "#F8F5F8",
    title: "עבודה בצוות",
    desc: "הזמן/י אנשי צוות עם גישה לפי תפקיד — ללא שיתוף סיסמאות, ללא כאוס.",
  },
  {
    mockup: <MockupReports />,
    label: "דוחות",
    bg: "#F5F7FB",
    title: "דוחות מוכנים להדפסה",
    desc: "דוח חודשי, שנתי, לפי מקור — לחצי הדפסה וקיבלת עמוד מסודר לפיקוח ולהורים.",
  },
];

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const f = "var(--font-sans, 'Rubik', sans-serif)";

  // Handle Supabase OAuth callback — Supabase redirects here with ?code=...
  // detectSessionInUrl is OFF; we manually exchange the code to avoid race conditions.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) {
        window.location.href = "/dashboard";
      } else {
        console.error("[OAuth] exchangeCodeForSession error:", error.message);
        // Fallback: maybe exchange already happened
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) window.location.href = "/dashboard";
        });
      }
    });
  }, []);

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
        padding: "clamp(60px, 10vh, 120px) clamp(20px, 5vw, 80px) clamp(40px, 8vh, 80px)",
        maxWidth: "1100px", margin: "0 auto", textAlign: "center",
      }}>
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
          כל הכסף של בית הספר שלך<br />
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

        {/* Hero dashboard mockup */}
        <div style={{
          marginTop: "60px",
          borderRadius: "20px",
          background: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 60%, #081510 100%)",
          padding: "28px 32px 0",
          boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.08) inset",
          maxWidth: "820px", margin: "60px auto 0",
          overflow: "hidden", position: "relative",
        }}>
          {/* Window chrome */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px" }}>
            {["rgba(255,90,97,0.7)","rgba(255,189,46,0.7)","rgba(39,201,63,0.7)"].map((c,i) => (
              <div key={i} style={{ width: "9px", height: "9px", borderRadius: "50%", background: c }} />
            ))}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "5px", padding: "3px 20px", fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>
                hakerem.app/dashboard
              </div>
            </div>
          </div>

          {/* Dashboard hero */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "rgba(122,170,142,0.8)", marginBottom: "6px", letterSpacing: "0.04em" }}>יתרה תקציבית — כל המקורות</div>
              <div style={{ fontSize: "44px", fontWeight: "200", color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>₪182,340</div>
              <div style={{ marginTop: "8px", fontSize: "11px", color: "#7AAA8E" }}>
                <span>₪66,160</span> <span style={{ color: "rgba(122,170,142,0.5)" }}>מתוך</span> <span>₪248,500 מתוכנן</span>
              </div>
            </div>
            <div style={{
              fontSize: "56px", fontWeight: "200",
              background: "linear-gradient(135deg,#7EE8A6,#4DC483)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              letterSpacing: "-2px", lineHeight: 1,
            }}>
              73%
            </div>
          </div>

          {/* Source cards row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
            {[
              { label: "גפן", bal: "₪94,200", pct: 43, color: "#2D6644", grad: "linear-gradient(135deg,#2D6644,#1A3D2B)" },
              { label: "עירייה", bal: "₪52,800", pct: 72, color: "#B5472A", grad: "linear-gradient(135deg,#B5472A,#7C2E18)" },
              { label: "הורים", bal: "₪35,340", pct: 28, color: "#8B2F6E", grad: "linear-gradient(135deg,#8B2F6E,#4A1A38)" },
            ].map(src => (
              <div key={src.label} style={{
                background: "rgba(255,255,255,0.06)", borderRadius: "10px", padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: src.color }} />
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>{src.label}</span>
                  </div>
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)" }}>{src.pct}%</span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: "300", color: "#fff", letterSpacing: "-0.3px" }}>{src.bal}</div>
                <div style={{ marginTop: "6px", height: "2px", background: "rgba(255,255,255,0.1)", borderRadius: "99px" }}>
                  <div style={{ width: `${src.pct}%`, height: "100%", background: src.grad, borderRadius: "99px" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Expense table */}
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "10px 10px 0 0", overflow: "hidden" }}>
            {[
              { date: "15/6", amt: "₪4,200", src: "גפן", bg: "#EDFBF3", tc: "#166534", cat: "ספרי לימוד" },
              { date: "12/6", amt: "₪1,850", src: "הורים", bg: "#F4EBF2", tc: "#6B2356", cat: "טיולים" },
              { date: "08/6", amt: "₪7,500", src: "עירייה", bg: "#FDF1EA", tc: "#7C3010", cat: "תחזוקה" },
            ].map((row, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "44px 80px 60px 1fr",
                padding: "9px 16px", gap: "10px", alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>{row.date}</span>
                <span style={{ fontSize: "11px", fontWeight: "500", color: "#fff", textAlign: "right" }}>{row.amt}</span>
                <span style={{ fontSize: "9px", fontWeight: "600", background: row.bg, color: row.tc, borderRadius: "99px", padding: "2px 7px", textAlign: "center" }}>{row.src}</span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)" }}>{row.cat}</span>
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
            כל מה שמנהל/ת צריכ/ה
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
          {FEATURES.map((feat) => (
            <div key={feat.title}
              style={{
                background: "#fff", border: "1px solid #EAE5DE",
                borderRadius: "18px", overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                transition: "box-shadow 0.2s, transform 0.2s",
                cursor: "default",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 40px rgba(0,0,0,0.1)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
            >
              {/* Mockup preview area */}
              <div style={{ background: feat.bg, padding: "20px 20px 16px", minHeight: "140px" }}>
                {feat.mockup}
              </div>
              {/* Text */}
              <div style={{ padding: "18px 20px 22px" }}>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#2D6644", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>
                  {feat.label}
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 7px", letterSpacing: "-0.3px" }}>{feat.title}</h3>
                <p style={{ fontSize: "13.5px", color: "#6B6560", lineHeight: 1.65, margin: 0 }}>{feat.desc}</p>
              </div>
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
