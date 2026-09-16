import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Plus, X, TrendingUp, Pencil, Check, Trash2, Search, ExternalLink, ChevronDown, ChevronLeft, Layers } from "lucide-react";
import { useCanWrite } from "@/hooks/use-organization";
import { DateInput } from "@/components/ui/date-input";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { CategorySearchSelect } from "@/components/ui/category-search-select";
import { useCountUp } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useIncome,
  useAddIncome,
  useAddIncomeSplit,
  useDeleteIncomeGroup,
  useUpdateIncome,
  useDeleteIncome,
  useUpdateIncomeCategory,
  type BudgetSource,
  type NewIncome,
  type Income,
} from "@/hooks/use-income";
import { useBudgetCategories } from "@/hooks/use-expenses";
import { useAddBudgetCategory, useCreateFlowThroughPair } from "@/hooks/use-budget-plan";
import { useOrgBudgetSources, getSourceStyle, getSourceLabel, FALLBACK_SOURCES, type OrgBudgetSource } from "@/hooks/use-budget-sources";
import { useSourceBudgetPlans } from "@/hooks/use-source-budget-plans";
import { useGrades, useGradeSectionAmounts, computeTarget, useParentCollections, useAllParentSections, useCollectionPct } from "@/hooks/use-horim";

export const Route = createFileRoute("/_authenticated/income/")({
  component: IncomePage,
});

// ─── Config ───────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ["העברה בנקאית", "מזומן", "צ׳ק", "אשראי", "ביט", "פייבוקס", "אחר"];

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

// 2.6.0 (P3): פורמט עם אגורות (לתצוגת חלקי פיצול חיים)
const fmt2 = (n: number) => new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// 2.6.0 (P3): חלוקה שווה באגורות שלמות בשיטת שארית-גדולה. Σ = total בדיוק.
function splitEqual(totalStr: string, ids: string[]): Record<string, number> {
  const cents = Math.round(Number(totalStr) * 100);
  const out: Record<string, number> = {};
  const n = ids.length;
  if (!n || !isFinite(cents) || cents <= 0) { ids.forEach((id) => (out[id] = 0)); return out; }
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  ids.forEach((id, i) => { out[id] = (base + (i < rem ? 1 : 0)) / 100; });
  return out;
}

