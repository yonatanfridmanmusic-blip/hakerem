import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowDownLeft, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDashboardSummary, type SourceSummary } from "@/hooks/use-dashboard-summary";
import { useOrganization } from "@/hooks/use-organization";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { supabase } from "@/integrations/supabase/client";
import { useCreateSchoolYear } from "@/hooks/use-school-years";
import { useAddGrade, useGrades } from "@/hooks/use-grades";
import { useAddBudgetCategory, useUpdatePlannedAmount, type BudgetSource } from "@/hooks/use-budget-plan";
import { useOrgBudgetSources, useAddBudgetSource, FALLBACK_SOURCES, type OrgBudgetSource } from "@/hooks/use-budget-sources";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardPage,
});

// ─── Source config (colors only) ─────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { color: string; barGradient: string; accentGradient: string }> = {
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
};

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
  const cfg = SOURCE_CONFIG[s.source] ?? { color: "#6B6560", barGradient: "linear-gradient(90deg,#AAA099,#6B6560)", accentGradient: "linear-gradient(90deg,#AAA099,#6B6560)" };
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

type WizardMode = "first" | "new-year";

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
    const { data: sec, error } = await supabase
      .from("parent_sections")
      .insert({ school_year_id: yearId, name: sectionName, order_index: 0, is_active: true })
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
}

