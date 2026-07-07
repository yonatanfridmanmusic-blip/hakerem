import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Plus, Check, X, Pencil, ChevronDown, Copy, Trash2 } from "lucide-react";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useBudgetPlan,
  useUpdatePlannedAmount,
  useAddBudgetCategory,
  useDeleteBudgetCategory,
  useCopyBudgetCategories,
  type BudgetSource,
  type BudgetCategory,
} from "@/hooks/use-budget-plan";
import { useSchoolYears } from "@/hooks/use-school-years";
import { useOrgBudgetSources, FALLBACK_SOURCES, type OrgBudgetSource } from "@/hooks/use-budget-sources";

export const Route = createFileRoute("/_authenticated/budget/")({
  component: BudgetPage,
});

// ─── Config ───────────────────────────────────────────────────────────────────

interface SrcCfg {
  key: string;
  label: string;
  color: string;
  bg: string;
  textColor: string;
  barGradient: string;
  heroGradient: string;
  heroShadow: string;
}

// Polished styles for the 3 default sources
const SOURCE_STYLE_MAP: Record<string, Omit<SrcCfg, "key" | "label">> = {
  gefen:  { color: "#2D6644", bg: "#EDFBF3", textColor: "#166534", barGradient: "linear-gradient(90deg, #5AA674, #2D6644)", heroGradient: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 55%, #081510 100%)", heroShadow: "0 8px 32px rgba(15,36,25,0.45)" },
  iriyah: { color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010", barGradient: "linear-gradient(90deg, #D46A42, #B5472A)", heroGradient: "linear-gradient(160deg, #7C2E18 0%, #5A1F10 55%, #3A140A 100%)", heroShadow: "0 8px 32px rgba(90,31,16,0.45)" },
  horim:  { color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356", barGradient: "linear-gradient(90deg, #B04A90, #8B2F6E)", heroGradient: "linear-gradient(160deg, #4A1A38 0%, #331228 55%, #1F0B17 100%)", heroShadow: "0 8px 32px rgba(51,18,40,0.45)" },
};

function buildSrcCfg(src: OrgBudgetSource): SrcCfg {
  const known = SOURCE_STYLE_MAP[src.slug];
  if (known) return { key: src.slug, label: src.label, ...known };
  return {
    key: src.slug, label: src.label,
    color: src.color, bg: src.bg_color, textColor: src.color,
    barGradient: `linear-gradient(90deg, ${src.color}88, ${src.color})`,
    heroGradient: `linear-gradient(160deg, ${src.color} 0%, ${src.color}CC 100%)`,
    heroShadow: `0 8px 32px ${src.color}40`,
  };
}

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);

// ─── Year Picker ──────────────────────────────────────────────────────────────

function YearPicker({
  selectedYearId,
  onSelect,
}: {
  selectedYearId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: years = [] } = useSchoolYears();
  const [open, setOpen] = useState(false);

  const selected = years.find((y) => y.id === selectedYearId);
  const activeYear = years.find((y) => y.is_active);

  // Auto-select active year on first load
  useEffect(() => {
    if (!selectedYearId && activeYear) {
      onSelect(activeYear.id);
    }
  }, [activeYear, selectedYearId, onSelect]);

  if (years.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 16px",
          background: "#fff",
          border: "1.5px solid #D4DDD6",
          borderRadius: "10px",
          fontSize: "14px",
          fontWeight: 500,
          color: "#1A1A1A",
          cursor: "pointer",
          fontFamily: "Rubik, sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <span>{selected?.name ?? "בחר שנה"}</span>
        {selected?.is_active && (
          <span
            style={{
              fontSize: "10px",
              background: "#2D6644",
              color: "#fff",
              borderRadius: "20px",
              padding: "1px 7px",
              fontWeight: 600,
            }}
          >
            פעיל
          </span>
        )}
        <ChevronDown size={14} style={{ color: "#7A7470" }} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 20,
              background: "#fff",
              border: "1px solid #E0E8E2",
              borderRadius: "12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
              minWidth: "200px",
              overflow: "hidden",
            }}
          >
            {years.map((y) => (
              <button
                key={y.id}
                onClick={() => {
                  onSelect(y.id);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "11px 16px",
                  background:
                    y.id === selectedYearId ? "#EDFBF3" : "transparent",
                  border: "none",
                  borderBottom: "1px solid #F0F4F1",
                  fontSize: "13.5px",
                  color: y.id === selectedYearId ? "#166534" : "#1A1A1A",
                  cursor: "pointer",
                  fontFamily: "Rubik, sans-serif",
                  textAlign: "right",
                }}
              >
                <span style={{ flex: 1 }}>{y.name}</span>
                {y.is_active && (
                  <span
                    style={{
                      fontSize: "10px",
                      background: "#2D6644",
                      color: "#fff",
                      borderRadius: "20px",
                      padding: "1px 7px",
                      fontWeight: 600,
                    }}
                  >
                    פעיל
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Copy from previous year banner ──────────────────────────────────────────

function CopyFromPreviousYearBanner({
  targetYearId,
  years,
}: {
  targetYearId: string;
  years: ReturnType<typeof useSchoolYears>["data"] & {};
}) {
  const copyMutation = useCopyBudgetCategories();

  // Find the year just before the target (by start_date)
  const sorted = [...years].sort(
    (a, b) =>
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );
  const targetIdx = sorted.findIndex((y) => y.id === targetYearId);
  const prevYear = targetIdx >= 0 ? sorted[targetIdx + 1] : null;

  if (!prevYear) return null;

  const handleCopy = async () => {
    try {
      const count = await copyMutation.mutateAsync({
        fromYearId: prevYear.id,
        toYearId: targetYearId,
      });
      toast.success(`הועתקו ${count} קטגוריות מ-${prevYear.name}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה בהעתקה";
      toast.error(msg);
    }
  };

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #F0F7F3, #E8F4EC)",
        border: "1.5px solid #C0DDC8",
        borderRadius: "14px",
        padding: "18px 22px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{ fontSize: "14px", fontWeight: 600, color: "#1A3D2B", marginBottom: "3px" }}
        >
          שנה חדשה — אין קטגוריות עדיין
        </div>
        <div style={{ fontSize: "13px", color: "#4A6656" }}>
          העתק את כל הקטגוריות מ-{prevYear.name} כנקודת התחלה לתכנון
        </div>
      </div>
      <button
        onClick={handleCopy}
        disabled={copyMutation.isPending}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "10px 20px",
          background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
          color: "#fff",
          border: "none",
          borderRadius: "9px",
          fontSize: "13.5px",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "Rubik, sans-serif",
          boxShadow: "0 3px 10px rgba(26,61,43,0.28)",
          flexShrink: 0,
        }}
      >
        <Copy size={14} />
        {copyMutation.isPending ? "מעתיק..." : `העתק מ-${prevYear.name}`}
      </button>
    </div>
  );
}

// ─── Inline amount editor ─────────────────────────────────────────────────────

function AmountCell({
  category,
  color,
}: {
  category: BudgetCategory;
  color: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(category.planned_amount));
  const inputRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdatePlannedAmount();

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = async () => {
    const n = Number(value);
    if (isNaN(n) || n < 0) {
      toast.error("סכום לא תקין");
      setValue(String(category.planned_amount));
      setEditing(false);
      return;
    }
    if (n === category.planned_amount) {
      setEditing(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({
        categoryId: category.id,
        plannedAmount: n,
      });
      toast.success("עודכן");
    } catch {
      toast.error("שגיאה בעדכון");
      setValue(String(category.planned_amount));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(String(category.planned_amount));
              setEditing(false);
            }
          }}
          style={{
            width: "90px",
            padding: "4px 8px",
            border: `1.5px solid ${color}`,
            borderRadius: "6px",
            fontSize: "13px",
            fontFamily: "var(--font-sans)",
            outline: "none",
            direction: "ltr",
            textAlign: "right",
          }}
        />
        <button
          onClick={save}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#2D6644",
            padding: "2px",
          }}
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => {
            setValue(String(category.planned_amount));
            setEditing(false);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#AAA099",
            padding: "2px",
          }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        cursor: "pointer",
      }}
      onClick={() => setEditing(true)}
    >
      <span
        className="num"
        style={{ fontSize: "14px", fontWeight: "500", color: "#1A1A1A" }}
      >
        {fmt(category.planned_amount)}
      </span>
      <Pencil size={11} style={{ color: "#7A7470", flexShrink: 0 }} />
    </div>
  );
}

// ─── Delete category button with inline confirm ───────────────────────────────

function DeleteCatButton({ categoryId, color }: { categoryId: string; color: string }) {
  const [confirming, setConfirming] = useState(false);
  const deleteMutation = useDeleteBudgetCategory();

  if (confirming) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button
          onClick={async () => {
            try { await deleteMutation.mutateAsync(categoryId); toast.success("נמחקה"); }
            catch { toast.error("שגיאה במחיקה"); }
            setConfirming(false);
          }}
          disabled={deleteMutation.isPending}
          style={{ padding: "3px 9px", borderRadius: "6px", border: "none", background: "#B5472A", color: "#fff", fontSize: "11px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
          {deleteMutation.isPending ? "..." : "מחק"}
        </button>
        <button onClick={() => setConfirming(false)}
          style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid #E8E2D9", background: "#fff", fontSize: "11px", fontFamily: "Rubik, sans-serif", cursor: "pointer", color: "#888" }}>
          בטל
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} title="מחק קטגוריה"
      style={{ padding: "4px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#C8C2BB", display: "flex", alignItems: "center" }}
      onMouseEnter={e => (e.currentTarget.style.color = "#B5472A")}
      onMouseLeave={e => (e.currentTarget.style.color = "#C8C2BB")}>
      <Trash2 size={13} />
    </button>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function MiniBar({ pct, gradient }: { pct: number; gradient: string }) {
  const [animW, setAnimW] = useState(0);
  useEffect(() => {
    setAnimW(0);
    const id = setTimeout(() => setAnimW(pct), 80);
    return () => clearTimeout(id);
  }, [pct]);
  return (
    <div
      style={{
        height: "5px",
        background: "#EAE5DE",
        borderRadius: "99px",
        overflow: "hidden",
        width: "80px",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, animW)}%`,
          background: gradient,
          borderRadius: "99px",
          transition: "width 0.7s ease",
        }}
      />
    </div>
  );
}

// ─── Add Category Row ─────────────────────────────────────────────────────────

function AddCategoryRow({
  source,
  color,
  targetYearId,
  onDone,
}: {
  source: BudgetSource;
  color: string;
  targetYearId: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const addMutation = useAddBudgetCategory();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const save = async () => {
    if (!name.trim()) {
      toast.error("יש להזין שם קטגוריה");
      return;
    }
    const n = Number(amount);
    if (isNaN(n) || n < 0) {
      toast.error("סכום לא תקין");
      return;
    }
    try {
      await addMutation.mutateAsync({
        name: name.trim(),
        source,
        plannedAmount: n,
        targetYearId,
      });
      toast.success("קטגוריה נוספה");
      onDone();
    } catch {
      toast.error("שגיאה בהוספה");
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: `1.5px solid ${color}`,
    borderRadius: "7px",
    fontSize: "13px",
    fontFamily: "var(--font-sans)",
    outline: "none",
    direction: "rtl",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 130px 120px 80px 36px 36px",
        padding: "10px 20px",
        gap: "12px",
        alignItems: "center",
        background: "#FAFAF8",
        borderTop: "1px solid #EAE5DE",
      }}
    >
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onDone();
        }}
        placeholder="שם הקטגוריה"
        style={{ ...inputStyle, direction: "rtl" }}
      />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onDone();
        }}
        placeholder="0"
        style={{ ...inputStyle, direction: "ltr", textAlign: "right" }}
      />
      <span />
      <span />
      <button
        onClick={save}
        disabled={addMutation.isPending}
        style={{
          padding: "6px",
          borderRadius: "7px",
          border: "none",
          background: color,
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={14} />
      </button>
      <button
        onClick={onDone}
        style={{
          padding: "6px",
          borderRadius: "7px",
          border: "1px solid #E8E2D9",
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#AAA099",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Source Tab Content ───────────────────────────────────────────────────────

function SourceTab({
  srcCfg,
  targetYearId,
  isCurrentYear,
  years,
}: {
  srcCfg: SrcCfg;
  targetYearId: string | null;
  isCurrentYear: boolean;
  years: ReturnType<typeof useSchoolYears>["data"] & {};
}) {
  const { data, isLoading } = useBudgetPlan(srcCfg.key, targetYearId);
  const categories = data?.categories ?? [];
  const [addingRow, setAddingRow] = useState(false);

  // For planning view: show planned only (no "used" from a future year)
  const totalPlanned = categories.reduce((s, c) => s + c.planned_amount, 0);
  const totalUsed = isCurrentYear ? (data?.totalSourceUsed ?? 0) : 0;
  const totalPct =
    totalPlanned > 0 ? Math.round((totalUsed / totalPlanned) * 100) : 0;

  const animPlanned = useCountUp(totalPlanned);
  const animUsed = useCountUp(totalUsed);
  const animBalance = useCountUp(Math.max(0, totalPlanned - totalUsed));
  const animPct = useAnimatedPct(totalPct);

  // Check if this source tab is empty — show copy banner on any tab with no categories
  const isEmpty = !isLoading && categories.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Copy from previous year banner — shown when new year is empty */}
      {isEmpty && !isCurrentYear && (
        <CopyFromPreviousYearBanner
          targetYearId={targetYearId!}
          years={years}
        />
      )}

      {/* Hero */}
      <div
        style={{
          borderRadius: "18px",
          background: srcCfg.heroGradient,
          padding: "24px 28px",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          boxShadow: srcCfg.heroShadow,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-50px",
            left: "-50px",
            width: "180px",
            height: "180px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-30px",
            right: "25%",
            width: "130px",
            height: "130px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.03)",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Grand total */}
          <div>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.55)",
                marginBottom: "6px",
                letterSpacing: "0.04em",
              }}
            >
              {isCurrentYear ? "סה״כ מתוכנן" : "סה״כ מתוכנן (טיוטה)"} —{" "}
              {srcCfg.label}
            </div>
            <div
              className="num"
              style={{
                fontSize: "38px",
                fontWeight: "200",
                letterSpacing: "-1.5px",
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {fmt(animPlanned)}
            </div>
          </div>

          {/* Stats — only show used/balance for the active/current year */}
          {isCurrentYear ? (
            <div style={{ display: "flex", gap: "28px", alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "4px",
                  }}
                >
                  נוצל
                </div>
                <div
                  className="num"
                  style={{ fontSize: "17px", fontWeight: "300", color: "#fff" }}
                >
                  {fmt(animUsed)}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "4px",
                  }}
                >
                  יתרה
                </div>
                <div
                  className="num"
                  style={{ fontSize: "17px", fontWeight: "300", color: "#fff" }}
                >
                  {fmt(animBalance)}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: "6px",
                  }}
                >
                  ניצול
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    style={{
                      width: "60px",
                      height: "4px",
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: "99px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, animPct)}%`,
                        height: "100%",
                        background: "rgba(255,255,255,0.8)",
                        borderRadius: "99px",
                        transition: "width 0.7s ease",
                      }}
                    />
                  </div>
                  <span
                    className="num"
                    style={{ fontSize: "14px", fontWeight: "500", color: "#fff" }}
                  >
                    {animPct}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                padding: "8px 18px",
                fontSize: "12px",
                color: "rgba(255,255,255,0.65)",
              }}
            >
              מצב תכנון — עריכת סכומים מתוכננים
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #EAE5DE",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isCurrentYear
              ? "1fr 130px 120px 80px 36px"
              : "1fr 130px 36px",
            minWidth: isCurrentYear ? "460px" : "220px",
            padding: "12px 20px",
            borderBottom: "1px solid #EAE5DE",
            fontSize: "11px",
            fontWeight: "600",
            color: "#AAA099",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            gap: "12px",
          }}
        >
          <span>קטגוריה</span>
          <span style={{ textAlign: "right" }}>מתוכנן</span>
          {isCurrentYear && (
            <>
              <span style={{ textAlign: "right" }}>נוצל</span>
              <span style={{ textAlign: "center" }}>ניצול</span>
            </>
          )}
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#AAA099",
              fontSize: "14px",
            }}
          >
            טוען...
          </div>
        ) : categories.length === 0 ? (
          !addingRow && (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ color: "#AAA099", fontSize: "14px" }}>
                אין קטגוריות עדיין
              </div>
              <div
                style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}
              >
                לחצו על "הוסף קטגוריה" להתחלה
              </div>
            </div>
          )
        ) : (
          categories.map((cat, i) => {
            const pct =
              cat.planned_amount > 0
                ? Math.round((cat.used / cat.planned_amount) * 100)
                : 0;
            const overBudget = cat.used > cat.planned_amount;
            return (
              <div
                key={cat.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isCurrentYear
                    ? "1fr 130px 120px 80px 36px"
                    : "1fr 130px 36px",
                  minWidth: isCurrentYear ? "460px" : "220px",
                  padding: "14px 20px",
                  gap: "12px",
                  borderBottom:
                    i < categories.length - 1
                      ? "1px solid #F3EEE8"
                      : "none",
                  alignItems: "center",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#FAFAF8")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <span style={{ fontSize: "14px", color: "#1A1A1A" }}>
                  {cat.name}
                </span>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <AmountCell category={cat} color={srcCfg.color} />
                </div>
                {isCurrentYear && (
                  <>
                    <span
                      className="num"
                      style={{
                        fontSize: "14px",
                        fontWeight: "400",
                        color: overBudget ? "#B5472A" : "#6B6560",
                        textAlign: "right",
                        display: "block",
                      }}
                    >
                      {fmt(cat.used)}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <MiniBar
                        pct={pct}
                        gradient={
                          overBudget
                            ? "linear-gradient(90deg, #D46A42, #B5472A)"
                            : srcCfg.barGradient
                        }
                      />
                      <span
                        className="num"
                        style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          color: overBudget ? "#B5472A" : srcCfg.color,
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DeleteCatButton categoryId={cat.id} color={srcCfg.color} />
                </div>
              </div>
            );
          })
        )}

        {/* Add row */}
        {addingRow && (
          <AddCategoryRow
            source={srcCfg.key}
            color={srcCfg.color}
            targetYearId={targetYearId}
            onDone={() => setAddingRow(false)}
          />
        )}
        </div>{/* /overflowX scroll */}
      </div>

      {/* Add button */}
      {!addingRow && (
        <button
          onClick={() => setAddingRow(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            alignSelf: "flex-start",
            border: `1px dashed ${srcCfg.color}`,
            borderRadius: "8px",
            background: srcCfg.bg,
            color: srcCfg.textColor,
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            transition: "all 0.12s",
          }}
        >
          <Plus size={14} />
          הוסף קטגוריה
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState<string>("");
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const { data: years = [] } = useSchoolYears();
  const { data: orgSources } = useOrgBudgetSources();

  const sources: SrcCfg[] = (orgSources ?? FALLBACK_SOURCES).map(buildSrcCfg);
  // Default to first org source once loaded
  const effectiveTab = activeTab || sources[0]?.key || "gefen";
  const srcCfg = sources.find((s) => s.key === effectiveTab) ?? sources[0];
  const activeYear = years.find((y) => y.is_active);
  const selectedYear = years.find((y) => y.id === selectedYearId);
  const isCurrentYear = !!selectedYear?.is_active;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
              fontWeight: "300",
              color: "#1A1A1A",
              letterSpacing: "-0.8px",
            }}
          >
            מצב תקציבי
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
            {isCurrentYear
              ? "תכנית שנתית לפי מקור — לחצו על סכום מתוכנן לעריכה"
              : selectedYear
              ? `תכנון תקציב — ${selectedYear.name}`
              : "טוען..."}
          </p>
        </div>

        {/* Year picker — only show if there's more than one year */}
        {years.length > 1 && (
          <YearPicker
            selectedYearId={selectedYearId}
            onSelect={setSelectedYearId}
          />
        )}
      </div>

      {/* Planning mode notice */}
      {!isCurrentYear && selectedYear && (
        <div
          style={{
            background: "linear-gradient(135deg, #FFFBEB, #FFF8E1)",
            border: "1.5px solid #F5D87A",
            borderRadius: "12px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13.5px",
            color: "#78600A",
          }}
        >
          <span style={{ fontSize: "16px" }}>✏️</span>
          <span>
            <strong>מצב תכנון — {selectedYear.name}.</strong> תקציב זה הוא לשנה הבאה.
            נתוני הניצול יופיעו כשהשנה תהיה פעילה.
          </span>
          {activeYear && (
            <button
              onClick={() => setSelectedYearId(activeYear.id)}
              style={{
                marginRight: "auto",
                background: "none",
                border: "1px solid #C9A227",
                borderRadius: "7px",
                padding: "4px 12px",
                fontSize: "12px",
                color: "#78600A",
                cursor: "pointer",
                fontFamily: "Rubik, sans-serif",
              }}
            >
              חזור לשנה הפעילה
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0",
          borderBottom: "2px solid #EAE5DE",
        }}
      >
        {sources.map((src) => {
          const active = effectiveTab === src.key;
          return (
            <button
              key={src.key}
              onClick={() => setActiveTab(src.key)}
              style={{
                padding: "10px 24px",
                border: "none",
                background: "none",
                fontSize: "14px",
                fontWeight: active ? "600" : "400",
                color: active ? src.color : "#888079",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                borderBottom: active
                  ? `2px solid ${src.color}`
                  : "2px solid transparent",
                marginBottom: "-2px",
                transition: "all 0.12s",
              }}
            >
              {src.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <SourceTab
        key={`${effectiveTab}-${selectedYearId}`}
        srcCfg={srcCfg}
        targetYearId={selectedYearId}
        isCurrentYear={isCurrentYear}
        years={years}
      />
    </div>
  );
}
