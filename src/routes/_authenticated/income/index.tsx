import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Plus, X, TrendingUp, Pencil, Check, Trash2, Search } from "lucide-react";
import { CategorySearchSelect } from "@/components/ui/category-search-select";
import { useCountUp } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useIncome,
  useAddIncome,
  useUpdateIncome,
  useDeleteIncome,
  useUpdateIncomeCategory,
  type BudgetSource,
  type NewIncome,
  type Income,
} from "@/hooks/use-income";
import { useBudgetCategories } from "@/hooks/use-expenses";
import { useAddBudgetCategory } from "@/hooks/use-budget-plan";
import { useOrgBudgetSources, getSourceStyle, getSourceLabel, FALLBACK_SOURCES } from "@/hooks/use-budget-sources";

export const Route = createFileRoute("/_authenticated/income/")({
  component: IncomePage,
});

// ─── Config ───────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ["העברה בנקאית", "מזומן", "צ׳ק", "אשראי", "ביט", "פייבוקס", "אחר"];

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

// ─── Shared form state type ───────────────────────────────────────────────────

type IncomeFormState = {
  income_date: string;
  amount: string;
  source: BudgetSource;
  bank_account: "school" | "parents";
  payer: string;
  description: string;
  payment_method: string;
  reference_number: string;
  budget_category_id: string;
  notes: string;
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1px solid #E8E2D9", borderRadius: "8px",
  fontSize: "14px", background: "#fff", color: "#1A1A1A",
  outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
};
const labelStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: "500", color: "#6B6560",
  display: "block", marginBottom: "6px",
};

// ─── Income Form (shared between Add + Edit) ──────────────────────────────────

