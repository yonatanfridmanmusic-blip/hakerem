import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Plus, Check, X, Pencil } from "lucide-react";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useBudgetPlan,
  useUpdatePlannedAmount,
  useAddBudgetCategory,
  type BudgetSource,
  type BudgetCategory,
} from "@/hooks/use-budget-plan";

export const Route = createFileRoute("/_authenticated/budget/")({
  component: BudgetPage,
});

// ─── Config ───────────────────────────────────────────────────────────────────

const SOURCES: { key: BudgetSource; label: string; color: string; bg: string; textColor: string; barGradient: string; heroGradient: string; heroShadow: string }[] = [
  { key: "gefen",  label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534", barGradient: "linear-gradient(90deg, #5AA674, #2D6644)", heroGradient: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 55%, #081510 100%)", heroShadow: "0 8px 32px rgba(15,36,25,0.45)" },
  { key: "iriyah", label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010", barGradient: "linear-gradient(90deg, #D46A42, #B5472A)", heroGradient: "linear-gradient(160deg, #7C2E18 0%, #5A1F10 55%, #3A140A 100%)", heroShadow: "0 8px 32px rgba(90,31,16,0.45)" },
  { key: "horim",  label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356", barGradient: "linear-gradient(90deg, #B04A90, #8B2F6E)", heroGradient: "linear-gradient(160deg, #4A1A38 0%, #331228 55%, #1F0B17 100%)", heroShadow: "0 8px 32px rgba(51,18,40,0.45)" },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

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
    if (n === category.planned_amount) { setEditing(false); return; }
    try {
      await updateMutation.mutateAsync({ categoryId: category.id, plannedAmount: n });
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
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(String(category.planned_amount)); setEditing(false); } }}
          style={{
            width: "90px", padding: "4px 8px",
            border: `1.5px solid ${color}`,
            borderRadius: "6px", fontSize: "13px",
            fontFamily: "var(--font-sans)", outline: "none",
            direction: "ltr", textAlign: "right",
          }}
        />
        <button onClick={save} style={{ background: "none", border: "none", cursor: "pointer", color: "#2D6644", padding: "2px" }}>
          <Check size={14} />
        </button>
        <button onClick={() => { setValue(String(category.planned_amount)); setEditing(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#AAA099", padding: "2px" }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
      onClick={() => setEditing(true)}
    >
      <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#1A1A1A" }}>
        {fmt(category.planned_amount)}
      </span>
      <Pencil size={11} style={{ color: "#7A7470", flexShrink: 0 }} />
    </div>
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
    <div style={{ height: "5px", background: "#EAE5DE", borderRadius: "99px", overflow: "hidden", width: "80px" }}>
      <div style={{
        height: "100%", width: `${Math.min(100, animW)}%`,
        background: gradient, borderRadius: "99px",
        transition: "width 0.7s ease",
      }} />
    </div>
  );
}

// ─── Add Category Row ─────────────────────────────────────────────────────────

function AddCategoryRow({
  source,
  color,
  onDone,
}: {
  source: BudgetSource;
  color: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const addMutation = useAddBudgetCategory();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const save = async () => {
    if (!name.trim()) { toast.error("יש להזין שם קטגוריה"); return; }
    const n = Number(amount);
    if (isNaN(n) || n < 0) { toast.error("סכום לא תקין"); return; }
    try {
      await addMutation.mutateAsync({ name: name.trim(), source, plannedAmount: n });
      toast.success("קטגוריה נוספה");
      onDone();
    } catch {
      toast.error("שגיאה בהוספה");
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px", border: `1.5px solid ${color}`,
    borderRadius: "7px", fontSize: "13px",
    fontFamily: "var(--font-sans)", outline: "none",
    direction: "rtl",
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 130px 120px 80px 36px 36px",
      padding: "10px 20px", gap: "12px", alignItems: "center",
      background: "#FAFAF8", borderTop: "1px solid #EAE5DE",
    }}>
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
        placeholder="שם הקטגוריה"
        style={{ ...inputStyle, direction: "rtl" }}
      />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
        placeholder="0"
        style={{ ...inputStyle, direction: "ltr", textAlign: "right" }}
      />
      <span />
      <span />
      <button onClick={save} disabled={addMutation.isPending} style={{
        padding: "6px", borderRadius: "7px", border: "none",
        background: color, color: "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Check size={14} />
      </button>
      <button onClick={onDone} style={{
        padding: "6px", borderRadius: "7px", border: "1px solid #E8E2D9",
        background: "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#AAA099",
      }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Source Tab Content ───────────────────────────────────────────────────────

function SourceTab({ srcCfg }: { srcCfg: typeof SOURCES[0] }) {
  const { data, isLoading } = useBudgetPlan(srcCfg.key);
  const categories = data?.categories ?? [];
  const [addingRow, setAddingRow] = useState(false);

  const totalPlanned = categories.reduce((s, c) => s + c.planned_amount, 0);
  // Use totalSourceUsed (all expenses, including uncategorized) so hero matches dashboard
  const totalUsed    = data?.totalSourceUsed ?? 0;
  const totalPct     = totalPlanned > 0 ? Math.round((totalUsed / totalPlanned) * 100) : 0;

  // Animations
  const animPlanned = useCountUp(totalPlanned);
  const animUsed    = useCountUp(totalUsed);
  const animBalance = useCountUp(Math.max(0, totalPlanned - totalUsed));
  const animPct     = useAnimatedPct(totalPct);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Hero */}
      <div style={{
        borderRadius: "18px",
        background: srcCfg.heroGradient,
        padding: "24px 28px",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        boxShadow: srcCfg.heroShadow,
      }}>
        <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", bottom: "-30px", right: "25%", width: "130px", height: "130px", borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
          {/* Grand total */}
          <div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "6px", letterSpacing: "0.04em" }}>סה״כ מתוכנן — {srcCfg.label}</div>
            <div className="num" style={{ fontSize: "38px", fontWeight: "200", letterSpacing: "-1.5px", color: "#fff", lineHeight: 1 }}>
              {fmt(animPlanned)}
            </div>
          </div>

          {/* Stats breakdown */}
          <div style={{ display: "flex", gap: "28px", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>נוצל</div>
              <div className="num" style={{ fontSize: "17px", fontWeight: "300", color: "#fff" }}>{fmt(animUsed)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>יתרה</div>
              <div className="num" style={{ fontSize: "17px", fontWeight: "300", color: "#fff" }}>{fmt(animBalance)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>ניצול</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "60px", height: "4px", background: "rgba(255,255,255,0.2)", borderRadius: "99px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, animPct)}%`, height: "100%", background: "rgba(255,255,255,0.8)", borderRadius: "99px", transition: "width 0.7s ease" }} />
                </div>
                <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#fff" }}>{animPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff", border: "1px solid #EAE5DE",
        borderRadius: "14px", overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 130px 120px 80px",
          padding: "12px 20px", borderBottom: "1px solid #EAE5DE",
          fontSize: "11px", fontWeight: "600", color: "#AAA099",
          letterSpacing: "0.04em", textTransform: "uppercase", gap: "12px",
        }}>
          <span>קטגוריה</span>
          <span style={{ textAlign: "right" }}>מתוכנן</span>
          <span style={{ textAlign: "right" }}>נוצל</span>
          <span style={{ textAlign: "center" }}>ניצול</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
        ) : categories.length === 0 ? (
          !addingRow && (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ color: "#AAA099", fontSize: "14px" }}>אין קטגוריות עדיין</div>
              <div style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}>לחץ "הוסף קטגוריה" להתחלה</div>
            </div>
          )
        ) : (
          categories.map((cat, i) => {
            const pct = cat.planned_amount > 0 ? Math.round((cat.used / cat.planned_amount) * 100) : 0;
            const overBudget = cat.used > cat.planned_amount;
            return (
              <div
                key={cat.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 130px 120px 80px",
                  padding: "14px 20px", gap: "12px",
                  borderBottom: i < categories.length - 1 ? "1px solid #F3EEE8" : "none",
                  alignItems: "center",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF8")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: "14px", color: "#1A1A1A" }}>{cat.name}</span>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <AmountCell category={cat} color={srcCfg.color} />
                </div>
                <span className="num" style={{
                  fontSize: "14px", fontWeight: "400",
                  color: overBudget ? "#B5472A" : "#6B6560",
                  textAlign: "right", display: "block",
                }}>
                  {fmt(cat.used)}
                </span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <MiniBar pct={pct} gradient={overBudget ? "linear-gradient(90deg, #D46A42, #B5472A)" : srcCfg.barGradient} />
                  <span className="num" style={{
                    fontSize: "10px", fontWeight: "600",
                    color: overBudget ? "#B5472A" : srcCfg.color,
                  }}>
                    {pct}%
                  </span>
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
            onDone={() => setAddingRow(false)}
          />
        )}
      </div>

      {/* Add button */}
      {!addingRow && (
        <button
          onClick={() => setAddingRow(true)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", alignSelf: "flex-start",
            border: `1px dashed ${srcCfg.color}`,
            borderRadius: "8px", background: srcCfg.bg,
            color: srcCfg.textColor, fontSize: "13px",
            cursor: "pointer", fontFamily: "var(--font-sans)",
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
  const [activeTab, setActiveTab] = useState<BudgetSource>("gefen");
  const srcCfg = SOURCES.find((s) => s.key === activeTab)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>
          מצב תקציבי
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
          תכנית שנתית לפי מקור — לחץ על סכום מתוכנן לעריכה
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #EAE5DE" }}>
        {SOURCES.map((src) => {
          const active = activeTab === src.key;
          return (
            <button
              key={src.key}
              onClick={() => setActiveTab(src.key)}
              style={{
                padding: "10px 24px",
                border: "none", background: "none",
                fontSize: "14px", fontWeight: active ? "600" : "400",
                color: active ? src.color : "#888079",
                cursor: "pointer", fontFamily: "var(--font-sans)",
                borderBottom: active ? `2px solid ${src.color}` : "2px solid transparent",
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
      <SourceTab key={activeTab} srcCfg={srcCfg} />
    </div>
  );
}
