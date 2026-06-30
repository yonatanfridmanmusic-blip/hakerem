import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useExpenses,
  useAddExpense,
  useBudgetCategories,
  type BudgetSource,
  type NewExpense,
} from "@/hooks/use-expenses";

export const Route = createFileRoute("/_authenticated/expenses/")({
  component: ExpensesPage,
});

// ─── Config ───────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  gefen:  { label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534" },
  iriyah: { label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010" },
  horim:  { label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356" },
} as const;

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

// ─── Add Expense Modal ────────────────────────────────────────────────────────

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<{
    expense_date: string;
    amount: string;
    source: BudgetSource;
    budget_category_id: string;
    supplier: string;
    description: string;
    bank_account: "school" | "parents";
  }>({
    expense_date: today(),
    amount: "",
    source: "gefen",
    budget_category_id: "",
    supplier: "",
    description: "",
    bank_account: "school",
  });

  const { data: categories } = useBudgetCategories(form.source);
  const addExpense = useAddExpense();

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("יש להזין סכום תקין");
      return;
    }
    try {
      const payload: NewExpense = {
        expense_date: form.expense_date,
        amount: Number(form.amount),
        source: form.source,
        bank_account: form.bank_account,
        budget_category_id: form.budget_category_id || null,
        supplier: form.supplier || null,
        description: form.description || null,
      };
      await addExpense.mutateAsync(payload);
      toast.success("ההוצאה נוספה בהצלחה");
      onClose();
    } catch {
      toast.error("שגיאה בשמירת ההוצאה");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff",
    color: "#1A1A1A", outline: "none",
    fontFamily: "var(--font-sans)",
    direction: "rtl",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "12px", fontWeight: "500",
    color: "#6B6560", display: "block", marginBottom: "6px",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "18px",
        width: "100%", maxWidth: "480px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #EAE5DE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>הוספת הוצאה</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>הזן את פרטי ההוצאה</div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "6px", borderRadius: "8px", color: "#AAA099",
            display: "flex", alignItems: "center",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Date + Amount */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>תאריך</label>
              <input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)}
                required style={{ ...inputStyle, direction: "ltr" }} />
            </div>
            <div>
              <label style={labelStyle}>סכום (₪)</label>
              <input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)}
                placeholder="0" min="0" step="0.01" required style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
            </div>
          </div>

          {/* Source */}
          <div>
            <label style={labelStyle}>מקור תקציב</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["gefen", "iriyah", "horim"] as BudgetSource[]).map((src) => {
                const cfg = SOURCE_CONFIG[src];
                const active = form.source === src;
                return (
                  <button key={src} type="button" onClick={() => { set("source", src); set("budget_category_id", ""); }}
                    style={{
                      flex: 1, padding: "8px 0",
                      borderRadius: "8px", border: `1.5px solid ${active ? cfg.color : "#E8E2D9"}`,
                      background: active ? cfg.bg : "#fff",
                      color: active ? cfg.textColor : "#888079",
                      fontSize: "13px", fontWeight: active ? "600" : "400",
                      cursor: "pointer", fontFamily: "var(--font-sans)",
                      transition: "all 0.12s",
                    }}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <label style={labelStyle}>קטגוריה</label>
            <select value={form.budget_category_id} onChange={(e) => set("budget_category_id", e.target.value)}
              style={inputStyle}>
              <option value="">— ללא קטגוריה —</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Supplier + Bank */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>ספק</label>
              <input type="text" value={form.supplier} onChange={(e) => set("supplier", e.target.value)}
                placeholder="שם הספק" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>חשבון בנק</label>
              <select value={form.bank_account} onChange={(e) => set("bank_account", e.target.value as "school" | "parents")}
                style={inputStyle}>
                <option value="school">בית ספר</option>
                <option value="parents">הורים</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>תיאור (אופציונלי)</label>
            <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="פרטים נוספים על ההוצאה" style={inputStyle} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "10px 0",
              border: "1px solid #E8E2D9", borderRadius: "8px",
              background: "#fff", color: "#6B6560", fontSize: "14px",
              cursor: "pointer", fontFamily: "var(--font-sans)",
            }}>ביטול</button>
            <button type="submit" disabled={addExpense.isPending} style={{
              flex: 2, padding: "10px 0",
              border: "none", borderRadius: "8px",
              background: addExpense.isPending ? "#888" : "#1A3D2B",
              color: "#fff", fontSize: "14px", fontWeight: "500",
              cursor: addExpense.isPending ? "not-allowed" : "pointer",
              fontFamily: "var(--font-sans)",
            }}>
              {addExpense.isPending ? "שומר..." : "הוסף הוצאה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [filter, setFilter] = useState<BudgetSource | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const { data: expenses, isLoading } = useExpenses(filter);
  const { data: allExpenses } = useExpenses("all");

  const total = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  // Per-source totals for hero
  const expTotals = { gefen: 0, iriyah: 0, horim: 0 };
  (allExpenses ?? []).forEach((e) => { expTotals[e.source] += e.amount; });
  const grandTotal = Object.values(expTotals).reduce((a, b) => a + b, 0);

  // Animations
  const animGrand = useCountUp(grandTotal);
  const animGefen = useCountUp(expTotals.gefen);
  const animIriyah = useCountUp(expTotals.iriyah);
  const animHorim = useCountUp(expTotals.horim);
  const animGefenPct = useAnimatedPct(grandTotal > 0 ? Math.round((expTotals.gefen / grandTotal) * 100) : 0);
  const animIriyahPct = useAnimatedPct(grandTotal > 0 ? Math.round((expTotals.iriyah / grandTotal) * 100) : 0);
  const animHorimPct = useAnimatedPct(grandTotal > 0 ? Math.round((expTotals.horim / grandTotal) * 100) : 0);
  const animPcts: Record<BudgetSource, number> = { gefen: animGefenPct, iriyah: animIriyahPct, horim: animHorimPct };
  const animAmts: Record<BudgetSource, number> = { gefen: animGefen, iriyah: animIriyah, horim: animHorim };

  return (
    <>
      {showModal && <AddExpenseModal onClose={() => setShowModal(false)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>
              הוצאות
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
              {isLoading ? "טוען..." : `${(expenses ?? []).length} הוצאות · סה״כ ${fmt(total)}`}
            </p>
          </div>
          <button onClick={() => setShowModal(true)} style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "10px 18px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            border: "none", borderRadius: "10px",
            color: "#fff", fontSize: "14px", fontWeight: "500",
            cursor: "pointer", fontFamily: "var(--font-sans)",
            boxShadow: "0 4px 12px rgba(26,61,43,0.3)",
          }}>
            <Plus size={16} />
            הוסף הוצאה
          </button>
        </div>

        {/* Hero */}
        <div style={{
          borderRadius: "18px",
          background: "linear-gradient(160deg, #8B1A1A 0%, #6B1212 55%, #460C0C 100%)",
          padding: "24px 28px",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(107,18,18,0.45)",
        }}>
          {/* Decorative circles */}
          <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ position: "absolute", bottom: "-30px", right: "25%", width: "130px", height: "130px", borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
            {/* Grand total */}
            <div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "6px", letterSpacing: "0.04em" }}>סה״כ הוצאות</div>
              <div className="num" style={{ fontSize: "38px", fontWeight: "200", letterSpacing: "-1.5px", color: "#fff", lineHeight: 1 }}>
                {fmt(animGrand)}
              </div>
            </div>

            {/* Per-source breakdown */}
            <div style={{ display: "flex", gap: "28px" }}>
              {(["gefen", "iriyah", "horim"] as BudgetSource[]).map((src) => {
                const cfg = SOURCE_CONFIG[src];
                return (
                  <div key={src} style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", justifyContent: "center", marginBottom: "4px" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.color, opacity: 0.9 }} />
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)" }}>{cfg.label}</span>
                    </div>
                    <div className="num" style={{ fontSize: "17px", fontWeight: "300", color: "#fff" }}>{fmt(animAmts[src])}</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>{animPcts[src]}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: "8px" }}>
          {([["all", "הכל"], ["gefen", "גפן"], ["iriyah", "עירייה"], ["horim", "הורים"]] as const).map(([val, label]) => {
            const active = filter === val;
            const cfg = val !== "all" ? SOURCE_CONFIG[val] : null;
            return (
              <button key={val} onClick={() => setFilter(val)} style={{
                padding: "6px 16px", borderRadius: "99px",
                border: `1px solid ${active && cfg ? cfg.color : active ? "#1A3D2B" : "#E8E2D9"}`,
                background: active && cfg ? cfg.bg : active ? "#1A3D2B" : "#fff",
                color: active && cfg ? cfg.textColor : active ? "#fff" : "#888079",
                fontSize: "13px", fontWeight: active ? "600" : "400",
                cursor: "pointer", fontFamily: "var(--font-sans)",
                transition: "all 0.12s",
              }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{
          background: "#fff", border: "1px solid #EAE5DE",
          borderRadius: "14px", overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "120px 100px 80px 1fr 1fr",
            padding: "12px 20px",
            borderBottom: "1px solid #EAE5DE",
            fontSize: "11px", fontWeight: "600", color: "#AAA099",
            letterSpacing: "0.04em", textTransform: "uppercase",
            gap: "12px",
          }}>
            <span>תאריך</span>
            <span style={{ textAlign: "right" }}>סכום</span>
            <span>מקור</span>
            <span>קטגוריה</span>
            <span>ספק</span>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
          ) : (expenses ?? []).length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <AlertTriangle size={24} style={{ color: "#E8E2D9", marginBottom: "12px" }} />
              <div style={{ color: "#AAA099", fontSize: "14px" }}>אין הוצאות להצגה</div>
              <div style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}>לחץ על "הוסף הוצאה" להתחלה</div>
            </div>
          ) : (
            (expenses ?? []).map((e, i) => {
              const cfg = SOURCE_CONFIG[e.source];
              return (
                <div key={e.id} style={{
                  display: "grid",
                  gridTemplateColumns: "120px 100px 80px 1fr 1fr",
                  padding: "14px 20px", gap: "12px",
                  borderBottom: i < (expenses ?? []).length - 1 ? "1px solid #F3EEE8" : "none",
                  alignItems: "center",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={(el) => (el.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: "13px", color: "#6B6560" }} className="num">
                    {new Date(e.expense_date).toLocaleDateString("he-IL")}
                  </span>
                  <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#1A1A1A", textAlign: "right" }}>
                    {fmt(e.amount)}
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 10px", borderRadius: "99px",
                    fontSize: "11px", fontWeight: "600",
                    background: cfg.bg, color: cfg.textColor,
                    whiteSpace: "nowrap",
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.budget_categories?.name ?? "—"}
                  </span>
                  <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.supplier ?? e.description ?? "—"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
