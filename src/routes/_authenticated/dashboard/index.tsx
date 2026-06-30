import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowDownLeft, Users } from "lucide-react";
import { useDashboardSummary, type SourceSummary } from "@/hooks/use-dashboard-summary";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";

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

  // No active school year — show clear notice instead of all-zeros
  if (!isLoading && !error && data && !data.schoolYear) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>לוח בקרה</h1>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>לא נמצאה שנת לימודים פעילה</p>
        </div>
        <div style={{
          background: "linear-gradient(135deg, #FEF9EC 0%, #FDF3D5 100%)",
          border: "1px solid #F0D98F", borderRadius: "16px",
          padding: "32px 36px", display: "flex", alignItems: "center", gap: "20px",
        }}>
          <div style={{ fontSize: "32px" }}>📅</div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "500", color: "#92400E", marginBottom: "6px" }}>
              אין שנת לימודים פעילה
            </div>
            <div style={{ fontSize: "13px", color: "#B45309", lineHeight: 1.6 }}>
              יש להגדיר שנת לימודים פעילה בהגדרות המערכת לפני שניתן לצפות בנתונים.
            </div>
          </div>
        </div>
      </div>
    );
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