function IncomeForm({
  initial,
  onSubmit,
  onClose,
  isPending,
  submitLabel,
  submitColor = "linear-gradient(135deg, #2D6644, #1A3D2B)",
}: {
  initial: IncomeFormState;
  onSubmit: (form: IncomeFormState) => Promise<void>;
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
  submitColor?: string;
}) {
  const [form, setForm] = useState<IncomeFormState>(initial);
  const [newCatName, setNewCatName] = useState("");
  const newCatRef = useRef<HTMLInputElement>(null);
  const { data: categories } = useBudgetCategories(form.source);
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const addCategory = useAddBudgetCategory();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isAddingNew = form.budget_category_id === "__new__";
  const activeSourceStyle = getSourceStyle(sources, form.source);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast.error("יש להזין סכום תקין"); return; }

    let resolvedCategoryId: string | null = form.budget_category_id || null;
    if (isAddingNew) {
      if (!newCatName.trim()) { toast.error("יש להזין שם קטגוריה"); return; }
      const created = await addCategory.mutateAsync({ name: newCatName.trim(), source: form.source, plannedAmount: 0 });
      resolvedCategoryId = (created as { id: string } | undefined)?.id ?? null;
    }

    await onSubmit({ ...form, budget_category_id: resolvedCategoryId ?? "" });
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>תאריך</label>
          <input type="date" value={form.income_date} onChange={(e) => set("income_date", e.target.value)}
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
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {sources.map((src) => {
            const active = form.source === src.slug;
            return (
              <button key={src.slug} type="button" onClick={() => { set("source", src.slug); set("budget_category_id", ""); }}
                style={{
                  flex: "1 1 auto", minWidth: "80px", padding: "8px 12px", borderRadius: "8px",
                  border: `1.5px solid ${active ? src.color : "#E8E2D9"}`,
                  background: active ? src.bg_color : "#fff",
                  color: active ? src.color : "#888079",
                  fontSize: "13px", fontWeight: active ? "600" : "400",
                  cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
                }}>
                {src.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={labelStyle}>קטגוריה תקציבית</label>
        <CategorySearchSelect
          value={form.budget_category_id}
          onChange={(id) => {
            set("budget_category_id", id);
            if (id === "__new__") setTimeout(() => newCatRef.current?.focus(), 50);
          }}
          categories={categories ?? []}
          allowAddNew
          sourceColor={activeSourceStyle.color}
        />
        {isAddingNew && (
          <input ref={newCatRef} type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
            placeholder="שם הקטגוריה החדשה"
            style={{ ...inputStyle, marginTop: "8px", borderColor: activeSourceStyle.color }} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>משלם / גורם מממן</label>
          <input type="text" value={form.payer} onChange={(e) => set("payer", e.target.value)}
            placeholder="שם המשלם" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>אמצעי תשלום</label>
          <select value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} style={inputStyle}>
            <option value="">— בחר —</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>מספר אסמכתא</label>
          <input type="text" value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)}
            placeholder="אופציונלי" style={{ ...inputStyle, direction: "ltr" }} />
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
          placeholder="פרטים נוספים על ההכנסה" style={inputStyle} />
      </div>

      <div>
        <label style={labelStyle}>הערות (אופציונלי)</label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="הערות חופשיות" rows={2}
          style={{ ...inputStyle, resize: "vertical", lineHeight: "1.5" }} />
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        <button type="button" onClick={onClose} style={{
          flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px",
          background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
        }}>ביטול</button>
        <button type="submit" disabled={isPending} style={{
          flex: 2, padding: "10px 0", border: "none", borderRadius: "8px",
          background: isPending ? "#888" : submitColor,
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
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #EAE5DE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
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

// ─── Add Income Modal ─────────────────────────────────────────────────────────

function AddIncomeModal({ onClose, defaultSource }: { onClose: () => void; defaultSource: string }) {
  const addIncome = useAddIncome();
  const initial: IncomeFormState = {
    income_date: today(), amount: "", source: defaultSource, bank_account: "school",
    payer: "", description: "", payment_method: "", reference_number: "", budget_category_id: "", notes: "",
  };
  const handleSubmit = async (form: IncomeFormState) => {
    try {
      await addIncome.mutateAsync({
        income_date: form.income_date, amount: Number(form.amount),
        source: form.source, bank_account: form.bank_account,
        payer: form.payer || null, description: form.description || null,
        payment_method: form.payment_method || null, reference_number: form.reference_number || null,
        budget_category_id: form.budget_category_id || null, notes: form.notes || null,
      } as NewIncome);
      toast.success("ההכנסה נוספה בהצלחה");
      onClose();
    } catch { toast.error("שגיאה בשמירת ההכנסה"); }
  };
  return (
    <Modal title="הוספת הכנסה" subtitle="הזן את פרטי ההכנסה" onClose={onClose}>
      <IncomeForm initial={initial} onSubmit={handleSubmit} onClose={onClose}
        isPending={addIncome.isPending} submitLabel="הוסף הכנסה" />
    </Modal>
  );
}

// ─── Edit Income Modal ────────────────────────────────────────────────────────

function EditIncomeModal({ income, onClose }: { income: Income; onClose: () => void }) {
  const updateIncome = useUpdateIncome();
  const initial: IncomeFormState = {
    income_date: income.income_date,
    amount: String(income.amount),
    source: income.source,
    bank_account: income.bank_account,
    payer: income.payer ?? "",
    description: income.description ?? "",
    payment_method: income.payment_method ?? "",
    reference_number: income.reference_number ?? "",
    budget_category_id: income.budget_category_id ?? "",
    notes: income.notes ?? "",
  };
  const handleSubmit = async (form: IncomeFormState) => {
    try {
      await updateIncome.mutateAsync({
        id: income.id,
        income_date: form.income_date, amount: Number(form.amount),
        source: form.source, bank_account: form.bank_account,
        payer: form.payer || null, description: form.description || null,
        payment_method: form.payment_method || null, reference_number: form.reference_number || null,
        budget_category_id: form.budget_category_id || null, notes: form.notes || null,
      });
      toast.success("ההכנסה עודכנה בהצלחה");
      onClose();
    } catch { toast.error("שגיאה בעדכון ההכנסה"); }
  };
  return (
    <Modal title="עריכת הכנסה" subtitle="ערוך את פרטי ההכנסה" onClose={onClose}>
      <IncomeForm initial={initial} onSubmit={handleSubmit} onClose={onClose}
        isPending={updateIncome.isPending} submitLabel="שמור שינויים" />
    </Modal>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ income, onClose }: { income: Income; onClose: () => void }) {
  const deleteIncome = useDeleteIncome();
  const handleDelete = async () => {
    try {
      await deleteIncome.mutateAsync(income.id);
      toast.success("ההכנסה נמחקה");
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
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A", marginBottom: "8px" }}>מחיקת הכנסה</div>
        <div style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.6, marginBottom: "24px" }}>
          האם למחוק הכנסה של <strong>{fmt(income.amount)}</strong>
          {income.payer ? ` מ-${income.payer}` : ""}? פעולה זו אינה הפיכה.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px",
            background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>ביטול</button>
          <button onClick={handleDelete} disabled={deleteIncome.isPending} style={{
            flex: 1, padding: "10px 0", border: "none", borderRadius: "8px",
            background: deleteIncome.isPending ? "#888" : "#DC2626",
            color: "#fff", fontSize: "14px", fontWeight: "500",
            cursor: deleteIncome.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
          }}>
            {deleteIncome.isPending ? "מוחק..." : "מחק"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline category editor (for existing rows) ───────────────────────────────

function InlineCategoryCell({ inc }: { inc: Income }) {
  const [editing, setEditing] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [selectedId, setSelectedId] = useState(inc.budget_category_id ?? "");
  const newCatRef = useRef<HTMLInputElement>(null);
  const { data: categories } = useBudgetCategories(inc.source);
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const updateCat = useUpdateIncomeCategory();
  const addCategory = useAddBudgetCategory();
  const isAddingNew = selectedId === "__new__";

  // Sync selectedId when inc.budget_category_id changes (e.g. after a background refetch)
  useEffect(() => {
    if (!editing) setSelectedId(inc.budget_category_id ?? "");
  }, [inc.budget_category_id, editing]);

  useEffect(() => { if (isAddingNew) setTimeout(() => newCatRef.current?.focus(), 50); }, [isAddingNew]);

  const save = async () => {
    try {
      let catId: string | null = selectedId || null;
      if (isAddingNew) {
        if (!newCatName.trim()) { toast.error("יש להזין שם קטגוריה"); return; }
        const created = await addCategory.mutateAsync({ name: newCatName.trim(), source: inc.source, plannedAmount: 0 });
        catId = (created as { id: string } | undefined)?.id ?? null;
      }
      await updateCat.mutateAsync({ id: inc.id, budget_category_id: catId });
      toast.success("קטגוריה עודכנה");
      setEditing(false);
      setNewCatName("");
    } catch { toast.error("שגיאה בעדכון"); }
  };

  const srcStyle = getSourceStyle(sources, inc.source);

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}
        onClick={() => { setSelectedId(inc.budget_category_id ?? ""); setEditing(true); }}>
        <span style={{ fontSize: "13px", color: inc.budget_categories?.name ? "#1A1A1A" : "#C0BAB4" }}>
          {inc.budget_categories?.name ?? "—"}
        </span>
        <Pencil size={10} style={{ color: "#C0BAB4", flexShrink: 0 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} autoFocus style={{
        padding: "4px 8px", border: `1.5px solid ${srcStyle.color}`, borderRadius: "6px",
        fontSize: "12px", fontFamily: "var(--font-sans)", outline: "none", direction: "rtl", background: "#fff",
      }}>
        <option value="">— ללא —</option>
        {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value="__new__">+ הוסף קטגוריה חדשה...</option>
      </select>
      {isAddingNew && (
        <input ref={newCatRef} type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          placeholder="שם קטגוריה חדשה"
          style={{ padding: "4px 8px", border: `1.5px solid ${srcStyle.color}`, borderRadius: "6px", fontSize: "12px", fontFamily: "var(--font-sans)", outline: "none", direction: "rtl" }} />
      )}
      <div style={{ display: "flex", gap: "4px" }}>
        <button onClick={save} style={{ padding: "3px 8px", borderRadius: "5px", border: "none", background: srcStyle.color, color: "#fff", fontSize: "11px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <Check size={11} />
        </button>
        <button onClick={() => setEditing(false)} style={{ padding: "3px 8px", borderRadius: "5px", border: "1px solid #E8E2D9", background: "#fff", fontSize: "11px", cursor: "pointer", color: "#AAA099" }}>
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IncomePage() {
  const [filter, setFilter] = useState<BudgetSource | "all">("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [deletingIncome, setDeletingIncome] = useState<Income | null>(null);

  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const defaultSource = sources[0]?.slug ?? "gefen";

  // Single fetch — filter + totals computed client-side to avoid double network request
  const { data: allIncome, isLoading } = useIncome("all");

  const filteredBySource = filter === "all"
    ? (allIncome ?? [])
    : (allIncome ?? []).filter((i) => i.source === filter);

  const q = search.trim().toLowerCase();
  const visibleIncome = q
    ? filteredBySource.filter((inc) =>
        [inc.payer, inc.description, inc.budget_categories?.name, inc.payment_method, inc.notes]
          .some((f) => f?.toLowerCase().includes(q))
      )
    : filteredBySource;

  // For display: "N הכנסות" counts against source-filtered list (before text search)
  const income = filteredBySource;
  const total = visibleIncome.reduce((sum, e) => sum + e.amount, 0);
  const sourceTotals: Record<string, number> = {};
  (allIncome ?? []).forEach((i) => { sourceTotals[i.source] = (sourceTotals[i.source] ?? 0) + i.amount; });
  const grandTotal = Object.values(sourceTotals).reduce((a, b) => a + b, 0);
  const animGrand = useCountUp(grandTotal);

  return (
    <>
      {showModal && <AddIncomeModal defaultSource={defaultSource} onClose={() => setShowModal(false)} />}
      {editingIncome && <EditIncomeModal income={editingIncome} onClose={() => setEditingIncome(null)} />}
      {deletingIncome && <DeleteConfirm income={deletingIncome} onClose={() => setDeletingIncome(null)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>הכנסות</h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
              {isLoading ? "טוען..." : q
                ? `${visibleIncome.length} מתוך ${(income ?? []).length} הכנסות · ${fmt(total)}`
                : `${(income ?? []).length} הכנסות · סה״כ ${fmt(total)}`}
            </p>
          </div>
          <button onClick={() => setShowModal(true)} style={{
            display: "flex", alignItems: "center", gap: "7px", padding: "10px 18px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            border: "none", borderRadius: "10px", color: "#fff",
            fontSize: "14px", fontWeight: "500", cursor: "pointer",
            fontFamily: "var(--font-sans)", boxShadow: "0 4px 12px rgba(26,61,43,0.3)",
          }}>
            <Plus size={16} />הוסף הכנסה
          </button>
        </div>

        {/* Hero */}
        <div style={{
          borderRadius: "18px",
          background: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 55%, #081510 100%)",
          padding: "24px 28px", color: "#fff", position: "relative", overflow: "hidden",
          boxShadow: "0 8px 32px rgba(15,36,25,0.45)",
        }}>
          <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ position: "absolute", bottom: "-30px", right: "25%", width: "130px", height: "130px", borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "6px", letterSpacing: "0.04em" }}>סה״כ הכנסות</div>
                <div className="num" style={{ fontSize: "38px", fontWeight: "200", letterSpacing: "-1.5px", color: "#fff", lineHeight: 1 }}>{fmt(animGrand)}</div>
              </div>
            </div>
            {grandTotal > 0 && (
              <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {sources.filter(s => (sourceTotals[s.slug] ?? 0) > 0).map(s => {
                  const amt = sourceTotals[s.slug] ?? 0;
                  const pct = Math.round((amt / grandTotal) * 100);
                  return (
                    <div key={s.slug}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>{s.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <span className="num" style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>{pct}%</span>
                          <span className="num" style={{ fontSize: "13px", color: "#fff", fontWeight: "300" }}>{fmt(amt)}</span>
                        </div>
                      </div>
                      <div style={{ height: "3px", background: "rgba(255,255,255,0.15)", borderRadius: "99px" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "rgba(255,255,255,0.6)", borderRadius: "99px", transition: "width 0.6s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Filter + Search row */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={() => setFilter("all")} style={{
              padding: "6px 16px", borderRadius: "99px",
              border: `1px solid ${filter === "all" ? "#1A3D2B" : "#E8E2D9"}`,
              background: filter === "all" ? "#1A3D2B" : "#fff",
              color: filter === "all" ? "#fff" : "#888079",
              fontSize: "13px", fontWeight: filter === "all" ? "600" : "400",
              cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
            }}>הכל</button>
            {sources.map((s) => {
              const active = filter === s.slug;
              return (
                <button key={s.slug} onClick={() => setFilter(s.slug)} style={{
                  padding: "6px 16px", borderRadius: "99px",
                  border: `1px solid ${active ? s.color : "#E8E2D9"}`,
                  background: active ? s.bg_color : "#fff",
                  color: active ? s.color : "#888079",
                  fontSize: "13px", fontWeight: active ? "600" : "400",
                  cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
                }}>{s.label}</button>
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
              placeholder="חיפוש לפי משלם, תיאור, קטגוריה..."
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
            display: "grid", gridTemplateColumns: "110px 110px 70px 100px 1fr 1fr 90px 72px",
            padding: "12px 20px", borderBottom: "1px solid #EAE5DE",
            fontSize: "11px", fontWeight: "600", color: "#AAA099",
            letterSpacing: "0.04em", textTransform: "uppercase", gap: "12px",
          }}>
            <span>תאריך</span>
            <span style={{ textAlign: "right" }}>סכום</span>
            <span>מקור</span>
            <span>קטגוריה</span>
            <span>משלם</span>
            <span>תיאור</span>
            <span>אמצעי תשלום</span>
            <span></span>
          </div>

          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
          ) : visibleIncome.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <TrendingUp size={24} style={{ color: "#E8E2D9", marginBottom: "12px" }} />
              <div style={{ color: "#AAA099", fontSize: "14px" }}>
                {q ? `אין תוצאות עבור "${search}"` : "אין הכנסות להצגה"}
              </div>
              <div style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}>
                {q ? "נסו מילת חיפוש אחרת" : "לחצו על \"הוסף הכנסה\" להתחלה"}
              </div>
            </div>
          ) : (
            visibleIncome.map((inc, i) => {
              const srcStyle = getSourceStyle(sources, inc.source);
              const srcLabel = getSourceLabel(sources, inc.source);
              return (
                <div key={inc.id} style={{
                  display: "grid", gridTemplateColumns: "110px 110px 70px 100px 1fr 1fr 90px 72px",
                  padding: "14px 20px", gap: "12px",
                  borderBottom: i < visibleIncome.length - 1 ? "1px solid #F3EEE8" : "none",
                  alignItems: "center", transition: "background 0.1s",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="num" style={{ fontSize: "13px", color: "#6B6560" }}>
                    {new Date(inc.income_date).toLocaleDateString("he-IL")}
                  </span>
                  <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#2D6644", textAlign: "right" }}>
                    +{fmt(inc.amount)}
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 10px", borderRadius: "99px",
                    fontSize: "11px", fontWeight: "600",
                    background: srcStyle.bg_color, color: srcStyle.color, whiteSpace: "nowrap",
                  }}>
                    {srcLabel}
                  </span>
                  <div style={{ overflow: "hidden" }}>
                    <InlineCategoryCell inc={inc} />
                  </div>
                  <span style={{ fontSize: "13px", color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inc.payer ?? "—"}
                  </span>
                  <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inc.description ?? "—"}
                  </span>
                  <span style={{ fontSize: "12px", color: "#AAA099" }}>
                    {inc.payment_method ?? "—"}
                  </span>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setEditingIncome(inc)}
                      title="ערוך"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                      onMouseEnter={(el) => { el.currentTarget.style.background = "#F0F0EE"; el.currentTarget.style.color = "#1A1A1A"; }}
                      onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeletingIncome(inc)}
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
