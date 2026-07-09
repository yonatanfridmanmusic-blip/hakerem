import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, AlertTriangle, Pencil, Trash2, Search, Paperclip, Check, Upload } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { CategorySearchSelect } from "@/components/ui/category-search-select";
import { useCountUp } from "@/hooks/use-count-up";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
import { useOrgBudgetSources, getSourceStyle, getSourceLabel, FALLBACK_SOURCES, type OrgBudgetSource } from "@/hooks/use-budget-sources";

export const Route = createFileRoute("/_authenticated/expenses/")({
  component: ExpensesPage,
});

// ─── Receipt helpers ──────────────────────────────────────────────────────────

/**
 * Compress a receipt file before storage.
 * - Images (JPEG/PNG/WEBP/HEIC): resize to ≤1800px, re-encode as JPEG @ 82%.
 *   Typical phone photo: 5–8 MB → 150–400 KB (≈95% reduction).
 * - PDFs: returned as-is (invoice PDFs are already compact vector files).
 */
async function compressReceiptFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;   // PDFs: skip

  const MAX_SIDE = 1800;
  const QUALITY  = 0.82;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Skip if already small enough
      if (width <= MAX_SIDE && height <= MAX_SIDE && file.size < 300_000) {
        resolve(file);
        return;
      }

      const ratio  = Math.min(1, MAX_SIDE / width, MAX_SIDE / height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(width  * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const baseName = file.name.replace(/\.[^.]+$/, "");
            resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
          } else {
            resolve(file);   // fallback: use original
          }
        },
        "image/jpeg",
        QUALITY,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadReceipt(file: File): Promise<string> {
  const compressed = await compressReceiptFile(file);
  const ext  = compressed.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("receipts").upload(path, compressed, { upsert: false });
  if (error) throw error;
  return path;
}

async function openReceipt(receiptUrl: string) {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(receiptUrl, 3600);
  if (error || !data?.signedUrl) { toast.error("שגיאה בפתיחת הקבלה"); return; }
  window.open(data.signedUrl, "_blank");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
  });
}

type ParsedReceipt = {
  amount?: number | null;
  supplier?: string | null;
  date?: string | null;
  description?: string | null;
  invoice_number?: string | null;
  suggested_category?: string | null;
};