// 2.4.0 נושא 2: תג "צבוע ⇄" — זהה לתג במסך ההוצאות ובמצב תקציבי.
function FlowThroughTag() {
  return (
    <span title="תקציב צבוע — מקושר להוצאה תואמת" style={{
      flexShrink: 0, padding: "1px 7px", borderRadius: "99px", fontSize: "10px", fontWeight: 700,
      background: "#EEEAF7", color: "#5B4B8A", border: "1px solid #CFC3EC",
    }}>צבוע ⇄</span>
  );
}

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
  onSubmitPair,
  onSubmitSplit,
  initialSplit,
  onClose,
  isPending,
  submitLabel,
  submitColor = "linear-gradient(135deg, #2D6644, #1A3D2B)",
}: {
  initial: IncomeFormState;
  onSubmit: (form: IncomeFormState) => Promise<void>;
  // 2.4.0 נושא 2.ב: רישום זוג צבוע מצד ההכנסה — דרך אותה פונקציית DB אטומית
  onSubmitPair?: (form: IncomeFormState) => Promise<void>;
  // 2.6.0 (P3): פיצול פעימה בין קטגוריות — N שורות עם split_group_id משותף
  onSubmitSplit?: (legs: { budget_category_id: string; amount: number }[], form: IncomeFormState) => Promise<void>;
  initialSplit?: { selected: string[] };
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
  submitColor?: string;
}) {
  const [form, setForm] = useState<IncomeFormState>(initial);
  const [newCatName, setNewCatName] = useState("");
  const newCatRef = useRef<HTMLInputElement>(null);
  // For "אחר" custom payment method
  const isOtherPayment = form.payment_method === "אחר";
  const [customPayment, setCustomPayment] = useState(() =>
    initial.payment_method && !PAYMENT_METHODS.includes(initial.payment_method) ? initial.payment_method : ""
  );
  const { data: categories } = useBudgetCategories(form.source);
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const addCategory = useAddBudgetCategory();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isAddingNew = form.budget_category_id === "__new__";
  const activeSourceStyle = getSourceStyle(sources, form.source);
  // 2.4.0 נושא 2.ב: סעיף צבוע → הצעה לרשום זוג (הכנסה+הוצאה) — כמו במסך ההוצאות
  const [alsoExpense, setAlsoExpense] = useState(false);
  const selectedCat = (categories ?? []).find((c) => c.id === form.budget_category_id) as { is_flow_through?: boolean } | undefined;
  const selectedFlowThrough = Boolean(selectedCat?.is_flow_through);
  // 2.6.0 (P3): מצב פיצול פעימה בין קטגוריות. צבועות מוחרגות (מנוהלות כזוג).
  const splittableCats = (categories ?? []).filter((c) => !(c as { is_flow_through?: boolean }).is_flow_through);
  const coloredCats = (categories ?? []).filter((c) => (c as { is_flow_through?: boolean }).is_flow_through);
  const canSplit = Boolean(onSubmitSplit) && form.source !== "horim" && splittableCats.length > 1;
  const [splitMode, setSplitMode] = useState(Boolean(initialSplit));
  const [splitSel, setSplitSel] = useState<string[]>(initialSplit?.selected ?? []);
  const shares = splitMode ? splitEqual(form.amount, splitSel) : {};
  const splitSum = splitSel.reduce((sm, id) => sm + (shares[id] ?? 0), 0);
  const splitBalanced = Math.abs(splitSum - Number(form.amount || 0)) < 0.005;
  useEffect(() => {
    setAlsoExpense(selectedFlowThrough);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.budget_category_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast.error("יש להזין סכום תקין"); return; }
    if (isOtherPayment && !customPayment.trim()) { toast.error("יש להזין אמצעי תשלום"); return; }

    // 2.6.0 (P3): פיצול — N שורות שוות (שארית-גדולה), Σ=total מובטח
    if (splitMode && onSubmitSplit) {
      if (splitSel.length < 1) { toast.error("בחרו לפחות קטגוריה אחת לפיצול"); return; }
      const sh = splitEqual(form.amount, splitSel);
      const legs = splitSel.map((id) => ({ budget_category_id: id, amount: sh[id] ?? 0 }));
      await onSubmitSplit(legs, form);
      return;
    }

    let resolvedCategoryId: string | null = form.budget_category_id || null;
    if (isAddingNew) {
      if (!newCatName.trim()) { toast.error("יש להזין שם קטגוריה"); return; }
      const created = await addCategory.mutateAsync({ name: newCatName.trim(), source: form.source, plannedAmount: 0 });
      resolvedCategoryId = (created as { id: string } | undefined)?.id ?? null;
    }

    const finalPaymentMethod = isOtherPayment ? customPayment.trim() : form.payment_method;
    const resolved: IncomeFormState = { ...form, payment_method: finalPaymentMethod, budget_category_id: resolvedCategoryId ?? "" };
    if (alsoExpense && onSubmitPair) { await onSubmitPair(resolved); return; }
    await onSubmit(resolved);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>תאריך</label>
          <DateInput value={form.income_date} onChange={(v) => set("income_date", v)} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>סכום (₪)</label>
          <input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)}
            placeholder="0" min="0" step="0.01" required autoFocus style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
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

      {canSplit && !initialSplit && (
        <button type="button" onClick={() => { const next = !splitMode; setSplitMode(next); if (next && splitSel.length === 0) setSplitSel(splittableCats.map((c) => c.id)); }}
          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "99px", fontSize: "12.5px", cursor: "pointer", fontFamily: "var(--font-sans)", border: `1.5px solid ${splitMode ? "#2D6644" : "#E8E2D9"}`, background: splitMode ? "#EAF3EB" : "#fff", color: splitMode ? "#1A3D2B" : "#6B6560" }}>
          <Layers size={13} /> {splitMode ? "מחלק בין קטגוריות — לחצו לביטול" : "חלק בין קטגוריות"}
        </button>
      )}
      {splitMode ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <label style={labelStyle}>חלוקה בין קטגוריות</label>
            <button type="button" onClick={() => setSplitSel(splitSel.length === splittableCats.length ? [] : splittableCats.map((c) => c.id))}
              style={{ background: "none", border: "none", color: "#2D6644", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-sans)", textDecoration: "underline" }}>
              {splitSel.length === splittableCats.length ? "נקה הכל" : "בחר הכל"}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
            {splittableCats.map((c) => {
              const on = splitSel.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => setSplitSel(on ? splitSel.filter((x) => x !== c.id) : [...splitSel, c.id])}
                  style={{ padding: "6px 11px", borderRadius: "99px", fontSize: "12.5px", cursor: "pointer", fontFamily: "var(--font-sans)", border: `1.5px solid ${on ? activeSourceStyle.color : "#E8E2D9"}`, background: on ? activeSourceStyle.bg_color : "#fff", color: on ? activeSourceStyle.color : "#888079", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span>{c.name}</span>
                  {on && Number(form.amount) > 0 && <span className="num" style={{ fontSize: "11px", opacity: 0.85 }}>{fmt2(shares[c.id] ?? 0)}</span>}
                </button>
              );
            })}
            {coloredCats.map((c) => (
              <span key={c.id} title="סעיף צבוע — מנוהל כזוג הכנסה+הוצאה, לא נכלל בפיצול"
                style={{ padding: "6px 11px", borderRadius: "99px", fontSize: "12.5px", border: "1px dashed #CFC3EC", background: "#F7F5FB", color: "#B0A8C8", display: "inline-flex", alignItems: "center", gap: "5px", cursor: "not-allowed" }}>
                {c.name} <span style={{ fontSize: "9.5px", fontWeight: 700 }}>צבוע ⇄</span>
              </span>
            ))}
          </div>
          <div style={{ marginTop: "9px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
            <span style={{ color: "#6B6560" }}>{splitSel.length} קטגוריות · חלוקה שווה</span>
            <span className="num" style={{ color: splitBalanced ? "#2D6644" : "#B5472A", fontWeight: 600 }}>
              סה&quot;כ מחולק: {fmt2(splitSum)}{Number(form.amount) > 0 ? ` / ${fmt2(Number(form.amount))}` : ""}
            </span>
          </div>
        </div>
      ) : (<>
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

      {/* 2.4.0 נושא 2.ב: רישום זוג צבוע — הכנסה והוצאה תואמות בפעולה אחת */}
      {onSubmitPair && (
        <label style={{
          display: "flex", alignItems: "flex-start", gap: "9px", cursor: "pointer",
          padding: "10px 12px", borderRadius: "10px",
          border: `1px solid ${alsoExpense ? "#CFC3EC" : "#E8E2D9"}`,
          background: alsoExpense ? "#F4F1FB" : "#FAFAF8",
        }}>
          <input type="checkbox" checked={alsoExpense} onChange={(e) => setAlsoExpense(e.target.checked)}
            style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "#5B4B8A", cursor: "pointer" }} />
          <span style={{ fontSize: "12.5px", color: "#4A4A4A", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: "#5B4B8A" }}>תקציב צבוע ⇄</span>
            {" — "}רשום במקביל גם הוצאה תואמת באותו סכום. הכסף נכנס ויוצא דרך בית הספר, והזוג נשמר יחד.
            {selectedFlowThrough && <span style={{ color: "#8A7FB0" }}> (הסעיף שנבחר מסומן כצבוע)</span>}
          </span>
        </label>
      )}
      </>)}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>משלם / גורם מממן</label>
          <input type="text" value={form.payer} onChange={(e) => set("payer", e.target.value)}
            placeholder="שם המשלם" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>אמצעי תשלום</label>
          <select
            value={isOtherPayment ? "אחר" : (PAYMENT_METHODS.includes(form.payment_method) ? form.payment_method : (form.payment_method ? "אחר" : ""))}
            onChange={(e) => { set("payment_method", e.target.value); if (e.target.value !== "אחר") setCustomPayment(""); }}
            style={inputStyle}
          >
            <option value="">— בחר —</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {isOtherPayment && (
            <input
              type="text"
              value={customPayment}
              onChange={(e) => setCustomPayment(e.target.value)}
              placeholder="פרט את אמצעי התשלום..."
              autoFocus
              style={{ ...inputStyle, marginTop: "8px", borderColor: "#B5472A" }}
            />
          )}
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
          {isPending ? "שומר..." : splitMode ? `רשום מפוצל (${splitSel.length})` : (alsoExpense && onSubmitPair ? "רשום כהכנסה והוצאה" : submitLabel)}
        </button>
      </div>
    </form>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle: string; onClose: () => void; children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center",
      padding: isMobile ? 0 : "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={isMobile ? "hk-bottom-sheet" : ""} style={{
        background: "#fff",
        borderRadius: isMobile ? "20px 20px 0 0" : "18px",
        width: "100%",
        maxWidth: isMobile ? "100%" : "480px",
        maxHeight: isMobile ? "92dvh" : "90vh",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18), 0 24px 80px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "20px 20px 16px", borderBottom: "1px solid #EAE5DE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "relative", flexShrink: 0,
        }}>
          {isMobile && (
            <div style={{
              position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
              width: "36px", height: "4px", borderRadius: "2px", background: "#E8E2D9",
            }} />
          )}
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "8px", color: "#AAA099", display: "flex" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Add Income Modal ─────────────────────────────────────────────────────────

