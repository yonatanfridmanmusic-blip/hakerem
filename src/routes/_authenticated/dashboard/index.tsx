import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowDownLeft, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDashboardSummary, type SourceSummary } from "@/hooks/use-dashboard-summary";
import { useOrganization } from "@/hooks/use-organization";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { supabase } from "@/integrations/supabase/client";
import { useCreateSchoolYear } from "@/hooks/use-school-years";
import { useAddGrade, useGrades } from "@/hooks/use-grades";
import { useAddBudgetCategory, type BudgetSource } from "@/hooks/use-budget-plan";

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

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

const GRADE_LETTERS = ["א","ב","ג","ד","ה","ו","ז","ח"];

const CAT_SUGGESTIONS: Record<BudgetSource, string[]> = {
  gefen:  ["ציוד משרדי","ספרי לימוד","ציוד ניקיון","חשמל ומים","תחזוקה","תקשורת"],
  iriyah: ["שכר עובדים","שיפוצים","ריהוט","ציוד טכנולוגי","נסיעות"],
  horim:  ["פעילויות חינוכיות","טיולים","הצגות ואירועים","ציוד ספורט","ימי כיף"],
};

const SRC_CFG = {
  gefen:  { label: "גפן",    color: "#2D6644", light: "#EDFBF3", grad: "linear-gradient(135deg,#2D6644,#1A3D2B)" },
  iriyah: { label: "עירייה", color: "#B5472A", light: "#FDF1EA", grad: "linear-gradient(135deg,#B5472A,#7C2E18)" },
  horim:  { label: "הורים",  color: "#8B2F6E", light: "#F4EBF2", grad: "linear-gradient(135deg,#8B2F6E,#4A1A38)" },
} as const;

