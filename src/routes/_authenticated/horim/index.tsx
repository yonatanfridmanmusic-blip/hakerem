import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Plus, X, Check, ChevronDown, ChevronUp, Users, Settings2, Pencil, Trash2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useGrades,
  useParentSections,
  useAllParentSections,
  useGradeSectionAmounts,
  useParentCollections,
  useUpsertGradeSectionAmount,
  useAddParentCollection,
  useUpdateParentCollection,
  useDeleteParentCollection,
  useAddParentSection,
  useToggleParentSection,
  syncAllHorimBudgetCategories,
  computeTarget,
  type Grade,
  type ParentSection,
  type ParentCollection,
} from "@/hooks/use-horim";

export const Route = createFileRoute("/_authenticated/horim/")({
  component: HorimPage,
});

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

// ─── Mini progress bar ────────────────────────────────────────────────────────

function Bar({ pct }: { pct: number }) {
  const over = pct > 100;
  const [animW, setAnimW] = useState(0);
  useEffect(() => {
    setAnimW(0);
    const id = setTimeout(() => setAnimW(pct), 80);
    return () => clearTimeout(id);
  }, [pct]);
  return (
    <div style={{ height: "4px", background: "#EAE5DE", borderRadius: "99px", overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${Math.min(100, animW)}%`,
        background: over
          ? "linear-gradient(90deg, #D46A42, #B5472A)"
          : "linear-gradient(90deg, #B04A90, #8B2F6E)",
        borderRadius: "99px", transition: "width 0.7s ease",
      }} />
    </div>
  );
}

// ─── Inline amount-per-student editor ─────────────────────────────────────────

function AmountPerStudentCell({
  gradeId, sectionId, sectionName, current, existingId,
}: {
  gradeId: string; sectionId: string; sectionName: string; current: number; existingId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(current));
  const inputRef = useRef<HTMLInputElement>(null);
  const upsert = useUpsertGradeSectionAmount();

  useEffect(() => { setValue(String(current)); }, [current]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = async () => {
    const n = Number(value);
    if (isNaN(n) || n < 0) { toast.error("סכום לא תקין"); setValue(String(current)); setEditing(false); return; }
    if (n === current) { setEditing(false); return; }
    try {
      await upsert.mutateAsync({ gradeId, sectionId, sectionName, amountPerStudent: n, existingId });
      toast.success("עודכן");
    } catch { toast.error("שגיאה בעדכון"); setValue(String(current)); }
    setEditing(false);
  };

  if (editing) return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <input
        ref={inputRef} type="number" value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(String(current)); setEditing(false); } }}
        style={{
          width: "70px", padding: "3px 6px",
          border: "1.5px solid #8B2F6E", borderRadius: "5px",
          fontSize: "12px", fontFamily: "var(--font-sans)",
          direction: "ltr", textAlign: "right", outline: "none",
        }}
      />
      <button onClick={save} style={{ background: "none", border: "none", cursor: "pointer", color: "#8B2F6E", padding: "1px" }}><Check size={12} /></button>
      <button onClick={() => { setValue(String(current)); setEditing(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#AAA099", padding: "1px" }}><X size={12} /></button>
    </div>
  );

  return (
    <div
      onClick={() => setEditing(true)}
      title="עריכה"
      onMouseEnter={e => {
        e.currentTarget.style.background = "#F0E0ED";
        e.currentTarget.style.borderColor = "#B060A0";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = current > 0 ? "#FAF0F8" : "#FCF7FB";
        e.currentTarget.style.borderColor = current > 0 ? "#DDB8D4" : "#D4B8CC";
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "6px 10px", borderRadius: "8px",
        border: current > 0 ? "1px solid #DDB8D4" : "1.5px dashed #D4B8CC",
        background: current > 0 ? "#FAF0F8" : "#FCF7FB",
        cursor: "pointer", minWidth: "82px",
        transition: "all 0.12s",
      }}
    >
      <span style={{ fontSize: "11px", color: "#8B2F6E", fontWeight: "500" }}>₪</span>
      {current > 0 ? (
        <>
          <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#8B2F6E" }}>
            {new Intl.NumberFormat("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(current)}
          </span>
          <span style={{ fontSize: "10.5px", color: "#B060A0", opacity: 0.75 }}>/תלמיד</span>
          <Pencil size={9} color="#C080A8" style={{ marginRight: "2px", flexShrink: 0 }} />
        </>
      ) : (
        <span style={{ fontSize: "12px", color: "#C0A0BE", fontStyle: "italic" }}>הגדר</span>
      )}
    </div>
  );
}

// ─── Manage Sections Modal ────────────────────────────────────────────────────

function ManageSectionsModal({ sections, onClose }: { sections: ParentSection[]; onClose: () => void }) {
  const [newName, setNewName] = useState("");
  const addSection = useAddParentSection();
  const toggleSection = useToggleParentSection();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const duplicate = sections.some((s) => s.name.trim() === trimmed);
    if (duplicate) { toast.error(`סעיף בשם "${trimmed}" כבר קיים`); return; }
    try {
      await addSection.mutateAsync({ name: trimmed });
      toast.success("סעיף נוסף");
      setNewName("");
      inputRef.current?.focus();
    } catch { toast.error("שגיאה בהוספה"); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "400px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>ניהול סעיפי גבייה</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>הוסף או השבת סעיפים</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#AAA099", display: "flex" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Existing sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sections.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "10px", border: "1px solid #EAE5DE", background: s.is_active ? "#fff" : "#FAFAF8" }}>
                <span style={{ fontSize: "14px", color: s.is_active ? "#1A1A1A" : "#AAA099" }}>{s.name}</span>
                <button
                  onClick={() => toggleSection.mutate({ id: s.id, isActive: !s.is_active })}
                  style={{
                    padding: "4px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                    border: `1px solid ${s.is_active ? "#E8E2D9" : "#8B2F6E"}`,
                    background: s.is_active ? "#F5F3F0" : "#F4EBF2",
                    color: s.is_active ? "#888079" : "#8B2F6E",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {s.is_active ? "השבת" : "הפעל"}
                </button>
              </div>
            ))}
          </div>

          {/* Add new section */}
          <form onSubmit={handleAdd} style={{ display: "flex", gap: "8px" }}>
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="שם הסעיף החדש"
              style={{
                flex: 1, padding: "9px 12px",
                border: "1px solid #E8E2D9", borderRadius: "8px",
                fontSize: "14px", fontFamily: "var(--font-sans)",
                direction: "rtl", outline: "none",
              }}
            />
            <button type="submit" disabled={addSection.isPending || !newName.trim()} style={{
              padding: "9px 16px", border: "none", borderRadius: "8px",
              background: "#8B2F6E", color: "#fff", fontSize: "14px",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              opacity: !newName.trim() ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <Plus size={14} />הוסף
            </button>
          </form>
        </div>

        <div style={{ padding: "0 24px 20px" }}>
          <button onClick={onClose} style={{ width: "100%", padding: "10px", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>סגור</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Collection Modal ─────────────────────────────────────────────────────

function AddCollectionModal({
  grades, sections, preGradeId,
  onClose,
}: {
  grades: Grade[]; sections: ParentSection[]; preGradeId?: string;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [gradeIds, setGradeIds] = useState<string[]>(
    preGradeId ? [preGradeId] : grades[0]?.id ? [grades[0].id] : []
  );
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const addCollection = useAddParentCollection();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("יש להזין סכום תקין"); return; }
    if (gradeIds.length === 0 || !sectionId) { toast.error("יש לבחור שכבה אחת לפחות וסעיף"); return; }
    try {
      for (const gId of gradeIds) {
        await addCollection.mutateAsync({ gradeId: gId, sectionId, amount: n, collectionDate: date, notes });
      }
      toast.success(gradeIds.length > 1 ? `הגבייה נרשמה עבור ${gradeIds.length} שכבות` : "הגבייה נרשמה");
      onClose();
    } catch { toast.error("שגיאה ברישום הגבייה"); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1A1A1A",
    outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "440px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>רישום גבייה</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>תשלום מהורים</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "8px", color: "#AAA099", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Multi-grade selection */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>
              שכבות{gradeIds.length > 0 && <span style={{ color: "#8B2F6E", fontWeight: "600" }}> ({gradeIds.length} נבחרו)</span>}
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {grades.map((g) => {
                const selected = gradeIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGradeIds((prev) =>
                      prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                    )}
                    style={{
                      padding: "6px 14px", borderRadius: "99px",
                      border: `1.5px solid ${selected ? "#8B2F6E" : "#E8E2D9"}`,
                      background: selected ? "#F4EBF2" : "#fff",
                      color: selected ? "#8B2F6E" : "#888079",
                      fontSize: "13px", fontWeight: selected ? "600" : "400",
                      cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
                    }}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section select */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>סעיף</label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} style={inputStyle}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Date + Amount */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>תאריך</label>
              <DateInput value={date} onChange={setDate} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>סכום (₪)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0" step="0.01" required style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>הערה (אופציונלי)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים נוספים" style={inputStyle} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
            <button type="submit" disabled={addCollection.isPending} style={{ flex: 2, padding: "10px 0", border: "none", borderRadius: "8px", background: addCollection.isPending ? "#888" : "linear-gradient(135deg, #B04A90, #8B2F6E)", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: addCollection.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
              {addCollection.isPending ? "שומר..." : "רשום גבייה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Collection Modal ────────────────────────────────────────────────────

function EditCollectionModal({
  collection, sections, onClose,
}: {
  collection: ParentCollection;
  sections: ParentSection[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(collection.amount));
  const [date, setDate] = useState(collection.collection_date);
  const [notes, setNotes] = useState(collection.notes ?? "");
  const updateCollection = useUpdateParentCollection();

  const sec = sections.find((s) => s.id === collection.parent_section_id);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1A1A1A",
    outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("יש להזין סכום תקין"); return; }
    try {
      await updateCollection.mutateAsync({ id: collection.id, amount: n, collectionDate: date, notes });
      toast.success("הגבייה עודכנה");
      onClose();
    } catch { toast.error("שגיאה בעדכון"); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "400px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>עריכת גבייה</div>
            {sec && <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>{sec.name}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#AAA099", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>תאריך</label>
              <DateInput value={date} onChange={setDate} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>סכום (₪)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0" step="0.01" required autoFocus style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#6B6560", display: "block", marginBottom: "6px" }}>הערה (אופציונלי)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים נוספים" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
            <button type="submit" disabled={updateCollection.isPending} style={{ flex: 2, padding: "10px 0", border: "none", borderRadius: "8px", background: updateCollection.isPending ? "#888" : "linear-gradient(135deg, #B04A90, #8B2F6E)", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: updateCollection.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
              {updateCollection.isPending ? "שומר..." : "שמור שינויים"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Collection Confirm ────────────────────────────────────────────────

function DeleteCollectionConfirm({ id, onClose }: { id: string; onClose: () => void }) {
  const deleteCollection = useDeleteParentCollection();
  const handleDelete = async () => {
    try {
      await deleteCollection.mutateAsync(id);
      toast.success("הגבייה נמחקה");
      onClose();
    } catch { toast.error("שגיאה במחיקה"); }
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "360px", padding: "28px 24px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <Trash2 size={20} color="#DC2626" />
        </div>
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1A1A1A", marginBottom: "8px" }}>מחיקת גבייה</div>
        <div style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.6, marginBottom: "24px" }}>
          האם למחוק רישום גבייה זה? פעולה זו אינה הפיכה.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px 0", border: "1px solid #E8E2D9", borderRadius: "10px", background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
          <button onClick={handleDelete} disabled={deleteCollection.isPending} style={{ flex: 1, padding: "12px 0", border: "none", borderRadius: "10px", background: deleteCollection.isPending ? "#888" : "#DC2626", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: deleteCollection.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
            {deleteCollection.isPending ? "מוחק..." : "מחק"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Grade Row (expandable) ───────────────────────────────────────────────────

function GradeRow({
  grade, sections, gsaMap, collectionsMap, onAddCollection, multiplier,
  onEditCollection, onDeleteCollection,
}: {
  grade: Grade;
  sections: ParentSection[];
  gsaMap: Map<string, { id?: string; amount_per_student: number; existing_id?: string }>;
  collectionsMap: Map<string, number>;
  onAddCollection: (gradeId: string) => void;
  multiplier: number;
  onEditCollection: (c: ParentCollection) => void;
  onDeleteCollection: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: allCollections } = useParentCollections();

  // Calculate totals across all sections for this grade
  let totalTarget = 0;
  let totalCollected = 0;
  sections.forEach((s) => {
    const key = `${grade.id}:${s.id}`;
    const gsa = gsaMap.get(key);
    const target = gsa ? gsa.amount_per_student * grade.student_count * multiplier : 0;
    totalTarget += target;
    totalCollected += collectionsMap.get(key) ?? 0;
  });

  const pct = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;
  const balance = totalTarget - totalCollected;

  // Detailed collections for this grade (for expanded view)
  const gradeCollections = (allCollections ?? []).filter((c) => c.grade_id === grade.id);

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `180px repeat(${sections.length}, minmax(110px, 1fr)) 120px 120px 80px 44px`,
          padding: "12px 20px", gap: "8px", alignItems: "center",
          borderBottom: "1px solid #F3EEE8",
          transition: "background 0.1s",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF8")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {/* Grade name + student count */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "14px", fontWeight: "500", color: "#1A1A1A" }}>{grade.name}</span>
          <span style={{ fontSize: "11px", color: "#AAA099", display: "flex", alignItems: "center", gap: "3px" }}>
            <Users size={10} />{grade.student_count} תלמידים
          </span>
        </div>

        {/* Section cells */}
        {sections.map((s) => {
          const key = `${grade.id}:${s.id}`;
          const gsa = gsaMap.get(key);
          return (
            <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <AmountPerStudentCell
                gradeId={grade.id}
                sectionId={s.id}
                sectionName={s.name}
                current={gsa?.amount_per_student ?? 0}
                existingId={gsa?.existing_id}
              />
            </div>
          );
        })}

        {/* Target */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {totalTarget > 0 ? (
            <>
              <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#1A1A1A" }}>{fmt(totalTarget)}</span>
              <span style={{ fontSize: "10px", color: "#AAA099" }}>יעד ({Math.round(multiplier * 100)}%)</span>
            </>
          ) : (
            <span style={{ fontSize: "12px", color: "#C0BAB4", fontStyle: "italic" }}>לא הוגדר</span>
          )}
        </div>

        {/* Collected + bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#8B2F6E" }}>{fmt(totalCollected)}</span>
          <Bar pct={pct} />
        </div>

        {/* % */}
        <span className="num" style={{
          fontSize: "13px", fontWeight: "600",
          color: totalTarget === 0 ? "#AAA099" : pct >= 85 ? "#2D6644" : pct >= 60 ? "#B5472A" : "#8B2F6E",
        }}>
          {totalTarget === 0 ? "—" : `${pct}%`}
        </span>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((x) => !x)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#AAA099", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded: per-section breakdown + collection history */}
      {expanded && (
        <div style={{ background: "#FAFAF8", borderBottom: "1px solid #EAE5DE", padding: "0 20px 16px" }}>
          <div style={{ paddingTop: "14px", display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Per-section table */}
            {sections.some((s) => {
              const gsa = gsaMap.get(`${grade.id}:${s.id}`);
              return gsa && gsa.amount_per_student > 0;
            }) && (
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#8B2F6E", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
                  פירוט לפי סעיף — {grade.name}
                </div>
                <div style={{ border: "1px solid #E8DEED", borderRadius: "10px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                    <thead>
                      <tr style={{ background: "#F4EBF2" }}>
                        <th style={{ padding: "7px 12px", textAlign: "right", fontWeight: "600", color: "#6B2356", fontSize: "11px" }}>סעיף</th>
                        <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: "600", color: "#6B2356", fontSize: "11px" }}>יעד ({Math.round(multiplier * 100)}%)</th>
                        <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: "600", color: "#6B2356", fontSize: "11px" }}>נגבה</th>
                        <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: "600", color: "#6B2356", fontSize: "11px" }}>נותר</th>
                        <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: "600", color: "#6B2356", fontSize: "11px" }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map((s) => {
                        const key = `${grade.id}:${s.id}`;
                        const gsa = gsaMap.get(key);
                        if (!gsa || gsa.amount_per_student === 0) return null;
                        const planned = gsa.amount_per_student * grade.student_count * multiplier;
                        const collected = collectionsMap.get(key) ?? 0;
                        const remaining = planned - collected;
                        const pct = planned > 0 ? Math.round((collected / planned) * 100) : 0;
                        const done = remaining <= 0;
                        return (
                          <tr key={s.id} style={{ borderTop: "1px solid #EAE5DE" }}>
                            <td style={{ padding: "8px 12px", fontWeight: "500", color: "#1A1A1A" }}>{s.name}</td>
                            <td style={{ padding: "8px 12px", textAlign: "left", color: "#555", fontVariantNumeric: "tabular-nums" }}>{fmt(planned)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "left", color: "#2D6644", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>{fmt(collected)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", color: done ? "#2D6644" : "#B5472A", fontVariantNumeric: "tabular-nums" }}>
                              {done ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "5px", padding: "1px 7px", fontSize: "11px" }}>✓</span> : fmt(remaining)}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", color: pct >= 85 ? "#2D6644" : pct >= 60 ? "#B5472A" : "#8B2F6E" }}>{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#AAA099", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                היסטוריית גבייה
              </span>
              <button
                onClick={() => onAddCollection(grade.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "5px 12px",
                  border: "1px solid #8B2F6E", borderRadius: "7px",
                  background: "#F4EBF2", color: "#6B2356",
                  fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-sans)",
                }}
              >
                <Plus size={12} />
                הוסף גבייה
              </button>
            </div>

            {gradeCollections.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#7A7470", padding: "8px 0" }}>אין גביות רשומות עדיין</div>
            ) : (
              gradeCollections.map((c) => {
                const sec = sections.find((s) => s.id === c.parent_section_id);
                return (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", borderRadius: "8px", border: "1px solid #EAE5DE" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: "12px", color: "#AAA099", whiteSpace: "nowrap" }}>
                        {new Date(c.collection_date).toLocaleDateString("he-IL")}
                      </span>
                      <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "99px", background: "#F4EBF2", color: "#6B2356", whiteSpace: "nowrap" }}>
                        {sec?.name ?? "—"}
                      </span>
                      {c.notes && <span style={{ fontSize: "12px", color: "#6B6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                      <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#8B2F6E" }}>{fmt(c.amount)}</span>
                      <button
                        onClick={() => onEditCollection(c)}
                        title="ערוך"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                        onMouseEnter={(el) => { el.currentTarget.style.background = "#F0E0ED"; el.currentTarget.style.color = "#8B2F6E"; }}
                        onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                      ><Pencil size={12} /></button>
                      <button
                        onClick={() => onDeleteCollection(c.id)}
                        title="מחק"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#AAA099", display: "flex", alignItems: "center" }}
                        onMouseEnter={(el) => { el.currentTarget.style.background = "#FEF2F2"; el.currentTarget.style.color = "#DC2626"; }}
                        onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#AAA099"; }}
                      ><Trash2 size={12} /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>{/* closes gap:16px flex */}
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HorimPage() {
  const isMobile = useIsMobile();
  const [showModal, setShowModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [preGradeId, setPreGradeId] = useState<string | undefined>();
  const [basis, setBasis] = useState<85 | 100>(85);
  const [guardMsg, setGuardMsg] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] = useState<ParentCollection | null>(null);
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null);

  const { data: grades = [], isLoading: gradesLoading } = useGrades();
  const { data: sections = [], isLoading: sectionsLoading } = useParentSections();
  const { data: allSections = [] } = useAllParentSections();
  const { data: gsaList = [] } = useGradeSectionAmounts();
  const { data: collections = [] } = useParentCollections();

  const isLoading = gradesLoading || sectionsLoading;

  // Build grade+section → gsa map
  const gsaMap = new Map<string, { amount_per_student: number; existing_id?: string }>();
  gsaList.forEach((gsa) => {
    gsaMap.set(`${gsa.grade_id}:${gsa.parent_section_id}`, {
      amount_per_student: gsa.amount_per_student,
      existing_id: gsa.id,
    });
  });

  // Build grade+section → total collected map
  const collectionsMap = new Map<string, number>();
  collections.forEach((c) => {
    const key = `${c.grade_id}:${c.parent_section_id}`;
    collectionsMap.set(key, (collectionsMap.get(key) ?? 0) + c.amount);
  });

  const multiplier = basis / 100;

  // Grand totals
  let grandTarget = 0;
  let grandCollected = 0;
  grades.forEach((g) => {
    sections.forEach((s) => {
      const key = `${g.id}:${s.id}`;
      const gsa = gsaMap.get(key);
      const target = gsa ? gsa.amount_per_student * g.student_count * multiplier : 0;
      grandTarget += target;
      grandCollected += collectionsMap.get(key) ?? 0;
    });
  });
  const grandPct = grandTarget > 0 ? Math.round((grandCollected / grandTarget) * 100) : 0;

  const hasTarget = grandTarget > 0;

  // Animations for hero
  const animCollected = useCountUp(grandCollected);
  const animTarget    = useCountUp(grandTarget);
  const animPct       = useAnimatedPct(hasTarget ? Math.min(grandPct, 100) : 0);

  // Auto-sync horim amounts → budget_categories once per mount
  // (ensures budget planning reflects current planned amounts even for pre-existing data)
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (didAutoSync.current) return;
    if (sections.length === 0 || !gsaList.some((r) => r.amount_per_student > 0)) return;
    didAutoSync.current = true;
    syncAllHorimBudgetCategories(sections).catch(() => {});
  }, [sections, gsaList]);

  const openAddCollection = (gradeId?: string) => {
    if (grades.length === 0) {
      setGuardMsg("יש להגדיר שכבות לימוד תחילה בדף ההגדרות → שכבות וכיתות");
      return;
    }
    if (sections.length === 0) {
      setGuardMsg("יש להגדיר סעיפי גבייה תחילה — לחץ/י על כפתור 'סעיפים'");
      return;
    }
    setGuardMsg(null);
    setPreGradeId(gradeId);
    setShowModal(true);
  };

  return (
    <>
      {showSectionsModal && (
        <ManageSectionsModal sections={allSections} onClose={() => setShowSectionsModal(false)} />
      )}
      {editingCollection && (
        <EditCollectionModal collection={editingCollection} sections={sections} onClose={() => setEditingCollection(null)} />
      )}
      {deletingCollectionId && (
        <DeleteCollectionConfirm id={deletingCollectionId} onClose={() => setDeletingCollectionId(null)} />
      )}
      {showModal && grades.length > 0 && sections.length > 0 && (
        <AddCollectionModal
          grades={grades}
          sections={sections}
          preGradeId={preGradeId}
          onClose={() => setShowModal(false)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Guard message banner (replaces alert()) */}
        {guardMsg && (
          <div style={{
            background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: "10px",
            padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px",
            fontSize: "13.5px", color: "#92400E",
          }}>
            <span style={{ flexShrink: 0, fontSize: "16px" }}>⚠</span>
            <span style={{ flex: 1 }}>{guardMsg}</span>
            <button
              type="button"
              onClick={() => setGuardMsg(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#92400E", fontSize: "16px", padding: "0 4px" }}
            >✕</button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", gap: isMobile ? "12px" : "0" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1A1A1A", letterSpacing: "-0.8px" }}>גביית הורים</h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#AAA099" }}>
              {isLoading ? "טוען..." : `${grades.length} שכבות · ${sections.length} סעיפים`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Basis toggle */}
            <div style={{ display: "flex", background: "#F0EBE6", borderRadius: "8px", padding: "3px", gap: "2px" }}>
              {([85, 100] as const).map((b) => (
                <button key={b} onClick={() => setBasis(b)} style={{
                  padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "500",
                  border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                  background: basis === b ? "#fff" : "transparent",
                  color: basis === b ? "#8B2F6E" : "#888079",
                  boxShadow: basis === b ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                  transition: "all 0.15s",
                }}>
                  {b}%
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSectionsModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 14px",
                border: "1px solid #E8E2D9", borderRadius: "10px",
                background: "#fff", color: "#6B6560",
                fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
              title="ניהול סעיפי גבייה"
            >
              <Settings2 size={15} />
              סעיפים
            </button>
            <button
              onClick={() => openAddCollection()}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 18px",
                background: "linear-gradient(135deg, #B04A90, #8B2F6E)",
                border: "none", borderRadius: "10px",
                color: "#fff", fontSize: "14px", fontWeight: "500",
                cursor: "pointer", fontFamily: "var(--font-sans)",
                boxShadow: "0 4px 12px rgba(139,47,110,0.3)",
              }}
            >
              <Plus size={16} />
              רשום גבייה
            </button>
          </div>
        </div>


        {/* Summary hero */}
        <div style={{
          background: "linear-gradient(135deg, #9B3880 0%, #7A2760 55%, #561A43 100%)",
          borderRadius: "20px", padding: isMobile ? "22px 18px" : "28px 32px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: "20px",
          boxShadow: "0 16px 56px rgba(86,26,67,0.35), 0 1px 0 rgba(255,255,255,0.08) inset",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 60% at 20% 10%, rgba(176,74,144,0.25) 0%, transparent 70%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: "11px", color: "rgba(220,150,200,0.8)", fontWeight: "500", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
              סה״כ גבייה — כל השכבות
            </div>
            <div className="num" style={{ fontSize: isMobile ? "36px" : "48px", fontWeight: "300", color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>
              {fmt(animCollected)}
            </div>
            {hasTarget ? (
              <div style={{ marginTop: "10px", fontSize: "13px", color: "rgba(220,150,200,0.7)" }}>
                <span>מתוך יעד </span>
                <span className="num">{fmt(animTarget)}</span>
                <span style={{ marginRight: "6px" }}> ({basis}%)</span>
              </div>
            ) : (
              <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(220,150,200,0.55)", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ padding: "2px 8px", borderRadius: "6px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(220,150,200,0.25)" }}>
                  לא הוגדר יעד — הגדר סכום/תלמיד בטבלה
                </span>
              </div>
            )}
          </div>
          <div style={{ textAlign: isMobile ? "right" : "left", position: "relative", width: isMobile ? "100%" : "auto" }}>
            {hasTarget ? (
              <>
                <div className="num" style={{
                  fontSize: isMobile ? "42px" : "58px", fontWeight: "200",
                  background: "linear-gradient(135deg, #F0A0D8 0%, #D060B0 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  letterSpacing: "-3px", lineHeight: 1,
                }}>
                  {animPct}%
                </div>
                <div style={{ fontSize: "11px", color: "rgba(220,150,200,0.6)", marginTop: "4px", textAlign: isMobile ? "right" : "center" }}>מהיעד נגבה</div>
              </>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
                padding: "12px 20px", borderRadius: "12px",
                border: "1px dashed rgba(220,150,200,0.35)",
                background: "rgba(255,255,255,0.05)",
              }}>
                <span style={{ fontSize: "13px", color: "rgba(220,150,200,0.7)", fontWeight: "500" }}>אין יעד מוגדר</span>
                <span style={{ fontSize: "11px", color: "rgba(220,150,200,0.4)", marginTop: "3px" }}>לחץ/י על סכום בטבלה להגדרה</span>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            {/* Horizontal scroll wrapper */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: `${180 + sections.length * 120 + 120 + 120 + 80 + 44}px` }}>
                {/* Table header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `180px repeat(${sections.length}, minmax(110px, 1fr)) 120px 120px 80px 44px`,
                  padding: "10px 20px", borderBottom: "1px solid #EAE5DE",
                  fontSize: "11px", fontWeight: "600", color: "#AAA099",
                  letterSpacing: "0.04em", gap: "8px", background: "#FAFAF8",
                }}>
                  <span>שכבה</span>
                  {sections.map((s) => (
                    <span key={s.id} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.name}>
                      {s.name}
                    </span>
                  ))}
                  <span>יעד ({basis}%)</span>
                  <span>נגבה</span>
                  <span>%</span>
                  <span />
                </div>

                {/* Grade rows */}
                {grades.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#AAA099", fontSize: "14px" }}>אין שכבות מוגדרות</div>
                ) : (
                  grades.map((g) => (
                    <GradeRow
                      key={g.id}
                      grade={g}
                      sections={sections}
                      gsaMap={gsaMap}
                      collectionsMap={collectionsMap}
                      onAddCollection={openAddCollection}
                      multiplier={multiplier}
                      onEditCollection={setEditingCollection}
                      onDeleteCollection={setDeletingCollectionId}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Per-section, per-grade breakdown */}
        {!isLoading && sections.length > 0 && grades.length > 0 && (() => {
          const sectionsWithData = sections.filter((sec) =>
            grades.some((g) => (gsaMap.get(`${g.id}:${sec.id}`)?.amount_per_student ?? 0) > 0)
          );
          if (sectionsWithData.length === 0) return null;
          return (
            <div>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "#AAA099", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "12px" }}>
                פירוט גבייה לפי שכבה וסעיף
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {sectionsWithData.map((sec) => {
                  const gradeRows = grades.map((g) => {
                    const gsa = gsaMap.get(`${g.id}:${sec.id}`);
                    if (!gsa || gsa.amount_per_student === 0) return null;
                    const target100 = gsa.amount_per_student * g.student_count;
                    const target85  = target100 * 0.85;
                    const collected = collectionsMap.get(`${g.id}:${sec.id}`) ?? 0;
                    const remaining = Math.max(0, target85 - collected);
                    const pct       = target85 > 0 ? Math.round((collected / target85) * 100) : 0;
                    return { grade: g, target100, target85, collected, remaining, pct };
                  }).filter((r): r is NonNullable<typeof r> => r !== null);

                  const ttl100 = gradeRows.reduce((s, r) => s + r.target100, 0);
                  const ttl85  = gradeRows.reduce((s, r) => s + r.target85, 0);
                  const ttlColl = gradeRows.reduce((s, r) => s + r.collected, 0);
                  const ttlRem  = Math.max(0, ttl85 - ttlColl);
                  const ttlPct  = ttl85 > 0 ? Math.round((ttlColl / ttl85) * 100) : 0;

                  return (
                    <div key={sec.id} style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden" }}>
                      {/* Section header */}
                      <div style={{
                        padding: "12px 16px",
                        background: "linear-gradient(135deg, #FAF0F7 0%, #F5E8F2 100%)",
                        borderBottom: "1px solid #EAE5DE",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#8B2F6E" }}>{sec.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="num" style={{ fontSize: "12px", color: "#888079" }}>
                            נגבה {fmt(ttlColl)} מתוך {fmt(ttl85)} (85%)
                          </span>
                          <span style={{
                            fontSize: "12px", fontWeight: "700",
                            color: ttlPct >= 85 ? "#2D6644" : "#8B2F6E",
                            padding: "2px 8px", borderRadius: "6px",
                            background: ttlPct >= 85 ? "rgba(45,102,68,0.1)" : "rgba(139,47,110,0.1)",
                          }}>{ttlPct}%</span>
                        </div>
                      </div>
                      {/* Grade rows table */}
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                          <thead>
                            <tr style={{ background: "#FAFAF9" }}>
                              {["שכבה", "תלמידים", "יעד 100%", "יעד 85%", "נגבה", "נותר", "התקדמות"].map((h) => (
                                <th key={h} style={{ padding: "8px 12px", fontWeight: "600", color: "#6B6560", fontSize: "11px", borderBottom: "1px solid #F0EBE4", whiteSpace: "nowrap", textAlign: h === "שכבה" ? "right" : "left" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {gradeRows.map((r, idx) => (
                              <tr key={r.grade.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFAF9" }}>
                                <td style={{ padding: "9px 12px", fontWeight: "500", color: "#1A1A1A", textAlign: "right" }}>{r.grade.name}</td>
                                <td style={{ padding: "9px 12px", color: "#888079", textAlign: "left" }}>{r.grade.student_count}</td>
                                <td className="num" style={{ padding: "9px 12px", color: "#888079", textAlign: "left" }}>{fmt(r.target100)}</td>
                                <td className="num" style={{ padding: "9px 12px", color: "#8B2F6E", fontWeight: "500", textAlign: "left" }}>{fmt(r.target85)}</td>
                                <td className="num" style={{ padding: "9px 12px", color: r.collected > 0 ? "#2D6644" : "#C0BAB4", fontWeight: r.collected > 0 ? 600 : 400, textAlign: "left" }}>{fmt(r.collected)}</td>
                                <td className="num" style={{ padding: "9px 12px", color: r.remaining <= 0 ? "#2D6644" : "#B5472A", fontWeight: "500", textAlign: "left" }}>
                                  {r.remaining <= 0 ? "✓ שולם" : fmt(r.remaining)}
                                </td>
                                <td style={{ padding: "9px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <div style={{ width: "52px", height: "4px", background: "#F0EBE4", borderRadius: "2px", overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${Math.min(r.pct, 100)}%`, background: r.pct >= 85 ? "#2D6644" : "#8B2F6E", borderRadius: "2px" }} />
                                    </div>
                                    <span style={{ fontSize: "11px", color: r.pct >= 85 ? "#2D6644" : "#8B2F6E", fontWeight: "600", minWidth: "30px" }}>{r.pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {gradeRows.length > 1 && (
                            <tfoot>
                              <tr style={{ background: "linear-gradient(135deg, #F0E8EE 0%, #EBE0EA 100%)", fontWeight: "700" }}>
                                <td style={{ padding: "9px 12px", color: "#1A1A1A", textAlign: "right" }}>סה"כ</td>
                                <td style={{ padding: "9px 12px" }} />
                                <td className="num" style={{ padding: "9px 12px", color: "#888079", textAlign: "left" }}>{fmt(ttl100)}</td>
                                <td className="num" style={{ padding: "9px 12px", color: "#8B2F6E", textAlign: "left" }}>{fmt(ttl85)}</td>
                                <td className="num" style={{ padding: "9px 12px", color: ttlColl > 0 ? "#2D6644" : "#C0BAB4", textAlign: "left" }}>{fmt(ttlColl)}</td>
                                <td className="num" style={{ padding: "9px 12px", color: ttlRem <= 0 ? "#2D6644" : "#B5472A", textAlign: "left" }}>
                                  {ttlRem <= 0 ? "✓ שולם" : fmt(ttlRem)}
                                </td>
                                <td style={{ padding: "9px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <div style={{ width: "52px", height: "4px", background: "rgba(139,47,110,0.2)", borderRadius: "2px", overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${Math.min(ttlPct, 100)}%`, background: ttlPct >= 85 ? "#2D6644" : "#8B2F6E", borderRadius: "2px" }} />
                                    </div>
                                    <span style={{ fontSize: "11px", color: ttlPct >= 85 ? "#2D6644" : "#8B2F6E", fontWeight: "700", minWidth: "30px" }}>{ttlPct}%</span>
                                  </div>
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Help text */}
        {!isLoading && grades.length > 0 && (
          <p style={{ margin: 0, fontSize: "12px", color: "#7A7470", textAlign: "center" }}>
            לחץ/י על סכום/תלמיד לעריכה · לחץ/י על ▾ לפתיחת היסטוריית גבייה לשכבה
          </p>
        )}
      </div>
    </>
  );
}
