import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowDownLeft, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDashboardSummary, type SourceSummary } from "@/hooks/use-dashboard-summary";
import { useOrganization, usePendingMembersCount } from "@/hooks/use-organization";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { supabase } from "@/integrations/supabase/client";
import { useCreateSchoolYear } from "@/hooks/use-school-years";
import { useAddGrade, useDeleteGrade, useGrades } from "@/hooks/use-grades";
import { useAddBudgetCategory, useDeleteBudgetCategory, useUpdatePlannedAmount, type BudgetSource } from "@/hooks/use-budget-plan";
import { useOrgBudgetSources, useAddBudgetSource, FALLBACK_SOURCES, type OrgBudgetSource } from "@/hooks/use-budget-sources";
import { syncHorimBudgetCategory } from "@/hooks/use-horim";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardPage,
});

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { color: string; barGradient: string; accentGradient: string }> = {
  gefen:  { color: "#2D6644", barGradient: "linear-gradient(90deg, #5AA674, #2D6644)", accentGradient: "linear-gradient(90deg, #5AA674, #2D6644)" },
  iriyah: { color: "#B5472A", barGradient: "linear-gradient(90deg, #D46A42, #B5472A)", accentGradient: "linear-gradient(90deg, #D46A42, #9C3A20)" },
  horim:  { color: "#8B2F6E", barGradient: "linear-gradient(90deg, #B04A90, #8B2F6E)", accentGradient: "linear-gradient(90deg, #B04A90, #6E235A)" },
};