function SetupWizard({ onComplete, mode = "first" }: { onComplete: () => void; mode?: WizardMode }) {
  const { data: membership } = useOrganization();
  const orgName = membership?.organization?.name ?? "בית הספר";
  const [firstName, setFirstName] = useState<string>("");

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0=year 1=grades 2=categories 3=done
  const [yearId, setYearId]     = useState<string>("");
  const [createdYearName, setCreatedYearName] = useState("");
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
  const { data: grades = [] } = useGrades(yearId || undefined);
  // Wizard: parent-collection sections defined inline
  const [wizardSections, setWizardSections] = useState<Array<{ name: string }>>([{ name: "שכר לימוד" }]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSecName, setNewSecName] = useState("");
  // wizardGSA[gradeId][sectionIndex] = amountString
  const [wizardGSA, setWizardGSA] = useState<Record<string, Record<number, string>>>({});
  const [editingCell, setEditingCell] = useState<{ gradeId: string; secIdx: number } | null>(null);
  const savingCellRef = useRef(false); // guard against double-save (Enter → blur)

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
  const addCategory = useAddBudgetCategory();
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
    },
  });

  // ── Step handlers ─────────────────────────────────────────────────────────

  const handleCreateYear = async () => {
    if (!yName || !yStart || !yEnd) return;
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

  const saveCellToDb = async (gradeId: string, sectionName: string, amountStr: string | undefined) => {
    if (savingCellRef.current) return;
    savingCellRef.current = true;
    const n = Number(amountStr ?? "");
    if (!amountStr || isNaN(n) || n < 0 || !yearId) {
      setEditingCell(null);
      savingCellRef.current = false;
      return;
    }
    try { await horimAmountMutation.mutateAsync({ yearId, gradeId, amount: n, sectionName }); }
    catch { /* non-blocking */ }
    setEditingCell(null);
    savingCellRef.current = false;
  };

  const handleAddCatSuggestion = async (name: string) => {
    if ((addedCats[effectiveCatSrc] ?? []).some(c => c.name === name)) return;
    const result = await addCategory.mutateAsync({ name, source: effectiveCatSrc, plannedAmount: 0 });
    if (result?.id) {
      setAddedCats(prev => ({ ...prev, [effectiveCatSrc]: [...(prev[effectiveCatSrc] ?? []), { id: result.id, name, amount: 0 }] }));
    }
  };

  const handleAddCustomCat = async () => {
    if (!catCustom.trim()) return;
    const name = catCustom.trim();
    const result = await addCategory.mutateAsync({ name, source: effectiveCatSrc, plannedAmount: 0 });
    if (result?.id) {
      setAddedCats(prev => ({ ...prev, [effectiveCatSrc]: [...(prev[effectiveCatSrc] ?? []), { id: result.id, name, amount: 0 }] }));
    }
    setCatCustom("");
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
    : (firstName ? `ברוכים הבאים, ${firstName}!` : "ברוכים הבאים!");

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
                      onKeyDown={e => { if (e.key === "Enter") handleAddGrade(); }} />
                  </div>
                  <button type="button" onClick={handleAddGrade} disabled={addGrade.isPending}
                    style={{ padding: "10px 22px", background: "linear-gradient(135deg,#2D6644,#1A3D2B)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: "pointer", fontWeight: "500", whiteSpace: "nowrap" }}>
                    {addGrade.isPending ? "..." : "הוסף שכבה"}
                  </button>
                </div>
              </div>
            )}

            {/* Parent-collection sections × grades matrix */}
            {grades.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                {/* Section header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560" }}>
                    סעיפי גביית הורים לפי שכבה
                  </div>
                  {addingSection ? (
                    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                      <input
                        autoFocus value={newSecName}
                        onChange={e => setNewSecName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newSecName.trim()) {
                            setWizardSections(prev => [...prev, { name: newSecName.trim() }]);
                            setNewSecName(""); setAddingSection(false);
                          }
                          if (e.key === "Escape") { setNewSecName(""); setAddingSection(false); }
                        }}
                        placeholder="שם סעיף..."
                        style={{ width: "110px", padding: "4px 9px", border: "1.5px solid #D0DDD4", borderRadius: "7px", fontSize: "12px", fontFamily: "Rubik, sans-serif", outline: "none" }}
                      />
                      <button type="button" onClick={() => {
                        if (newSecName.trim()) setWizardSections(prev => [...prev, { name: newSecName.trim() }]);
                        setNewSecName(""); setAddingSection(false);
                      }} style={{ padding: "4px 10px", background: "#EAF2EC", color: "#2D6644", border: "1px solid #B6E0C0", borderRadius: "7px", fontSize: "12px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                        הוסף
                      </button>
                      <button type="button" onClick={() => { setNewSecName(""); setAddingSection(false); }} style={{ padding: "4px 8px", background: "none", color: "#AAA099", border: "1px solid #E8E2D9", borderRadius: "7px", fontSize: "12px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>ביטול</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingSection(true)}
                      style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", background: "#F9F7F4", color: "#6B6560", border: "1px solid #E8E2D9", borderRadius: "7px", fontSize: "12px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                      + הוסף סעיף
                    </button>
                  )}
                </div>

                {/* Matrix table */}
                <div style={{ border: "1px solid #E8E2D9", borderRadius: "10px", overflow: "hidden" }}>
                  {/* Table header: Grade | Section1 | Section2 | ... | Total */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `140px repeat(${wizardSections.length}, 1fr) 100px`,
                    padding: "8px 14px", background: "#F5F3F0", borderBottom: "1px solid #E8E2D9",
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#AAA099", letterSpacing: "0.04em" }}>שכבה</span>
                    {wizardSections.map((sec, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "3px", justifyContent: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "#AAA099" }}>{sec.name}</span>
                        {wizardSections.length > 1 && (
                          <button type="button" onClick={() => {
                            setWizardSections(prev => prev.filter((_, j) => j !== i));
                            setWizardGSA(prev => {
                              const next = { ...prev };
                              Object.keys(next).forEach(gId => {
                                const updated: Record<number, string> = {};
                                Object.entries(next[gId] ?? {}).forEach(([k, v]) => {
                                  const ki = Number(k);
                                  if (ki < i) updated[ki] = v;
                                  else if (ki > i) updated[ki - 1] = v;
                                });
                                next[gId] = updated;
                              });
                              return next;
                            });
                          }} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0BAB4", padding: "0", display: "flex", lineHeight: 1 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#1A1A1A", textAlign: "center", letterSpacing: "0.04em" }}>סה"כ/תלמיד</span>
                  </div>

                  {/* Grade rows */}
                  {grades.map((g, gIdx) => {
                    const gAmts = wizardGSA[g.id] ?? {};
                    const total = wizardSections.reduce((s, _, i) => s + (Number(gAmts[i]) || 0), 0);
                    return (
                      <div key={g.id} style={{
                        display: "grid",
                        gridTemplateColumns: `140px repeat(${wizardSections.length}, 1fr) 100px`,
                        padding: "10px 14px", alignItems: "center",
                        borderBottom: gIdx < grades.length - 1 ? "1px solid #F3EEE8" : "none",
                        background: "#fff",
                      }}>
                        {/* Grade name */}
                        <div>
                          <div style={{ fontSize: "13px", color: "#1A1A1A", fontWeight: "500" }}>{g.name}</div>
                          <div style={{ fontSize: "11px", color: "#AAA099" }}>{g.student_count} תלמידים</div>
                        </div>

                        {/* Amount cell per section */}
                        {wizardSections.map((sec, secIdx) => (
                          <div key={secIdx} style={{ display: "flex", justifyContent: "center" }}>
                            {editingCell?.gradeId === g.id && editingCell?.secIdx === secIdx ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <span style={{ fontSize: "11px", color: "#8B2F6E", fontWeight: "500" }}>₪</span>
                                <input
                                  autoFocus type="number" min="0"
                                  value={gAmts[secIdx] ?? ""}
                                  onChange={e => setWizardGSA(prev => ({
                                    ...prev,
                                    [g.id]: { ...(prev[g.id] ?? {}), [secIdx]: e.target.value },
                                  }))}
                                  onBlur={() => saveCellToDb(g.id, sec.name, gAmts[secIdx])}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveCellToDb(g.id, sec.name, gAmts[secIdx]);
                                    if (e.key === "Escape") setEditingCell(null);
                                    if (e.key === "Tab") {
                                      e.preventDefault();
                                      saveCellToDb(g.id, sec.name, gAmts[secIdx]);
                                      if (secIdx < wizardSections.length - 1) setEditingCell({ gradeId: g.id, secIdx: secIdx + 1 });
                                      else if (gIdx < grades.length - 1) setEditingCell({ gradeId: grades[gIdx + 1].id, secIdx: 0 });
                                    }
                                  }}
                                  style={{
                                    width: "62px", padding: "3px 6px",
                                    border: "1.5px solid #C080A8", borderRadius: "6px",
                                    fontSize: "12px", fontFamily: "Rubik, sans-serif",
                                    direction: "ltr", textAlign: "right", outline: "none",
                                  }}
                                />
                              </div>
                            ) : (
                              <div
                                onClick={() => setEditingCell({ gradeId: g.id, secIdx })}
                                title="לחץ/י לעריכה"
                                onMouseEnter={e => { e.currentTarget.style.background = "#F0E0ED"; e.currentTarget.style.borderColor = "#B060A0"; }}
                                onMouseLeave={e => {
                                  const hv = gAmts[secIdx] && Number(gAmts[secIdx]) > 0;
                                  e.currentTarget.style.background = hv ? "#FAF0F8" : "#FCF7FB";
                                  e.currentTarget.style.borderColor = hv ? "#DDB8D4" : "#D4B8CC";
                                }}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "4px",
                                  padding: "5px 9px", borderRadius: "7px", cursor: "pointer",
                                  border: gAmts[secIdx] && Number(gAmts[secIdx]) > 0
                                    ? "1px solid #DDB8D4" : "1.5px dashed #D4B8CC",
                                  background: gAmts[secIdx] && Number(gAmts[secIdx]) > 0
                                    ? "#FAF0F8" : "#FCF7FB",
                                  minWidth: "68px", justifyContent: "center", transition: "all 0.12s",
                                }}
                              >
                                <span style={{ fontSize: "11px", color: "#8B2F6E", fontWeight: "500" }}>₪</span>
                                {gAmts[secIdx] && Number(gAmts[secIdx]) > 0 ? (
                                  <span style={{ fontSize: "12px", fontWeight: "500", color: "#8B2F6E" }}>
                                    {Number(gAmts[secIdx]).toLocaleString("he-IL")}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "11px", color: "#C0A0BE", fontStyle: "italic" }}>הגדר</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Total */}
                        <div style={{ textAlign: "center" }}>
                          {total > 0 ? (
                            <>
                              <div style={{ fontSize: "13px", fontWeight: "600", color: "#1A1A1A" }}>
                                ₪{total.toLocaleString("he-IL")}
                              </div>
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
                        await addBudgetSource.mutateAsync({ label: newSrcLabel.trim() });
                        setCatSrc(newSrcLabel.trim().toLowerCase().replace(/\s+/g, "_"));
                        setNewSrcLabel(""); setShowAddSrc(false);
                      }
                      if (e.key === "Escape") { setNewSrcLabel(""); setShowAddSrc(false); }
                    }}
                    placeholder="שם מקור..."
                    style={{ width: "100px", padding: "5px 8px", border: "1.5px solid #D0DDD4", borderRadius: "7px", fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none" }} />
                  <button type="button" onClick={async () => {
                    if (!newSrcLabel.trim()) return;
                    await addBudgetSource.mutateAsync({ label: newSrcLabel.trim() });
                    setCatSrc(newSrcLabel.trim().toLowerCase().replace(/\s+/g, "_"));
                    setNewSrcLabel(""); setShowAddSrc(false);
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

                  {/* Added categories list */}
                  {cats.length > 0 && (
                    <div style={{ marginTop: "14px" }}>
                      <div style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", marginBottom: "8px" }}>
                        נוספו ({cats.length}) — לחץ/י על הסכום לעדכון
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
                            <InlineAmountEdit catId={cat.id} current={cat.amount} color={c.color}
                              onSave={async (n) => {
                                await updatePlannedAmount.mutateAsync({ categoryId: cat.id, plannedAmount: n });
                                setAddedCats(prev => ({ ...prev, [effectiveCatSrc]: (prev[effectiveCatSrc] ?? []).map(x => x.id === cat.id ? { ...x, amount: n } : x) }));
                              }} />
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
                  <button type="button" onClick={handleAddCustomCat} disabled={!catCustom.trim()}
                    style={{ padding: "10px 18px", background: catCustom.trim() ? c.grad : "#E8E2D9", color: catCustom.trim() ? "#fff" : "#AAA099", border: "none", borderRadius: "10px", fontSize: "14px", fontFamily: "Rubik, sans-serif", cursor: catCustom.trim() ? "pointer" : "not-allowed", fontWeight: "500" }}>
                    הוסף
                  </button>
                </div>
              );
            })()}

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
                { label: grades.length > 0 ? `${grades.length} שכבות הוגדרו` : "שכבות — ניתן להוסיף בהגדרות", done: grades.length > 0 },
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
  const [wizardTriggered, setWizardTriggered] = useState<boolean | null>(null);
  const [wizardDone, setWizardDone] = useState(false);
  const [showNewYearWizard, setShowNewYearWizard] = useState(false);

  useEffect(() => {
    if (!isLoading && data !== undefined && wizardTriggered === null) {
      setWizardTriggered(!data.schoolYear);
    }
  }, [isLoading, data, wizardTriggered]);

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

  // Show initial wizard (no school year yet)
  if (wizardTriggered === true && !wizardDone) {
    return <SetupWizard onComplete={() => setWizardDone(true)} mode="first" />;
  }

  // Show new-year wizard (triggered from button)
  if (showNewYearWizard) {
    return <SetupWizard onComplete={() => setShowNewYearWizard(false)} mode="new-year" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* Page heading */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
            display: "flex", alignItems: "center", gap: "7px",
            padding: "9px 16px",
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
