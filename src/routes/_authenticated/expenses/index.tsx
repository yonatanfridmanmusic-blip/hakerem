import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X, AlertTriangle, Pencil, Trash2, Search } from "lucide-react";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useExpenses,
  useAddExpense,
  useUpdateExpense,
  useDeleteExpense,
  useBudgetCategories,
  type BudgetSource,
  type NewExpense,
  type Expense,
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

// ─── Shared form styles ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1px solid #E8E2D9", borderRadius: "8px",
  fontSize: "14px", background: "#fff",
  color: "#1A1A1A", outline: "none",
  fontFamily: "var(--font-sans)", direction: "rtl",
};
const labelStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: "500",
  color: "#6B6560", display: "block", marginBottom: "6px",
};

// ─── Expense Form (shared between Add + Edit) ─────────────────────────────────

type ExpenseFormState = {
  expense_date: string;
  amount: string;
  source: BudgetSource;
  budget_category_id: string;
  supplier: string;
  description: string;
  bank_account: "school" | "parents";
};

function ExpenseForm({
  initial,
  onSubmit,
  onClose,
  isPending,
  submitLabel,
}: {
  initial: ExpenseFormState;
  onSubmit: (form: ExpenseFormState) => Promise<void>;
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ExpenseFormState>(initial);
  const { data: categories } = useBudgetCategories(form.source);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast.error("יש להזין סכום תקין"); return; }
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
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

      <div>
        <label style={labelStyle}>מקור תקציב</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {(["gefen", "iriyah", "horim"] as BudgetSource[]).map((src) => {
            const cfg = SOURCE_CONFIG[src];
            const active = form.source === src;
            return (
              <button key={src} type="button"
                onClick={() => { set("source", src); set("budget_category_id", ""); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: "8px",
                  border: `1.5px solid ${active ? cfg.color : "#E8E2D9"}`,
                  background: active ? cfg.bg : "#fff",
                  color: active ? cfg.textColor : "#888079",
                  fontSize: "13px", fontWeight: active ? "600" : "400",
                  cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
                }}>
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={labelStyle}>קטגוריה</label>
        <select value={form.budget_category_id} onChange={(e) => set("budget_category_id", e.target.value)} style={inputStyle}>
          <option value="">— ללא קטגוריה —</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>ספק</label>
          <input type="text" value={form.supplier} onChange={(e) => set("supplier", e.target.value)}
            placeholder="שם הספק" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>חשבון בנק</label>
          <select value={form.bank_account} onChange={(e) => set("bank_account", e.target.value as "school" | "parents")} style={inputStyle}>
            <option value="school">בית ספר</option>
            <option value="parents">הורים</option>
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>תיאור (אופציונלי)</label>
        <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)}
          placeholder="פרטים נוספים" style={inputStyle} />
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        <button type="button" onClick={onClose} style={{
          flex: 1, padding: "10px 0", border: "1px solid #E8E2D9",
          borderRadius: "8px", background: "#fff", color: "#6B6560",
          fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
        }}>ביטול</button>
        <button type="submit" disabled={isPending} style={{
          flex: 2, padding: "10px 0", border: "none", borderRadius: "8px",
          background: isPending ? "#888" : "#1A3D2B",
          color: "#fff", fontSize: "14px", fontWeight: "500",
          cursor: isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
        }}>
          {isPending ? "שומר..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "480px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #EAE5DE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "8px", color: "#AAA099", display: "flex" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Add Modal ────────────────────────────────────────────────────────────────

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const addExpense = useAddExpense();
  const initial: ExpenseFormState = {
    expense_date: today(), amount: "", source: "gefen",
    budget_category_id: "", supplier: "", description: "", bank_account: "school",
  };
  const handleSubmit = async (form: ExpenseFormState) => {
    try {
      await addExpense.mutateAsync({
        expense_date: form.expense_date, amount: Number(form.amount),
        source: form.source, bank_account: form.bank_account,
        budget_category_id: form.budget_category_id || null,
        supplier: form.supplier || null, description: form.description || null,
      } as NewExpense);
      toast.success("ההוצאה נוספה בהצלחה");
      onClose();
    } catch { toast.error("שגיאה בשמירת ההוצאה"); }
  };
  return (
    <Modal title="הוספת הוצאה" subtitle="הזן את פרטי ההוצאה" onClose={onClose}>
      <ExpenseForm initial={initial} onSubmit={handleSubmit} onClose={onClose}
        isPending={addExpense.isPending} submitLabel="הוסף הוצאה" />
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditExpenseModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const updateExpense = useUpdateExpense();
  const initial: ExpenseFormState = {
    expense_date: expense.expense_date,
    amount: String(expense.amount),
    source: expense.source,
    budget_category_id: expense.budget_category_id ?? "",
    supplier: expense.supplier ?? "",
    description: expense.description ?? "",
    bank_account: expense.bank_account ?? "school",
  };
  const handleSubmit = async (form: ExpenseFormState) => {
    try {
      await updateExpense.mutateAsync({
        id: expense.id,
        expense_date: form.expense_date, amount: Number(form.amount),
        source: form.source, bank_account: form.bank_account,
        budget_category_id: form.budget_category_id || null,
        supplier: form.supplier || null, description: form.description || null,
      });
      toast.success("ההוצאה עודכנה בהצלחה");
      onClose();
    } catch { toast.error("שגיאה בעדכון ההוצאה"); }
  };
  return (
    <Modal title="עריכת הוצאה" subtitle="ערוך את פרטי ההוצאה" onClose={onClose}>
      <ExpenseForm initial={initial} onSubmit={handleSubmit} onClose={onClose}
        isPending={updateExpense.isPending} submitLabel="שמור שינויים" />
    </Modal>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const deleteExpense = useDeleteExpense();
  const handleDelete = async () => {
    try {
      await deleteExpense.mutateAsync(expense.id);
      toast.success("ההוצאה נמחקה");
      onClose();
    } catch { toast.error("שגיאה במחיקה"); }
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "380px",
        padding: "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
      }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <Trash2 size={20} color="#DC2626" />
        </div>
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A", marginBottom: "8px" }}>מחיקת הוצאה</div>
        <div style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.6, marginBottom: "24px" }}>
          האם למחוק הוצאה של <strong>{fmt(expense.amount)}</strong>
          {expense.supplier ? ` מ-${expense.supplier}` : ""}? פעולה זו אינה הפיכה.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px",
            background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>ביטול</button>
          <button onClick={handleDelete} disabled={deleteExpense.isPending} style={{
            flex: 1, padding: "10px 0", border: "none", borderRadius: "8px",
            background: deleteExpense.isPending ? "#888" : "#DC2626",
            color: "#fff", fontSize: "14px", fontWeight: "500",
            cursor: deleteExpense.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
          }}>
            {deleteExpense.isPending ? "מוחק..." : "מחק"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [filter, setFilter] = useState<BudgetSource | "all">("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const { data: expenses, isLoading } = useExpenses(filter);
  const { data: allExpenses } = useExpenses("all");

  const q = search.trim().toLowerCase();
  const visibleExpenses = q
    ? (expenses ?? []).filter((e) =>
        [e.supplier, e.description, e.budget_categories?.name]
          .some((f) => f?.toLowerCase().includes(q))
      )
    : (expenses ?? []);

  const total = visibleExpenses.reduce((sum, e) => sum + e.amount, 0);
  const expTotals = { gefen: 0, iriyah: 0, horim: 0 };
  (allExpenses ?? []).forEach((e) => { expTotals[e.source] += e.amount; });
  const grandTotal = Object.values(expTotals).reduce((a, b) => a + b, 0);

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
      {showAdd && <AddExpenseModal onClose={() => setShowAdd(false)} />}
      {editingExpense && <EditExpenseModal expense={editingExpense} onClose={() => setEditingExpense(null)} />}
      {deletingExpense && <DeleteConfirm expense={deletingExpense} onClose={() => setDeletingExpense(null)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>הוצאות</h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
              {isLoading ? "טוען..." : q
                ? `${visibleExpenses.length} מתוך ${(expenses ?? []).length} הוצאות · ${fmt(total)}`
                : `${(expenses ?? []).length} הוצאות · סה״כ ${fmt(total)}`}
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            display: "flex", alignItems: "center", gap: "7px", padding: "10px 18px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            border: "none", borderRadius: "10px", color: "#fff",
            fontSize: "14px", fontWeight: "500", cursor: "pointer",
            fontFamily: "var(--font-sans)", boxShadow: "0 4px 12px rgba(26,61,43,0.3)",
          }}>
            <Plus size={16} />הוסף הוצאה
          </button>
        </div>

        {/* Hero */}
        <div style={{
          borderRadius: "18px",
          background: "linear-gradient(160deg, #8B1A1A 0%, #6B1212 55%, #460C0C 100%)",
          padding: "24px 28px", color: "#fff", position: "relative", overflow: "hidden",
          boxShadow: "0 8px 32px rgba(107,18,18,0.45)",
        }}>
          <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ position: "absolute", bottom: "-30px", right: "25%", width: "130px", height: "130px", borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
            <div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "6px", letterSpacing: "0.04em" }}>סה״כ הוצאות</div>
              <div className="num" style={{ fontSize: "38px", fontWeight: "200", letterSpacing: "-1.5px", color: "#fff", lineHeight: 1 }}>{fmt(animGrand)}</div>
            </div>
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

        {/* Filter + Search row */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {/* Source chips */}
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
                cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
              }}>{label}</button>
            );
          })}
          </div>

          {/* Search input */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#AAA099", pointerEvents: "none" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי ספק, תיאור, קטגוריה..."
              style={{
                width: "100%", padding: "7px 36px 7px 34px", boxSizing: "border-box",
                border: "1px solid #E8E2D9", borderRadius: "99px",
                fontSize: "13px", color: "#1A1A1A", background: "#fff",
                outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{
                position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", color: "#AAA099",
              }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "120px 100px 80px 1fr 1fr 72px",
            padding: "12px 20px", borderBottom: "1px solid #EAE5DE",
            fontSize: "11px", fontWeight: "600", color: "#AAA099",
            letterSpacing: "0.04em", textTransform: "uppercase", gap: "12px",
          }}>
            <span>תאריך</span>
            <span style={{ textAlign: "right" }}>סכום</span>
            <span>מקור</span>
            <span>קטגוריה</span>
            <span>ספק</span>
            <span></span>
          </div>

          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
          ) : visibleExpenses.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <AlertTriangle size={24} style={{ color: "#E8E2D9", marginBottom: "12px" }} />
              <div style={{ color: "#AAA099", fontSize: "14px" }}>
                {q ? `אין תוצאות עבור "${search}"` : "אין הוצאות להצגה"}
              </div>
              <div style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}>
                {q ? "נסה מילת חיפוש אחרת" : "לחץ על \"הוסף הוצאה\" להתחלה"}
              </div>
            </div>
          ) : (
            visibleExpenses.map((e, i) => {
              const cfg = SOURCE_CONFIG[e.source];
              return (
                <div key={e.id} style={{
                  display: "grid", gridTemplateColumns: "120px 100px 80px 1fr 1fr 72px",
                  padding: "14px 20px", gap: "12px",
                  borderBottom: i < visibleExpenses.length - 1 ? "1px solid #F3EEE8" : "none",
                  alignItems: "center", transition: "background 0.1s",
                }}
                  onMouseEnter={(el) => (el.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                >
                  <span className="num" style={{ fontSize: "13px", color: "#6B6560" }}>
                    {new Date(e.expense_date).toLocaleDateString("he-IL")}
                  </span>
                  <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#1A1A1A", textAlign: "right" }}>
                    {fmt(e.amount)}
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 10px", borderRadius: "99px",
                    fontSize: "11px", fontWeight: "600",
                    background: cfg.bg, color: cfg.textColor, whiteSpace: "nowrap",
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.budget_categories?.name ?? "—"}
                  </span>
                  <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.supplier ?? e.description ?? "—"}
                  </span>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setEditingExpense(e)}
                      title="ערוך"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                      onMouseEnter={(el) => { el.currentTarget.style.background = "#F0F0EE"; el.currentTarget.style.color = "#1A1A1A"; }}
                      onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeletingExpense(e)}
                      title="מחק"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                      onMouseEnter={(el) => { el.currentTarget.style.background = "#FEF2F2"; el.currentTarget.style.color = "#DC2626"; }}
                      onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