// Hero card color themes per source (dark gradient cards matching the main green hero)
const SOURCE_HERO: Record<string, {
  bg: string; glow: string; shadow: string;
  barGradient: string; pctGradient: string;
  subtleText: string; secondaryText: string; tertiaryText: string;
}> = {
  gefen: {
    bg: "linear-gradient(135deg, #2D6644 0%, #1A3D2B 55%, #0D2118 100%)",
    glow: "radial-gradient(ellipse 70% 60% at 20% 10%, rgba(90,166,116,0.18) 0%, transparent 70%)",
    shadow: "0 16px 56px rgba(13,33,24,0.4), 0 1px 0 rgba(255,255,255,0.08) inset",
    barGradient: "linear-gradient(90deg, rgba(255,255,255,0.45), rgba(255,255,255,0.85))",
    pctGradient: "linear-gradient(135deg, #7EE8A6 0%, #4DC483 100%)",
    subtleText: "rgba(122,170,142,0.85)", secondaryText: "#7AAA8E", tertiaryText: "rgba(122,170,142,0.6)",
  },
  iriyah: {
    bg: "linear-gradient(135deg, #B5472A 0%, #7C2C15 55%, #4A1508 100%)",
    glow: "radial-gradient(ellipse 70% 60% at 20% 10%, rgba(212,106,66,0.22) 0%, transparent 70%)",
    shadow: "0 16px 56px rgba(74,21,8,0.4), 0 1px 0 rgba(255,255,255,0.08) inset",
    barGradient: "linear-gradient(90deg, rgba(255,200,160,0.45), rgba(255,200,160,0.85))",
    pctGradient: "linear-gradient(135deg, #F9C09A 0%, #E07040 100%)",
    subtleText: "rgba(212,160,130,0.85)", secondaryText: "#D49070", tertiaryText: "rgba(212,160,130,0.6)",
  },
  horim: {
    bg: "linear-gradient(135deg, #8B2F6E 0%, #5E1F4A 55%, #3A1230 100%)",
    glow: "radial-gradient(ellipse 70% 60% at 20% 10%, rgba(176,74,144,0.22) 0%, transparent 70%)",
    shadow: "0 16px 56px rgba(58,18,48,0.4), 0 1px 0 rgba(255,255,255,0.08) inset",
    barGradient: "linear-gradient(90deg, rgba(220,160,200,0.45), rgba(220,160,200,0.85))",
    pctGradient: "linear-gradient(135deg, #ECA8D8 0%, #C060A0 100%)",
    subtleText: "rgba(200,140,180,0.85)", secondaryText: "#C080A8", tertiaryText: "rgba(200,140,180,0.6)",
  },
  _default: {
    bg: "linear-gradient(135deg, #6B6560 0%, #4A4540 55%, #2E2A28 100%)",
    glow: "radial-gradient(ellipse 70% 60% at 20% 10%, rgba(170,160,153,0.18) 0%, transparent 70%)",
    shadow: "0 16px 56px rgba(46,42,40,0.4), 0 1px 0 rgba(255,255,255,0.08) inset",
    barGradient: "linear-gradient(90deg, rgba(210,205,200,0.45), rgba(210,205,200,0.85))",
    pctGradient: "linear-gradient(135deg, #D4CFC9 0%, #B0A8A0 100%)",
    subtleText: "rgba(180,170,165,0.85)", secondaryText: "#B0A8A0", tertiaryText: "rgba(180,170,165,0.6)",
  },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const animCashBalance = useCountUp(s.cashBalance);
  const animIncome      = useCountUp(s.income);
  const animUsed        = useCountUp(s.used);
  const animPlanned     = useCountUp(s.planned);
  const animBudgetPct   = useAnimatedPct(s.pct, 80);
  const animCashPct     = useAnimatedPct(s.cashPct, 80);

  const cashLabel   = s.isIncomeBased ? (s.source === "horim" ? "יתרה מגבייה" : "יתרה מהכנסות") : "יתרה תקציבית";
  const incomeLabel = s.source === "horim" ? "גבייה" : "הכנסות";

  const displayPct = !s.isIncomeBased && s.planned === 0 && s.used > 0 ? 100 : s.isIncomeBased ? s.cashPct : s.pct;
  void animCashPct;

  const hero = SOURCE_HERO[s.source] ?? SOURCE_HERO["_default"];
  const isOverrun = s.planned > 0 && s.used > s.planned;
  const overrunAmount = isOverrun ? s.used - s.planned : 0;

  return (
    <div
      onClick={() => void navigate({ to: "/budget" })}
      style={{
        background: hero.bg,
        borderRadius: "20px", padding: isMobile ? "24px 20px" : "32px 36px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        flexWrap: "wrap", gap: "24px",
        boxShadow: isOverrun
          ? `${hero.shadow}, 0 0 0 2.5px rgba(239,68,68,0.7), 0 0 32px rgba(239,68,68,0.25)`
          : hero.shadow,
        position: "relative", overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: hero.glow }} />

      {/* Overrun banner — red strip at top of card */}
      {isOverrun && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          background: "linear-gradient(90deg, rgba(220,38,38,0.92), rgba(185,28,28,0.92))",
          padding: "7px 20px", display: "flex", alignItems: "center", gap: "7px",
          zIndex: 2,
        }}>
          <AlertTriangle size={13} color="#FCA5A5" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "12px", fontWeight: "600", color: "#fff", flex: 1 }}>
            חריגה תקציבית — {fmt(overrunAmount)} מעל התקציב המאושר
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,200,200,0.8)" }}>לחץ לפירוט ←</span>
        </div>
      )}

      {/* Left: label + balance + details */}
      <div style={{ position: "relative", marginTop: isOverrun ? "28px" : 0 }}>
        <div style={{ fontSize: "12px", color: hero.subtleText, fontWeight: "500", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>
          {s.label} — {cashLabel}
        </div>
        <div className="num" style={{ fontSize: isMobile ? "36px" : "52px", fontWeight: "300", color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>
          {fmt(animCashBalance)}
        </div>
        <div style={{ marginTop: "12px", fontSize: "13px", color: hero.secondaryText, display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {s.income > 0 && (
            <span>
              <span className="num">{fmt(animIncome)}</span>
              <span style={{ color: hero.tertiaryText, marginRight: "4px" }}> {incomeLabel}</span>
            </span>
          )}
          {s.income > 0 && s.used > 0 && <span style={{ color: hero.tertiaryText }}>·</span>}
          {s.used > 0 && (
            <span>
              <span className="num">{fmt(animUsed)}</span>
              <span style={{ color: hero.tertiaryText, marginRight: "4px" }}> הוצאות</span>
            </span>
          )}
        </div>

        {/* Budget bar */}
        {s.planned > 0 ? (
          <div style={{ marginTop: "18px", minWidth: "220px", maxWidth: "360px" }}>
            <Bar pct={s.pct} gradient={isOverrun ? "linear-gradient(90deg, #F87171, #DC2626)" : hero.barGradient} />
            {isOverrun ? (
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#FCA5A5", display: "flex", alignItems: "center", gap: "5px" }}>
                <span className="num">{fmt(animUsed)}</span>
                <span style={{ color: "rgba(252,165,165,0.6)", margin: "0 2px" }}>מתוך</span>
                <span className="num">{fmt(animPlanned)}</span>
                <span style={{ color: "rgba(252,165,165,0.6)", marginRight: "2px" }}>מתוכנן</span>
              </div>
            ) : (
              <div style={{ marginTop: "6px", fontSize: "12px", color: hero.subtleText }}>
                <span className="num">{fmt(animUsed)}</span>
                <span style={{ color: hero.tertiaryText, margin: "0 4px" }}>מתוך</span>
                <span className="num">{fmt(animPlanned)}</span>
                <span style={{ color: hero.tertiaryText, marginRight: "4px" }}>מתוכנן</span>
              </div>
            )}
          </div>
        ) : s.used > 0 ? (
          <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
            <AlertTriangle size={12} style={{ color: "rgba(255,200,150,0.8)", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "rgba(255,200,150,0.7)" }}>אין תקציב מאושר — יש הוצאות</span>
          </div>
        ) : null}
      </div>

      {/* Right: big pct */}
      <div style={{ textAlign: isMobile ? "right" : "left", position: "relative", width: isMobile ? "100%" : "auto" }}>
        <div className="num" style={{
          fontSize: isMobile ? "40px" : "64px", fontWeight: "200",
          background: hero.pctGradient,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: "-3px", lineHeight: 1,
        }}>
          {s.planned > 0 || s.used > 0 ? `${animBudgetPct}%` : "—"}
        </div>
        <div style={{ fontSize: "11px", color: hero.tertiaryText, marginTop: "4px", textAlign: isMobile ? "right" : "center" }}>
          {s.planned > 0 ? "מהתקציב נוצל" : displayPct > 0 ? "מהתקציב נוצל" : "טרם הוגדר תקציב"}
        </div>
      </div>
    </div>
  );
}

// ─── Budget Alert Banner ──────────────────────────────────────────────────────

function BudgetAlertBanner({ sources }: { sources: SourceSummary[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const overruns = sources.filter(s => s.planned > 0 && s.used > s.planned && !dismissed.has(`over-${s.source}`));
  const warnings = sources.filter(s => s.planned > 0 && s.pct >= 80 && s.used <= s.planned && !dismissed.has(`warn-${s.source}`));

  if (!overruns.length && !warnings.length) return null;

  const dismiss = (key: string) => setDismissed(prev => new Set([...prev, key]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {overruns.map(s => (
        <div key={s.source} style={{
          display: "flex", alignItems: "center", gap: "10px",
          background: "linear-gradient(135deg, #FEF2F2, #FFF5F5)",
          border: "1.5px solid #FECACA", borderRadius: "12px", padding: "12px 16px",
          boxShadow: "0 2px 8px rgba(220,38,38,0.08)",
        }}>
          <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: "13.5px", fontWeight: "600", color: "#991B1B" }}>{s.label}</span>
            <span style={{ fontSize: "13px", color: "#B91C1C", marginRight: "6px" }}>
              {" "}— חריגה של {fmt(s.used - s.planned)} מעל התקציב ({s.pct}%)
            </span>
          </div>
          <Link to="/budget"
            style={{ fontSize: "12px", color: "#DC2626", fontWeight: "600", textDecoration: "none",
              padding: "4px 10px", border: "1px solid #FECACA", borderRadius: "6px",
              background: "#fff", whiteSpace: "nowrap" }}>
            לפירוט ←
          </Link>
          <button onClick={() => dismiss(`over-${s.source}`)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#FECACA", padding: "2px", lineHeight: 1, fontSize: "14px" }}
            title="סגור">✕</button>
        </div>
      ))}
      {warnings.map(s => (
        <div key={s.source} style={{
          display: "flex", alignItems: "center", gap: "10px",
          background: "linear-gradient(135deg, #FFFBEB, #FFFDF5)",
          border: "1.5px solid #FDE68A", borderRadius: "12px", padding: "12px 16px",
          boxShadow: "0 2px 8px rgba(217,119,6,0.08)",
        }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: "13.5px", fontWeight: "600", color: "#92400E" }}>{s.label}</span>
            <span style={{ fontSize: "13px", color: "#B45309", marginRight: "6px" }}>
              {" "}— {s.pct}% מהתקציב נוצל (נותר {fmt(s.planned - s.used)})
            </span>
          </div>
          <Link to="/budget"
            style={{ fontSize: "12px", color: "#D97706", fontWeight: "600", textDecoration: "none",
              padding: "4px 10px", border: "1px solid #FDE68A", borderRadius: "6px",
              background: "#fff", whiteSpace: "nowrap" }}>
            לפירוט ←
          </Link>
          <button onClick={() => dismiss(`warn-${s.source}`)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#FDE68A", padding: "2px", lineHeight: 1, fontSize: "14px" }}
            title="סגור">✕</button>
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: "linear-gradient(135deg, #E8E4DF 0%, #D8D4CE 55%, #C8C4BE 100%)",
      borderRadius: "20px", height: "180px",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

const GRADE_LETTERS = ["א","ב","ג","ד","ה","ו","ז","ח"];

const CAT_SUGGESTIONS: Record<string, string[]> = {
  gefen:  ["ציוד משרדי","ספרי לימוד","ציוד ניקיון","חשמל ומים","תחזוקה","תקשורת"],
  iriyah: ["שכר עובדים","שיפוצים","ריהוט","ציוד טכנולוגי","נסיעות"],
  horim:  ["פעילויות חינוכיות","טיולים","הצגות ואירועים","ציוד ספורט","ימי כיף"],
};

// Derives wizard-card style from an OrgBudgetSource (default or custom)
const WIZARD_GRAD: Record<string, { light: string; grad: string }> = {
  gefen:  { light: "#EDFBF3", grad: "linear-gradient(135deg,#2D6644,#1A3D2B)" },
  iriyah: { light: "#FDF1EA", grad: "linear-gradient(135deg,#B5472A,#7C2E18)" },
  horim:  { light: "#F4EBF2", grad: "linear-gradient(135deg,#8B2F6E,#4A1A38)" },
};
function wizardStyle(src: OrgBudgetSource) {
  const g = WIZARD_GRAD[src.slug] ?? { light: src.bg_color, grad: `linear-gradient(135deg,${src.color},${src.color}CC)` };
  return { label: src.label, color: src.color, light: g.light, grad: g.grad };
}

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

// ─── Inline amount editor (wizard step 2) ────────────────────────────────────

function InlineAmountEdit({ catId, current, color, onSave }: {
  catId: string; current: number; color: string;
  onSave: (n: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(current || ""));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (editing) {
    const save = async () => {
      const n = Number(val);
      if (isNaN(n) || n < 0) { setEditing(false); return; }
      setSaving(true);
      setSaveError(null);
      try {
        await onSave(n);
        setEditing(false);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "שגיאה בשמירה");
      } finally {
        setSaving(false);
      }
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <input autoFocus type="number" min="0" value={val}
            onChange={e => { setVal(e.target.value); setSaveError(null); }}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            style={{ width: "80px", padding: "3px 7px", border: `1.5px solid ${saveError ? "#DC2626" : color}`, borderRadius: "6px", fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none", direction: "ltr", textAlign: "right" }} />
          <button onClick={save} disabled={saving}
            style={{ padding: "3px 8px", borderRadius: "6px", border: "none", background: color, color: "#fff", fontSize: "12px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
            {saving ? "..." : "שמור"}
          </button>
          <button onClick={() => { setEditing(false); setSaveError(null); }}
            style={{ padding: "3px 6px", borderRadius: "6px", border: "1px solid #E8E2D9", background: "#fff", color: "#888", fontSize: "12px", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
            ✕
          </button>
        </div>
        {saveError && (
          <div style={{ fontSize: "11px", color: "#DC2626", fontFamily: "Rubik, sans-serif" }}>
            {saveError}
          </div>
        )}
      </div>
    );
  }

  return (
    <button onClick={() => { setVal(String(current || "")); setEditing(true); }}
      style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", color: current > 0 ? color : "#AAA099", fontSize: "12.5px", fontFamily: "Rubik, sans-serif", fontWeight: current > 0 ? "500" : "400" }}>
      {current > 0 ? `₪${current.toLocaleString("he-IL")}` : "הוסף סכום"}
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M1 9l2 2 8-8" stroke="none"/><path d="M8 1l3 3-7 7H1V8l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );
}

type WizardMode = "first" | "new-year" | "edit";

// Helper: ensure named parent section exists + upsert grade_section_amount
async function setGradeHorimAmount(
  yearId: string, gradeId: string, amountPerStudent: number,
  sectionName = "שכר לימוד",
) {
  const { data: existing } = await supabase
    .from("parent_sections")
    .select("id")
    .eq("school_year_id", yearId)
    .eq("name", sectionName)
    .limit(1);

  let sectionId: string;
  if (existing && existing.length > 0) {
    sectionId = existing[0].id;
  } else {
    // Use upsert so concurrent calls don't create duplicate sections
    // (UNIQUE constraint on school_year_id, name)
    const { data: sec, error } = await supabase
      .from("parent_sections")
      .upsert(
        { school_year_id: yearId, name: sectionName, order_index: 0, is_active: true },
        { onConflict: "school_year_id,name", ignoreDuplicates: false },
      )
      .select("id").single();
    if (error) throw error;
    sectionId = sec.id;
  }

  const { data: gsa } = await supabase
    .from("grade_section_amounts")
    .select("id")
    .eq("grade_id", gradeId)
    .eq("parent_section_id", sectionId)
    .maybeSingle();

  if (gsa) {
    await supabase.from("grade_section_amounts").update({ amount_per_student: amountPerStudent }).eq("id", gsa.id);
  } else {
    await supabase.from("grade_section_amounts").insert({
      school_year_id: yearId, grade_id: gradeId, parent_section_id: sectionId,
      amount_per_student: amountPerStudent, working_budget_basis: "p85",
    });
  }

  // Sync budget_category planned amount for this horim section
  await syncHorimBudgetCategory(yearId, sectionId, sectionName);
}

function SetupWizard({ onComplete, mode = "first", existingSchoolYear }: {
  onComplete: () => void;
  mode?: WizardMode;
  existingSchoolYear?: { id: string; name: string };
}) {
  const isMobile = useIsMobile();
  const { data: membership } = useOrganization();
  const orgName = membership?.organization?.name ?? "בית הספר";
  const [firstName, setFirstName] = useState<string>("");

  // ── Wizard state ──────────────────────────────────────────────────────────
  // If we have an existing school year (user closed mid-wizard and returned),
  // start at step 1 (grades) so they don't have to re-enter the year.
  const [step, setStep] = useState<0 | 1 | 2 | 3>(existingSchoolYear ? 1 : 0);
  const [yearId, setYearId]     = useState<string>(existingSchoolYear?.id ?? "");
  const [createdYearName, setCreatedYearName] = useState(existingSchoolYear?.name ?? "");
  const [wizardError, setWizardError] = useState<string | null>(null);

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
  const deleteGrade = useDeleteGrade();
  const { data: grades = [] } = useGrades(yearId || undefined);
  // Sort grades by Hebrew letter order (א, ב, ג, ד...)
  const sortedGrades = [...grades].sort((a, b) => {
    const letterOf = (name: string) => name.replace(/^שכבה /, "").replace(/['"]/g, "").trim();
    return GRADE_LETTERS.indexOf(letterOf(a.name)) - GRADE_LETTERS.indexOf(letterOf(b.name));
  });
  // fill-all: secIdx → fill value being typed
  const [fillAllState, setFillAllState] = useState<{ secIdx: number; value: string } | null>(null);
  // Wizard: parent-collection sections defined inline
  const [wizardSections, setWizardSections] = useState<Array<{ name: string }>>([{ name: "שכר לימוד" }]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSecName, setNewSecName] = useState("");
  // wizardGSA[gradeId][sectionIndex] = amountString | "na" (not applicable)
  const [wizardGSA, setWizardGSA] = useState<Record<string, Record<number, string>>>({});
  const [editingCell, setEditingCell] = useState<{ gradeId: string; secIdx: number } | null>(null);
  // Horim wizard: which grades each section applies to ('all' | gradeId[])
  const [wizardSectionGrades, setWizardSectionGrades] = useState<Record<number, 'all' | string[]>>({});
  // Horim wizard: default amount per section (pre-populates all applicable grades in View B)
  const [wizardSectionDefaults, setWizardSectionDefaults] = useState<Record<number, string>>({});
  // Horim wizard view: 'sections' = define sections+grades, 'amounts' = enter per-grade amounts
  const [horimView, setHorimView] = useState<'sections' | 'amounts'>('sections');
  const savingCellRef = useRef(false); // guard against double-save (Enter → blur)
  const cellInputRef = useRef<HTMLInputElement>(null); // for reliable focus on cell edit

  // Reliable focus whenever editingCell changes
  useEffect(() => {
    if (!editingCell) return;
    requestAnimationFrame(() => {
      cellInputRef.current?.focus();
      cellInputRef.current?.select();
    });
  }, [editingCell?.gradeId, editingCell?.secIdx]);

  // Org sources (loaded dynamically — wizard shows ALL sources including custom)
  const { data: orgSources = FALLBACK_SOURCES } = useOrgBudgetSources();
  const addBudgetSource = useAddBudgetSource();

  // Step 2 — categories
  const [catSrc, setCatSrc] = useState<string>("");
  // Effective source: use selected if valid, else first org source
  const effectiveCatSrc = catSrc && orgSources.some(s => s.slug === catSrc) ? catSrc : (orgSources[0]?.slug ?? "gefen");
  const [catCustom, setCatCustom] = useState("");
  type AddedCat = { id: string; name: string; amount: number };
  const [addedCats, setAddedCats] = useState<Record<string, AddedCat[]>>({});
  // localAmounts: tracks what the user is typing per cat id (string to allow empty while editing)
  const [localAmounts, setLocalAmounts] = useState<Record<string, string>>({});
  const addCategory = useAddBudgetCategory();
  const deleteCategory = useDeleteBudgetCategory();
  const updatePlannedAmount = useUpdatePlannedAmount();

  // "Add source" mini-form (inside wizard step 2)
  const [showAddSrc, setShowAddSrc]     = useState(false);
  const [newSrcLabel, setNewSrcLabel]   = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const full = data.user?.user_metadata?.full_name as string | undefined;
      setFirstName((full ?? "").split(" ")[0] || "");
    });
  }, []);

  // ── Mutation hook wrapping direct Supabase helper ─────────────────────────
  const queryClient = useQueryClient();
  const horimAmountMutation = useMutation({
    mutationFn: ({ yearId: yId, gradeId, amount, sectionName }: { yearId: string; gradeId: string; amount: number; sectionName: string }) =>
      setGradeHorimAmount(yId, gradeId, amount, sectionName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grade-section-amounts"] });
      queryClient.invalidateQueries({ queryKey: ["horim"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories"] });
    },
  });

  // ── Step handlers ─────────────────────────────────────────────────────────

  const handleCreateYear = async () => {
    if (!yName || !yStart || !yEnd) return;
    if (yStart >= yEnd) {
      setWizardError("תאריך הסיום חייב להיות אחרי תאריך ההתחלה");
      return;
    }
    setWizardError(null);
    try {
      const id = await createYear.mutateAsync({
        name: yName, start_date: yStart, end_date: yEnd,
        collection_percentage: Number(yPct),
      });
      setYearId(id);
      setCreatedYearName(yName);
      setStep(1);
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : "שגיאה ביצירת שנת הלימודים. נסה שוב.");
    }
  };

  const handleAddGrade = async () => {
    if (!selLetter || !yearId) return;
    setWizardError(null);
    try {
      await addGrade.mutateAsync({
        name: `שכבה ${selLetter}'`,
        student_count: Number(gradeCount),
        yearId,
      });
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : "שגיאה בהוספת שכבה. נסה שוב.");
    }
    setSelLetter("");
    setGradeCount("0");
  };

  // Draft mode: cell edits stay in local state (wizardGSA) — DB write happens
  // only on "סיים הגדרה" via commitHorimData. This just closes the editing cell.
  const saveCellToDb = async (gradeId: string, _sectionName: string, _amountStr: string | undefined, secIdx?: number) => {
    if (savingCellRef.current) return;
    savingCellRef.current = true;
    setEditingCell(prev =>
      (prev?.gradeId === gradeId && (secIdx === undefined || prev?.secIdx === secIdx)) ? null : prev
    );
    savingCellRef.current = false;
  };

  // ── Draft mode: categories live in localStorage until "סיים הגדרה" commits them to DB ──
  const draftKey = yearId ? `hakerem_wizard_draft_cats_${yearId}` : null;

  // Load draft on mount / when yearId becomes available
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, AddedCat[]>;
        if (parsed && typeof parsed === "object") setAddedCats(parsed);
      }
    } catch { /* corrupt draft — start fresh */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Persist draft on every change
  useEffect(() => {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify(addedCats)); } catch { /* quota */ }
  }, [addedCats, draftKey]);

  const handleAddCatSuggestion = (name: string) => {
    if ((addedCats[effectiveCatSrc] ?? []).some(c => c.name === name)) return;
    setAddedCats(prev => ({ ...prev, [effectiveCatSrc]: [...(prev[effectiveCatSrc] ?? []), { id: crypto.randomUUID(), name, amount: 0 }] }));
  };

  const handleAddCustomCat = () => {
    if (!catCustom.trim()) return;
    const name = catCustom.trim();
    if ((addedCats[effectiveCatSrc] ?? []).some(c => c.name === name)) { setCatCustom(""); return; }
    setAddedCats(prev => ({ ...prev, [effectiveCatSrc]: [...(prev[effectiveCatSrc] ?? []), { id: crypto.randomUUID(), name, amount: 0 }] }));
    setCatCustom("");
  };

  const handleDeleteCat = (catId: string, src: string) => {
    setAddedCats(prev => ({ ...prev, [src]: (prev[src] ?? []).filter(c => c.id !== catId) }));
    setLocalAmounts(prev => { const next = { ...prev }; delete next[catId]; return next; });
  };

  // Commit all draft categories to DB — called by "סיים הגדרה" (and "דלג" if drafts exist)
  const [committingCats, setCommittingCats] = useState(false);
  const commitDraftCats = async (): Promise<boolean> => {
    setCommittingCats(true);
    try {
      // Fetch existing category names for this year to avoid duplicates on re-run
      const { data: existingCats } = await supabase
        .from("budget_categories")
        .select("name, source")
        .eq("school_year_id", yearId);
      const existingKeys = new Set((existingCats ?? []).map(c => `${c.source}::${c.name}`));

      for (const [src, cats] of Object.entries(addedCats)) {
        for (const cat of cats) {
          if (existingKeys.has(`${src}::${cat.name}`)) continue;
          // Latest typed value wins over last-saved value
          const rawVal = localAmounts[cat.id];
          const n = rawVal !== undefined ? Number(rawVal) : cat.amount;
          const amount = !isNaN(n) && n >= 0 ? n : cat.amount;
          await addCategory.mutateAsync({ name: cat.name, source: src, plannedAmount: amount, targetYearId: yearId });
        }
      }
      if (draftKey) localStorage.removeItem(draftKey);
      return true;
    } catch {
      toast.error("שגיאה בשמירת הקטגוריות — נסו/י שוב");
      return false;
    } finally {
      setCommittingCats(false);
    }
  };

  // ── Horim draft: sections/defaults/matrix live in localStorage until commit ──
  const horimDraftKey = yearId ? `hakerem_wizard_draft_horim_${yearId}` : null;

  useEffect(() => {
    if (!horimDraftKey) return;
    try {
      const raw = localStorage.getItem(horimDraftKey);
      if (raw) {
        const p = JSON.parse(raw) as {
          sections?: Array<{ name: string }>;
          sectionGrades?: Record<number, 'all' | string[]>;
          sectionDefaults?: Record<number, string>;
          gsa?: Record<string, Record<number, string>>;
        };
        if (Array.isArray(p.sections) && p.sections.length > 0) setWizardSections(p.sections);
        if (p.sectionGrades) setWizardSectionGrades(p.sectionGrades);
        if (p.sectionDefaults) setWizardSectionDefaults(p.sectionDefaults);
        if (p.gsa) setWizardGSA(p.gsa);
      }
    } catch { /* corrupt draft — start fresh */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horimDraftKey]);

  useEffect(() => {
    if (!horimDraftKey) return;
    try {
      localStorage.setItem(horimDraftKey, JSON.stringify({
        sections: wizardSections, sectionGrades: wizardSectionGrades,
        sectionDefaults: wizardSectionDefaults, gsa: wizardGSA,
      }));
    } catch { /* quota */ }
  }, [horimDraftKey, wizardSections, wizardSectionGrades, wizardSectionDefaults, wizardGSA]);

  // Commit horim sections + per-grade amounts to DB.
  // Falls back to section defaults for applicable grades the user never edited,
  // so data is saved even if the user never opened the amounts matrix.
  const commitHorimData = async () => {
    if (!yearId || wizardSections.length === 0 || sortedGrades.length === 0) return;
    for (const g of sortedGrades) {
      for (let secIdx = 0; secIdx < wizardSections.length; secIdx++) {
        const sg = wizardSectionGrades[secIdx];
        const applicable = !sg || sg === 'all' || (sg as string[]).includes(g.id);
        if (!applicable) continue;
        let val = wizardGSA[g.id]?.[secIdx];
        if (val === "na") continue;
        if (!val) val = wizardSectionDefaults[secIdx]; // default per section
        const n = Number(val);
        if (val && !isNaN(n) && n > 0) {
          try { await setGradeHorimAmount(yearId, g.id, n, wizardSections[secIdx].name); }
          catch { /* non-blocking */ }
        }
      }
    }
    if (horimDraftKey) localStorage.removeItem(horimDraftKey);
    queryClient.invalidateQueries({ queryKey: ["grade-section-amounts"] });
    queryClient.invalidateQueries({ queryKey: ["horim"] });
    queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
    queryClient.invalidateQueries({ queryKey: ["budget-categories"] });
  };

  const handleFillAll = async (secIdx: number, value: string) => {
    const n = Number(value);
    if (!value || isNaN(n) || n < 0 || !yearId) return;
    const sec = wizardSections[secIdx];
    if (!sec) return;
    // Update local state and save to DB for each grade
    const updates: Record<string, Record<number, string>> = {};
    for (const g of grades) {
      updates[g.id] = { ...(wizardGSA[g.id] ?? {}), [secIdx]: value };
      await saveCellToDb(g.id, sec.name, value, secIdx);
    }
    setWizardGSA(prev => {
      const next = { ...prev };
      for (const g of grades) {
        next[g.id] = { ...(next[g.id] ?? {}), [secIdx]: value };
      }
      return next;
    });
    setFillAllState(null);
  };

  // Save all filled horim cells to DB, then advance to step 3
  // Unified finish — ALWAYS commits both draft categories AND horim data,
  // no matter which tab's finish button was clicked. Fixes the bug where
  // horim data was silently dropped when finishing from a non-horim tab.
  const handleFinishWizardStep2 = async () => {
    setEditingCell(null);
    const ok = await commitDraftCats();
    if (!ok) return;
    await commitHorimData();
    setStep(3);
  };

  const handleFinishHorimWizard = handleFinishWizardStep2;

  // Apply grade applicability: mark non-applicable grade×section combos as "na"
  const handleSectionsToAmounts = () => {
    setWizardGSA(prev => {
      const next = { ...prev };
      sortedGrades.forEach(g => {
        wizardSections.forEach((_, secIdx) => {
          const sg = wizardSectionGrades[secIdx];
          const isAll = !sg || sg === 'all';
          const applicable = isAll ? true : (sg as string[]).includes(g.id);
          if (!applicable) {
            next[g.id] = { ...(next[g.id] ?? {}), [secIdx]: "na" };
          } else {
            // Pre-populate with section default if cell not yet filled
            const def = wizardSectionDefaults[secIdx];
            if (def && !next[g.id]?.[secIdx]) {
              next[g.id] = { ...(next[g.id] ?? {}), [secIdx]: def };
            }
          }
        });
      });
      return next;
    });
    setHorimView('amounts');
  };

  // ── Shared UI pieces ──────────────────────────────────────────────────────

  const STEP_LABELS = ["שנת לימודים","שכבות","קטגוריות","סיום"];
  const progress = [0,1,2,3].indexOf(step);
  const pct = ((progress) / 3) * 100;
  // On the "done" step (3), all dots should show as completed (green check)
  const dotDone = (i: number) => step === 3 || i < progress;
  const dotActive = (i: number) => step !== 3 && i === progress;

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "10px 13px", border: "1.5px solid #E8E2D9",
    borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif",
    background: "#FAFAF8", color: "#1A1A1A", outline: "none", boxSizing: "border-box",
  };

  const greeting = mode === "new-year"
    ? (firstName ? `${firstName}, מתחילים שנה חדשה!` : "מתחילים שנה חדשה!")
    : mode === "edit"
    ? (firstName ? `${firstName}, עריכת הגדרות השנה` : "עריכת הגדרות השנה")
    : (firstName ? `ברוכים הבאים, ${firstName}!` : "ברוכים הבאים!");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "680px", margin: isMobile ? "0 16px" : "0 auto" }}>

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
            {step === 3 ? (mode === "new-year" ? "השנה החדשה מוכנה!" : "הכל מוכן!") : greeting}
          </div>
          <div style={{ fontSize: "13.5px", color: "rgba(255,255,255,0.6)" }}>
            {step === 0 && (mode === "new-year" ? "איזה כיף לפתוח שנה חדשה ביחד — נתחיל?" : "נגדיר את שנת הלימודים שלך יחד — שלב שלב")}
            {step === 1 && `✓ שנת הלימודים "${createdYearName}" נוצרה! עכשיו נוסיף שכבות.`}
            {step === 2 && `✓ השכבות הוגדרו! עכשיו נגדיר קטגוריות תקציב.`}
            {step === 3 && (mode === "new-year" ? "השנה החדשה פעילה ומחכה להוצאות ראשונות!" : "לוח הבקרה שלך פעיל ומוכן לעבודה. בואו נתחיל!")}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              {STEP_LABELS.map((label, i) => (
                <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: dotDone(i) ? "#4DC483" : dotActive(i) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.4s",
                    boxShadow: dotActive(i) ? "0 0 0 3px rgba(255,255,255,0.25)" : "none",
                  }}>
                    {dotDone(i) ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#1A3D2B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <span style={{ fontSize: "11px", fontWeight: "600", color: dotActive(i) ? "#1A3D2B" : "rgba(255,255,255,0.5)" }}>{i + 1}</span>
                    )}
                  </div>
                  <span style={{ fontSize: "10px", color: (dotDone(i) || i <= progress) ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{label}</span>
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

        {/* ── Global error banner ── */}
        {wizardError && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: "10px", padding: "10px 14px", marginBottom: "20px",
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="7" stroke="#EF4444" strokeWidth="1.4"/>
              <path d="M8 5v3.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="11" r="0.7" fill="#EF4444"/>
            </svg>
            <span style={{ fontSize: "13px", color: "#991B1B" }}>{wizardError}</span>
            <button
              type="button"
              onClick={() => setWizardError(null)}
              style={{ marginRight: "auto", background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}
            >✕</button>
          </div>
        )}

        {/* ── STEP 0: Create school year ── */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A", marginBottom: "6px" }}>יצירת שנת הלימודים</div>
            <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "24px", lineHeight: 1.6 }}>
              נתחיל מהבסיס — מה שם שנת הלימודים שתרצה/י להגדיר?
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
              בחרו שכבה, הזינו מספר תלמידים ולחצו על "הוסף". אפשר להוסיף כמה שרוצים.
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

            {/* Student count + add */}
            {selLetter && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>
                      שכבה {selLetter}' — מספר תלמידים
                    </label>
                    <input style={inputSt} type="number" min="0" value={gradeCount} onChange={e => setGradeCount(e.target.value)} autoFocus
                      onFocus={e => e.target.select()}
                      onKeyDown={e => { if (e.key === "Enter") handleAddGrade(); }} />
                  </div>
                  <button type="button" onClick={handleAddGrade} disabled={addGrade.isPending}
                    style={{ padding: "10px 22px", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer", fontWeight: "500", whiteSpace: "nowrap" }}>
                    {addGrade.isPending ? "..." : "הוסף שכבה"}
                  </button>
                </div>
              </div>
            )}

            {/* Grades list — simple summary */}
            {sortedGrades.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>שכבות שנוספו</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {sortedGrades.map(g => (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderRadius: "10px", background: "#EDFBF3", border: "1px solid #B6E8C4" }}>
                      <div>
                        <span style={{ fontSize: "13.5px", fontWeight: "500", color: "#1A3D2B" }}>{g.name}</span>
                        <span style={{ fontSize: "12px", color: "#6B9E80", marginRight: "8px" }}> — {g.student_count} תלמידים</span>
                      </div>
                      <button type="button" onClick={async () => { try { await deleteGrade.mutateAsync(g.id); } catch { toast.error("שגיאה במחיקת השכבה"); } }} title="הסר שכבה"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#C0D8C0", padding: "2px", fontSize: "13px" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#E57373")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#C0D8C0")}
                      >✕</button>
                    </div>
                  ))}
                </div>

              </div>
            )}
            <div style={{ display: "flex", gap: "10px", marginTop: "28px" }}>
              <button type="button" onClick={() => setStep(2)} style={{ flex: 1, padding: "14px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,61,43,0.3)" }}>
                המשך לקטגוריות ←
              </button>
              <button type="button" onClick={() => setStep(0)} style={{ padding: "14px 18px", background: "none", color: "#6B6560", border: "1.5px solid #E8E2D9", borderRadius: "12px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                → חזור
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Categories ── */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>קטגוריות תקציב</div>
              <button type="button" onClick={() => setStep(1)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6560", fontSize: "13px", fontFamily: "Rubik, sans-serif", display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px" }}>
                → חזור לשכבות
              </button>
            </div>
            <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "20px", lineHeight: 1.6 }}>
              לחצו על הצעות מהירות להוסיף קטגוריות נפוצות, או הקלידו שם מותאם.
            </div>

            {/* Source tabs — all org sources */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "20px", background: "#F3EEE8", borderRadius: "10px", padding: "4px", flexWrap: "wrap" }}>
              {orgSources.map(src => {
                const c = wizardStyle(src);
                const active = effectiveCatSrc === src.slug;
                return (
                  <button key={src.slug} type="button" onClick={() => setCatSrc(src.slug)}
                    style={{ flex: 1, minWidth: "72px", padding: "8px 0", borderRadius: "8px", border: "none", fontSize: "13.5px", fontWeight: active ? "500" : "400", background: active ? c.grad : "transparent", color: active ? "#fff" : c.color, cursor: "pointer", fontFamily: "Rubik, sans-serif", transition: "all 0.15s", boxShadow: active ? "0 2px 8px rgba(0,0,0,0.2)" : "none" }}>
                    {c.label}
                  </button>
                );
              })}
              {/* Add new source inline */}
              {showAddSrc ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 6px" }}>
                  <input autoFocus value={newSrcLabel} onChange={e => setNewSrcLabel(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newSrcLabel.trim()) {
                        try {
                          await addBudgetSource.mutateAsync({ label: newSrcLabel.trim() });
                          setCatSrc(newSrcLabel.trim().toLowerCase().replace(/\s+/g, "_"));
                          setNewSrcLabel(""); setShowAddSrc(false);
                        } catch { toast.error("שגיאה בהוספת מקור התקציב"); }
                      }
                      if (e.key === "Escape") { setNewSrcLabel(""); setShowAddSrc(false); }
                    }}
                    placeholder="שם מקור..."
                    style={{ width: "100px", padding: "5px 8px", border: "1.5px solid #D0DDD4", borderRadius: "7px", fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none" }} />
                  <button type="button" onClick={async () => {
                    if (!newSrcLabel.trim()) return;
                    try {
                      await addBudgetSource.mutateAsync({ label: newSrcLabel.trim() });
                      setCatSrc(newSrcLabel.trim().toLowerCase().replace(/\s+/g, "_"));
                      setNewSrcLabel(""); setShowAddSrc(false);
                    } catch { toast.error("שגיאה בהוספת מקור התקציב"); }
                  }} style={{ padding: "5px 10px", background: "#2D6644", color: "#fff", border: "none", borderRadius: "7px", fontSize: "12px", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
                    הוסף
                  </button>
                  <button type="button" onClick={() => { setNewSrcLabel(""); setShowAddSrc(false); }}
                    style={{ padding: "5px 8px", background: "none", border: "1px solid #D0DDD4", borderRadius: "7px", fontSize: "12px", cursor: "pointer", color: "#888" }}>✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAddSrc(true)}
                  style={{ padding: "8px 12px", borderRadius: "8px", border: "1.5px dashed #C0C8C2", background: "transparent", color: "#7A8A82", fontSize: "13px", cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" }}>
                  + מקור חדש
                </button>
              )}
            </div>

            {effectiveCatSrc === 'horim' ? (
              horimView === 'sections' ? (
                /* ── View A: Define sections + grade applicability ── */
                <div>
                  <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "16px", lineHeight: 1.6 }}>
                    הגדירו את סעיפי הגבייה וסמנו לאילו שכבות כל סעיף מתאים.
                  </div>

                  {/* Quick suggestions */}
                  {CAT_SUGGESTIONS.horim.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>הצעות מהירות</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                        {CAT_SUGGESTIONS.horim.map(name => {
                          const alreadyAdded = wizardSections.some(s => s.name === name);
                          return (
                            <button key={name} type="button"
                              onClick={() => { if (!alreadyAdded) setWizardSections(prev => [...prev, { name }]); }}
                              disabled={alreadyAdded}
                              style={{
                                padding: "6px 13px",
                                background: alreadyAdded ? "#F4EBF2" : "#F4EBF2",
                                color: "#8B2F6E",
                                border: alreadyAdded ? "1.5px solid #D4A0C8" : "1px solid #C080A830",
                                borderRadius: "8px", fontSize: "12.5px", fontFamily: "Rubik, sans-serif",
                                cursor: alreadyAdded ? "default" : "pointer", fontWeight: alreadyAdded ? "500" : "400",
                                transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: "5px",
                              }}>
                              {alreadyAdded
                                ? (<><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#8B2F6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>{name}</>)
                                : `+ ${name}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sections list with grade applicability */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                    {wizardSections.map((sec, i) => {
                      const sg = wizardSectionGrades[i];
                      const isAll = !sg || sg === 'all';
                      return (
                        <div key={i} style={{ background: "#FAF0F8", border: "1px solid #DDB8D4", borderRadius: "12px", padding: "12px 14px" }}>
                          {/* Section name row */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "500", color: "#1A1A1A" }}>{sec.name}</span>
                            <button type="button" onClick={() => {
                              setWizardSections(prev => prev.filter((_, idx) => idx !== i));
                              setWizardSectionGrades(prev => {
                                const next: Record<number, 'all' | string[]> = {};
                                Object.entries(prev).forEach(([k, v]) => {
                                  const ki = Number(k);
                                  if (ki < i) next[ki] = v;
                                  else if (ki > i) next[ki - 1] = v;
                                });
                                return next;
                              });
                              setWizardSectionDefaults(prev => {
                                const next: Record<number, string> = {};
                                Object.entries(prev).forEach(([k, v]) => {
                                  const ki = Number(k);
                                  if (ki < i) next[ki] = v;
                                  else if (ki > i) next[ki - 1] = v;
                                });
                                return next;
                              });
                            }} title="הסר סעיף"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#C0BAB4", fontSize: "13px", padding: "2px" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#E57373")}
                              onMouseLeave={e => (e.currentTarget.style.color = "#C0BAB4")}
                            >✕</button>
                          </div>
                          {/* Grade applicability chips */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <button type="button" onClick={() => setWizardSectionGrades(prev => ({ ...prev, [i]: 'all' }))}
                              style={{
                                padding: "4px 10px", borderRadius: "20px", fontSize: "12px", cursor: "pointer",
                                background: isAll ? "#8B2F6E" : "transparent",
                                color: isAll ? "#fff" : "#8B2F6E",
                                border: "1.5px solid #8B2F6E",
                                fontFamily: "Rubik, sans-serif", fontWeight: "500", transition: "all 0.12s",
                              }}>
                              כל השכבות
                            </button>
                            {sortedGrades.map(g => {
                              const gradeInList = !isAll && (sg as string[]).includes(g.id);
                              const letterOf = (n: string) => n.replace(/^שכבה /, "").replace(/['"]/g, "").trim();
                              return (
                                <button key={g.id} type="button" onClick={() => {
                                  setWizardSectionGrades(prev => {
                                    const cur = prev[i];
                                    // When all grades are selected → isolate to this grade only
                                    if (!cur || cur === 'all') {
                                      return { ...prev, [i]: [g.id] };
                                    }
                                    const curList = [...(cur as string[])];
                                    const toggled = curList.includes(g.id)
                                      ? curList.filter(id => id !== g.id)
                                      : [...curList, g.id];
                                    return { ...prev, [i]: toggled.length === 0 ? 'all' : toggled };
                                  });
                                }}
                                  title={isAll ? "לחץ לבחירת שכבה זו בלבד" : undefined}
                                  style={{
                                    padding: "4px 10px", borderRadius: "20px", fontSize: "12px", cursor: "pointer",
                                    background: gradeInList ? "#8B2F6E" : (isAll ? "transparent" : "transparent"),
                                    color: gradeInList ? "#fff" : "#8B2F6E",
                                    border: `1.5px solid ${gradeInList ? "#8B2F6E" : (isAll ? "#C080A8" : "#8B2F6E")}`,
                                    fontFamily: "Rubik, sans-serif", fontWeight: gradeInList ? "500" : "400",
                                    transition: "all 0.12s", opacity: isAll ? 0.65 : 1,
                                  }}>
                                  {letterOf(g.name)}′
                                </button>
                              );
                            })}
                          </div>
                          {/* Default amount per student for this section */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #EDD8E8" }}>
                            <span style={{ fontSize: "12px", color: "#8B2F6E", fontWeight: "500", whiteSpace: "nowrap" }}>סכום לתלמיד:</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ fontSize: "12px", color: "#8B2F6E" }}>₪</span>
                              <input
                                type="number" min="0"
                                value={wizardSectionDefaults[i] ?? ""}
                                onChange={e => setWizardSectionDefaults(prev => ({ ...prev, [i]: e.target.value }))}
                                onFocus={e => e.target.select()}
                                placeholder="0"
                                style={{ width: "72px", padding: "4px 8px", border: "1.5px solid #C080A8", borderRadius: "7px", fontSize: "13px", fontFamily: "Rubik, sans-serif", direction: "ltr", textAlign: "right", outline: "none", background: "#fff" }}
                              />
                            </div>
                            <span style={{ fontSize: "11px", color: "#B090C0" }}>ניתן לשנות לפי שכבה בשלב הבא</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add section input */}
                  {addingSection ? (
                    <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                      <input autoFocus value={newSecName} onChange={e => setNewSecName(e.target.value)}
                        placeholder="שם הסעיף..."
                        onKeyDown={e => {
                          if (e.key === "Enter" && newSecName.trim()) {
                            setWizardSections(prev => [...prev, { name: newSecName.trim() }]);
                            setNewSecName(""); setAddingSection(false);
                          }
                          if (e.key === "Escape") { setNewSecName(""); setAddingSection(false); }
                        }}
                        style={{ ...inputSt, flex: 1 }} />
                      <button type="button" onClick={() => {
                        if (!newSecName.trim()) return;
                        setWizardSections(prev => [...prev, { name: newSecName.trim() }]);
                        setNewSecName(""); setAddingSection(false);
                      }} style={{ padding: "10px 14px", background: "linear-gradient(135deg,#8B2F6E,#4A1A38)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                        הוסף
                      </button>
                      <button type="button" onClick={() => { setNewSecName(""); setAddingSection(false); }}
                        style={{ padding: "10px 12px", background: "none", border: "1px solid #D0C8C4", borderRadius: "10px", fontSize: "13px", cursor: "pointer", color: "#888" }}>✕</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingSection(true)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", background: "transparent", border: "1.5px dashed #C080A8", borderRadius: "10px", color: "#8B2F6E", fontSize: "13px", cursor: "pointer", fontFamily: "Rubik, sans-serif", marginBottom: "16px" }}>
                      + הוסף סעיף
                    </button>
                  )}

                  {/* Continue button */}
                  <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                    <button type="button" onClick={handleSectionsToAmounts} disabled={wizardSections.length === 0}
                      style={{ flex: 1, padding: "14px 0", background: wizardSections.length > 0 ? "linear-gradient(135deg,#8B2F6E,#4A1A38)" : "#E8E2D9", color: wizardSections.length > 0 ? "#fff" : "#AAA099", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: wizardSections.length > 0 ? "pointer" : "not-allowed", boxShadow: wizardSections.length > 0 ? "0 4px 16px rgba(139,47,110,0.3)" : "none" }}>
                      המשך לסכומות ←
                    </button>
                    {wizardSections.length === 0 && (
                      <button type="button" onClick={() => setStep(3)}
                        style={{ padding: "14px 18px", background: "none", color: "#AAA099", border: "1.5px solid #E8E2D9", borderRadius: "12px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                        דלג
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ── View B: Amounts matrix ── */
                <div>
                  <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "16px", lineHeight: 1.6 }}>
                    הכניסו סכום לתלמיד לפי שכבה וסעיף.
                  </div>

                  {wizardSections.length > 0 && sortedGrades.length > 0 && (
                    <div style={{ overflowX: "auto", marginBottom: "20px", borderRadius: "12px", border: "1px solid #EDD8E8" }}>
                      <div style={{ minWidth: `${120 + wizardSections.length * 100 + 88}px` }}>
                        {/* Header row */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: `120px repeat(${wizardSections.length}, minmax(96px, 1fr)) 88px`,
                          padding: "10px 12px", borderBottom: "2px solid #EDD8E8",
                          background: "#F9F0F7", borderRadius: "10px 10px 0 0",
                        }}>
                          <span style={{ fontSize: "11px", fontWeight: "600", color: "#8B2F6E", letterSpacing: "0.04em" }}>שכבה</span>
                          {wizardSections.map((sec, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                              <span style={{ fontSize: "11px", fontWeight: "600", color: "#8B2F6E", textAlign: "center" }}>{sec.name}</span>
                              {fillAllState?.secIdx === i ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                                  <input
                                    autoFocus type="number" min="0"
                                    value={fillAllState.value}
                                    onChange={e => setFillAllState({ secIdx: i, value: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") handleFillAll(i, fillAllState.value);
                                      if (e.key === "Escape") setFillAllState(null);
                                    }}
                                    onBlur={() => { if (fillAllState.value) handleFillAll(i, fillAllState.value); else setFillAllState(null); }}
                                    style={{ width: "46px", padding: "2px 4px", border: "1.5px solid #C080A8", borderRadius: "5px", fontSize: "11px", fontFamily: "Rubik, sans-serif", direction: "ltr", textAlign: "right", outline: "none" }}
                                  />
                                  <span style={{ fontSize: "9px", color: "#8B2F6E" }}>₪</span>
                                </div>
                              ) : (
                                <button type="button" onClick={() => setFillAllState({ secIdx: i, value: "" })}
                                  title="מלא/י את כל השכבות בסכום זהה"
                                  style={{ fontSize: "9px", color: "#B090C0", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Rubik, sans-serif" }}>
                                  מלא הכל
                                </button>
                              )}
                            </div>
                          ))}
                          <span style={{ fontSize: "11px", fontWeight: "600", color: "#1A1A1A", textAlign: "center", letterSpacing: "0.04em" }}>סה"כ/תלמיד</span>
                        </div>

                        {/* Grade rows */}
                        {sortedGrades.map((g, gIdx) => {
                          const gAmts = wizardGSA[g.id] ?? {};
                          const total = wizardSections.reduce((s, _, idx) => {
                            const v = gAmts[idx];
                            if (!v || v === "na") return s;
                            return s + (Number(v) || 0);
                          }, 0);
                          return (
                            <div key={g.id} style={{
                              display: "grid",
                              gridTemplateColumns: `120px repeat(${wizardSections.length}, minmax(96px, 1fr)) 88px`,
                              padding: "8px 12px", alignItems: "center",
                              borderBottom: gIdx < sortedGrades.length - 1 ? "1px solid #F3EEE8" : "none",
                              background: gIdx % 2 === 0 ? "#fff" : "#FDFCFB",
                            }}>
                              <div>
                                <div style={{ fontSize: "13px", color: "#1A1A1A", fontWeight: "500" }}>{g.name}</div>
                                <div style={{ fontSize: "11px", color: "#AAA099" }}>{g.student_count} תלמידים</div>
                              </div>

                              {wizardSections.map((sec, secIdx) => {
                                const cellVal = gAmts[secIdx];
                                const isNA = cellVal === "na";
                                const isEditing = editingCell?.gradeId === g.id && editingCell?.secIdx === secIdx;
                                const hasValue = !isNA && cellVal && Number(cellVal) > 0;
                                return (
                                  <div key={secIdx} style={{ display: "flex", justifyContent: "center" }}>
                                    {isEditing ? (
                                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                                          <span style={{ fontSize: "11px", color: "#8B2F6E", fontWeight: "500" }}>₪</span>
                                          <input
                                            ref={cellInputRef}
                                            type="number" min="0"
                                            value={isNA ? "" : (cellVal ?? "")}
                                            onFocus={e => e.target.select()}
                                            onChange={e => setWizardGSA(prev => ({
                                              ...prev,
                                              [g.id]: { ...(prev[g.id] ?? {}), [secIdx]: e.target.value },
                                            }))}
                                            onBlur={() => saveCellToDb(g.id, sec.name, gAmts[secIdx], secIdx)}
                                            onKeyDown={e => {
                                              if (e.key === "Enter") saveCellToDb(g.id, sec.name, gAmts[secIdx], secIdx);
                                              if (e.key === "Escape") setEditingCell(null);
                                              if (e.key === "Tab") {
                                                e.preventDefault();
                                                saveCellToDb(g.id, sec.name, gAmts[secIdx], secIdx);
                                                if (secIdx < wizardSections.length - 1) setEditingCell({ gradeId: g.id, secIdx: secIdx + 1 });
                                                else if (gIdx < sortedGrades.length - 1) setEditingCell({ gradeId: sortedGrades[gIdx + 1].id, secIdx: 0 });
                                              }
                                            }}
                                            style={{
                                              width: "58px", padding: "3px 6px",
                                              border: "1.5px solid #C080A8", borderRadius: "6px",
                                              fontSize: "12px", fontFamily: "Rubik, sans-serif",
                                              direction: "ltr", textAlign: "right", outline: "none",
                                            }}
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onMouseDown={e => {
                                            e.preventDefault();
                                            setWizardGSA(prev => ({
                                              ...prev,
                                              [g.id]: { ...(prev[g.id] ?? {}), [secIdx]: "na" },
                                            }));
                                            saveCellToDb(g.id, sec.name, "na", secIdx);
                                          }}
                                          style={{ fontSize: "10px", color: "#B0A8A4", background: "none", border: "none", cursor: "pointer", padding: "0", lineHeight: 1.2, fontFamily: "Rubik, sans-serif" }}
                                        >לא רלוונטי</button>
                                      </div>
                                    ) : isNA ? (
                                      <div
                                        onClick={() => {
                                          setWizardGSA(prev => ({ ...prev, [g.id]: { ...(prev[g.id] ?? {}), [secIdx]: "" } }));
                                          setEditingCell({ gradeId: g.id, secIdx });
                                        }}
                                        title="לחץ/י לעריכה"
                                        style={{
                                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                                          padding: "5px 10px", borderRadius: "7px", cursor: "pointer",
                                          border: "1px dashed #DDD8D4", background: "#F8F6F3",
                                          minWidth: "64px", transition: "all 0.12s",
                                        }}
                                      >
                                        <span style={{ fontSize: "12px", color: "#CCC4BC" }}>—</span>
                                      </div>
                                    ) : (
                                      <div
                                        onClick={() => setEditingCell({ gradeId: g.id, secIdx })}
                                        title="לחץ/י לעריכה"
                                        onMouseEnter={e => { e.currentTarget.style.background = "#F0E0ED"; (e.currentTarget.style as CSSStyleDeclaration).borderColor = "#B060A0"; }}
                                        onMouseLeave={e => {
                                          e.currentTarget.style.background = hasValue ? "#FAF0F8" : "#FCF7FB";
                                          (e.currentTarget.style as CSSStyleDeclaration).borderColor = hasValue ? "#DDB8D4" : "#D4B8CC";
                                        }}
                                        style={{
                                          display: "inline-flex", alignItems: "center", gap: "3px",
                                          padding: "5px 10px", borderRadius: "7px", cursor: "pointer",
                                          border: hasValue ? "1px solid #DDB8D4" : "1.5px dashed #D4B8CC",
                                          background: hasValue ? "#FAF0F8" : "#FCF7FB",
                                          minWidth: "64px", justifyContent: "center", transition: "all 0.12s",
                                        }}
                                      >
                                        {hasValue ? (
                                          <>
                                            <span style={{ fontSize: "10px", color: "#8B2F6E" }}>₪</span>
                                            <span style={{ fontSize: "12px", fontWeight: "600", color: "#8B2F6E" }}>
                                              {Number(cellVal).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                            </span>
                                          </>
                                        ) : (
                                          <span style={{ fontSize: "11px", color: "#C0A0BE", fontStyle: "italic" }}>הגדר</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              <div style={{ textAlign: "center" }}>
                                {total > 0 ? (
                                  <>
                                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#1A1A1A" }}>₪{total.toLocaleString("he-IL")}</div>
                                    <div style={{ fontSize: "10px", color: "#AAA099" }}>לתלמיד</div>
                                  </>
                                ) : (
                                  <span style={{ fontSize: "11px", color: "#C0BAB4" }}>—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                    <button type="button" onClick={handleFinishHorimWizard} style={{ flex: 1, padding: "14px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,61,43,0.3)" }}>
                      סיים הגדרה ←
                    </button>
                    <button type="button" onClick={() => setHorimView('sections')}
                      style={{ padding: "14px 18px", background: "none", color: "#8B2F6E", border: "1.5px solid #C080A8", borderRadius: "12px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                      ← חזור לסעיפים
                    </button>
                  </div>
                </div>
              )
            ) : (
              /* ── Regular categories UI (non-horim sources) ── */
              <>
                {/* Quick suggestions */}
                {(() => {
                  const activeSrc = orgSources.find(s => s.slug === effectiveCatSrc) ?? orgSources[0];
                  const c = activeSrc ? wizardStyle(activeSrc) : { label: effectiveCatSrc, color: "#6B6560", light: "#F5F5F2", grad: "#aaa" };
                  const suggestions = CAT_SUGGESTIONS[effectiveCatSrc] ?? [];
                  const cats = addedCats[effectiveCatSrc] ?? [];
                  return (
                    <div style={{ marginBottom: "16px" }}>
                      {suggestions.length > 0 && (
                        <>
                          <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>הצעות מהירות</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                            {suggestions.map(name => {
                              const added = cats.some(cat => cat.name === name);
                              return (
                                <button key={name} type="button"
                                  onClick={() => handleAddCatSuggestion(name)}
                                  disabled={added || addCategory.isPending}
                                  style={{
                                    padding: "6px 13px",
                                    background: added ? "#EDFBF3" : c.light,
                                    color: added ? "#2D6644" : c.color,
                                    border: added ? "1.5px solid #B6E8C4" : `1px solid ${c.color}30`,
                                    borderRadius: "8px", fontSize: "12.5px", fontFamily: "Rubik, sans-serif",
                                    cursor: added ? "default" : "pointer", fontWeight: added ? "500" : "400",
                                    transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: "5px",
                                    opacity: addCategory.isPending && !added ? 0.6 : 1,
                                  }}>
                                  {added ? (<><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#2D6644" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>{name}</>) : `+ ${name}`}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {cats.length > 0 && (
                        <div style={{ marginTop: "14px" }}>
                          <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>
                            נוספו ({cats.length}) — הזן/י סכום ולחץ/י "שמור"
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {cats.map(cat => (
                              <div key={cat.id} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: c.light, border: `1px solid ${c.color}30`,
                                borderRadius: "9px", padding: "7px 12px",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={c.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  <span style={{ fontSize: "13px", color: c.color, fontWeight: "500" }}>{cat.name}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  {(() => {
                                    // Derived save state — no timers, no flicker:
                                    // dirty  = typed value differs from last-saved amount → show "שמור"
                                    // saved  = value saved and unchanged → show quiet "נשמר" (stays)
                                    const typed = localAmounts[cat.id];
                                    const typedNum = typed !== undefined ? Number(typed) : cat.amount;
                                    const isDirty = typed !== undefined && !isNaN(typedNum) && typedNum !== cat.amount;
                                    const isSaved = !isDirty && cat.amount > 0;
                                    const doSave = () => {
                                      const n = Number(localAmounts[cat.id] ?? cat.amount);
                                      if (!isNaN(n) && n >= 0) {
                                        setAddedCats(prev => ({ ...prev, [effectiveCatSrc]: (prev[effectiveCatSrc] ?? []).map(x => x.id === cat.id ? { ...x, amount: n } : x) }));
                                      }
                                    };
                                    return (
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ fontSize: "12px", color: c.color, fontWeight: "500" }}>₪</span>
                                        <input
                                          type="number" min="0"
                                          value={localAmounts[cat.id] ?? String(cat.amount || "")}
                                          placeholder="0"
                                          onChange={e => setLocalAmounts(prev => ({ ...prev, [cat.id]: e.target.value }))}
                                          onFocus={e => {
                                            if (localAmounts[cat.id] === undefined) {
                                              setLocalAmounts(prev => ({ ...prev, [cat.id]: String(cat.amount || "") }));
                                            }
                                            e.target.select();
                                          }}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") { doSave(); (e.target as HTMLInputElement).blur(); }
                                          }}
                                          style={{ width: "72px", padding: "4px 8px", border: `1.5px solid ${isDirty ? c.color : "#E8E2D9"}`, borderRadius: "7px", fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none", direction: "ltr", textAlign: "right", background: "#fff", transition: "border-color 0.15s" }}
                                        />
                                        {isDirty ? (
                                          <button
                                            type="button"
                                            onClick={doSave}
                                            style={{ padding: "4px 14px", borderRadius: "7px", border: "none", background: c.color, color: "#fff", fontSize: "12.5px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}
                                          >
                                            שמור
                                          </button>
                                        ) : isSaved ? (
                                          <span style={{ padding: "4px 14px", borderRadius: "7px", background: "#EDFBF3", border: "1px solid #B6E8C4", color: "#2D6644", fontSize: "12.5px", fontWeight: "500", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" }}>
                                            נשמר
                                          </span>
                                        ) : (
                                          <span style={{ padding: "4px 14px", borderRadius: "7px", background: "#F5F2EE", border: "1px solid #E8E2D9", color: "#C0BAB4", fontSize: "12.5px", fontWeight: "500", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" }}>
                                            שמור
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <button type="button" onClick={() => handleDeleteCat(cat.id, effectiveCatSrc)}
                                    title="הסר קטגוריה"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#C0BAB4", padding: "2px", fontSize: "14px", lineHeight: 1 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#E57373")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "#C0BAB4")}
                                  >✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Custom cat input */}
                {(() => {
                  const activeSrc = orgSources.find(s => s.slug === effectiveCatSrc) ?? orgSources[0];
                  const c = activeSrc ? wizardStyle(activeSrc) : { grad: "#aaa" };
                  return (
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                      <input style={{ ...inputSt, flex: 1 }} value={catCustom} onChange={e => setCatCustom(e.target.value)}
                        placeholder="קטגוריה מותאמת אישית..." onKeyDown={e => { if (e.key === "Enter") handleAddCustomCat(); }} />
                      <button type="button" onClick={handleAddCustomCat} disabled={!catCustom.trim() || addCategory.isPending}
                        style={{ padding: "10px 18px", background: (catCustom.trim() && !addCategory.isPending) ? c.grad : "#E8E2D9", color: (catCustom.trim() && !addCategory.isPending) ? "#fff" : "#AAA099", border: "none", borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: (catCustom.trim() && !addCategory.isPending) ? "pointer" : "not-allowed", fontWeight: "500" }}>
                        {addCategory.isPending ? "..." : "הוסף"}
                      </button>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: "10px", marginTop: "28px" }}>
                  <button type="button" disabled={committingCats} onClick={handleFinishWizardStep2} style={{ flex: 1, padding: "14px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: committingCats ? "wait" : "pointer", opacity: committingCats ? 0.7 : 1, boxShadow: "0 4px 16px rgba(26,61,43,0.3)" }}>
                    {committingCats ? "שומר..." : "סיים הגדרה ←"}
                  </button>
                  <button type="button" disabled={committingCats} onClick={handleFinishWizardStep2} style={{ padding: "14px 18px", background: "none", color: "#AAA099", border: "1.5px solid #E8E2D9", borderRadius: "12px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                    דלג
                  </button>
                </div>
              </>
            )}
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
              {mode === "edit" ? "ההגדרות עודכנו!" : `${createdYearName} מוכנה!`}
            </div>
            <div style={{ fontSize: "14px", color: "#6B6560", marginBottom: "28px", lineHeight: 1.6 }}>
              {mode === "edit"
                ? "השינויים נשמרו בהצלחה."
                : <>לוח הבקרה שלך פעיל ומוכן לעבודה.<br/>עכשיו ניתן להתחיל להזין הכנסות והוצאות.</>}
            </div>

            {/* Summary */}
            <div style={{ background: "#F8F5F1", borderRadius: "12px", padding: "16px 20px", marginBottom: "28px", textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: "500", color: "#AAA099", marginBottom: "10px", letterSpacing: "0.05em" }}>מה הוגדר</div>
              {[
                { label: `שנת לימודים: ${createdYearName}`, done: true },
                { label: sortedGrades.length > 0 ? `${sortedGrades.length} שכבות הוגדרו` : "שכבות — ניתן להוסיף בהגדרות", done: sortedGrades.length > 0 },
                { label: (() => { const total = Object.values(addedCats).reduce((s,a) => s + a.length, 0); return total > 0 ? `${total} קטגוריות תקציב נוספו` : "קטגוריות — ניתן להוסיף בהגדרות"; })(), done: Object.values(addedCats).some(a => a.length > 0) },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: item.done ? "#EDFBF3" : "#F5F0EA", border: `1px solid ${item.done ? "#B6E8C4" : "#E8E2D9"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {item.done && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#2D6644" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: "13px", color: "#1A1A1A" }}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* ── Optional bulk import CTA ── */}
            {mode === "first" && (
              <div style={{
                marginBottom: "16px",
                border: "1.5px dashed #D4C9B8",
                borderRadius: "14px",
                padding: "20px",
                background: "#FAFAF8",
                textAlign: "right",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg,#EDF8F2,#D4EDE0)", border: "1px solid #B6DFC8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2D6644" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#1A1A1A", marginBottom: "5px" }}>
                      ייבוא נתונים קיימים
                      <span style={{ marginRight: "8px", fontSize: "11px", fontWeight: "400", color: "#AAA099", background: "#F0EBE4", borderRadius: "99px", padding: "2px 8px" }}>אופציונלי</span>
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#6B6560", lineHeight: 1.6 }}>
                      אם בית הספר כבר פעיל השנה וברשותך חשבוניות קיימות — ניתן לייבא אותן עכשיו בצובר.
                      המערכת תקרא את הפרטים אוטומטית ותציע קטגוריה לכל קובץ.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem("openBulkImport", "1");
                        onComplete();
                      }}
                      style={{
                        marginTop: "12px",
                        padding: "8px 16px", border: "1.5px solid #2D6644", borderRadius: "8px",
                        background: "#fff", color: "#2D6644", fontSize: "13px", fontWeight: "500",
                        cursor: "pointer", fontFamily: "Rubik, sans-serif",
                        display: "inline-flex", alignItems: "center", gap: "6px",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      פתח ייבוא מסמכים
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button type="button" onClick={onComplete}
              style={{ width: "100%", padding: "15px 0", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15.5px", fontWeight: "500", fontFamily: "Rubik, sans-serif", cursor: "pointer", boxShadow: "0 6px 20px rgba(26,61,43,0.35)" }}>
              {mode === "edit" ? "חזרה ללוח הבקרה →" : "כניסה ללוח הבקרה →"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Setup Completion Banner ──────────────────────────────────────────────────

function SetupCompletionBanner() {
  const { data: membership } = useOrganization();
  const [dismissed, setDismissed] = useState(false);

  const isOwner = membership?.role === "owner";
  const setupDone = !!membership?.organization?.setup_completed_at;

  if (!isOwner || setupDone || dismissed) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
      border: "1.5px solid #F59E0B",
      borderRadius: "14px",
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      gap: "14px",
      fontFamily: "Rubik, sans-serif",
    }}>
      <div style={{
        width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
        background: "#FEF3C7", border: "1px solid #F59E0B",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M3 10l9-7 9 7M5 21V10M19 21V10M9 21v-6h6v6"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: "500", color: "#78350F", marginBottom: "2px" }}>
          הגדרת בית הספר לא הושלמה
        </div>
        <div style={{ fontSize: "12.5px", color: "#92400E", lineHeight: 1.5 }}>
          טרם הגדרת את מקורות התקציב. ייקח רק כמה שניות.
        </div>
      </div>
      <a
        href="/onboarding"
        style={{
          padding: "8px 16px", borderRadius: "9px", flexShrink: 0,
          background: "#B45309", color: "#fff", textDecoration: "none",
          fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap",
        }}
      >
        השלם הגדרה →
      </a>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#B45309", fontSize: "18px", padding: "0 4px",
          lineHeight: 1, flexShrink: 0,
        }}
        aria-label="סגור"
      >
        ×
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useDashboardSummary();
  const { data: membership } = useOrganization();
  const orgId = membership?.organization?.id;
  const isOwner = membership?.role === "owner";
  const { data: pendingMembersCount = 0 } = usePendingMembersCount();

  // Track whether this session started without a school year
  const [wizardTriggered, setWizardTriggered] = useState<boolean | null>(null);
  const [wizardDone, setWizardDone] = useState(false);
  const [showNewYearWizard, setShowNewYearWizard] = useState(false);
  const [showEditWizard, setShowEditWizard] = useState(false);

  // Check if settings page requested to open the edit wizard
  useEffect(() => {
    const flag = localStorage.getItem("hakerem_open_edit_wizard");
    if (flag) {
      localStorage.removeItem("hakerem_open_edit_wizard");
      setShowEditWizard(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && data !== undefined && orgId) {
      // If DB says setup is complete — never show the wizard (works across browsers/incognito)
      if (membership?.organization?.setup_completed_at) {
        setWizardTriggered(false);
        return;
      }
      // Only evaluate localStorage once
      if (wizardTriggered !== null) return;
      const localKey = `hakerem_wizard_done_${orgId}`;
      const isLocallyDone = localStorage.getItem(localKey) === "true";
      setWizardTriggered(!data.schoolYear || !isLocallyDone);
    }
  }, [isLoading, data, wizardTriggered, orgId, membership?.organization?.setup_completed_at]);

  const totals = data?.totals ?? { planned: 0, used: 0, balance: 0, pct: 0 };
  const incomeTotals = data?.incomeTotals ?? { fromIncome: 0, fromParentCollections: 0, grand: 0 };
  const yearName = data?.schoolYear?.name ?? "—";

  // Animations
  const animBalance = useCountUp(incomeTotals.grand - totals.used);
  const animUsed    = useCountUp(totals.used);
  const animPlanned = useCountUp(totals.planned);
  const animPct     = useAnimatedPct(totals.pct, 80);
  const animFromIncome     = useCountUp(incomeTotals.fromIncome);
  const animFromParentColl = useCountUp(incomeTotals.fromParentCollections);

  // Show initial wizard (no school year yet, or wizard not yet completed)
  if (wizardTriggered === true && !wizardDone) {
    return (
      <SetupWizard
        onComplete={async () => {
          if (orgId) {
            localStorage.setItem(`hakerem_wizard_done_${orgId}`, "true");
            // Persist to DB so wizard doesn't re-appear in other browsers/incognito.
            // NOTE: must await — supabase builders are lazy and `void` never executes them.
            try {
              await supabase
                .from("organizations")
                .update({ setup_completed_at: new Date().toISOString() })
                .eq("id", orgId);
              queryClient.invalidateQueries({ queryKey: ["organization"] });
            } catch { /* non-blocking — wizard still closes */ }
          }
          setWizardDone(true);
        }}
        mode="first"
        existingSchoolYear={data?.schoolYear ?? undefined}
      />
    );
  }

  // Show edit wizard (triggered from settings page)
  if (showEditWizard) {
    return (
      <SetupWizard
        onComplete={() => setShowEditWizard(false)}
        mode="edit"
        existingSchoolYear={data?.schoolYear ?? undefined}
      />
    );
  }

  // Show new-year wizard (triggered from button)
  if (showNewYearWizard) {
    return <SetupWizard onComplete={() => setShowNewYearWizard(false)} mode="new-year" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* Page heading */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", gap: isMobile ? "12px" : "0" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>
            לוח בקרה
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099", fontWeight: "400" }}>
            {yearName} — מבט כולל על מצב התקציב
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewYearWizard(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
            padding: "9px 16px",
            width: isMobile ? "100%" : "auto",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            color: "#fff", border: "none", borderRadius: "10px",
            fontSize: "13px", fontWeight: "500", fontFamily: "Rubik, sans-serif",
            cursor: "pointer",
            boxShadow: "0 3px 10px rgba(26,61,43,0.25)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>
            <path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>
          </svg>
          פתח שנת לימודים חדשה
        </button>
      </div>

      {/* Setup completion banner — shown only to owners who haven't finished onboarding */}
      <SetupCompletionBanner />

      {/* Pending team members banner */}
      {isOwner && pendingMembersCount > 0 && (
        <Link
          to="/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "linear-gradient(135deg, #FFF8E6 0%, #FFFDF5 100%)",
            border: "1.5px solid #F59E0B",
            borderRadius: "14px",
            padding: "14px 18px",
            textDecoration: "none",
            boxShadow: "0 2px 10px rgba(245,158,11,0.12)",
            cursor: "pointer",
          }}
        >
          <div style={{
            width: "34px", height: "34px", borderRadius: "10px",
            background: "#FEF3C7",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#92400E" }}>
              {pendingMembersCount === 1
                ? "יש בקשת הצטרפות ממתינה לאישור"
                : `יש ${pendingMembersCount} בקשות הצטרפות ממתינות לאישור`}
            </div>
            <div style={{ fontSize: "12px", color: "#B45309", marginTop: "2px" }}>
              לחץ/י לאישור אנשי הצוות בהגדרות
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: "rotate(180deg)" }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>
      )}

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #2D6644 0%, #1A3D2B 55%, #0D2118 100%)",
        borderRadius: "20px", padding: isMobile ? "24px 20px" : "32px 36px",
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
          <div className="num" style={{ fontSize: isMobile ? "36px" : "52px", fontWeight: "300", color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>
            {isLoading ? "—" : fmt(animBalance)}
          </div>
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#7AAA8E" }}>
            <span className="num">{isLoading ? "—" : fmt(animUsed)}</span>
            <span style={{ color: "rgba(122,170,142,0.6)", marginRight: "5px" }}> הוצאות</span>
          </div>
          <div style={{ marginTop: "5px", fontSize: "12px", color: "rgba(122,170,142,0.6)" }}>
            מתוך תכנון שנתי: <span className="num">{isLoading ? "—" : fmt(animPlanned)}</span>
          </div>
        </div>

        <div style={{ textAlign: isMobile ? "right" : "left", position: "relative", width: isMobile ? "100%" : "auto" }}>
          <div className="num" style={{
            fontSize: isMobile ? "40px" : "64px", fontWeight: "200",
            background: "linear-gradient(135deg, #7EE8A6 0%, #4DC483 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-3px", lineHeight: 1,
          }}>
            {isLoading ? "—" : `${animPct}%`}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(122,170,142,0.6)", marginTop: "4px", textAlign: isMobile ? "right" : "center" }}>
            מהתקציב נוצל
          </div>
        </div>
      </div>

      {/* Income strip */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
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

      {/* Budget alert banners */}
      {!isLoading && data && <BudgetAlertBanner sources={data.sources} />}

      {/* Source cards — large hero style, one per row */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {isLoading
          ? [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : (data?.sources ?? []).map((s) => <SourceCard key={s.source} s={s} />)
        }
      </div>
    </div>
  );
}