function SmartDefaults() {
  const now = new Date();
  const y = now.getFullYear();
  const hebrewMap: Record<number,string> = { 2024:'תשפ"ה', 2025:'תשפ"ו', 2026:'תשפ"ז', 2027:'תשפ"ח', 2028:'תשפ"ט' };
  return {
    name: `${hebrewMap[y] ?? y} ${y}-${y+1}`,
    start: `${y}-09-01`,
    end: `${y+1}-06-30`,
  };
}

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { data: membership } = useOrganization();
  const orgName = membership?.organization?.name ?? "בית הספר";
  const [firstName, setFirstName] = useState<string>("");

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0=year 1=grades 2=categories 3=done
  const [yearId, setYearId]     = useState<string>("");
  const [createdYearName, setCreatedYearName] = useState("");

  // Step 0 — school year form
  const defs = SmartDefaults();
  const [yName, setYName]   = useState(defs.name);
  const [yStart, setYStart] = useState(defs.start);
  const [yEnd, setYEnd]     = useState(defs.end);
  const [yPct, setYPct]     = useState("85");
  const createYear = useCreateSchoolYear();

  // Step 1 — grades
  const [selLetter, setSelLetter] = useState("");
  const [gradeCount, setGradeCount] = useState("0");
  const addGrade = useAddGrade();
  const { data: grades = [] } = useGrades(yearId || undefined);

  // Step 2 — categories
  const [catSrc, setCatSrc] = useState<BudgetSource>("gefen");
  const [catCustom, setCatCustom] = useState("");
  const addCategory = useAddBudgetCategory();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const full = data.user?.user_metadata?.full_name as string | undefined;
      setFirstName((full ?? "").split(" ")[0] || "");
    });
  }, []);

  // ── Step handlers ─────────────────────────────────────────────────────────

  const handleCreateYear = async () => {
    if (!yName || !yStart || !yEnd) return;
    const id = await createYear.mutateAsync({
      name: yName, start_date: yStart, end_date: yEnd,
      collection_percentage: Number(yPct),
    });
    setYearId(id);
    setCreatedYearName(yName);
    setStep(1);
  };

  const handleAddGrade = async () => {
    if (!selLetter || !yearId) return;
    await addGrade.mutateAsync({
      name: `שכבה ${selLetter}'`,
      student_count: Number(gradeCount),
      yearId,
    });
    setSelLetter("");
    setGradeCount("0");
  };

  const handleAddCatSuggestion = async (name: string) => {
    await addCategory.mutateAsync({ name, source: catSrc, plannedAmount: 0 });
  };

  const handleAddCustomCat = async () => {
    if (!catCustom.trim()) return;
    await addCategory.mutateAsync({ name: catCustom.trim(), source: catSrc, plannedAmount: 0 });
    setCatCustom("");
  };

  // ── Shared UI pieces ──────────────────────────────────────────────────────

  const STEP_LABELS = ["שנת לימודים","שכבות","קטגוריות","סיום"];
  const progress = [0,1,2,3].indexOf(step);
  const pct = ((progress) / 3) * 100;

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "10px 13px", border: "1.5px solid #E8E2D9",
    borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif",
    background: "#FAFAF8", color: "#1A1A1A", outline: "none", boxSizing: "border-box",
  };

  const greeting = firstName ? `ברוכים הבאים, ${firstName}!` : "ברוכים הבאים!";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>

      {/* ── Header card ── */}
      <div style={{
        background: "linear-gradient(135deg, #2D6644 0%, #1A3D2B 55%, #0D2118 100%)",
        borderRadius: "20px 20px 0 0", padding: "28px 36px 24px",
        color: "#fff", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-40px", left: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
            <div style={{ width: "30px", height: "30px", background: "rgba(255,255,255,0.12)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 36 36" fill="none">
                <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/><circle cx="24" cy="14" r="5.5" fill="#5AA674"/><circle cx="18" cy="23" r="5.5" fill="#4A8C62"/>
              </svg>
            </div>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>הכרם · {orgName}</span>
          </div>

          <div style={{ fontSize: "24px", fontWeight: "300", letterSpacing: "-0.6px", marginBottom: "4px" }}>
            {step === 3 ? "הכל מוכן!" : greeting}
          </div>
          <div style={{ fontSize: "13.5px", color: "rgba(255,255,255,0.6)" }}>
            {step === 0 && "נגדיר את שנת הלימודים שלך יחד — שלב שלב"}
            {step === 1 && `✓ שנת הלימודים "${createdYearName}" נוצרה ואופעלה! עכשיו נוסיף שכבות.`}
            {step === 2 && `✓ השכבות הוגדרו! עכשיו נגדיר קטגוריות תקציב.`}
            {step === 3 && "לוח הבקרה שלך מוכן ועובד. בואי נתחיל!"}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              {STEP_LABELS.map((label, i) => (
                <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: i < progress ? "#4DC483" : i === progress ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.4s",
                    boxShadow: i === progress ? "0 0 0 3px rgba(255,255,255,0.25)" : "none",
                  }}>
                    {i < progress ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#1A3D2B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <span style={{ fontSize: "11px", fontWeight: "600", color: i === progress ? "#1A3D2B" : "rgba(255,255,255,0.5)" }}>{i + 1}</span>
                    )}
                  </div>
                  <span style={{ fontSize: "10px", color: i <= progress ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#7EE8A6,#4DC483)", borderRadius: "99px", transition: "width 0.6s ease" }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Step body card ── */}
      <div style={{
        background: "#fff", border: "1px solid #E8E2D9", borderTop: "none",
        borderRadius: "0 0 20px 20px", padding: "32px 36px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      }}>

        {/* ── STEP 0: Create school year ── */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A", marginBottom: "6px" }}>יצירת שנת הלימודים</div>
            <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "24px", lineHeight: 1.6 }}>
              נתחיל מהבסיס — מה שם שנת הלימודים שתרצי להגדיר?
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>שם שנת הלימודים</label>
                <input style={inputSt} value={yName} onChange={e => setYName(e.target.value)} placeholder='לדוגמה: תשפ"ח 2027-2028' />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>תאריך התחלה</label>
                  <input style={inputSt} type="date" value={yStart} onChange={e => setYStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>תאריך סיום</label>
                  <input style={inputSt} type="date" value={yEnd} onChange={e => setYEnd(e.target.value)} />
                </div>
              </div>
              <div style={{ maxWidth: "200px" }}>
                <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>יעד גביית הורים (%)</label>
                <input style={inputSt} type="number" min="0" max="100" value={yPct} onChange={e => setYPct(e.target.value)} />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateYear}
              disabled={createYear.isPending || !yName || !yStart || !yEnd}
              style={{
                marginTop: "28px", width: "100%", padding: "14px 0",
                background: (!yName || !yStart || !yEnd) ? "#E8E2D9" : "linear-gradient(135deg,#2D6644,#1A3D2B)",
                color: (!yName || !yStart || !yEnd) ? "#AAA099" : "#fff",
                border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500",
                fontFamily: "Rubik, sans-serif", cursor: (!yName || !yStart || !yEnd) ? "not-allowed" : "pointer",
                boxShadow: (!yName || !yStart || !yEnd) ? "none" : "0 4px 16px rgba(26,61,43,0.3)",
                transition: "all 0.2s",
              }}
            >
              {createYear.isPending ? "יוצר שנה..." : "צור שנת לימודים ←"}
            </button>
          </div>
        )}

        {/* ── STEP 1: Add grades ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A", marginBottom: "6px" }}>הגדרת שכבות</div>
            <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "24px", lineHeight: 1.6 }}>
              בחרי שכבה, הזיני מספר תלמידים ולחצי "הוסף". אפשר להוסיף כמה שתרצי.
            </div>

            {/* Grade chips */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>בחר שכבה</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {GRADE_LETTERS.filter(l => !grades.some(g => g.name === `שכבה ${l}'`)).map(letter => (
                  <button key={letter} type="button"
                    onClick={() => setSelLetter(selLetter === letter ? "" : letter)}
                    style={{
                      width: "46px", height: "46px", borderRadius: "12px",
                      border: selLetter === letter ? "none" : "1.5px solid #E8E2D9",
                      background: selLetter === letter ? "linear-gradient(135deg,#2D6644,#1A3D2B)" : "#FAFAF8",
                      color: selLetter === letter ? "#fff" : "#4A6656",
                      fontSize: "17px", fontFamily: "Rubik, sans-serif",
                      cursor: "pointer", fontWeight: selLetter === letter ? "500" : "400",
                      boxShadow: selLetter === letter ? "0 3px 10px rgba(26,61,43,0.3)" : "none",
                      transition: "all 0.12s",
                    }}>{letter}</button>
                ))}
              </div>
            </div>

            {/* Count + add */}
            {selLetter && (
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "20px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>
                    שכבה {selLetter}' — מספר תלמידים
                  </label>
                  <input style={inputSt} type="number" min="0" value={gradeCount} onChange={e => setGradeCount(e.target.value)} autoFocus />
                </div>
                <button type="button" onClick={handleAddGrade} disabled={addGrade.isPending}
                  style={{ padding: "10px 22px", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer", fontWeight: "500", whiteSpace: "nowrap" }}>
                  {addGrade.isPending ? "..." : "הוסף שכבה"}
                </button>
              </div>
            )}

            {/* Added grades list */}
            {grades.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>שכבות שנוספו ({grades.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {grades.map(g => (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#EDFBF3", border: "1px solid #B6E8C4", borderRadius: "8px", padding: "5px 12px" }}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#2D6644" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span style={{ fontSize: "13px", color: "#1A3D2B", fontWeight: "500" }}>{g.name}</span>
                      <span style={{ fontSize: "11.5px", color: "#4A8C62" }}>{g.student_count} תלמידים</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "28px" }}>
              <button type="button" onClick={() => setStep(2)} style={{ flex: 1, padding: "14px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,61,43,0.3)" }}>
                המשך לקטגוריות ←
              </button>
              {grades.length === 0 && (
                <button type="button" onClick={() => setStep(2)} style={{ padding: "14px 18px", background: "none", color: "#AAA099", border: "1.5px solid #E8E2D9", borderRadius: "12px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                  דלג
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Categories ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A", marginBottom: "6px" }}>קטגוריות תקציב</div>
            <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "20px", lineHeight: 1.6 }}>
              לחצי על הצעות מהירות להוסיף קטגוריות נפוצות, או הקלידי שם מותאם.
            </div>

            {/* Source tabs */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "20px", background: "#F3EEE8", borderRadius: "10px", padding: "4px" }}>
              {(["gefen","iriyah","horim"] as BudgetSource[]).map(src => {
                const c = SRC_CFG[src];
                const active = catSrc === src;
                return (
                  <button key={src} type="button" onClick={() => setCatSrc(src)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: "8px", border: "none", fontSize: "13.5px", fontWeight: active ? "500" : "400", background: active ? c.grad : "transparent", color: active ? "#fff" : c.color, cursor: "pointer", fontFamily: "Rubik, sans-serif", transition: "all 0.15s", boxShadow: active ? "0 2px 8px rgba(0,0,0,0.2)" : "none" }}>
                    {c.label}
                  </button>
                );
              })}
            </div>

            {/* Quick suggestions */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>הצעות מהירות</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                {CAT_SUGGESTIONS[catSrc].map(name => (
                  <button key={name} type="button" onClick={() => handleAddCatSuggestion(name)}
                    style={{ padding: "6px 13px", background: SRC_CFG[catSrc].light, color: SRC_CFG[catSrc].color, border: `1px solid ${SRC_CFG[catSrc].color}30`, borderRadius: "8px", fontSize: "12.5px", fontFamily: "Rubik, sans-serif", cursor: "pointer", fontWeight: "400", transition: "all 0.1s" }}>
                    + {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom cat input */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <input style={{ ...inputSt, flex: 1 }} value={catCustom} onChange={e => setCatCustom(e.target.value)} placeholder="קטגוריה מותאמת אישית..."
                onKeyDown={e => { if (e.key === "Enter") handleAddCustomCat(); }} />
              <button type="button" onClick={handleAddCustomCat} disabled={!catCustom.trim()}
                style={{ padding: "10px 18px", background: catCustom.trim() ? SRC_CFG[catSrc].grad : "#E8E2D9", color: catCustom.trim() ? "#fff" : "#AAA099", border: "none", borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: catCustom.trim() ? "pointer" : "not-allowed", fontWeight: "500" }}>
                הוסף
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "28px" }}>
              <button type="button" onClick={() => setStep(3)} style={{ flex: 1, padding: "14px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,61,43,0.3)" }}>
                סיים הגדרה ←
              </button>
              <button type="button" onClick={() => setStep(3)} style={{ padding: "14px 18px", background: "none", color: "#AAA099", border: "1.5px solid #E8E2D9", borderRadius: "12px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                דלג
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === 3 && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            {/* Big check */}
            <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(135deg,#EDFBF3,#C6E8D0)", border: "2px solid #B6E8C4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M5 16l8 8 14-14" stroke="#2D6644" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div style={{ fontSize: "20px", fontWeight: "500", color: "#1A1A1A", marginBottom: "6px" }}>
              {createdYearName} מוכנה!
            </div>
            <div style={{ fontSize: "14px", color: "#6B6560", marginBottom: "28px", lineHeight: 1.6 }}>
              לוח הבקרה שלך פעיל ומוכן לעבודה.<br/>עכשיו ניתן להתחיל להזין הכנסות והוצאות.
            </div>

            {/* Summary */}
            <div style={{ background: "#F8F5F1", borderRadius: "12px", padding: "16px 20px", marginBottom: "28px", textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: "500", color: "#AAA099", marginBottom: "10px", letterSpacing: "0.05em" }}>מה הוגדר</div>
              {[
                { label: `שנת לימודים: ${createdYearName}`, done: true },
                { label: `${grades.length} שכבות הוגדרו`, done: grades.length > 0 },
                { label: "קטגוריות תקציב — ניתן להוסיף בהגדרות", done: true },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: item.done ? "#EDFBF3" : "#F5F0EA", border: `1px solid ${item.done ? "#B6E8C4" : "#E8E2D9"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {item.done && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#2D6644" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: "13px", color: "#1A1A1A" }}>{item.label}</span>
                </div>
              ))}
            </div>

            <button type="button" onClick={onComplete}
              style={{ width: "100%", padding: "15px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15.5px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", boxShadow: "0 6px 20px rgba(26,61,43,0.35)" }}>
              כניסה ללוח הבקרה →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardSummary();

  // Track whether this session started without a school year
  const wizardTriggered = useRef<boolean | null>(null);
  const [wizardDone, setWizardDone] = useState(false);

  useEffect(() => {
    if (!isLoading && data !== undefined && wizardTriggered.current === null) {
      wizardTriggered.current = !data.schoolYear;
    }
  }, [isLoading, data]);

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

  // Show wizard if session started without a school year and wizard not completed
  if (wizardTriggered.current === true && !wizardDone) {
    return <SetupWizard onComplete={() => setWizardDone(true)} />;
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
