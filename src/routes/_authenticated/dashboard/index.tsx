import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowDownLeft, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboardSummary, type SourceSummary } from "@/hooks/use-dashboard-summary";
import { useOrganization } from "@/hooks/use-organization";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardPage,
});

// ─── Source config (colors only) ─────────────────────────────────────────────

const SOURCE_CONFIG = {
  gefen: {
    color: "#2D6644",
    barGradient: "linear-gradient(90deg, #5AA674, #2D6644)",
    accentGradient: "linear-gradient(90deg, #5AA674, #2D6644)",
  },
  iriyah: {
    color: "#B5472A",
    barGradient: "linear-gradient(90deg, #D46A42, #B5472A)",
    accentGradient: "linear-gradient(90deg, #D46A42, #9C3A20)",
  },
  horim: {
    color: "#8B2F6E",
    barGradient: "linear-gradient(90deg, #B04A90, #8B2F6E)",
    accentGradient: "linear-gradient(90deg, #B04A90, #6E235A)",
  },
} as const;

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ pct }: { pct: number }) {
  const status = pct >= 90 ? "risk" : pct >= 65 ? "caution" : "safe";
  const map = {
    safe:    { label: "תקין",   bg: "#ECFDF5", color: "#065F46", icon: <Minus size={9} /> },
    caution: { label: "זהירות", bg: "#F5EDE9", color: "#7C3010", icon: <TrendingUp size={9} /> },
    risk:    { label: "חריגה",  bg: "#FEF2F2", color: "#991B1B", icon: <TrendingDown size={9} /> },
  };
  const s = map[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "3px 9px", borderRadius: "99px",
      fontSize: "11px", fontWeight: "600",
      background: s.bg, color: s.color,
    }}>
      {s.icon}{s.label}
    </span>
  );
}