async function parseReceiptFile(file: File, categoryNames?: string[]): Promise<ParsedReceipt> {
  const file_base64 = await fileToBase64(file);
  const file_media_type = file.type || "application/pdf";

  // Use raw fetch — supabase.functions.invoke can silently drop large payloads
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
  const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ?? "";
  const sessionResp = await supabase.auth.getSession();
  const token = sessionResp.data.session?.access_token ?? supabaseKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/parse-receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": supabaseKey,
    },
    body: JSON.stringify({ file_base64, file_media_type, category_names: categoryNames ?? [] }),
  });

  if (!res.ok) {
    let errMsg = `שגיאת שרת ${res.status}`;
    try {
      const errBody = await res.json() as { error?: string };
      if (errBody.error) errMsg = errBody.error;
    } catch { /* ignore json parse error */ }
    throw new Error(errMsg);
  }

  const result = await res.json() as { success: boolean; data?: ParsedReceipt; error?: string };
  if (!result.success) throw new Error(result.error ?? "Parse failed");
  return (result.data ?? {}) as ParsedReceipt;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  onSubmit: (form: ExpenseFormState, receiptFile: File | null) => Promise<void>;
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ExpenseFormState>(initial);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedReceipt | null>(null);
  const { data: categories } = useBudgetCategories(form.source);
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleFileSelect = async (file: File | null) => {
    setReceiptFile(file);
    setAutofilled(false);
    setParsedResult(null);
    if (!file) return;
    setParsing(true);
    try {
      const fileToUse = await compressReceiptFile(file);
      // Keep the compressed version so uploadReceipt doesn't re-compress
      setReceiptFile(fileToUse);
      const parsed = await parseReceiptFile(fileToUse);
      setParsedResult(parsed);
      setForm((prev) => ({
        ...prev,
        amount: parsed.amount != null && (prev.amount === "" || prev.amount === "0")
          ? String(parsed.amount) : prev.amount,
        supplier: parsed.supplier && prev.supplier === "" ? parsed.supplier : prev.supplier,
        expense_date: parsed.date && prev.expense_date === today() ? parsed.date : prev.expense_date,
        description: parsed.description && prev.description === "" ? parsed.description : prev.description,
      }));
      setAutofilled(true);
    } catch (err) {
      console.error("[parse-receipt] client error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`לא ניתן לקרוא את הקבלה: ${msg}`);
    } finally {
      setParsing(false);
    }
  };
  const activeSourceColor = sources.find(s => s.slug === form.source)?.color ?? "#2D6644";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast.error("יש להזין סכום תקין"); return; }
    await onSubmit(form, receiptFile);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>תאריך</label>
          <DateInput value={form.expense_date} onChange={(v) => set("expense_date", v)} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>סכום (₪)</label>
          <input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)}
            placeholder="0" min="0" step="0.01" required autoFocus style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
        </div>
      </div>

      {/* Dynamic source selector */}
      <div>
        <label style={labelStyle}>מקור תקציב</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {sources.map((src) => {
            const active = form.source === src.slug;
            return (
              <button key={src.slug} type="button"
                onClick={() => { set("source", src.slug); set("budget_category_id", ""); }}
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
        <label style={labelStyle}>קטגוריה</label>
        <CategorySearchSelect
          value={form.budget_category_id}
          onChange={(id) => set("budget_category_id", id)}
          categories={categories ?? []}
          sourceColor={activeSourceColor}
        />
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

      <div>
        <label style={labelStyle}>קבלה (אופציונלי)</label>
        <label style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "9px 12px", border: "1px dashed #E8E2D9", borderRadius: "8px",
          cursor: "pointer", fontSize: "14px",
          color: receiptFile ? "#1A1A1A" : "#AAA099",
          background: receiptFile ? "#F7FBF9" : "#FAFAF8",
        }}>
          <Paperclip size={15} color={receiptFile ? "#2D6644" : "#AAA099"} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {receiptFile ? receiptFile.name : "בחר/י קובץ קבלה..."}
          </span>
          <input type="file" accept="image/*,application/pdf"
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            style={{ display: "none" }} />
        </label>
        {parsing && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#2D6644", display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "12px", height: "12px", border: "2px solid #2D6644", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
            קורא את הקבלה עם AI...
          </div>
        )}

        {/* AI Review Card — shown after successful parse */}
        {!parsing && autofilled && parsedResult && (
          <div style={{
            marginTop: "10px",
            background: "linear-gradient(135deg, #EDF8F2, #E4F5EC)",
            border: "1.5px solid #A8D9BC",
            borderRadius: "10px",
            padding: "12px 14px",
          }}>
            <div style={{
              fontSize: "12px", fontWeight: "700", color: "#1A3D2B",
              marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px",
            }}>
              <Check size={13} color="#2D6644" />
              AI זיהה — בדוק לפני שמירה
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
              {parsedResult.amount != null && (
                <div style={{ fontSize: "13px" }}>
                  <span style={{ color: "#6B8F7D", fontSize: "11px" }}>סכום</span>
                  <div style={{ fontWeight: "600", color: "#1A1A1A" }}>{fmt(parsedResult.amount)}</div>
                </div>
              )}
              {parsedResult.supplier && (
                <div style={{ fontSize: "13px" }}>
                  <span style={{ color: "#6B8F7D", fontSize: "11px" }}>ספק</span>
                  <div style={{ fontWeight: "600", color: "#1A1A1A" }}>{parsedResult.supplier}</div>
                </div>
              )}
              {parsedResult.date && (
                <div style={{ fontSize: "13px" }}>
                  <span style={{ color: "#6B8F7D", fontSize: "11px" }}>תאריך</span>
                  <div style={{ fontWeight: "600", color: "#1A1A1A" }}>{parsedResult.date}</div>
                </div>
              )}
              {parsedResult.invoice_number && (
                <div style={{ fontSize: "13px" }}>
                  <span style={{ color: "#6B8F7D", fontSize: "11px" }}>מס׳ חשבונית</span>
                  <div style={{ fontWeight: "600", color: "#1A1A1A" }}>{parsedResult.invoice_number}</div>
                </div>
              )}
              {parsedResult.description && (
                <div style={{ fontSize: "13px", gridColumn: "span 2" }}>
                  <span style={{ color: "#6B8F7D", fontSize: "11px" }}>תיאור</span>
                  <div style={{ fontWeight: "500", color: "#1A1A1A" }}>{parsedResult.description}</div>
                </div>
              )}
            </div>
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#6B8F7D", borderTop: "1px solid #C8E8D4", paddingTop: "7px" }}>
              הפרטים מולאו בטופס — ניתן לערוך לפני השמירה
            </div>
          </div>
        )}

        {receiptFile && (
          <button type="button" onClick={() => { setReceiptFile(null); setAutofilled(false); setParsedResult(null); }} style={{
            marginTop: "6px", background: "none", border: "none",
            cursor: "pointer", fontSize: "12px", color: "#AAA099",
            display: "flex", alignItems: "center", gap: "4px", padding: 0,
            fontFamily: "var(--font-sans)",
          }}>
            <X size={11} /> הסר קבלה
          </button>
        )}
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
          flexShrink: 0,
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

// ─── Add Modal ────────────────────────────────────────────────────────────────

function AddExpenseModal({ onClose, defaultSource }: { onClose: () => void; defaultSource: string }) {
  const addExpense = useAddExpense();
  const initial: ExpenseFormState = {
    expense_date: today(), amount: "", source: defaultSource,
    budget_category_id: "", supplier: "", description: "", bank_account: "school",
  };
  const handleSubmit = async (form: ExpenseFormState, receiptFile: File | null) => {
    try {
      let receipt_url: string | null = null;
      if (receiptFile) receipt_url = await uploadReceipt(receiptFile);
      await addExpense.mutateAsync({
        expense_date: form.expense_date, amount: Math.round(Number(form.amount) * 100) / 100,
        source: form.source, bank_account: form.bank_account,
        budget_category_id: form.budget_category_id || null,
        supplier: form.supplier || null, description: form.description || null,
        receipt_url,
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
  const handleSubmit = async (form: ExpenseFormState, receiptFile: File | null) => {
    try {
      let receipt_url = expense.receipt_url;
      if (receiptFile) receipt_url = await uploadReceipt(receiptFile);
      await updateExpense.mutateAsync({
        id: expense.id,
        expense_date: form.expense_date, amount: Math.round(Number(form.amount) * 100) / 100,
        source: form.source, bank_account: form.bank_account,
        budget_category_id: form.budget_category_id || null,
        supplier: form.supplier || null, description: form.description || null,
        receipt_url,
      });
      toast.success("ההוצאה עודכנה בהצלחה");
      onClose();
    } catch { toast.error("שגיאה בעדכון ההוצאה"); }
  };
  return (
    <Modal title="עריכת הוצאה" subtitle="ערוך את פרטי ההוצאה" onClose={onClose}>
      {expense.receipt_url && (
        <div style={{ padding: "12px 24px 0" }}>
          <button type="button" onClick={() => void openReceipt(expense.receipt_url!)} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 12px", borderRadius: "8px",
            border: "1px solid #D4EDE0", background: "#F0FAF5",
            color: "#2D6644", fontSize: "13px", cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}>
            <Paperclip size={14} />
            צפה בקבלה הקיימת
          </button>
        </div>
      )}
      <ExpenseForm initial={initial} onSubmit={handleSubmit} onClose={onClose}
        isPending={updateExpense.isPending} submitLabel="שמור שינויים" />
    </Modal>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const isMobile = useIsMobile();
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
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A", marginBottom: "8px" }}>מחיקת הוצאה</div>
        <div style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.6, marginBottom: "24px" }}>
          האם למחוק הוצאה של <strong>{fmt(expense.amount)}</strong>
          {expense.supplier ? ` מ-${expense.supplier}` : ""}? פעולה זו אינה הפיכה.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px 0", border: "1px solid #E8E2D9", borderRadius: "10px",
            background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>ביטול</button>
          <button onClick={handleDelete} disabled={deleteExpense.isPending} style={{
            flex: 1, padding: "12px 0", border: "none", borderRadius: "10px",
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

// ─── Mobile Card Row ──────────────────────────────────────────────────────────

function ExpenseMobileCard({
  e, onEdit, onDelete, sources,
}: {
  e: Expense;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  sources: OrgBudgetSource[];
}) {
  const style = getSourceStyle(sources, e.source);
  const label = getSourceLabel(sources, e.source);
  return (
    <div style={{
      padding: "14px 16px",
      borderBottom: "1px solid #F3EEE8",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    }}>
      {/* Source dot */}
      <div style={{
        width: "9px", height: "9px", borderRadius: "50%",
        background: style.color, flexShrink: 0,
      }} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
          <span className="num" style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A" }}>
            {fmt(e.amount)}
          </span>
          <span className="num" style={{ fontSize: "11px", color: "#AAA099", whiteSpace: "nowrap" }}>
            {new Date(e.expense_date).toLocaleDateString("he-IL")}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#6B6560", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {e.supplier ?? e.description ?? "—"}
        </div>
        <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            padding: "2px 8px", borderRadius: "99px",
            fontSize: "10px", fontWeight: "600",
            background: style.bg_color, color: style.color,
          }}>{label}</span>
          {e.budget_categories?.name && (
            <span style={{ fontSize: "11px", color: "#AAA099" }}>· {e.budget_categories.name}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {e.receipt_url && (
          <button onClick={() => void openReceipt(e.receipt_url!)} title="קבלה" style={{
            background: "#EDFBF3", border: "none", borderRadius: "9px",
            width: "36px", height: "36px", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "#2D6644",
          }}>
            <Paperclip size={14} />
          </button>
        )}
        <button onClick={() => onEdit(e)} style={{
          background: "#F7F4EF", border: "none", borderRadius: "9px",
          width: "36px", height: "36px", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", color: "#6B6560",
        }}>
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(e)} style={{
          background: "#FEF2F2", border: "none", borderRadius: "9px",
          width: "36px", height: "36px", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", color: "#DC2626",
        }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────────

type ImportStatus = "queued" | "parsing" | "ready" | "error" | "saving" | "saved";
type ImportItem = {
  id: string;
  file: File;
  status: ImportStatus;
  parsed?: ParsedReceipt;
  error?: string;
  categoryId?: string; // per-item: AI-suggested or manually chosen
};

function BulkImportModal({ onClose, defaultSource }: { onClose: () => void; defaultSource: string }) {
  const isMobile = useIsMobile();
  const addExpense = useAddExpense();
  const [items, setItems] = useState<ImportItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Bulk defaults ──────────────────────────────────────────────────────────
  const [bulkSource, setBulkSource] = useState<string>(defaultSource);
  const { data: bulkCategories } = useBudgetCategories(bulkSource);
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const activeSourceColor = sources.find(s => s.slug === bulkSource)?.color ?? "#2D6644";

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/")
    );
    if (!arr.length) return;
    setItems((prev) => [
      ...prev,
      ...arr.map((f) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file: f,
        status: "queued" as ImportStatus,
      })),
    ]);
  };

  const setItemStatus = (id: string, updates: Partial<ImportItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updates } : it)));

  const processAll = async () => {
    const queued = items.filter((it) => it.status === "queued" || it.status === "error");
    if (!queued.length) return;
    setProcessing(true);

    const cats = bulkCategories ?? [];
    const categoryNames = cats.map((c) => c.name);

    const resolveCategoryId = (suggested?: string | null) =>
      cats.find((c) => c.name === suggested)?.id ?? "";

    // Pass 1: batches of 3 concurrent requests
    for (let i = 0; i < queued.length; i += 3) {
      const batch = queued.slice(i, i + 3);
      batch.forEach((it) => setItemStatus(it.id, { status: "parsing" }));
      await Promise.allSettled(
        batch.map(async (it) => {
          try {
            const compressed = await compressReceiptFile(it.file);
            setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, file: compressed } : x));
            const parsed = await parseReceiptFile(compressed, categoryNames);
            const categoryId = resolveCategoryId(parsed.suggested_category);
            setItemStatus(it.id, { status: "ready", parsed, error: undefined, categoryId });
          } catch {
            setItemStatus(it.id, { status: "error", error: "לא ניתן לקרוא את המסמך" });
          }
        })
      );
    }

    // Pass 2: auto-retry failures one-by-one (avoids concurrent load timeout)
    const failedIds: string[] = [];
    setItems((prev) => {
      prev.filter((it) => it.status === "error").forEach((it) => failedIds.push(it.id));
      return prev;
    });
    for (const failId of failedIds) {
      setItemStatus(failId, { status: "parsing" });
      let currentFile: File | undefined;
      setItems((prev) => { currentFile = prev.find((x) => x.id === failId)?.file; return prev; });
      if (!currentFile) continue;
      try {
        const parsed = await parseReceiptFile(currentFile, categoryNames);
        const categoryId = resolveCategoryId(parsed.suggested_category);
        setItemStatus(failId, { status: "ready", parsed, error: undefined, categoryId });
      } catch {
        setItemStatus(failId, { status: "error", error: "לא ניתן לקרוא את המסמך" });
      }
    }

    setProcessing(false);
  };

  const importAll = async () => {
    const ready = items.filter((it) => it.status === "ready");
    if (!ready.length) return;
    setImporting(true);
    let saved = 0;
    for (const it of ready) {
      setItemStatus(it.id, { status: "saving" });
      try {
        const receipt_url = await uploadReceipt(it.file);
        const p = it.parsed ?? {};
        await addExpense.mutateAsync({
          expense_date: p.date ?? today(),
          amount: p.amount ?? 0,
          source: bulkSource,
          bank_account: "school",
          budget_category_id: it.categoryId || null,
          supplier: p.supplier ?? null,
          description: p.description ?? null,
          receipt_url,
        } as NewExpense);
        setItemStatus(it.id, { status: "saved" });
        saved++;
      } catch {
        setItemStatus(it.id, { status: "error", error: "שגיאה בשמירה" });
      }
    }
    setImporting(false);
    if (saved > 0) toast.success(`${saved} הוצאות נשמרו בהצלחה`);
  };

  const statusIcon = (status: ImportStatus) => {
    if (status === "parsing" || status === "saving")
      return <div style={{ width: "14px", height: "14px", border: "2px solid #2D6644", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
    if (status === "ready") return <Check size={14} color="#2D6644" />;
    if (status === "saved") return <Check size={14} color="#2D6644" />;
    if (status === "error") return <AlertTriangle size={14} color="#DC2626" />;
    return <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#E8E2D9", margin: "0 3px" }} />;
  };

  const readyCount = items.filter((it) => it.status === "ready").length;
  const savedCount = items.filter((it) => it.status === "saved").length;
  const pendingCount = items.filter((it) => it.status === "queued" || it.status === "error").length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center",
      padding: isMobile ? 0 : "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={isMobile ? "hk-bottom-sheet" : ""} style={{
        background: "#fff",
        borderRadius: isMobile ? "20px 20px 0 0" : "18px",
        width: "100%",
        maxWidth: isMobile ? "100%" : "560px",
        maxHeight: isMobile ? "92dvh" : "90vh",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18), 0 24px 80px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 20px 16px", borderBottom: "1px solid #EAE5DE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          {isMobile && (
            <div style={{
              position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
              width: "36px", height: "4px", borderRadius: "2px", background: "#E8E2D9",
            }} />
          )}
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>ייבוא מרובה</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>
              העלה מסמכים — AI יזהה פרטים אוטומטית
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "8px", color: "#AAA099", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" } as React.CSSProperties}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "#2D6644" : "#E8E2D9"}`,
              borderRadius: "12px",
              padding: "28px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "#F0FAF5" : "#FAFAF8",
              transition: "all 0.15s",
            }}
          >
            <Upload size={26} color={dragging ? "#2D6644" : "#C5BFB8"} style={{ marginBottom: "8px" }} />
            <div style={{ fontSize: "14px", fontWeight: "500", color: dragging ? "#2D6644" : "#6B6560" }}>
              גרור קבצים לכאן
            </div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "4px" }}>
              או לחץ לבחירה · PDF, JPG, PNG
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => { addFiles(e.target.files ?? new FileList()); e.target.value = ""; }}
            />
          </div>

          {/* ── Bulk defaults: source only ──────────────────────────────────── */}
          <div style={{
            background: "#F7F4EF", borderRadius: "10px",
            padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#6B6560" }}>מקור תקציב לכל הקבצים</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {sources.map((src) => {
                const active = bulkSource === src.slug;
                return (
                  <button key={src.slug} type="button"
                    onClick={() => setBulkSource(src.slug)}
                    style={{
                      flex: "1 1 auto", minWidth: "72px", padding: "7px 10px", borderRadius: "8px",
                      border: `1.5px solid ${active ? src.color : "#E8E2D9"}`,
                      background: active ? src.bg_color : "#fff",
                      color: active ? src.color : "#888079",
                      fontSize: "12px", fontWeight: active ? "600" : "400",
                      cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
                    }}>
                    {src.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "11px", color: "#AAA099" }}>
              הקטגוריה תוצע אוטומטית לכל קובץ ותוכל לשנות לפני הייבוא
            </div>
          </div>

          {/* File list */}
          {items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {items.map((it) => (
                <div key={it.id} style={{
                  padding: "10px 12px", borderRadius: "10px",
                  background: it.status === "saved" ? "#F0FAF5" : it.status === "error" ? "#FEF2F2" : "#F7F4EF",
                  border: `1px solid ${it.status === "saved" ? "#D4EDE0" : it.status === "error" ? "#FECACA" : "#EAE5DE"}`,
                }}>
                  {/* Top row: icon + name + status label */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flexShrink: 0, width: "20px", display: "flex", justifyContent: "center" }}>
                      {statusIcon(it.status)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: "500", color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.parsed?.supplier ?? it.file.name}
                      </div>
                      {it.parsed && (
                        <div style={{ fontSize: "11px", color: "#6B6560", marginTop: "1px" }}>
                          {[
                            it.parsed.amount != null ? fmt(it.parsed.amount) : null,
                            it.parsed.date,
                          ].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {it.error && (
                        <div style={{ fontSize: "11px", color: "#DC2626", marginTop: "1px" }}>{it.error}</div>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#AAA099", flexShrink: 0 }}>
                      {it.status === "queued" && "ממתין"}
                      {it.status === "parsing" && "קורא..."}
                      {it.status === "saving" && "שומר..."}
                      {it.status === "saved" && "✓ נשמר"}
                      {it.status === "error" && "שגיאה"}
                    </div>
                  </div>

                  {/* Category selector — visible only for "ready" items */}
                  {it.status === "ready" && (
                    <div style={{ marginTop: "8px", paddingRight: "30px" }}>
                      <select
                        value={it.categoryId ?? ""}
                        onChange={(e) => setItemStatus(it.id, { categoryId: e.target.value })}
                        style={{
                          width: "100%", padding: "6px 10px",
                          border: `1.5px solid ${it.categoryId ? activeSourceColor : "#E8E2D9"}`,
                          borderRadius: "7px", fontSize: "12px",
                          background: it.categoryId ? "#fff" : "#FAFAF8",
                          color: it.categoryId ? "#1A1A1A" : "#AAA099",
                          fontFamily: "var(--font-sans)", direction: "rtl", cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        <option value="">ללא קטגוריה</option>
                        {(bulkCategories ?? []).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{
            padding: `14px 20px calc(14px + env(safe-area-inset-bottom, 0px))`,
            borderTop: "1px solid #EAE5DE",
            display: "flex", gap: "10px", alignItems: "center", flexShrink: 0,
          }}>
            <div style={{ flex: 1, fontSize: "12px", color: "#AAA099" }}>
              {[
                savedCount > 0 && `${savedCount} נשמרו`,
                readyCount > 0 && `${readyCount} מוכנים`,
                pendingCount > 0 && `${pendingCount} ממתינים`,
              ].filter(Boolean).join(" · ")}
            </div>
            {pendingCount > 0 && (
              <button
                onClick={() => void processAll()}
                disabled={processing}
                style={{
                  padding: "9px 16px", border: "1px solid #1A3D2B", borderRadius: "8px",
                  background: "#fff", color: "#1A3D2B", fontSize: "13px", fontWeight: "500",
                  cursor: processing ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {processing ? "מעבד..." : "עבד קבצים"}
              </button>
            )}
            {readyCount > 0 && (
              <button
                onClick={() => void importAll()}
                disabled={importing}
                style={{
                  padding: "9px 18px", border: "none", borderRadius: "8px",
                  background: importing ? "#888" : "linear-gradient(135deg, #2D6644, #1A3D2B)",
                  color: "#fff", fontSize: "13px", fontWeight: "500",
                  cursor: importing ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
                }}
              >
                {importing ? "מייבא..." : `ייבא ${readyCount} הוצאות`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<BudgetSource | "all">("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const defaultSource = sources[0]?.slug ?? "gefen";

  // Single fetch — filter + totals computed client-side to avoid double network request
  const { data: allExpenses, isLoading } = useExpenses("all");

  const filteredBySource = filter === "all"
    ? (allExpenses ?? [])
    : (allExpenses ?? []).filter((e) => e.source === filter);

  const q = search.trim().toLowerCase();
  const visibleExpenses = q
    ? filteredBySource.filter((e) =>
        [e.supplier, e.description, e.budget_categories?.name]
          .some((f) => f?.toLowerCase().includes(q))
      )
    : filteredBySource;

  // For display: "N הוצאות" counts against the source-filtered list (before text search)
  const expenses = filteredBySource;
  const total = visibleExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Dynamic source totals (always from all data)
  const sourceTotals: Record<string, number> = {};
  (allExpenses ?? []).forEach((e) => {
    sourceTotals[e.source] = (sourceTotals[e.source] ?? 0) + e.amount;
  });
  const grandTotal = Object.values(sourceTotals).reduce((a, b) => a + b, 0);
  const animGrand = useCountUp(grandTotal);

  return (
    <>
      {showAdd && <AddExpenseModal defaultSource={defaultSource} onClose={() => setShowAdd(false)} />}
      {showBulkImport && <BulkImportModal defaultSource={defaultSource} onClose={() => setShowBulkImport(false)} />}
      {editingExpense && <EditExpenseModal expense={editingExpense} onClose={() => setEditingExpense(null)} />}
      {deletingExpense && <DeleteConfirm expense={deletingExpense} onClose={() => setDeletingExpense(null)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? "22px" : "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>הוצאות</h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
              {isLoading ? "טוען..." : q
                ? `${visibleExpenses.length} מתוך ${(expenses ?? []).length} הוצאות · ${fmt(total)}`
                : `${(expenses ?? []).length} הוצאות · סה״כ ${fmt(total)}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", width: isMobile ? "100%" : "auto", flexShrink: 0 }}>
            <button onClick={() => setShowBulkImport(true)} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: isMobile ? "11px 0" : "10px 14px",
              flex: isMobile ? 1 : "none",
              justifyContent: "center",
              background: "#fff",
              border: "1px solid #1A3D2B", borderRadius: "10px", color: "#1A3D2B",
              fontSize: "14px", fontWeight: "500", cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}>
              <Upload size={15} />ייבוא מרובה
            </button>
            <button onClick={() => setShowAdd(true)} style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: isMobile ? "11px 0" : "10px 18px",
              flex: isMobile ? 1 : "none",
              justifyContent: "center",
              background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
              border: "none", borderRadius: "10px", color: "#fff",
              fontSize: "14px", fontWeight: "500", cursor: "pointer",
              fontFamily: "var(--font-sans)", boxShadow: "0 4px 12px rgba(26,61,43,0.3)",
            }}>
              <Plus size={16} />הוסף הוצאה
            </button>
          </div>
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
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "6px", letterSpacing: "0.04em" }}>סה״כ הוצאות</div>
                <div className="num" style={{ fontSize: "38px", fontWeight: "200", letterSpacing: "-1.5px", color: "#fff", lineHeight: 1 }}>{fmt(animGrand)}</div>
              </div>
            </div>
            {/* Dynamic source breakdown bars */}
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
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Source chips — dynamic */}
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
          <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
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

        {/* List / Table */}
        <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
          ) : visibleExpenses.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <AlertTriangle size={24} style={{ color: "#E8E2D9", marginBottom: "12px" }} />
              <div style={{ color: "#AAA099", fontSize: "14px" }}>
                {q ? `אין תוצאות עבור "${search}"` : "אין הוצאות להצגה"}
              </div>
              <div style={{ color: "#7A7470", fontSize: "12px", marginTop: "4px" }}>
                {q ? 'נסו/י מילת חיפוש אחרת' : 'לחצו על "הוסף הוצאה" להתחלה'}
              </div>
            </div>
          ) : isMobile ? (
            /* ── Mobile: card list ── */
            visibleExpenses.map((e) => (
              <ExpenseMobileCard
                key={e.id}
                e={e}
                sources={sources}
                onEdit={setEditingExpense}
                onDelete={setDeletingExpense}
              />
            ))
          ) : (
            /* ── Desktop: scrollable table ── */
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              <div style={{
                display: "grid", gridTemplateColumns: "120px 100px 80px 1fr 1fr 72px",
                minWidth: "580px",
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
              {visibleExpenses.map((e, i) => {
                const style = getSourceStyle(sources, e.source);
                const label = getSourceLabel(sources, e.source);
                return (
                  <div key={e.id} style={{
                    display: "grid", gridTemplateColumns: "120px 100px 80px 1fr 1fr 72px",
                    minWidth: "580px",
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
                      background: style.bg_color, color: style.color, whiteSpace: "nowrap",
                    }}>
                      {label}
                    </span>
                    <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.budget_categories?.name ?? "—"}
                    </span>
                    <span style={{ fontSize: "13px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.supplier ?? e.description ?? "—"}
                    </span>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {e.receipt_url && (
                        <button
                          onClick={() => void openReceipt(e.receipt_url!)}
                          title="קבלה"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "5px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                          onMouseEnter={(el) => { el.currentTarget.style.background = "#EDFBF3"; el.currentTarget.style.color = "#2D6644"; }}
                          onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                        >
                          <Paperclip size={13} />
                        </button>
                      )}
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
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