function AddIncomeModal({ onClose, defaultSource }: { onClose: () => void; defaultSource: string }) {
  const addIncome = useAddIncome();
  const createPair = useCreateFlowThroughPair();
  const addSplit = useAddIncomeSplit();
  const initial: IncomeFormState = {
    income_date: today(), amount: "", source: defaultSource, bank_account: "school",
    payer: "", description: "", payment_method: "", reference_number: "", budget_category_id: "", notes: "",
  };
  const handleSubmit = async (form: IncomeFormState) => {
    try {
      await addIncome.mutateAsync({
        income_date: form.income_date, amount: Math.round(Number(form.amount) * 100) / 100,
        source: form.source, bank_account: form.bank_account,
        payer: form.payer || null, description: form.description || null,
        payment_method: form.payment_method || null, reference_number: form.reference_number || null,
        budget_category_id: form.budget_category_id || null, notes: form.notes || null,
      } as NewIncome);
      toast.success("ההכנסה נוספה בהצלחה");
      onClose();
    } catch { toast.error("שגיאה בשמירת ההכנסה"); }
  };
  // 2.4.0 נושא 2.ב: זוג צבוע אטומי מצד ההכנסה — אותה פונקציית DB כמו בהוצאה.
  const handleSubmitPair = async (form: IncomeFormState) => {
    try {
      await createPair.mutateAsync({
        source: form.source,
        amount: Math.round(Number(form.amount) * 100) / 100,
        date: form.income_date,
        bankAccount: form.bank_account,
        budgetCategoryId: form.budget_category_id || null,
        // המשלם הוא מי ששילם לביה"ס, לא הספק (מי שמקבלים ממנו) — משאירים ספק ריק בכיוון הזה
        supplier: null,
        payer: form.payer || null,
        description: form.description || null,
      });
      toast.success("נרשמו הכנסה והוצאה תואמות (תקציב צבוע)");
      onClose();
    } catch { toast.error("שגיאה ברישום הזוג הצבוע"); }
  };
  // 2.6.0 (P3): פיצול פעימה — N שורות עם split_group_id משותף (insert אחד).
  const handleSubmitSplit = async (legs: { budget_category_id: string; amount: number }[], form: IncomeFormState) => {
    try {
      const groupId = crypto.randomUUID();
      await addSplit.mutateAsync({
        split_group_id: groupId,
        base: {
          income_date: form.income_date, source: form.source, bank_account: form.bank_account,
          payer: form.payer || null, description: form.description || null,
          payment_method: form.payment_method || null, reference_number: form.reference_number || null, notes: form.notes || null,
        },
        legs,
      });
      toast.success(`הפעימה חולקה בין ${legs.length} קטגוריות`);
      onClose();
    } catch { toast.error("שגיאה ברישום הפיצול"); }
  };
  return (
    <Modal title="הוספת הכנסה" subtitle="הזן את פרטי ההכנסה" onClose={onClose}>
      <IncomeForm initial={initial} onSubmit={handleSubmit} onSubmitPair={handleSubmitPair} onSubmitSplit={handleSubmitSplit} onClose={onClose}
        isPending={addIncome.isPending || createPair.isPending || addSplit.isPending} submitLabel="הוסף הכנסה" />
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
        income_date: form.income_date, amount: Math.round(Number(form.amount) * 100) / 100,
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
  const isMobile = useIsMobile();
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
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center",
      padding: isMobile ? 0 : "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={isMobile ? "hk-bottom-sheet" : ""} style={{
        background: "#fff",
        borderRadius: isMobile ? "20px 20px 0 0" : "16px",
        width: "100%",
        maxWidth: isMobile ? "100%" : "380px",
        padding: isMobile ? "28px 20px calc(20px + env(safe-area-inset-bottom, 0px))" : "28px 28px 24px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
        position: "relative",
      }}>
        {isMobile && (
          <div style={{
            position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
            width: "36px", height: "4px", borderRadius: "2px", background: "#E8E2D9",
          }} />
        )}
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <Trash2 size={20} color="#DC2626" />
        </div>
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A", marginBottom: "8px" }}>מחיקת הכנסה</div>
        <div style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.6, marginBottom: "24px" }}>
          האם למחוק הכנסה של <strong>{fmt(income.amount)}</strong>
          {income.payer ? ` מ-${income.payer}` : ""}? פעולה זו אינה הפיכה.
        </div>
        {income.linkedExpense && (
          <div style={{ fontSize: "12.5px", color: "#5B4B8A", background: "#F4F1FB", border: "1px solid #CFC3EC", borderRadius: "9px", padding: "9px 11px", lineHeight: 1.5, marginBottom: "20px" }}>
            רשומה זו היא חלק מזוג צבוע ⇄ — הרשומה התואמת תישאר ותנותק מהקישור.
          </div>
        )}
        {income.split_group_id && (
          <div style={{ fontSize: "12.5px", color: "#8B5E0B", background: "#FDF6E3", border: "1px solid #E8CF9C", borderRadius: "9px", padding: "9px 11px", lineHeight: 1.5, marginBottom: "20px" }}>
            רשומה זו היא רגל בודדת מפעימה מפוצלת — שאר הרגליים יישארו. למחיקת הפעימה כולה השתמשו בכפתור המחיקה שעל שורת הפעימה.
          </div>
        )}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px 0", border: "1px solid #E8E2D9", borderRadius: "10px",
            background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>ביטול</button>
          <button onClick={handleDelete} disabled={deleteIncome.isPending} style={{
            flex: 1, padding: "12px 0", border: "none", borderRadius: "10px",
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
  const canWrite = useCanWrite();

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
    if (!canWrite) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: inc.budget_categories?.name ? "#1A1A1A" : "#C0BAB4" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.budget_categories?.name ?? "—"}</span>
          {inc.linkedExpense && <FlowThroughTag />}
        </span>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", minWidth: 0 }}
        onClick={() => { setSelectedId(inc.budget_category_id ?? ""); setEditing(true); }}>
        <span style={{ fontSize: "13px", color: inc.budget_categories?.name ? "#1A1A1A" : "#C0BAB4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {inc.budget_categories?.name ?? "—"}
        </span>
        {inc.linkedExpense && <FlowThroughTag />}
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

// ─── Mobile Card Row ──────────────────────────────────────────────────────────

function IncomeMobileCard({
  inc, onEdit, onDelete, sources,
}: {
  inc: Income;
  onEdit: (i: Income) => void;
  onDelete: (i: Income) => void;
  sources: OrgBudgetSource[];
}) {
  const srcStyle = getSourceStyle(sources, inc.source);
  const srcLabel = getSourceLabel(sources, inc.source);
  const canWrite = useCanWrite();
  return (
    <div style={{
      padding: "14px 16px",
      borderBottom: "1px solid #F3EEE8",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    }}>
      <div style={{
        width: "9px", height: "9px", borderRadius: "50%",
        background: srcStyle.color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
          <span className="num" style={{ fontSize: "17px", fontWeight: "600", color: "#2D6644" }}>
            +{fmt(inc.amount)}
          </span>
          <span className="num" style={{ fontSize: "11px", color: "#AAA099", whiteSpace: "nowrap" }}>
            {new Date(inc.income_date).toLocaleDateString("he-IL")}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#1A1A1A", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {inc.payer ?? inc.description ?? "—"}
        </div>
        <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            padding: "2px 8px", borderRadius: "99px",
            fontSize: "10px", fontWeight: "600",
            background: srcStyle.bg_color, color: srcStyle.color,
          }}>{srcLabel}</span>
          {inc.budget_categories?.name && (
            <span style={{ fontSize: "11px", color: "#AAA099" }}>· {inc.budget_categories.name}</span>
          )}
          {inc.linkedExpense && <FlowThroughTag />}
          {inc.payment_method && (
            <span style={{ fontSize: "11px", color: "#AAA099" }}>· {inc.payment_method}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {canWrite && (
          <button onClick={() => onEdit(inc)} style={{
            background: "#F7F4EF", border: "none", borderRadius: "9px",
            width: "36px", height: "36px", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "#6B6560",
          }}>
            <Pencil size={14} />
          </button>
        )}
        {canWrite && (
          <button onClick={() => onDelete(inc)} style={{
            background: "#FEF2F2", border: "none", borderRadius: "9px",
            width: "36px", height: "36px", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "#DC2626",
          }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── 2.6.0 (P3): עריכת פעימה מפוצלת (עורך הפיצול מאותחל) ──────────────────────
function EditSplitModal({ legs, onClose }: { legs: Income[]; onClose: () => void }) {
  const addSplit = useAddIncomeSplit();
  const delGroup = useDeleteIncomeGroup();
  const first = legs[0];
  const total = legs.reduce((sm, l) => sm + l.amount, 0);
  const selected = legs.map((l) => l.budget_category_id).filter(Boolean) as string[];
  const initial: IncomeFormState = {
    income_date: first.income_date, amount: String(total), source: first.source, bank_account: first.bank_account,
    payer: first.payer ?? "", description: first.description ?? "", payment_method: first.payment_method ?? "",
    reference_number: first.reference_number ?? "", budget_category_id: "", notes: first.notes ?? "",
  };
  const handleSubmitSplit = async (newLegs: { budget_category_id: string; amount: number }[], form: IncomeFormState) => {
    try {
      const groupId = crypto.randomUUID();
      await addSplit.mutateAsync({
        split_group_id: groupId,
        base: {
          income_date: form.income_date, source: form.source, bank_account: form.bank_account,
          payer: form.payer || null, description: form.description || null,
          payment_method: form.payment_method || null, reference_number: form.reference_number || null, notes: form.notes || null,
        },
        legs: newLegs,
      });
      if (first.split_group_id) await delGroup.mutateAsync(first.split_group_id);
      toast.success("הפיצול עודכן");
      onClose();
    } catch { toast.error("שגיאה בעדכון הפיצול"); }
  };
  return (
    <Modal title="עריכת פעימה מפוצלת" subtitle="עדכן את הסכום והקטגוריות" onClose={onClose}>
      <IncomeForm initial={initial} initialSplit={{ selected }} onSubmit={async () => {}} onSubmitSplit={handleSubmitSplit} onClose={onClose}
        isPending={addSplit.isPending || delGroup.isPending} submitLabel="שמור" />
    </Modal>
  );
}

// ─── 2.6.0 (P3): מחיקת פעימה מפוצלת כיחידה ────────────────────────────────────
function GroupDeleteConfirm({ group, onClose }: { group: { groupId: string; legs: Income[] }; onClose: () => void }) {
  const isMobile = useIsMobile();
  const delGroup = useDeleteIncomeGroup();
  const total = group.legs.reduce((sm, l) => sm + l.amount, 0);
  const handleDelete = async () => {
    try { await delGroup.mutateAsync(group.groupId); toast.success("הפעימה נמחקה"); onClose(); }
    catch { toast.error("שגיאה במחיקה"); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : "20px" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={isMobile ? "hk-bottom-sheet" : ""} style={{ background: "#fff", borderRadius: isMobile ? "20px 20px 0 0" : "16px", width: "100%", maxWidth: isMobile ? "100%" : "400px", padding: isMobile ? "28px 20px calc(20px + env(safe-area-inset-bottom, 0px))" : "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <Trash2 size={20} color="#DC2626" />
        </div>
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A", marginBottom: "8px" }}>מחיקת פעימה מפוצלת</div>
        <div style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.6, marginBottom: "20px" }}>
          פעימה זו מחולקת ל-<strong>{group.legs.length}</strong> רשומות בסך <strong>{fmt(total)}</strong>. מחיקה תסיר את כל הרשומות בפעימה. פעולה זו אינה הפיכה.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px 0", border: "1px solid #E8E2D9", borderRadius: "10px", background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
          <button onClick={handleDelete} disabled={delGroup.isPending} style={{ flex: 1, padding: "12px 0", border: "none", borderRadius: "10px", background: delGroup.isPending ? "#888" : "#DC2626", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: delGroup.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
            {delGroup.isPending ? "מוחק..." : `מחק פעימה (${group.legs.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IncomePage() {
  const isMobile = useIsMobile();
  const canWrite = useCanWrite();
  const [filter, setFilter] = useState<BudgetSource | "all">("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [deletingIncome, setDeletingIncome] = useState<Income | null>(null);
  const [editingSplit, setEditingSplit] = useState<Income[] | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<{ groupId: string; legs: Income[] } | null>(null);
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());
  const toggleSplit = (id: string) => setExpandedSplits((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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

  // Parent collections flow into horim's actuals — single source of truth
  // (entered and managed in the horim screen, displayed here as list rows + totals)
  const { data: parentColls } = useParentCollections();
  const { data: collGrades } = useGrades();
  const { data: collSections } = useAllParentSections();
  const collectionRows = (parentColls ?? []).map((c) => ({
    id: c.id,
    date: c.collection_date,
    amount: c.amount,
    gradeName: (collGrades ?? []).find((g) => g.id === c.grade_id)?.name ?? "—",
    sectionName: c.parent_section_id === null
      ? "לא משויך"
      : ((collSections ?? []).find((s) => s.id === c.parent_section_id)?.name ?? "—"),
    notes: c.notes,
  }));
  const filteredColls = (filter === "all" || filter === "horim") ? collectionRows : [];
  const visibleColls = q
    ? filteredColls.filter((c) =>
        [c.gradeName, c.sectionName, c.notes, "גביית הורים"].some((f) => f?.toLowerCase().includes(q))
      )
    : filteredColls;
  const parentCollTotal = collectionRows.reduce((sum, c) => sum + c.amount, 0);

  // Merged, date-sorted display rows (income + collections). 2.6.0 (P3):
  // שורות עם split_group_id מקובצות לשורת "פעימה מפוצלת" אחת.
  type DisplayRow =
    | { kind: "income"; inc: Income }
    | { kind: "split"; groupId: string; legs: Income[] }
    | { kind: "coll"; c: (typeof collectionRows)[number] };
  const splitMap = new Map<string, Income[]>();
  const singleIncome: Income[] = [];
  for (const inc of visibleIncome) {
    if (inc.split_group_id) {
      const arr = splitMap.get(inc.split_group_id) ?? [];
      arr.push(inc); splitMap.set(inc.split_group_id, arr);
    } else singleIncome.push(inc);
  }
  const mergedRows: DisplayRow[] = [
    ...singleIncome.map((inc): DisplayRow => ({ kind: "income", inc })),
    ...[...splitMap.entries()].map(([groupId, legs]): DisplayRow => ({ kind: "split", groupId, legs })),
    ...visibleColls.map((c): DisplayRow => ({ kind: "coll", c })),
  ].sort((a, b) => {
    const da = a.kind === "income" ? a.inc.income_date : a.kind === "split" ? a.legs[0].income_date : a.c.date;
    const db = b.kind === "income" ? b.inc.income_date : b.kind === "split" ? b.legs[0].income_date : b.c.date;
    return db.localeCompare(da);
  });

  // Counts + totals include collections (numeric consistency with the hero)
  const income = filteredBySource;
  const listCount = income.length + filteredColls.length;
  const total = visibleIncome.reduce((sum, e) => sum + e.amount, 0)
    + visibleColls.reduce((sum, c) => sum + c.amount, 0);
  const sourceTotals: Record<string, number> = {};
  (allIncome ?? []).forEach((i) => { sourceTotals[i.source] = (sourceTotals[i.source] ?? 0) + i.amount; });
  if (parentCollTotal > 0) sourceTotals["horim"] = (sourceTotals["horim"] ?? 0) + parentCollTotal;

  const grandTotal = Object.values(sourceTotals).reduce((a, b) => a + b, 0);
  const animGrand = useCountUp(grandTotal);
  const navigate = useNavigate();

  // Planned vs. actual — global plans from source_budget_plans;
  // horim's plan is the derived collection target (same computation as the horim screen)
  const { data: sourcePlans } = useSourceBudgetPlans();
  const { data: horimGrades } = useGrades();
  const { data: horimGSA } = useGradeSectionAmounts();
  const { data: collectionPct = 85 } = useCollectionPct();
  const horimTarget = (horimGSA ?? []).reduce((sum, gsa) => {
    const grade = (horimGrades ?? []).find((g) => g.id === gsa.grade_id);
    return grade ? sum + computeTarget(grade, gsa, collectionPct) : sum;
  }, 0);
  // Full 100% target — shown alongside the year-pct target (both views at a glance)
  const horimTargetFull = (horimGSA ?? []).reduce((sum, gsa) => {
    const grade = (horimGrades ?? []).find((g) => g.id === gsa.grade_id);
    return grade ? sum + gsa.amount_per_student * grade.student_count : sum;
  }, 0);
  const plannedFor = (slug: string): number =>
    slug === "horim" ? horimTarget : (sourcePlans?.[slug] ?? 0);
  const anyPlanned = sources.some((s) => plannedFor(s.slug) > 0);

  return (
    <>
      {showModal && <AddIncomeModal defaultSource={defaultSource} onClose={() => setShowModal(false)} />}
      {editingIncome && <EditIncomeModal income={editingIncome} onClose={() => setEditingIncome(null)} />}
      {deletingIncome && <DeleteConfirm income={deletingIncome} onClose={() => setDeletingIncome(null)} />}
      {editingSplit && <EditSplitModal legs={editingSplit} onClose={() => setEditingSplit(null)} />}
      {deletingGroup && <GroupDeleteConfirm group={deletingGroup} onClose={() => setDeletingGroup(null)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? "22px" : "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>הכנסות</h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
              {isLoading ? "טוען..." : q
                ? `${mergedRows.length} מתוך ${listCount} הכנסות · ${fmt(total)}`
                : `${listCount} הכנסות · סה״כ ${fmt(total)}`}
            </p>
          </div>
          {canWrite && (
            <button onClick={() => setShowModal(true)} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: isMobile ? "11px 0" : "10px 18px",
              width: isMobile ? "100%" : "auto",
              justifyContent: "center",
              background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
              border: "none", borderRadius: "10px", color: "#fff",
              fontSize: "14px", fontWeight: "500", cursor: "pointer",
              fontFamily: "var(--font-sans)", boxShadow: "0 4px 12px rgba(26,61,43,0.3)",
              flexShrink: 0,
            }}>
              <Plus size={16} />הוסף הכנסה
            </button>
          )}
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
            {(grandTotal > 0 || anyPlanned) && (
              <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {sources.filter(s => (sourceTotals[s.slug] ?? 0) > 0 || plannedFor(s.slug) > 0).map(s => {
                  const amt = sourceTotals[s.slug] ?? 0;
                  const planned = plannedFor(s.slug);
                  if (planned > 0) {
                    // Planned vs. actual — progress toward the plan
                    const pct = Math.round((amt / planned) * 100);
                    return (
                      <div key={s.slug}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
                            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>
                              {s.label}
                              {s.slug === "horim" && <span style={{ color: "rgba(255,255,255,0.4)" }}> · יעד גבייה</span>}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            <span className="num" style={{ fontSize: "12px", color: pct >= 100 ? "#8FDCA8" : "rgba(255,255,255,0.55)" }}>{pct}%</span>
                            <span className="num" style={{ fontSize: "13px", color: "#fff", fontWeight: "300" }}>
                              {fmt(amt)}{" "}
                              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11.5px" }}>
                                {s.slug === "horim" && horimTargetFull > planned
                                  ? <>מתוך {fmt(planned)} ({collectionPct}%) · מלא {fmt(horimTargetFull)}</>
                                  : <>מתוך {fmt(planned)} מתוכנן</>}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div style={{ height: "4px", background: "rgba(255,255,255,0.15)", borderRadius: "99px" }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: pct >= 100 ? "#8FDCA8" : "rgba(255,255,255,0.6)", borderRadius: "99px", transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    );
                  }
                  // No plan for this source — original share-of-total display
                  const sharePct = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;
                  return (
                    <div key={s.slug}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>{s.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <span className="num" style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>{sharePct}%</span>
                          <span className="num" style={{ fontSize: "13px", color: "#fff", fontWeight: "300" }}>{fmt(amt)}</span>
                        </div>
                      </div>
                      <div style={{ height: "3px", background: "rgba(255,255,255,0.15)", borderRadius: "99px" }}>
                        <div style={{ width: `${sharePct}%`, height: "100%", background: "rgba(255,255,255,0.6)", borderRadius: "99px", transition: "width 0.6s ease" }} />
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

        {/* List / Table */}
        <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
          ) : mergedRows.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <TrendingUp size={24} style={{ color: "#E8E2D9", marginBottom: "12px" }} />
              <div style={{ color: "#AAA099", fontSize: "14px" }}>
                {q ? `אין תוצאות עבור "${search}"` : "אין הכנסות להצגה"}
              </div>
              <div style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}>
                {q ? 'נסו/י מילת חיפוש אחרת' : 'לחצו על "הוסף הכנסה" להתחלה'}
              </div>
            </div>
          ) : isMobile ? (
            /* ── Mobile: card list ── */
            mergedRows.map((row) => row.kind === "income" ? (
              <IncomeMobileCard
                key={row.inc.id}
                inc={row.inc}
                sources={sources}
                onEdit={setEditingIncome}
                onDelete={setDeletingIncome}
              />
            ) : row.kind === "split" ? (
              (() => {
                const legs = row.legs;
                const gtotal = legs.reduce((sm, l) => sm + l.amount, 0);
                const sStyle = getSourceStyle(sources, legs[0].source);
                const sLabel = getSourceLabel(sources, legs[0].source);
                const open = expandedSplits.has(row.groupId);
                return (
                  <div key={`split-${row.groupId}`} style={{ padding: "14px 16px", borderBottom: "1px solid #F3EEE8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: "600", background: sStyle.bg_color, color: sStyle.color }}>{sLabel}</span>
                      <span className="num" style={{ fontSize: "15px", fontWeight: "500", color: "#2D6644" }}>+{fmt(gtotal)}</span>
                    </div>
                    <button onClick={() => toggleSplit(row.groupId)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: "5px", color: "#2D6644", fontSize: "13px", fontFamily: "var(--font-sans)", marginBottom: "4px" }}>
                      <Layers size={13} /> פעימה מפוצלת · {legs.length} סעיפים {open ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                    </button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="num" style={{ fontSize: "12.5px", color: "#6B6560" }}>{legs[0].payer ? `${legs[0].payer} · ` : ""}{new Date(legs[0].income_date).toLocaleDateString("he-IL")}</span>
                      {canWrite && (
                        <div style={{ display: "flex", gap: "12px" }}>
                          <button onClick={() => setEditingSplit(legs)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8B8079", display: "flex" }}><Pencil size={15} /></button>
                          <button onClick={() => setDeletingGroup({ groupId: row.groupId, legs })} style={{ background: "none", border: "none", cursor: "pointer", color: "#8B8079", display: "flex" }}><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>
                    {open && (
                      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px", paddingRight: "4px" }}>
                        {legs.map((l) => (
                          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                            <span style={{ color: "#4A453F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↳ {l.budget_categories?.name ?? "—"}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                              <span className="num" style={{ color: "#6B8F7D" }}>+{fmt(l.amount)}</span>
                              {canWrite && <button onClick={() => setDeletingIncome(l)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C9BEB6", display: "flex" }}><Trash2 size={12} /></button>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* Collection card — same look, managed in the horim screen */
              <div key={`coll-${row.c.id}`}
                onClick={() => navigate({ to: "/horim" })}
                style={{ padding: "14px 16px", borderBottom: "1px solid #F3EEE8", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "5px",
                    padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: "600",
                    background: getSourceStyle(sources, "horim").bg_color, color: getSourceStyle(sources, "horim").color,
                  }}>
                    גביית הורים
                  </span>
                  <span className="num" style={{ fontSize: "15px", fontWeight: "500", color: "#2D6644" }}>+{fmt(row.c.amount)}</span>
                </div>
                <div style={{ fontSize: "13px", color: "#1A1A1A", marginBottom: "3px" }}>
                  {row.c.gradeName} · {row.c.sectionName}{row.c.notes ? ` · ${row.c.notes}` : ""}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="num" style={{ fontSize: "12px", color: "#AAA099" }}>
                    {new Date(row.c.date).toLocaleDateString("he-IL")}
                  </span>
                  <span style={{ fontSize: "11.5px", color: "#8B2F6E", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    ניהול במסך הורים <ExternalLink size={11} />
                  </span>
                </div>
              </div>
            ))
          ) : (
            /* ── Desktop: scrollable table ── */
            <div style={{ overflowX: "auto" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "110px 110px 70px 100px 1fr 1fr 90px 72px",
                minWidth: "740px",
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
              {mergedRows.map((row, i) => {
                if (row.kind === "coll") {
                  const horimStyle = getSourceStyle(sources, "horim");
                  return (
                    <div key={`coll-${row.c.id}`}
                      onClick={() => navigate({ to: "/horim" })}
                      title="עריכה ומחיקה במסך גביית הורים"
                      style={{
                        display: "grid", gridTemplateColumns: "110px 110px 70px 100px 1fr 1fr 90px 72px",
                        minWidth: "740px",
                        padding: "14px 20px", gap: "12px",
                        borderBottom: i < mergedRows.length - 1 ? "1px solid #F3EEE8" : "none",
                        alignItems: "center", transition: "background 0.1s", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF8")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="num" style={{ fontSize: "13px", color: "#6B6560" }}>
                        {new Date(row.c.date).toLocaleDateString("he-IL")}
                      </span>
                      <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#2D6644", textAlign: "right" }}>
                        +{fmt(row.c.amount)}
                      </span>
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "3px 10px", borderRadius: "99px",
                        fontSize: "11px", fontWeight: "600",
                        background: horimStyle.bg_color, color: horimStyle.color, whiteSpace: "nowrap",
                      }}>
                        גביית הורים
                      </span>
                      <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.c.sectionName}
                      </span>
                      <span style={{ fontSize: "13px", color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.c.gradeName}
                      </span>
                      <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.c.notes ?? "—"}
                      </span>
                      <span style={{ fontSize: "12px", color: "#AAA099" }}>—</span>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: "11.5px", color: horimStyle.color, display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
                          ניהול <ExternalLink size={11} />
                        </span>
                      </div>
                    </div>
                  );
                }
                if (row.kind === "split") {
                  const legs = row.legs;
                  const gtotal = legs.reduce((sm, l) => sm + l.amount, 0);
                  const sStyle = getSourceStyle(sources, legs[0].source);
                  const sLabel = getSourceLabel(sources, legs[0].source);
                  const open = expandedSplits.has(row.groupId);
                  const catNames = legs.map((l) => l.budget_categories?.name ?? "—").join(", ");
                  return (
                    <div key={`split-${row.groupId}`} style={{ borderBottom: i < mergedRows.length - 1 ? "1px solid #F3EEE8" : "none" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "110px 110px 70px 100px 1fr 1fr 90px 72px", minWidth: "740px", padding: "14px 20px", gap: "12px", alignItems: "center" }}>
                        <span className="num" style={{ fontSize: "13px", color: "#6B6560" }}>{new Date(legs[0].income_date).toLocaleDateString("he-IL")}</span>
                        <span className="num" style={{ fontSize: "14px", fontWeight: "500", color: "#2D6644", textAlign: "right" }}>+{fmt(gtotal)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: "600", background: sStyle.bg_color, color: sStyle.color, whiteSpace: "nowrap" }}>{sLabel}</span>
                        <button onClick={() => toggleSplit(row.groupId)} title="פעימה מפוצלת" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: "4px", color: "#2D6644", fontSize: "12.5px", fontFamily: "var(--font-sans)" }}>
                          <Layers size={12} /> {legs.length} סעיפים {open ? <ChevronDown size={13} /> : <ChevronLeft size={13} />}
                        </button>
                        <span style={{ fontSize: "13px", color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{legs[0].payer ?? "—"}</span>
                        <span style={{ fontSize: "12.5px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={catNames}>מחולק: {catNames}</span>
                        <span style={{ fontSize: "12px", color: "#AAA099" }}>{legs[0].payment_method ?? "—"}</span>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          {canWrite && <button onClick={() => setEditingSplit(legs)} title="ערוך פעימה" style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex" }}><Pencil size={13} /></button>}
                          {canWrite && <button onClick={() => setDeletingGroup({ groupId: row.groupId, legs })} title="מחק פעימה" style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex" }}><Trash2 size={13} /></button>}
                        </div>
                      </div>
                      {open && legs.map((l) => (
                        <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "8px 40px 8px 20px", background: "#FAFAF8" }}>
                          <span style={{ fontSize: "12.5px", color: "#4A453F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↳ {l.budget_categories?.name ?? "—"}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                            <span className="num" style={{ fontSize: "13px", color: "#6B8F7D" }}>+{fmt(l.amount)}</span>
                            {canWrite && <button onClick={() => setDeletingIncome(l)} title="מחק רשומה בודדת" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#C9BEB6", display: "flex" }}><Trash2 size={11} /></button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                const inc = row.inc;
                const srcStyle = getSourceStyle(sources, inc.source);
                const srcLabel = getSourceLabel(sources, inc.source);
                return (
                  <div key={inc.id} style={{
                    display: "grid", gridTemplateColumns: "110px 110px 70px 100px 1fr 1fr 90px 72px",
                    minWidth: "740px",
                    padding: "14px 20px", gap: "12px",
                    borderBottom: i < mergedRows.length - 1 ? "1px solid #F3EEE8" : "none",
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
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canWrite && (
                        <button
                          onClick={() => setEditingIncome(inc)}
                          title="ערוך"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                          onMouseEnter={(el) => { el.currentTarget.style.background = "#F0F0EE"; el.currentTarget.style.color = "#1A1A1A"; }}
                          onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {canWrite && (
                        <button
                          onClick={() => setDeletingIncome(inc)}
                          title="מחק"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                          onMouseEnter={(el) => { el.currentTarget.style.background = "#FEF2F2"; el.currentTarget.style.color = "#DC2626"; }}
                          onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