function Bar({ pct, gradient }: { pct: number; gradient: string }) {
  const animW = useAnimatedPct(pct, 80);
  return (
    <div style={{
      height: "7px", background: "linear-gradient(90deg, #E8E2D9, #EEE9E1)",
      borderRadius: "99px", overflow: "hidden",
      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
    }}>
      <div style={{
        height: "100%", width: `${Math.min(100, animW)}%`,
        background: gradient, borderRadius: "99px",
        transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </div>
  );
}

function SourceCard({ s }: { s: SourceSummary }) {
  const cfg = SOURCE_CONFIG[s.source];
  // Cash / income side
  const animCashBalance = useCountUp(s.cashBalance);
  const animIncome      = useCountUp(s.income);
  const animUsed        = useCountUp(s.used);
  const animCashPct     = useAnimatedPct(s.cashPct, 80);
  // Budget side (for progress bar when planned > 0)
  const animPlanned     = useCountUp(s.planned);
  const animBudgetPct   = useAnimatedPct(s.pct, 80);

  const cashLabel = s.isIncomeBased
    ? (s.source === "horim" ? "יתרה מגבייה" : "יתרה מהכנסות")
    : "יתרה תקציבית";

  const incomeLabel = s.source === "horim" ? "גבייה" : "הכנסות";

  // Status pill: if no income & no budget but has expenses → force "חריגה" (not "תקין")
  const displayPct =
    !s.isIncomeBased && s.planned === 0 && s.used > 0
      ? 100
      : s.isIncomeBased ? s.cashPct : s.pct;

  return (
    <div style={{
      background: "linear-gradient(160deg, #ffffff 0%, #F8F4EF 100%)",
      border: "1px solid #EAE5DE",
      borderRadius: "16px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,0.8) inset",
      overflow: "hidden",
    }}>
      <div style={{ height: "4px", background: cfg.accentGradient }} />
      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
            <span style={{ fontSize: "15px", fontWeight: "500", color: "#1A1A1A" }}>{s.label}</span>
          </div>
          <StatusPill pct={displayPct} />
        </div>

        {/* ── Section A: Cash balance ── */}
        <div>
          <div style={{ fontSize: "11px", color: "#AAA099", fontWeight: "500", marginBottom: "4px", letterSpacing: "0.02em" }}>
            {cashLabel}
          </div>
          <div className="num" style={{
            fontSize: "30px", fontWeight: "300", lineHeight: 1, letterSpacing: "-1px",
            color: s.cashBalance < 0 ? "#C2501A" : "#1A1A1A",
          }}>
            {fmt(animCashBalance)}
          </div>
          {/* Income vs used sub-row */}
          {(s.income > 0 || s.used > 0) && (
            <div style={{ marginTop: "6px", display: "flex", gap: "12px", fontSize: "11.5px", color: "#888079" }}>
              {s.income > 0 && (
                <span>
                  {incomeLabel}: <span className="num" style={{ color: "#2D6644", fontWeight: "500" }}>{fmt(animIncome)}</span>
                </span>
              )}
              {s.used > 0 && (
                <span>
                  הוצ׳: <span className="num" style={{ color: "#B5472A", fontWeight: "500" }}>{fmt(animUsed)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Divider: Budget utilization ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div style={{ flex: 1, height: "1px", background: "#EAE5DE" }} />
            <span style={{ fontSize: "10px", fontWeight: "600", color: "#C0BAB4", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              ניצול תקציב
            </span>
            <div style={{ flex: 1, height: "1px", background: "#EAE5DE" }} />
          </div>

          {s.planned > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Bar pct={s.pct} gradient={cfg.barGradient} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11.5px", color: "#888079" }}>
                  <span className="num">{fmt(animUsed)}</span>
                  {" "}מתוך{" "}
                  <span className="num">{fmt(animPlanned)}</span>
                  {" "}מתוכנן
                </span>
                <span className="num" style={{ fontSize: "11.5px", fontWeight: "600", color: cfg.color }}>
                  {animBudgetPct}%
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "7px 10px", borderRadius: "7px",
              background: s.used > 0 ? "#FDF1EA" : "#F8F6F3",
              border: `1px solid ${s.used > 0 ? "#F0C4A8" : "#EAE5DE"}`,
            }}>
              {s.used > 0 && <AlertTriangle size={11} style={{ color: "#C2501A", flexShrink: 0 }} />}
              <span style={{ fontSize: "11.5px", color: s.used > 0 ? "#7C3010" : "#AAA099" }}>
                {s.used > 0 ? "אין תקציב מאושר — יש הוצאות" : "לא הוגדר תקציב מאושר"}
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: "#fff", border: "1px solid #EAE5DE",
      borderRadius: "16px", overflow: "hidden", height: "220px",
      animation: "pulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ height: "4px", background: "#EAE5DE" }} />
    </div>
  );
}

// ─── Welcome Setup (shown when no active school year) ─────────────────────────

function WelcomeSetup() {
  const { data: membership } = useOrganization();
  const orgName = membership?.organization?.name ?? "בית הספר שלך";
  const orgRole = membership?.role;
  const canManage = orgRole === "owner" || orgRole === "admin";
  const [firstName, setFirstName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const fullName = data.user?.user_metadata?.full_name as string | undefined;
      const name = (fullName ?? "").split(" ")[0] || "";
      setFirstName(name);
    });
  }, []);

  const greeting = firstName ? `ברוכים הבאים, ${firstName}!` : "ברוכים הבאים להכרם!";

  const STEPS = [
    {
      num: 1, done: true,
      title: "יצירת חשבון בית הספר",
      desc: `הארגון "${orgName}" נוצר בהצלחה`,
      cta: null,
    },
    {
      num: 2, done: false,
      title: "הגדרת שנת לימודים",
      desc: canManage
        ? "צרי שנת לימודים פעילה — השלב הכי חשוב"
        : "המנהל צריך ליצור שנת לימודים פעילה",
      cta: canManage ? { label: "צור שנת לימודים", to: "/settings" as const } : null,
    },
    {
      num: 3, done: false,
      title: "הגדרת קטגוריות תקציב",
      desc: "הגדרי קטגוריות לגפן, עירייה והורים",
      cta: null,
    },
    {
      num: 4, done: false,
      title: "הזנת נתונים ראשונים",
      desc: "הוסיפי הכנסה או הוצאה ראשונה — הכל יחל לזוז",
      cta: null,
    },
  ];

  const FEATURES = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2D6644" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
      label: "לוח בקרה",
      desc: "מבט כולל על כל הכסף",
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B5472A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
      label: "הוצאות",
      desc: "מעקב לפי ספק וקטגוריה",
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2D6644" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
      label: "הכנסות",
      desc: "גפן, עירייה, הורים",
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B2F6E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
      label: "דוחות",
      desc: "PDF מוכן להגשה",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Hero banner ── */}
      <div style={{
        background: "linear-gradient(135deg, #2D6644 0%, #1A3D2B 55%, #0D2118 100%)",
        borderRadius: "20px", padding: "36px 40px",
        color: "#fff", position: "relative", overflow: "hidden",
        boxShadow: "0 16px 56px rgba(13,33,24,0.4)",
      }}>
        {/* Background blobs */}
        <div style={{ position: "absolute", top: "-60px", left: "-60px", width: "220px", height: "220px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-40px", right: "10%", width: "160px", height: "160px", borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
            <div style={{ width: "36px", height: "36px", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.15)" }}>
              <svg width="20" height="20" viewBox="0 0 36 36" fill="none">
                <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/><circle cx="24" cy="14" r="5.5" fill="#5AA674"/><circle cx="18" cy="23" r="5.5" fill="#4A8C62"/>
              </svg>
            </div>
            <span style={{ fontSize: "14px", fontWeight: "500", color: "rgba(255,255,255,0.7)", letterSpacing: "0.02em" }}>הכרם — ניהול פיננסי</span>
          </div>

          <h1 style={{ fontSize: "32px", fontWeight: "300", color: "#fff", letterSpacing: "-1px", margin: "0 0 8px", lineHeight: 1.2 }}>
            {greeting}
          </h1>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.65)", margin: "0 0 28px", lineHeight: 1.65, maxWidth: "480px" }}>
            עוד כמה שלבים קצרים ולוח הבקרה שלך יהיה חי עם כל הנתונים.
            בואי נגדיר את הסביבה שלך — זה לוקח פחות מ-2 דקות.
          </p>

          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ height: "5px", flex: 1, background: "rgba(255,255,255,0.12)", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: "25%", background: "linear-gradient(90deg, #7EE8A6, #4DC483)", borderRadius: "99px", transition: "width 0.8s" }} />
            </div>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>שלב 1 מתוך 4</span>
          </div>
        </div>
      </div>

      {/* ── Setup checklist ── */}
      <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "16px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3EEE8" }}>
          <div style={{ fontSize: "15px", fontWeight: "500", color: "#1A1A1A" }}>מדריך התחלה מהירה</div>
          <div style={{ fontSize: "13px", color: "#AAA099", marginTop: "3px" }}>עקבי אחרי השלבים לפי הסדר</div>
        </div>

        {STEPS.map((step, idx) => {
          const isActive = !step.done && (idx === 0 || STEPS[idx - 1].done);
          const isUpcoming = !step.done && !isActive;
          return (
            <div key={step.num} style={{
              display: "flex", alignItems: "flex-start", gap: "16px",
              padding: "18px 24px",
              borderBottom: idx < STEPS.length - 1 ? "1px solid #F8F4F0" : "none",
              background: isActive ? "linear-gradient(90deg, #F4FAF6 0%, #fff 60%)" : "#fff",
              transition: "background 0.2s",
            }}>
              {/* Step indicator */}
              <div style={{ flexShrink: 0, marginTop: "1px" }}>
                {step.done ? (
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#2D6644", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ) : isActive ? (
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #2D6644, #1A3D2B)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(45,102,68,0.4)" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>{step.num}</span>
                  </div>
                ) : (
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1.5px solid #E8E2D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "12px", color: "#C0BAB4" }}>{step.num}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14.5px", fontWeight: step.done ? "400" : isActive ? "500" : "400", color: step.done ? "#AAA099" : isUpcoming ? "#C0BAB4" : "#1A1A1A", textDecoration: step.done ? "line-through" : "none", marginBottom: "3px" }}>
                  {step.title}
                </div>
                <div style={{ fontSize: "12.5px", color: step.done ? "#C0BAB4" : isUpcoming ? "#D4CFC9" : "#6B6560", lineHeight: 1.5 }}>
                  {step.desc}
                </div>
                {isActive && step.cta && (
                  <Link to={step.cta.to} style={{ display: "inline-flex", alignItems: "center", gap: "7px", marginTop: "12px", padding: "9px 18px", background: "linear-gradient(135deg, #2D6644, #1A3D2B)", color: "#fff", borderRadius: "9px", fontSize: "13.5px", fontWeight: "500", textDecoration: "none", fontFamily: "var(--font-sans)", boxShadow: "0 3px 12px rgba(26,61,43,0.3)" }}>
                    {step.cta.label}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M5 10L9 7 5 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 7 7)"/>
                    </svg>
                  </Link>
                )}
              </div>

              {/* Status badge */}
              <div style={{ flexShrink: 0, marginTop: "3px" }}>
                {step.done && <span style={{ fontSize: "11px", color: "#2D6644", fontWeight: "600", background: "#EDFBF3", padding: "3px 9px", borderRadius: "99px" }}>הושלם</span>}
                {isActive && <span style={{ fontSize: "11px", color: "#1A3D2B", fontWeight: "600", background: "#D5F0E0", padding: "3px 9px", borderRadius: "99px" }}>עכשיו</span>}
                {isUpcoming && <span style={{ fontSize: "11px", color: "#C0BAB4", background: "#F5F2EE", padding: "3px 9px", borderRadius: "99px" }}>בקרוב</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── What you'll get ── */}
      <div>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "#AAA099", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "12px" }}>
          מה תקבלי אחרי ההגדרה
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
          {FEATURES.map((f) => (
            <div key={f.label} style={{
              background: "#fff", border: "1px solid #EAE5DE",
              borderRadius: "12px", padding: "16px 18px",
              display: "flex", alignItems: "center", gap: "12px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#F5F5F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: "500", color: "#1A1A1A", marginBottom: "2px" }}>{f.label}</div>
                <div style={{ fontSize: "11.5px", color: "#AAA099" }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardSummary();

  const totals = data?.totals ?? { planned: 0, used: 0, balance: 0, pct: 0 };
  const incomeTotals = data?.incomeTotals ?? { fromIncome: 0, fromParentCollections: 0, grand: 0 };
  const yearName = data?.schoolYear?.name ?? "—";

  // Animations
  const animBalance = useCountUp(totals.balance);
  const animUsed    = useCountUp(totals.used);
  const animPlanned = useCountUp(totals.planned);
  const animPct     = useAnimatedPct(totals.pct, 80);
  const animFromIncome     = useCountUp(incomeTotals.fromIncome);
  const animFromParentColl = useCountUp(incomeTotals.fromParentCollections);

  // No active school year → full setup walkthrough
  if (!isLoading && !error && data && !data.schoolYear) {
    return <WelcomeSetup />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* Page heading */}
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>
          לוח בקרה
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099", fontWeight: "400" }}>
          {yearName} — מבט כולל על מצב התקציב
        </p>
      </div>

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #2D6644 0%, #1A3D2B 55%, #0D2118 100%)",
        borderRadius: "20px", padding: "32px 36px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        flexWrap: "wrap", gap: "24px",
        boxShadow: "0 16px 56px rgba(13,33,24,0.4), 0 1px 0 rgba(255,255,255,0.08) inset",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 70% 60% at 20% 10%, rgba(90,166,116,0.18) 0%, transparent 70%)",
        }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: "12px", color: "rgba(122,170,142,0.8)", fontWeight: "500", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>
            יתרה תקציבית — כל המקורות
          </div>
          <div className="num" style={{ fontSize: "52px", fontWeight: "300", color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>
            {isLoading ? "—" : fmt(animBalance)}
          </div>
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#7AAA8E" }}>
            <span className="num">{isLoading ? "—" : fmt(animUsed)}</span>
            <span style={{ color: "rgba(122,170,142,0.6)", margin: "0 5px" }}>מתוך</span>
            <span className="num">{isLoading ? "—" : fmt(animPlanned)}</span>
            <span style={{ color: "rgba(122,170,142,0.6)", marginRight: "5px" }}>מתוכנן</span>
          </div>
        </div>

        <div style={{ textAlign: "left", position: "relative" }}>
          <div className="num" style={{
            fontSize: "64px", fontWeight: "200",
            background: "linear-gradient(135deg, #7EE8A6 0%, #4DC483 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-3px", lineHeight: 1,
          }}>
            {isLoading ? "—" : `${animPct}%`}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(122,170,142,0.6)", marginTop: "4px", textAlign: "center" }}>
            מהתקציב נוצל
          </div>
        </div>
      </div>

      {/* Income strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: "14px",
      }}>
        {/* Income from income table */}
        <div style={{
          background: "linear-gradient(135deg, #F0FBF5 0%, #E6F5EE 100%)",
          border: "1px solid #C3E6D3", borderRadius: "14px",
          padding: "18px 22px",
          display: "flex", alignItems: "center", gap: "14px",
        }}>
          <div style={{
            width: "38px", height: "38px", borderRadius: "10px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <ArrowDownLeft size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "#166534", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "4px" }}>
              הכנסות (מקורות)
            </div>
            <div className="num" style={{ fontSize: "22px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>
              {isLoading ? "—" : fmt(animFromIncome)}
            </div>
          </div>
        </div>

        {/* Parent collections */}
        <div style={{
          background: "linear-gradient(135deg, #F7EFF5 0%, #F0E6EF 100%)",
          border: "1px solid #DDB8D5", borderRadius: "14px",
          padding: "18px 22px",
          display: "flex", alignItems: "center", gap: "14px",
        }}>
          <div style={{
            width: "38px", height: "38px", borderRadius: "10px",
            background: "linear-gradient(135deg, #B04A90, #8B2F6E)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Users size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "#6B2356", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "4px" }}>
              גביית הורים
            </div>
            <div className="num" style={{ fontSize: "22px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>
              {isLoading ? "—" : fmt(animFromParentColl)}
            </div>
          </div>
        </div>
      </div>

      {/* Separator label */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ flex: 1, height: "1px", background: "#EAE5DE" }} />
        <span style={{ fontSize: "11px", fontWeight: "600", color: "#AAA099", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          ניצול תקציב לפי מקור
        </span>
        <div style={{ flex: 1, height: "1px", background: "#EAE5DE" }} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "12px", padding: "14px 18px", color: "#991B1B", fontSize: "13px" }}>
          שגיאה בטעינת הנתונים — נסה לרענן את הדף
        </div>
      )}

      {/* Source cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "16px" }}>
        {isLoading
          ? [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : (data?.sources ?? []).map((s) => <SourceCard key={s.source} s={s} />)
        }
      </div>
    </div>
  );
}
