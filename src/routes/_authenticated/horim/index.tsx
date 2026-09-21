import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Plus, X, Check, ChevronDown, ChevronUp, Users, Settings2, Pencil, Trash2, FileUp, Layers } from "lucide-react";
import { KesafimImportModal, normalizeReportName } from "@/components/kesafim-import";
import { useCanWrite, useOrganization } from "@/hooks/use-organization";
import { useExpenses, type Expense } from "@/hooks/use-expenses";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";
import { DateInput } from "@/components/ui/date-input";
import { useCountUp, useAnimatedPct } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  useGrades,
  useParentSections,
  useAllParentSections,
  useGradeSectionAmounts,
  useParentCollections,
  useParentRefunds,
  useAddParentRefund,
  useUpdateParentRefund,
  useDeleteParentRefund,
  useUpsertGradeSectionAmount,
  useCollectionPct,
  useSetCollectionPct,
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
  type ParentRefund,
} from "@/hooks/use-horim";

export const Route = createFileRoute("/_authenticated/horim/")({
  component: HorimPage,
});

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

// 2.7.0: largest-remainder split in whole agorot, weighted (same method as the P3 income split).
// Distributes `cents` across `weights` so the integer parts sum EXACTLY to `cents`.
function splitByWeights(cents: number, weights: number[]): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (cents <= 0 || W <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (cents * w) / W);
  const out = exact.map((x) => Math.floor(x));
  const rem = cents - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; k < rem && k < order.length; k++) out[order[k].i] += 1;
  return out;
}

// 2.7.0: display-only spend per grade — grade-assigned expenses in full, plus each grade's
// proportional share (by student count) of grade-less ("all grades") expenses. Amounts in agorot.
type GradeSpend = {
  spentAg: number;
  proratedAg: number;
  bySectionAg: Map<string, number>;
  bySectionProratedAg: Map<string, number>;
  otherAg: number;
  otherProratedAg: number;
};

// 2.7.0: ONE shared column template for the parent grades table — the header row and every data
// row reference this single constant, so the columns can never drift apart.
// Order: שכבה · יעד · נגבה · יצא · נשאר בקופה · התקדמות · שברון.
const HORIM_GRID = "1.6fr 1fr 1fr 1.1fr 1.1fr 1.4fr 36px";

// 2.7.0: shared column template for the per-grade drill-down (פירוט לפי סעיף) — header AND every
// detail row reference it, so those columns can never drift apart either.
// Order: סעיף · לתלמיד · יעד · נגבה · יצא · נשאר · %.
const DRILL_GRID = "1.7fr 1.1fr 1fr 1fr 1fr 1fr 0.6fr";
const DIM = "#98A09A"; // one muted color for every empty "—"

// ─── Mini progress bar ────────────────────────────────────────────────────────

function Bar({ pct }: { pct: number }) {
  const [animW, setAnimW] = useState(0);
  useEffect(() => {
    setAnimW(0);
    const id = setTimeout(() => setAnimW(pct), 80);
    return () => clearTimeout(id);
  }, [pct]);
  // Colour by state: <50% neutral grey · 50%+ vineyard green. (Fill transition lives in CSS,
  // so prefers-reduced-motion can switch it off.)
  const fill = pct >= 50
    ? "linear-gradient(90deg, #15A57C, #0B7A5C)"
    : "rgba(31,36,33,0.25)";
  return (
    <div className="horim-bar">
      <div className="horim-bar__fill" style={{ width: `${Math.min(100, animW)}%`, background: fill, boxShadow: pct >= 100 ? "0 0 6px 0 rgba(21,165,124,0.6)" : "none" }} />
    </div>
  );
}

// ─── Hero progress ring (hand-built SVG donut) ────────────────────────────────
function HeroRing({ pct, hasTarget, reduceMotion, size }: { pct: number; hasTarget: boolean; reduceMotion: boolean; size: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const pctCount = useCountUp(clamped, 900);           // synced with the ring fill
  const shown = reduceMotion ? clamped : pctCount;
  const stroke = size >= 140 ? 11 : 9;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const target = C * (1 - clamped / 100);
  const [off, setOff] = useState(C);
  useEffect(() => {
    if (reduceMotion) { setOff(target); return; }
    setOff(C);
    const id = setTimeout(() => setOff(target), 60);
    return () => clearTimeout(id);
  }, [target, C, reduceMotion]);
  const c = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", filter: "drop-shadow(0 0 6px rgba(232,201,126,0.35))" }} aria-hidden="true">
        <defs>
          <linearGradient id="kerem-champagne" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F1DCA5" />
            <stop offset="1" stopColor="#C9A34E" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(242,239,232,0.12)" strokeWidth={stroke} />
        <circle className="horim-ring__arc" cx={c} cy={c} r={r} fill="none" stroke="url(#kerem-champagne)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="num" style={{ fontSize: size >= 140 ? "34px" : "27px", fontWeight: 400, color: "#F7F4EC", lineHeight: 1, letterSpacing: "-0.02em" }}>{hasTarget ? `${shown}%` : "—"}</div>
        <div style={{ fontSize: "10.5px", color: "rgba(242,239,232,0.5)", marginTop: "2px", letterSpacing: "0.02em" }}>מהצפי השנתי</div>
      </div>
    </div>
  );
}

// ─── Skeleton loading ─────────────────────────────────────────────────────────
function Shimmer({ w, h, radius = 8 }: { w: number | string; h: number | string; radius?: number | string }) {
  return <div className="hk-skel" style={{ width: w, height: h, borderRadius: radius }} />;
}
function HeroSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ borderRadius: "24px", padding: isMobile ? "24px" : "36px 40px", background: "#F1ECE6", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "20px", minHeight: isMobile ? "180px" : "156px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <Shimmer w={120} h={12} />
        <Shimmer w={isMobile ? 190 : 250} h={isMobile ? 36 : 46} radius={10} />
        <div style={{ display: "flex", gap: "28px", marginTop: "6px" }}>
          <Shimmer w={72} h={26} />
          <Shimmer w={120} h={34} />
        </div>
      </div>
      <Shimmer w={isMobile ? 118 : 152} h={isMobile ? 118 : 152} radius="50%" />
    </div>
  );
}
function TableSkeleton() {
  return (
    <div style={{ background: "#fff", borderRadius: "20px", overflow: "hidden", boxShadow: "0 1px 2px rgba(31,36,33,0.04), 0 12px 32px -12px rgba(31,36,33,0.10)" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: HORIM_GRID, gap: "10px", padding: "17px 20px", borderBottom: i < 3 ? "1px solid #F5F0EA" : "none", alignItems: "center" }}>
          <Shimmer w="70%" h={14} />
          <Shimmer w="62%" h={12} />
          <Shimmer w="62%" h={12} />
          <Shimmer w="55%" h={12} />
          <Shimmer w="66%" h={12} />
          <Shimmer w="82%" h={6} radius={99} />
          <Shimmer w={16} h={16} radius="50%" />
        </div>
      ))}
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
  const [hover, setHover] = useState(false);
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
          border: "1.5px solid #0B7A5C", borderRadius: "5px",
          fontSize: "12px", fontFamily: "var(--font-sans)",
          direction: "ltr", textAlign: "right", outline: "none",
        }}
      />
      <button onClick={save} style={{ background: "none", border: "none", cursor: "pointer", color: "#0B7A5C", padding: "1px" }}><Check size={12} /></button>
      <button onClick={() => { setValue(String(current)); setEditing(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#98A09A", padding: "1px" }}><X size={12} /></button>
    </div>
  );

  // Calm at rest: plain text of the amount; the frame + pencil appear only on hover. Editing is unchanged.
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="לחצו לעריכה"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: "4px 8px", borderRadius: "8px", cursor: "pointer",
        background: hover ? "#F6EEDD" : "transparent",
        border: hover ? "1px solid #D8C08A" : "1px solid transparent",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {current > 0 ? (
        <>
          <span className="num" style={{ fontSize: "12.5px", color: "#997404" }}>{fmt(current)}</span>
          <Pencil size={9} color="#997404" style={{ opacity: hover ? 0.9 : 0, transition: "opacity 0.12s", flexShrink: 0 }} />
        </>
      ) : (
        <span style={{ fontSize: "12px", color: "#997404", textDecoration: "underline", textUnderlineOffset: "2px" }}>הגדר</span>
      )}
    </span>
  );
}

// ─── Manage Sections Modal ────────────────────────────────────────────────────

function ManageSectionsModal({ sections, onClose }: { sections: ParentSection[]; onClose: () => void }) {
  const [newName, setNewName] = useState("");
  const addSection = useAddParentSection();
  const toggleSection = useToggleParentSection();
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data: membership } = useOrganization();
  const orgId = membership?.organization?.id;
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // הקשר לכל סעיף (תיקון 4, בדיקת 8.8): סך גבייה, מספר יעדים, מקור, תאריך יצירה
  const { data: ctx } = useQuery({
    queryKey: ["sections-context", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId || !orgId) return null;
      const [colR, gsaR, mapR, secR] = await Promise.all([
        supabase.from("parent_collections").select("parent_section_id, amount").eq("school_year_id", yearId),
        supabase.from("grade_section_amounts").select("parent_section_id").eq("school_year_id", yearId),
        supabase.from("kesafim_section_map").select("parent_section_id").eq("organization_id", orgId),
        supabase.from("parent_sections").select("id, created_at").eq("school_year_id", yearId),
      ]);
      if (colR.error || gsaR.error || mapR.error || secR.error) throw new Error("שגיאה בטעינת נתוני הסעיפים");
      const collected: Record<string, number> = {};
      (colR.data ?? []).forEach((r) => {
        if (!r.parent_section_id) return;
        collected[r.parent_section_id] = (collected[r.parent_section_id] ?? 0) + Number(r.amount);
      });
      const targets: Record<string, number> = {};
      (gsaR.data ?? []).forEach((r) => { targets[r.parent_section_id] = (targets[r.parent_section_id] ?? 0) + 1; });
      const imported = new Set((mapR.data ?? []).map((r) => r.parent_section_id));
      const createdAt: Record<string, string> = Object.fromEntries((secR.data ?? []).map((s) => [s.id, s.created_at as string]));
      return { collected, targets, imported: [...imported], createdAt };
    },
  });

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
      qc.invalidateQueries({ queryKey: ["sections-context"] });
      inputRef.current?.focus();
    } catch { toast.error("שגיאה בהוספה"); }
  };

  // מחיקת סעיף ריק מגבייה: מוחקת גם יעדים, קטגוריית תקציב ורשומות מיפוי.
  // בטיחות: אימות טרי מול ה-DB שאין גבייה או החזרים על הסעיף.
  const handleDelete = async (s: ParentSection) => {
    setDeleting(true);
    try {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const [colR, refR] = await Promise.all([
        supabase.from("parent_collections").select("id").eq("parent_section_id", s.id).limit(1),
        supabase.from("parent_refunds").select("id").eq("parent_section_id", s.id).limit(1),
      ]);
      if (colR.error || refR.error) throw new Error("בדיקת הסעיף נכשלה");
      if ((colR.data ?? []).length > 0) throw new Error("לסעיף נרשמה גבייה — לא ניתן למחוק");
      if ((refR.data ?? []).length > 0) throw new Error("לסעיף נרשמו החזרים — לא ניתן למחוק");

      const { error: gsaErr } = await supabase.from("grade_section_amounts").delete().eq("parent_section_id", s.id);
      if (gsaErr) throw new Error(`מחיקת היעדים נכשלה: ${gsaErr.message}`);
      const { error: mapErr } = await supabase.from("kesafim_section_map").delete().eq("parent_section_id", s.id);
      if (mapErr) throw new Error(`מחיקת המיפויים נכשלה: ${mapErr.message}`);
      const { error: catErr } = await supabase.from("budget_categories")
        .delete().eq("school_year_id", yearId).eq("source", "horim").eq("name", s.name);
      if (catErr) throw new Error(`מחיקת קטגוריית התקציב נכשלה: ${catErr.message}`);
      const { error: secErr } = await supabase.from("parent_sections").delete().eq("id", s.id);
      if (secErr) throw new Error(`מחיקת הסעיף נכשלה: ${secErr.message}`);

      ["parent-sections", "parent-sections-all", "grade-section-amounts", "budget-categories",
        "budget-plan", "dashboard", "source-breakdown", "sections-context",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`הסעיף "${s.name}" נמחק`);
      setDeleteConfirm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה במחיקת הסעיף");
    } finally {
      setDeleting(false);
    }
  };

  const dateHe = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
  const fmtNum = (n: number) => n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "460px", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1F2421" }}>ניהול סעיפי גבייה</div>
            <div style={{ fontSize: "12px", color: "#98A09A", marginTop: "2px" }}>הוספה, השבתה ומחיקה של סעיפים</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#98A09A", display: "flex" }}><X size={18} /></button>
        </div>

        {/* גוף נגלל — גובה מוגבל (תיקון 4) */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", flex: 1 }}>
          {/* Existing sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sections.map((s) => {
              const col = ctx?.collected[s.id] ?? 0;
              const tgt = ctx?.targets[s.id] ?? 0;
              const isImported = (ctx?.imported ?? []).includes(s.id);
              const isDupName = sections.filter((o) => normalizeReportName(o.name) === normalizeReportName(s.name)).length > 1;
              const deletable = !!ctx && col === 0;
              return (
                <div key={s.id} style={{ borderRadius: "10px", border: "1px solid #EAE5DE", background: s.is_active ? "#fff" : "#FAFAF8", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", gap: "10px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "14px", color: s.is_active ? "#1F2421" : "#98A09A" }}>{s.name}</span>
                        <span style={{ fontSize: "10px", fontWeight: "600", color: isImported ? "#0B7A5C" : "#5C645F", background: isImported ? "#F4F1EA" : "#F3F0EB", borderRadius: "99px", padding: "2px 8px" }}>
                          {isImported ? "ייבוא" : "ידני"}
                        </span>
                        {isDupName && ctx?.createdAt[s.id] && (
                          <span title="קיים סעיף נוסף עם שם זהה — תג הבחנה" style={{ fontSize: "10px", color: "#997404", background: "#FDF6E3", border: "1px solid #E8C97E", borderRadius: "99px", padding: "2px 8px" }} className="num">
                            נוצר {dateHe(ctx.createdAt[s.id])}
                          </span>
                        )}
                      </div>
                      {/* שורת הקשר */}
                      <div style={{ fontSize: "11.5px", color: "#5C645F", marginTop: "3px" }} className="num">
                        {ctx ? <>נגבה {fmtNum(col)} ₪ · {tgt} יעדים</> : "טוען..."}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      {deletable && (
                        <button
                          onClick={() => setDeleteConfirm(deleteConfirm === s.id ? null : s.id)}
                          title="מחיקת סעיף (אין עליו גבייה)"
                          style={{
                            padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                            border: "1px solid #E5B5B0", background: "#fff", color: "#CE2458",
                            fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: "4px",
                          }}
                        >
                          <Trash2 size={11} />מחק
                        </button>
                      )}
                      <button
                        onClick={() => toggleSection.mutate(
                          { id: s.id, isActive: !s.is_active },
                          { onError: () => toast.error("שגיאה בעדכון הסעיף") }
                        )}
                        style={{
                          padding: "4px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                          border: `1px solid ${s.is_active ? "#E8E2D9" : "#0B7A5C"}`,
                          background: s.is_active ? "#F5F3F0" : "#F1EEE8",
                          color: s.is_active ? "#5C645F" : "#0B7A5C",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {s.is_active ? "השבת" : "הפעל"}
                      </button>
                    </div>
                  </div>
                  {/* אישור דו-שלבי למחיקה — מפרט מה יימחק */}
                  {deleteConfirm === s.id && (
                    <div style={{ padding: "10px 14px", background: "#FDEBEA", borderTop: "1px solid #F2D3CF" }}>
                      <div style={{ fontSize: "12px", color: "#A93226", lineHeight: 1.6, marginBottom: "8px" }}>
                        למחוק את הסעיף "{s.name}"? יימחקו גם <b className="num">{tgt}</b> יעדי גבייה,
                        קטגוריית התקציב שלו ורשומות המיפוי מכספים 2000. אין גבייה רשומה על הסעיף. פעולה זו אינה הפיכה.
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => void handleDelete(s)} disabled={deleting} style={{
                          padding: "5px 14px", border: "none", borderRadius: "7px", background: "#CE2458",
                          color: "#fff", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-sans)",
                        }}>{deleting ? "מוחק..." : "כן, מחק סעיף"}</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{
                          padding: "5px 12px", border: "1px solid #E8E2D9", borderRadius: "7px", background: "#fff",
                          color: "#5C645F", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-sans)",
                        }}>ביטול</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
              background: "#0B7A5C", color: "#fff", fontSize: "14px",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              opacity: !newName.trim() ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <Plus size={14} />הוסף
            </button>
          </form>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #EAE5DE", flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: "100%", padding: "10px", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#5C645F", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>סגור</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Collection Modal ─────────────────────────────────────────────────────

function AddCollectionModal({
  grades, sections, gsaMap, preGradeId,
  onClose,
}: {
  grades: Grade[]; sections: ParentSection[];
  gsaMap: Map<string, { id?: string; amount_per_student: number; existing_id?: string }>;
  preGradeId?: string;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<"payers" | "manual">("payers");
  const [gradeIds, setGradeIds] = useState<string[]>(
    preGradeId ? [preGradeId] : grades[0]?.id ? [grades[0].id] : []
  );
  // Payers mode — per-grade payer counts and (optional) amount overrides
  const [payers, setPayers] = useState<Record<string, string>>({});
  const [amountOverride, setAmountOverride] = useState<Record<string, string>>({});
  // Manual mode (the original flow)
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const addCollection = useAddParentCollection();

  // Full price per student for a grade = sum of all its section amounts (100%)
  const perStudentFull = (gradeId: string): number =>
    sections.reduce((sum, s) => sum + (gsaMap.get(`${gradeId}:${s.id}`)?.amount_per_student ?? 0), 0);

  const computedFor = (gradeId: string): number =>
    (Number(payers[gradeId]) || 0) * perStudentFull(gradeId);

  const effectiveFor = (gradeId: string): number => {
    const o = amountOverride[gradeId];
    if (o !== undefined && o !== "" && !isNaN(Number(o))) return Number(o);
    return computedFor(gradeId);
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const submitPayers = async () => {
    const active = gradeIds.filter((gId) => effectiveFor(gId) > 0);
    if (active.length === 0) { toast.error("יש להזין מספר משלמים או סכום לשכבה אחת לפחות"); return; }
    for (const gId of active) {
      const T = effectiveFor(gId);
      const nPayers = Number(payers[gId]) || 0;
      const parts = sections
        .map((s) => ({ sectionId: s.id, auto: nPayers * (gsaMap.get(`${gId}:${s.id}`)?.amount_per_student ?? 0) }))
        .filter((p) => p.auto > 0);
      const A = parts.reduce((sum, p) => sum + p.auto, 0);
      const noteText = nPayers > 0 ? [`לפי ${nPayers} משלמים`, notes].filter(Boolean).join(" · ") : notes;

      if (A === 0) {
        // No per-student amounts defined — the whole amount is unassigned
        await addCollection.mutateAsync({ gradeId: gId, sectionId: null, amount: round2(T), collectionDate: date, notes: noteText });
      } else if (T >= A) {
        // Full section amounts; any surplus goes to "לא משויך"
        for (const p of parts) {
          await addCollection.mutateAsync({ gradeId: gId, sectionId: p.sectionId, amount: round2(p.auto), collectionDate: date, notes: noteText });
        }
        const surplus = round2(T - A);
        if (surplus > 0) {
          await addCollection.mutateAsync({ gradeId: gId, sectionId: null, amount: surplus, collectionDate: date, notes: noteText });
        }
      } else {
        // Edited down — scale sections proportionally so the total matches exactly
        let written = 0;
        for (let i = 0; i < parts.length; i++) {
          const isLast = i === parts.length - 1;
          const share = isLast ? round2(T - written) : round2(parts[i].auto * (T / A));
          written = round2(written + share);
          if (share > 0) {
            await addCollection.mutateAsync({ gradeId: gId, sectionId: parts[i].sectionId, amount: share, collectionDate: date, notes: noteText });
          }
        }
      }
    }
    toast.success(active.length > 1 ? `הגבייה נרשמה עבור ${active.length} שכבות` : "הגבייה נרשמה");
    onClose();
  };

  const submitManual = async () => {
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("יש להזין סכום תקין"); return; }
    if (gradeIds.length === 0 || !sectionId) { toast.error("יש לבחור שכבה אחת לפחות וסעיף"); return; }
    for (const gId of gradeIds) {
      await addCollection.mutateAsync({ gradeId: gId, sectionId, amount: n, collectionDate: date, notes });
    }
    toast.success(gradeIds.length > 1 ? `הגבייה נרשמה עבור ${gradeIds.length} שכבות` : "הגבייה נרשמה");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "payers") await submitPayers();
      else await submitManual();
    } catch { toast.error("שגיאה ברישום הגבייה"); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1F2421",
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
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1F2421" }}>רישום גבייה</div>
            <div style={{ fontSize: "12px", color: "#98A09A", marginTop: "2px" }}>תשלום מהורים</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "8px", color: "#98A09A", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: "4px", background: "#F3EEE8", borderRadius: "9px", padding: "3px" }}>
            {([["payers", "לפי מספר משלמים"], ["manual", "סכום ידני"]] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: "7px", border: "none",
                  background: mode === m ? "#fff" : "transparent",
                  color: mode === m ? "#0B7A5C" : "#5C645F",
                  fontSize: "13px", fontWeight: mode === m ? "600" : "400",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                  boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.12s",
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Multi-grade selection */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>
              שכבות{gradeIds.length > 0 && <span style={{ color: "#0B7A5C", fontWeight: "600" }}> ({gradeIds.length} נבחרו)</span>}
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
                      border: `1.5px solid ${selected ? "#0B7A5C" : "#E8E2D9"}`,
                      background: selected ? "#F1EEE8" : "#fff",
                      color: selected ? "#0B7A5C" : "#5C645F",
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

          {mode === "payers" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {gradeIds.length === 0 && (
                <div style={{ fontSize: "13px", color: "#5C645F", padding: "4px 0" }}>בחרו שכבה אחת לפחות</div>
              )}
              {gradeIds.map((gId) => {
                const g = grades.find((x) => x.id === gId);
                if (!g) return null;
                const full = perStudentFull(gId);
                const computed = computedFor(gId);
                const overridden = amountOverride[gId] !== undefined && amountOverride[gId] !== "";
                return (
                  <div key={gId} style={{ background: "#FBFAF7", border: "1px solid #E8E2D9", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                      <div style={{ minWidth: "72px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#1F2421" }}>{g.name}</div>
                        <div style={{ fontSize: "10.5px", color: "#98A09A" }}>₪{full.toLocaleString("he-IL")}/תלמיד</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <label style={{ fontSize: "11.5px", color: "#5C645F", whiteSpace: "nowrap" }}>כמה שילמו?</label>
                        <input
                          type="number" min="0"
                          value={payers[gId] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPayers((prev) => ({ ...prev, [gId]: v }));
                            setAmountOverride((prev) => { const n = { ...prev }; delete n[gId]; return n; });
                          }}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          style={{ width: "58px", padding: "6px 8px", border: "1px solid #D4B8CC", borderRadius: "7px", fontSize: "13px", fontFamily: "var(--font-sans)", direction: "ltr", textAlign: "right", outline: "none", background: "#fff" }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ fontSize: "12px", color: "#0B7A5C" }}>₪</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={amountOverride[gId] ?? (computed > 0 ? String(round2(computed)) : "")}
                          onChange={(e) => setAmountOverride((prev) => ({ ...prev, [gId]: e.target.value }))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          style={{ width: "96px", padding: "6px 9px", border: `1.5px solid ${overridden ? "#997404" : "#D4B8CC"}`, borderRadius: "7px", fontSize: "13.5px", fontWeight: "600", fontFamily: "var(--font-sans)", direction: "ltr", textAlign: "right", outline: "none", background: "#fff", color: "#0B7A5C" }}
                        />
                      </div>
                    </div>
                    {(Number(payers[gId]) || 0) > 0 && !overridden && (
                      <div style={{ fontSize: "11px", color: "#5C645F", marginTop: "6px" }}>
                        {payers[gId]} × ₪{full.toLocaleString("he-IL")} — מתחלק אוטומטית בין הסעיפים · ניתן לערוך את הסכום
                      </div>
                    )}
                    {overridden && (
                      <div style={{ fontSize: "11px", color: "#92400E", marginTop: "6px" }}>
                        {effectiveFor(gId) > computed
                          ? `העודף מעל המחושב (₪${round2(effectiveFor(gId) - computed).toLocaleString("he-IL")}) יירשם כ"לא משויך" — ניתן לשייך לסעיף אחר כך`
                          : `הסכום יתחלק בין הסעיפים באופן יחסי`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {mode === "manual" && (
            <>
              {/* Section select */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סעיף</label>
                <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} style={inputStyle}>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סכום (₪)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0" step="0.01" style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
              </div>
            </>
          )}

          {/* Date */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>תאריך</label>
            <DateInput value={date} onChange={setDate} required style={inputStyle} />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>הערה (אופציונלי)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים נוספים" style={inputStyle} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#5C645F", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
            <button type="submit" disabled={addCollection.isPending} style={{ flex: 2, padding: "10px 0", border: "none", borderRadius: "8px", background: addCollection.isPending ? "#888" : "linear-gradient(135deg, #15A57C, #0B7A5C)", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: addCollection.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
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
  const [editSectionId, setEditSectionId] = useState<string>(collection.parent_section_id ?? "");
  const updateCollection = useUpdateParentCollection();

  const sec = sections.find((s) => s.id === collection.parent_section_id);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1F2421",
    outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("יש להזין סכום תקין"); return; }
    try {
      await updateCollection.mutateAsync({
        id: collection.id, amount: n, collectionDate: date, notes,
        sectionId: editSectionId === "" ? null : editSectionId,
      });
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
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1F2421" }}>עריכת גבייה</div>
            {sec && <div style={{ fontSize: "12px", color: "#98A09A", marginTop: "2px" }}>{sec.name}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#98A09A", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Section — incl. "לא משויך", enables assigning unassigned money */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סעיף</label>
            <select value={editSectionId} onChange={(e) => setEditSectionId(e.target.value)} style={inputStyle}>
              <option value="">לא משויך</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>תאריך</label>
              <DateInput value={date} onChange={setDate} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סכום (₪)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0" step="0.01" required autoFocus style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>הערה (אופציונלי)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים נוספים" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#5C645F", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
            <button type="submit" disabled={updateCollection.isPending} style={{ flex: 2, padding: "10px 0", border: "none", borderRadius: "8px", background: updateCollection.isPending ? "#888" : "linear-gradient(135deg, #15A57C, #0B7A5C)", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: updateCollection.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
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
        <div style={{ fontSize: "17px", fontWeight: "600", color: "#1F2421", marginBottom: "8px" }}>מחיקת גבייה</div>
        <div style={{ fontSize: "14px", color: "#5C645F", lineHeight: 1.6, marginBottom: "24px" }}>
          האם למחוק רישום גבייה זה? פעולה זו אינה הפיכה.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px 0", border: "1px solid #E8E2D9", borderRadius: "10px", background: "#fff", color: "#5C645F", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
          <button onClick={handleDelete} disabled={deleteCollection.isPending} style={{ flex: 1, padding: "12px 0", border: "none", borderRadius: "10px", background: deleteCollection.isPending ? "#888" : "#DC2626", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: deleteCollection.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
            {deleteCollection.isPending ? "מוחק..." : "מחק"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Refund Modal ─────────────────────────────────────────────────────────

function AddRefundModal({
  grades, sections, onClose,
}: {
  grades: Grade[]; sections: ParentSection[]; onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const addRefund = useAddParentRefund();

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1F2421",
    outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("יש להזין סכום חיובי"); return; }
    if (!gradeId) { toast.error("יש לבחור שכבה"); return; }
    try {
      await addRefund.mutateAsync({ gradeId, sectionId: sectionId || undefined, amount: n, refundDate: date, reason, notes });
      toast.success("ההחזר נרשם");
      onClose();
    } catch { toast.error("שגיאה ברישום ההחזר"); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "440px", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #EAE5DE",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "linear-gradient(135deg, #FEF2F2, #fff)",
        }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1F2421" }}>רישום החזר להורה</div>
            <div style={{ fontSize: "12px", color: "#997404", marginTop: "2px" }}>כסף שיוצא → מקטין את הנטו</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#98A09A", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Grade */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>שכבה</label>
            <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} style={inputStyle} required>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {/* Section */}
          {sections.length > 0 && (
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>
                סעיף <span style={{ color: "#98A09A", fontWeight: "400" }}>(אופציונלי)</span>
              </label>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} style={inputStyle}>
                <option value="">— ללא סעיף ספציפי —</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Date + Amount */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>תאריך</label>
              <DateInput value={date} onChange={setDate} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סכום ההחזר (₪)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0.01" step="0.01" required autoFocus style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סיבה</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="לדוגמה: ביטול טיול, תשלום כפול" style={inputStyle} />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>הערה <span style={{ color: "#98A09A", fontWeight: "400" }}>(אופציונלי)</span></label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים נוספים" style={inputStyle} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#5C645F", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
            <button type="submit" disabled={addRefund.isPending} style={{ flex: 2, padding: "10px 0", border: "none", borderRadius: "8px", background: addRefund.isPending ? "#888" : "linear-gradient(135deg, #CE2458, #922B21)", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: addRefund.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
              {addRefund.isPending ? "שומר..." : "רשום החזר"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Refund Modal ────────────────────────────────────────────────────────

function EditRefundModal({
  refund, grades, sections, onClose,
}: {
  refund: ParentRefund;
  grades: Grade[];
  sections: ParentSection[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(refund.amount));
  const [date, setDate] = useState(refund.refund_date);
  const [reason, setReason] = useState(refund.reason ?? "");
  const [notes, setNotes] = useState(refund.notes ?? "");
  const updateRefund = useUpdateParentRefund();

  const gradeName = grades.find((g) => g.id === refund.grade_id)?.name ?? "";
  const sectionName = refund.parent_section_id ? sections.find((s) => s.id === refund.parent_section_id)?.name : null;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1F2421",
    outline: "none", fontFamily: "var(--font-sans)", direction: "rtl",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("יש להזין סכום תקין"); return; }
    try {
      await updateRefund.mutateAsync({ id: refund.id, amount: n, refundDate: date, reason, notes });
      toast.success("ההחזר עודכן");
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
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1F2421" }}>עריכת החזר</div>
            <div style={{ fontSize: "12px", color: "#98A09A", marginTop: "2px" }}>
              {gradeName}{sectionName ? ` · ${sectionName}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#98A09A", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>תאריך</label>
              <DateInput value={date} onChange={setDate} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סכום (₪)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0.01" step="0.01" required autoFocus style={{ ...inputStyle, direction: "ltr", textAlign: "right" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>סיבה</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="לדוגמה: ביטול טיול" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "500", color: "#5C645F", display: "block", marginBottom: "6px" }}>הערה <span style={{ color: "#98A09A", fontWeight: "400" }}>(אופציונלי)</span></label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים נוספים" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px", background: "#fff", color: "#5C645F", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>ביטול</button>
            <button type="submit" disabled={updateRefund.isPending} style={{ flex: 2, padding: "10px 0", border: "none", borderRadius: "8px", background: updateRefund.isPending ? "#888" : "linear-gradient(135deg, #CE2458, #922B21)", color: "#fff", fontSize: "14px", fontWeight: "500", cursor: updateRefund.isPending ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)" }}>
              {updateRefund.isPending ? "שומר..." : "שמור שינויים"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Refunds Summary Section ──────────────────────────────────────────────────

function RefundsSummary({
  refunds, grades, sections, canWrite,
}: {
  refunds: ParentRefund[];
  grades: Grade[];
  sections: ParentSection[];
  canWrite: boolean;
}) {
  const deleteRefund = useDeleteParentRefund();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingRefund, setEditingRefund] = useState<ParentRefund | null>(null);

  if (refunds.length === 0) return null;

  const total = refunds.reduce((s, r) => s + r.amount, 0);

  // Group by grade
  const byGrade = new Map<string, number>();
  refunds.forEach((r) => {
    byGrade.set(r.grade_id, (byGrade.get(r.grade_id) ?? 0) + r.amount);
  });

  const gradeMap = new Map(grades.map((g) => [g.id, g.name]));
  const sectionMap = new Map(sections.map((s) => [s.id, s.name]));

  return (
    <div>
      <div style={{ fontSize: "12px", fontWeight: "600", color: "#98A09A", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "12px" }}>
        מעקב החזרי הורים
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", color: "#B91C1C", fontWeight: "500", marginBottom: "4px" }}>מספר החזרים</div>
          <div style={{ fontSize: "22px", fontWeight: "600", color: "#991B1B" }}>{refunds.length}</div>
        </div>
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", color: "#B91C1C", fontWeight: "500", marginBottom: "4px" }}>סכום כולל</div>
          <div style={{ fontSize: "22px", fontWeight: "600", color: "#991B1B" }}>{fmt(total)}</div>
        </div>
        {byGrade.size > 1 && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: "#B91C1C", fontWeight: "500", marginBottom: "6px" }}>לפי שכבה</div>
            {Array.from(byGrade.entries()).map(([gId, sum]) => (
              <div key={gId} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#7F1D1D", marginBottom: "2px" }}>
                <span>{gradeMap.get(gId) ?? "—"}</span>
                <span style={{ fontWeight: "600" }}>{fmt(sum)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refunds list */}
      <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", background: "#FEF2F2", borderBottom: "1px solid #FECACA", fontSize: "12px", fontWeight: "600", color: "#B91C1C" }}>
          פירוט החזרים
        </div>
        {refunds.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderBottom: "1px solid #F5F0EC" }}>
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "#98A09A", whiteSpace: "nowrap" }}>
                {new Date(r.refund_date).toLocaleDateString("he-IL")}
              </span>
              <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "99px", background: "#F5F3F0", color: "#5C645F", whiteSpace: "nowrap" }}>
                {gradeMap.get(r.grade_id) ?? "—"}
              </span>
              {r.parent_section_id && (
                <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "99px", background: "#FEF2F2", color: "#B91C1C", whiteSpace: "nowrap" }}>
                  {sectionMap.get(r.parent_section_id) ?? "—"}
                </span>
              )}
              {r.reason && <span style={{ fontSize: "12px", color: "#5C645F" }}>{r.reason}</span>}
              {r.notes && <span style={{ fontSize: "11px", color: "#98A09A", fontStyle: "italic" }}>{r.notes}</span>}
            </div>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#CE2458", flexShrink: 0 }}>−{fmt(r.amount)}</span>
            {canWrite && (
              confirmDeleteId === r.id ? (
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                  <button
                    onClick={async () => {
                      try {
                        await deleteRefund.mutateAsync(r.id);
                        toast.success("ההחזר נמחק");
                        setConfirmDeleteId(null);
                      } catch { toast.error("שגיאה במחיקה"); }
                    }}
                    disabled={deleteRefund.isPending}
                    style={{ padding: "3px 10px", borderRadius: "6px", border: "none", background: "#B91C1C", color: "#fff", fontSize: "11px", fontFamily: "var(--font-sans)", cursor: "pointer" }}
                  >
                    {deleteRefund.isPending ? "..." : "מחק"}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "3px 8px", borderRadius: "6px", border: "1px solid #E8E2D9", background: "#fff", fontSize: "11px", fontFamily: "var(--font-sans)", cursor: "pointer", color: "#888" }}>
                    ביטול
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 }}>
                  <button
                    onClick={() => setEditingRefund(r)}
                    title="ערוך החזר"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#98A09A", display: "flex", alignItems: "center" }}
                    onMouseEnter={(el) => { el.currentTarget.style.background = "#F5F0EC"; el.currentTarget.style.color = "#5C645F"; }}
                    onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#98A09A"; }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(r.id)}
                    title="מחק החזר"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#98A09A", display: "flex", alignItems: "center" }}
                    onMouseEnter={(el) => { el.currentTarget.style.background = "#FEF2F2"; el.currentTarget.style.color = "#DC2626"; }}
                    onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#98A09A"; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
      {editingRefund && (
        <EditRefundModal
          refund={editingRefund}
          grades={grades}
          sections={sections}
          onClose={() => setEditingRefund(null)}
        />
      )}
    </div>
  );
}

// ─── Grade Row (expandable) ───────────────────────────────────────────────────

function GradeRow({
  grade, sections, gsaMap, collectionsMap, onAddCollection, multiplier,
  onEditCollection, onDeleteCollection, spend, index,
}: {
  grade: Grade;
  sections: ParentSection[];
  gsaMap: Map<string, { id?: string; amount_per_student: number; existing_id?: string }>;
  collectionsMap: Map<string, number>;
  onAddCollection: (gradeId: string) => void;
  multiplier: number;
  onEditCollection: (c: ParentCollection) => void;
  onDeleteCollection: (id: string) => void;
  spend: GradeSpend;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const { data: allCollections } = useParentCollections();
  const canWrite = useCanWrite();

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
  // Unassigned collections ("לא משויך") still count toward the grade's total
  const unassignedCollected = collectionsMap.get(`${grade.id}:null`) ?? 0;
  totalCollected += unassignedCollected;

  const pct = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;
  const balance = totalTarget - totalCollected;

  // Detailed collections for this grade (for expanded view)
  const gradeCollections = (allCollections ?? []).filter((c) => c.grade_id === grade.id);

  // 2.7.0: spend for this grade (own + proportional share of "all grades" expenses) — see spendByGrade.
  const totalSpent = spend.spentAg / 100;
  const cashBalance = totalCollected - totalSpent; // "נשאר בקופה" = נגבה − יצא (כסף אמיתי)
  const hasProrated = spend.proratedAg > 0;
  const otherSpent = spend.otherAg / 100;
  const otherProrated = spend.otherProratedAg > 0;

  // 2.7.0: per-section detail rows. "Active" = has a target, a collection or spend for THIS grade;
  // the rest are noise and collapse into one row.
  const secRows = sections.map((s) => {
    const key = `${grade.id}:${s.id}`;
    const gsa = gsaMap.get(key);
    const aps = gsa?.amount_per_student ?? 0;
    const planned = aps * grade.student_count * multiplier;
    const collected = collectionsMap.get(key) ?? 0;
    const spent = (spend.bySectionAg.get(s.id) ?? 0) / 100;
    const secProrated = (spend.bySectionProratedAg.get(s.id) ?? 0) > 0;
    const secPct = planned > 0 ? Math.round((collected / planned) * 100) : 0;
    const active = aps > 0 || collected > 0 || spent > 0;
    return { s, gsa, aps, planned, collected, spent, secProrated, secPct, active };
  });
  const activeRows = secRows.filter((r) => r.active);
  const inactiveRows = secRows.filter((r) => !r.active);
  const dash = () => <span className="num" style={{ color: DIM }}>—</span>;
  const renderSecRow = (r: (typeof secRows)[number], isInactive: boolean) => (
    <div key={r.s.id} style={{ display: "grid", gridTemplateColumns: DRILL_GRID, gap: "8px", padding: "8px 16px", alignItems: "center", borderTop: "1px solid rgba(31,36,33,0.05)", background: isInactive ? "#FBFAF7" : "transparent" }}>
      <span title={r.s.name} style={{ textAlign: "right", fontWeight: 500, color: "#1F2421", fontSize: "12.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.s.name}</span>
      <div style={{ textAlign: "right" }}>
        <AmountPerStudentCell gradeId={grade.id} sectionId={r.s.id} sectionName={r.s.name} current={r.aps} existingId={r.gsa?.existing_id} />
      </div>
      <div style={{ textAlign: "right" }}>{r.planned > 0 ? <span className="num" style={{ color: "#997404" }}>{fmt(r.planned)}</span> : dash()}</div>
      <div style={{ textAlign: "right" }}>{r.collected > 0 ? <span className="num" style={{ color: "#1F2421", fontWeight: 600 }}>{fmt(r.collected)}</span> : dash()}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "3px", minWidth: 0 }}>
        {r.spent > 0 ? <span className="num" style={{ color: "#CE2458" }}>{fmt(r.spent)}</span> : dash()}
        {r.secProrated && <span title="כולל חלק יחסי מהוצאות כל השכבות" style={{ display: "inline-flex", color: "#997404", cursor: "help", flexShrink: 0 }}><Layers size={9} /></span>}
      </div>
      <div style={{ textAlign: "right" }}>{(r.collected > 0 || r.spent > 0) ? <span className="num" style={{ fontWeight: 600, color: (r.collected - r.spent) < 0 ? "#CE2458" : "#0B7A5C" }}>{fmt(r.collected - r.spent)}</span> : dash()}</div>
      <div style={{ textAlign: "right" }}>{r.planned === 0 ? dash() : <span className="num" style={{ fontWeight: 600, color: r.secPct >= 100 ? "#0B7A5C" : r.secPct >= 50 ? "#0B7A5C" : "#5C645F" }}>{r.secPct}%</span>}</div>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setExpanded((x) => !x)}
        className="horim-row horim-row-enter"
        data-open={expanded ? "true" : "false"}
        style={{
          display: "grid",
          gridTemplateColumns: HORIM_GRID,
          padding: "16px 20px", gap: "12px", alignItems: "center",
          borderBottom: "1px solid rgba(31,36,33,0.05)",
          cursor: "pointer",
          animationDelay: `${Math.min(index, 12) * 40}ms`,
        }}
      >
        {/* Grade name + student count */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "15px", fontWeight: "500", color: "#1F2421" }}>{grade.name}</span>
          <span style={{ fontSize: "11px", color: "#98A09A", display: "flex", alignItems: "center", gap: "3px" }}>
            <Users size={10} />{grade.student_count} תלמידים
          </span>
        </div>

        {/* יעד */}
        <div style={{ textAlign: "right" }}>
          {totalTarget > 0 ? (
            <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#997404" }}>{fmt(totalTarget)}</span>
          ) : (
            <span style={{ fontSize: "12px", color: "#98A09A", fontStyle: "italic" }}>לא הוגדר</span>
          )}
        </div>

        {/* נגבה */}
        <div style={{ textAlign: "right" }}>
          <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#1F2421" }}>{fmt(totalCollected)}</span>
        </div>

        {/* יצא — המספר בקצה הימני, אייקון החלק היחסי משמאלו במקום קבוע */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "3px", minWidth: 0 }}>
          <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: totalSpent > 0 ? "#CE2458" : "#98A09A" }}>
            {totalSpent > 0 ? fmt(totalSpent) : "—"}
          </span>
          {hasProrated && (
            <span title="כולל חלק יחסי מהוצאות כל השכבות" onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", color: "#997404", cursor: "help", flexShrink: 0 }}>
              <Layers size={10} />
            </span>
          )}
        </div>

        {/* נשאר בקופה = נגבה − יצא */}
        <div style={{ textAlign: "right" }}>
          <span className="num" style={{ fontSize: "13px", fontWeight: "600", color: cashBalance < 0 ? "#CE2458" : "#0B7A5C", background: cashBalance < 0 ? "rgba(206,36,88,0.08)" : "rgba(11,122,92,0.09)", borderRadius: "99px", padding: "2px 8px", display: "inline-block" }}>
            {fmt(cashBalance)}
          </span>
        </div>

        {/* התקדמות (נגבה מתוך יעד) — אחוז בקצה הימני מתחת לכותרת, פס דק משמאלו */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="num" style={{
            fontSize: "12px", fontWeight: "600", flexShrink: 0, minWidth: "34px",
            color: totalTarget === 0 ? "#98A09A" : pct >= 100 ? "#0B7A5C" : pct >= 50 ? "#0B7A5C" : "#5C645F",
          }}>
            {totalTarget === 0 ? "—" : `${pct}%`}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}><Bar pct={pct} /></div>
        </div>

        {/* Expand toggle — chevron rotates 180° when open (CSS) */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          className="horim-chevron-btn"
          aria-label={expanded ? "סגור פירוט" : "פתח פירוט"}
          style={{ border: "none", cursor: "pointer", padding: "6px", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronDown className="horim-chevron" size={16} />
        </button>
      </div>

      {/* Expanded drill-down — animated open/close (respects reduced-motion) */}
      <div className="horim-drill" data-open={expanded ? "true" : "false"}>
        <div className="horim-drill__inner">
        <div style={{ background: "#FBFAF7", borderBottom: "1px solid rgba(31,36,33,0.08)", boxShadow: "inset 0 3px 6px -4px rgba(12,35,27,0.12)", padding: "0 20px 16px" }}>
          <div style={{ paddingTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Per-section table — full picture for this grade */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#0B7A5C", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
                פירוט לפי סעיף — {grade.name}
              </div>
              <div style={{ border: "1px solid rgba(31,36,33,0.09)", borderRadius: "12px", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: "640px" }}>
                    {/* header — shares DRILL_GRID with every detail row below */}
                    <div style={{ display: "grid", gridTemplateColumns: DRILL_GRID, gap: "8px", padding: "8px 16px", background: "#FBFAF7", fontSize: "12px", fontWeight: 600, color: "#0B7A5C" }}>
                      <span style={{ textAlign: "right" }}>סעיף</span>
                      <span style={{ textAlign: "right" }}>לתלמיד</span>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#997404", flexShrink: 0 }} />יעד ({Math.round(multiplier * 100)}%)</span>
                      <span style={{ textAlign: "right" }}>נגבה</span>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#CE2458", flexShrink: 0 }} />יצא</span>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0B7A5C", flexShrink: 0 }} />נשאר</span>
                      <span style={{ textAlign: "right" }}>%</span>
                    </div>
                    {activeRows.length === 0 && inactiveRows.length > 0 && (
                      <div style={{ padding: "12px 16px", fontSize: "12px", color: "#98A09A", borderTop: "1px solid rgba(31,36,33,0.05)", textAlign: "right" }}>אין עדיין יעד, גבייה או הוצאה לשכבה זו.</div>
                    )}
                    {activeRows.map((r) => renderSecRow(r, false))}
                    {inactiveRows.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowInactive((x) => !x); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "8px 16px", borderTop: "1px solid rgba(31,36,33,0.05)", background: "#FBFAF7", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", color: "#98A09A" }}
                      >
                        {showInactive ? "הסתר סעיפים ללא פעילות" : `עוד ${inactiveRows.length} סעיפים ללא פעילות לשכבה זו`}
                        {showInactive ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}
                    {showInactive && inactiveRows.map((r) => renderSecRow(r, true))}
                    {(otherSpent > 0 || unassignedCollected > 0) && (
                      <div style={{ display: "grid", gridTemplateColumns: DRILL_GRID, gap: "8px", padding: "8px 16px", alignItems: "center", borderTop: "1px solid rgba(31,36,33,0.05)", background: "#FBFAF7" }}>
                        <span style={{ gridColumn: "span 2", textAlign: "right", fontWeight: 500, color: "#5C645F", fontSize: "12px" }}>אחר — הוצאות ללא סעיף</span>
                        <div style={{ textAlign: "right" }}>{dash()}</div>
                        <div style={{ textAlign: "right" }}>{unassignedCollected > 0 ? <span className="num" style={{ color: "#1F2421", fontWeight: 600 }}>{fmt(unassignedCollected)}</span> : dash()}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "3px", minWidth: 0 }}>
                          {otherSpent > 0 ? <span className="num" style={{ color: "#CE2458" }}>{fmt(otherSpent)}</span> : dash()}
                          {otherProrated && <span title="כולל חלק יחסי מהוצאות כל השכבות" style={{ display: "inline-flex", color: "#997404", cursor: "help", flexShrink: 0 }}><Layers size={9} /></span>}
                        </div>
                        <div style={{ textAlign: "right" }}>{(unassignedCollected > 0 || otherSpent > 0) ? <span className="num" style={{ fontWeight: 600, color: (unassignedCollected - otherSpent) < 0 ? "#CE2458" : "#0B7A5C" }}>{fmt(unassignedCollected - otherSpent)}</span> : dash()}</div>
                        <div style={{ textAlign: "right" }}>{dash()}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#98A09A", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                היסטוריית גבייה
              </span>
              {canWrite && (
                <button
                  onClick={() => onAddCollection(grade.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "5px",
                    padding: "5px 12px",
                    border: "1px solid #0B7A5C", borderRadius: "7px",
                    background: "#F1EEE8", color: "#0B7A5C",
                    fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-sans)",
                  }}
                >
                  <Plus size={12} />
                  הוסף גבייה
                </button>
              )}
            </div>

            {gradeCollections.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#5C645F", padding: "8px 0" }}>אין גביות רשומות עדיין</div>
            ) : (
              gradeCollections.map((c) => {
                const sec = sections.find((s) => s.id === c.parent_section_id);
                return (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", borderRadius: "8px", border: "1px solid #EAE5DE" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: "12px", color: "#98A09A", whiteSpace: "nowrap" }}>
                        {new Date(c.collection_date).toLocaleDateString("he-IL")}
                      </span>
                      <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "99px", background: c.parent_section_id === null ? "#FDF3DC" : "#F1EEE8", color: c.parent_section_id === null ? "#92400E" : "#0B7A5C", whiteSpace: "nowrap" }}>
                        {c.parent_section_id === null ? "לא משויך" : (sec?.name ?? "—")}
                      </span>
                      {c.notes && <span style={{ fontSize: "12px", color: "#5C645F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                      <span className="num" style={{ fontSize: "13px", fontWeight: "500", color: "#0B7A5C" }}>{fmt(c.amount)}</span>
                      {canWrite && (
                        <button
                          onClick={() => onEditCollection(c)}
                          title="ערוך"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#98A09A", display: "flex", alignItems: "center" }}
                          onMouseEnter={(el) => { el.currentTarget.style.background = "#EDE8E0"; el.currentTarget.style.color = "#0B7A5C"; }}
                          onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#98A09A"; }}
                        ><Pencil size={12} /></button>
                      )}
                      {canWrite && (
                        <button
                          onClick={() => onDeleteCollection(c.id)}
                          title="מחק"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", color: "#98A09A", display: "flex", alignItems: "center" }}
                          onMouseEnter={(el) => { el.currentTarget.style.background = "#FEF2F2"; el.currentTarget.style.color = "#DC2626"; }}
                          onMouseLeave={(el) => { el.currentTarget.style.background = "none"; el.currentTarget.style.color = "#98A09A"; }}
                        ><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>{/* closes gap:16px flex */}
        </div>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HorimPage() {
  const isMobile = useIsMobile();
  const canWrite = useCanWrite();
  // Honour prefers-reduced-motion: when set, the hero shows final numbers instead of counting up.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduceMotion(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // Sticky glass action bar: a 0-height sentinel above it reports when the bar is "floating".
  const [barStuck, setBarStuck] = useState(false);
  const barSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barSentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setBarStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [showModal, setShowModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showKesafimImport, setShowKesafimImport] = useState(false);
  const [preGradeId, setPreGradeId] = useState<string | undefined>();
  // Basis: "year" = the school year's collection percentage (school_years.collection_percentage),
  // "full" = 100%. The year's pct is the wired default — no more hardcoded 85.
  const { data: yearPct = 85 } = useCollectionPct();
  const [basisMode, setBasisMode] = useState<"year" | "full">("year");
  // Forecast mode: a temporary what-if view. null = off. NEVER persisted —
  // resets on refresh; only the explicit "קבע" button writes the setting.
  const [forecastPct, setForecastPct] = useState<number | null>(null);
  const [confirmSetPct, setConfirmSetPct] = useState(false);
  const setCollectionPct = useSetCollectionPct();
  const basis = forecastPct ?? (basisMode === "year" ? yearPct : 100);
  const [guardMsg, setGuardMsg] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] = useState<ParentCollection | null>(null);
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null);

  const { data: grades = [], isLoading: gradesLoading } = useGrades();
  const { data: sections = [], isLoading: sectionsLoading } = useParentSections();
  const { data: allSections = [] } = useAllParentSections();
  const { data: gsaList = [] } = useGradeSectionAmounts();
  const { data: collections = [] } = useParentCollections();
  const { data: refunds = [] } = useParentRefunds();
  const { data: horimExpenses = [] } = useExpenses("horim"); // 2.7.0: הוצאות הורים — הוצא/נשאר בקופה בטבלה ובהירו

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
    // Unassigned collections ("לא משויך") count toward the grand total
    grandCollected += collectionsMap.get(`${g.id}:null`) ?? 0;
  });
  const grandPct = grandTarget > 0 ? Math.round((grandCollected / grandTarget) * 100) : 0;

  const hasTarget = grandTarget > 0;

  // 2.7.0: display-only spend distribution. A grade-assigned expense counts fully for that grade;
  // a grade-less ("all grades") expense splits across grades by student count (largest-remainder in
  // whole agorot, so shares sum to the exact amount). No DB record is changed.
  const spendByGrade = new Map<string, GradeSpend>();
  grades.forEach((g) => spendByGrade.set(g.id, {
    spentAg: 0, proratedAg: 0, bySectionAg: new Map(), bySectionProratedAg: new Map(), otherAg: 0, otherProratedAg: 0,
  }));
  horimExpenses.forEach((e) => {
    const cents = Math.round(e.amount * 100);
    if (cents <= 0) return;
    const catName = e.budget_categories?.name ?? null;
    const sec = catName ? sections.find((x) => normalizeReportName(x.name) === normalizeReportName(catName)) : undefined;
    const apply = (gid: string, ag: number, prorated: boolean) => {
      const gs = spendByGrade.get(gid);
      if (!gs || ag <= 0) return;
      gs.spentAg += ag;
      if (prorated) gs.proratedAg += ag;
      if (sec) {
        gs.bySectionAg.set(sec.id, (gs.bySectionAg.get(sec.id) ?? 0) + ag);
        if (prorated) gs.bySectionProratedAg.set(sec.id, (gs.bySectionProratedAg.get(sec.id) ?? 0) + ag);
      } else {
        gs.otherAg += ag;
        if (prorated) gs.otherProratedAg += ag;
      }
    };
    if (e.grade_id && spendByGrade.has(e.grade_id)) {
      apply(e.grade_id, cents, false);
    } else {
      const alloc = splitByWeights(cents, grades.map((g) => g.student_count));
      grades.forEach((g, i) => apply(g.id, alloc[i], true));
    }
  });

  // 2.7.0 refactor: all-parents spend + real-cash balance for the hero
  const grandSpent = horimExpenses.reduce((sm, e) => sm + e.amount, 0);
  const grandCash  = grandCollected - grandSpent;
  // Hero count-up (≤800ms, ease-out). One pass when the numbers arrive — the hook re-runs only when
  // its target changes, never on every render.
  const animCollected = useCountUp(grandCollected, 800);
  const animTarget    = useCountUp(grandTarget, 800);
  const animSpent     = useCountUp(grandSpent, 800);
  const animCash      = useCountUp(grandCash, 800);
  const animPct       = useAnimatedPct(hasTarget ? Math.min(grandPct, 100) : 0);
  // Reduced-motion: skip the count-up and show the final values.
  const showCollected = reduceMotion ? grandCollected : animCollected;
  const showTarget    = reduceMotion ? grandTarget : animTarget;
  const showSpent     = reduceMotion ? grandSpent : animSpent;
  const showCash      = reduceMotion ? grandCash : animCash;
  const showPct       = reduceMotion ? (hasTarget ? Math.min(grandPct, 100) : 0) : animPct;
  // "נשאר בקופה" is the hero's star: state colour (green positive · amber negative · grey zero),
  // tuned to read on the dark wine hero.
  const cashColor = grandCash < 0 ? "#F2A0B4" : "#8FE3C0";

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
      {showKesafimImport && (
        <KesafimImportModal grades={grades} sections={sections} onClose={() => setShowKesafimImport(false)} />
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
          gsaMap={gsaMap}
          preGradeId={preGradeId}
          onClose={() => setShowModal(false)}
        />
      )}
      {showRefundModal && grades.length > 0 && (
        <AddRefundModal
          grades={grades}
          sections={sections}
          onClose={() => setShowRefundModal(false)}
        />
      )}

      <div className="horim-screen" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div ref={barSentinelRef} aria-hidden="true" style={{ height: 0 }} />

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
        <div className="horim-actionbar" data-stuck={barStuck ? "true" : "false"} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", gap: isMobile ? "12px" : "0", paddingBlock: "4px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "300", color: "#1F2421", letterSpacing: "-0.8px" }}>גביית הורים</h1>
            <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#98A09A" }}>
              {isLoading ? "טוען..." : `${grades.length} שכבות · ${sections.length} סעיפים`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Basis toggle */}
            <div style={{ display: "flex", background: "#fff", borderRadius: "11px", padding: "3px", gap: "2px", boxShadow: "0 1px 2px rgba(31,36,33,0.05), 0 0 0 1px rgba(31,36,33,0.08)" }}>
              {([["year", `${yearPct}%`], ["full", "100%"]] as const).map(([mode, label]) => {
                const active = forecastPct === null && basisMode === mode;
                return (
                  <button key={mode} onClick={() => { setForecastPct(null); setConfirmSetPct(false); setBasisMode(mode); }} style={{
                    padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "500",
                    border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                    background: active ? "#0C231B" : "transparent",
                    color: active ? "#F2EFE8" : "#5C645F",
                    boxShadow: "none",
                    transition: "all 0.15s",
                  }}>
                    {label}
                  </button>
                );
              })}
              <button onClick={() => { setForecastPct((p) => p === null ? yearPct : null); setConfirmSetPct(false); }} style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "500",
                border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                background: forecastPct !== null ? "#997404" : "transparent",
                color: forecastPct !== null ? "#fff" : "#5C645F",
                boxShadow: forecastPct !== null ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.15s",
              }}>
                תחזית {forecastPct !== null ? `${forecastPct}%` : "▾"}
              </button>
            </div>
            {canWrite && (
              <button
                onClick={() => {
                  if (grades.length === 0) { setGuardMsg("יש להגדיר שכבות תחילה"); return; }
                  setShowKesafimImport(true);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 14px",
                  border: "1px solid #E8E2D9", borderRadius: "10px",
                  background: "#fff", color: "#5C645F",
                  fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
                }}
                title="ייבוא דוח סטטוס גביה מתוכנת כספים 2000"
              >
                <FileUp size={15} />
                ייבוא מכספים 2000
              </button>
            )}
            {canWrite && (
              <button
                onClick={() => setShowSectionsModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 14px",
                  border: "1px solid #E8E2D9", borderRadius: "10px",
                  background: "#fff", color: "#5C645F",
                  fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
                }}
                title="ניהול סעיפי גבייה"
              >
                <Settings2 size={15} />
                סעיפים
              </button>
            )}
            {canWrite && (
              <button
                onClick={() => {
                  if (grades.length === 0) { setGuardMsg("יש להגדיר שכבות תחילה"); return; }
                  setShowRefundModal(true);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "10px 16px",
                  background: "#fff",
                  border: "none", borderRadius: "11px",
                  color: "#5C645F", fontSize: "14px", fontWeight: "500",
                  boxShadow: "0 1px 2px rgba(31,36,33,0.05), 0 0 0 1px rgba(31,36,33,0.08)",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                }}
              >
                <span style={{ fontSize: "16px", lineHeight: 1 }}>↩</span>
                רשום החזר
              </button>
            )}
            {canWrite && (
              <button
                onClick={() => openAddCollection()}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "10px 18px",
                  background: "linear-gradient(135deg, #A44A61, #7A2E42)",
                  border: "none", borderRadius: "11px",
                  color: "#fff", fontSize: "14px", fontWeight: "500",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                  boxShadow: "0 2px 8px rgba(122,46,66,0.28), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <Plus size={16} />
                רשום גבייה
              </button>
            )}
          </div>
        </div>

        {/* ── Forecast strip — temporary what-if view, never persisted ── */}
        {forecastPct !== null && (
          <div style={{
            display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
            background: "linear-gradient(135deg, #FDF6E3, #FBF0D9)",
            border: "1.5px solid #E8C97E", borderRadius: "14px",
            padding: "12px 18px",
          }}>
            <span style={{
              fontSize: "11px", fontWeight: "700", color: "#fff", background: "#997404",
              borderRadius: "99px", padding: "3px 10px", letterSpacing: "0.05em", whiteSpace: "nowrap",
            }}>
              מצב תחזית
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "220px" }}>
              <span className="num" style={{ fontSize: "20px", fontWeight: "600", color: "#997404", minWidth: "52px" }}>
                {forecastPct}%
              </span>
              <input
                type="range" min={50} max={100} step={1}
                value={forecastPct}
                onChange={(e) => { setForecastPct(Number(e.target.value)); setConfirmSetPct(false); }}
                style={{ flex: 1, maxWidth: "300px", accentColor: "#997404", cursor: "grab" }}
              />
              <span style={{ fontSize: "11.5px", color: "#997404", whiteSpace: "nowrap" }}>
                אחוז השנה הקבוע: <b>{yearPct}%</b>
              </span>
            </div>
            <span style={{ fontSize: "11.5px", color: "#997404" }}>
              תצוגה זמנית — לא נשמרת
            </span>
            {canWrite && forecastPct !== yearPct && (
              confirmSetPct ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#997404", fontWeight: "600" }}>
                    לקבוע {forecastPct}% כאחוז השנה? כל היעדים במערכת יתעדכנו.
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await setCollectionPct.mutateAsync(forecastPct);
                        toast.success(`אחוז הגבייה נקבע ל-${forecastPct}%`);
                        setForecastPct(null); setConfirmSetPct(false); setBasisMode("year");
                      } catch { toast.error("שגיאה בקביעת אחוז הגבייה"); }
                    }}
                    disabled={setCollectionPct.isPending}
                    style={{ padding: "6px 14px", borderRadius: "8px", border: "none", background: "#997404", color: "#fff", fontSize: "12.5px", fontWeight: "600", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                  >
                    {setCollectionPct.isPending ? "קובע..." : "כן, קבע"}
                  </button>
                  <button onClick={() => setConfirmSetPct(false)}
                    style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid #E8C97E", background: "#fff", color: "#997404", fontSize: "12.5px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    ביטול
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmSetPct(true)}
                  style={{ padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #997404", background: "#fff", color: "#997404", fontSize: "12.5px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-sans)" }}>
                  קבע {forecastPct}% כאחוז השנה
                </button>
              )
            )}
            <button onClick={() => { setForecastPct(null); setConfirmSetPct(false); }}
              title="חזרה לתצוגה רגילה"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#997404", padding: "2px", fontSize: "15px", lineHeight: 1 }}>
              ✕
            </button>
          </div>
        )}

        {/* Summary hero */}
        {isLoading ? <HeroSkeleton isMobile={isMobile} /> : (
        <div className="hk-fade-in" style={{
          background: "radial-gradient(120% 180% at 85% -20%, #552549 0%, #37152F 38%, #200C1C 100%)",
          borderRadius: "24px", padding: isMobile ? "24px" : "36px 40px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 1px 2px rgba(12,35,27,0.2), 0 20px 48px -18px rgba(12,35,27,0.45)",
        }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(52% 70% at 18% 105%, rgba(232,201,126,0.13), transparent 65%)" }} />
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(40% 55% at 65% -10%, rgba(214,170,222,0.09), transparent 70%)" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: isMobile ? "24px" : "44px", flexWrap: "wrap" }}>
            {/* collected */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", color: "rgba(242,239,232,0.62)", letterSpacing: "0.02em" }}>סה״כ גבייה — כל השכבות</span>
              <div className="num" style={{ fontSize: isMobile ? "38px" : "54px", fontWeight: "300", color: "#F7F4EC", letterSpacing: "-0.025em", lineHeight: 1.05 }}>
                {new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(showCollected)}
                <span style={{ fontSize: "0.44em", fontWeight: 400, opacity: 0.55, marginInlineStart: "0.12em", letterSpacing: 0 }}>₪</span>
              </div>
              {hasTarget ? (
                <div style={{ marginTop: "8px", fontSize: "13px", color: "#E8C97E" }}>
                  מתוך צפי שנתי <b className="num" style={{ fontWeight: 500 }}>{fmt(showTarget)}</b> ({basis}%)
                </div>
              ) : (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(242,239,232,0.5)" }}>
                  <span style={{ padding: "2px 8px", borderRadius: "6px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(242,239,232,0.2)" }}>לא הוגדר צפי — הגדר סכום/תלמיד בטבלה</span>
                </div>
              )}
            </div>
            {/* divider · נשאר · יצא · divider · ring */}
            <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: isMobile ? "20px" : "36px", flexWrap: "wrap" }}>
              {hasTarget && <div style={{ width: "1px", alignSelf: "stretch", background: "linear-gradient(180deg, transparent, rgba(242,239,232,0.14), transparent)" }} />}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "rgba(242,239,232,0.5)", letterSpacing: "0.02em" }}>נשאר בקופה</span>
                <div className="num" style={{ fontSize: isMobile ? "28px" : "34px", fontWeight: "400", color: cashColor, lineHeight: 1.05, letterSpacing: "-0.02em" }}>{fmt(showCash)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "12px", color: "rgba(242,239,232,0.5)", letterSpacing: "0.02em" }}>יצא</span>
                <div className="num" style={{ fontSize: "19px", fontWeight: "400", color: "#F2A0B4", lineHeight: 1.05 }}>{fmt(showSpent)}</div>
              </div>
              {hasTarget && <div style={{ width: "1px", alignSelf: "stretch", background: "linear-gradient(180deg, transparent, rgba(242,239,232,0.14), transparent)" }} />}
              <HeroRing pct={hasTarget ? grandPct : 0} hasTarget={hasTarget} reduceMotion={reduceMotion} size={isMobile ? 104 : 132} />
            </div>
          </div>
        </div>
        )}

        {/* Table */}
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="hk-fade-in" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {grades.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#98A09A", fontSize: "12.5px", margin: "8px 0 2px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#997404", opacity: 0.6 }} />
                <span>לחצו על שכבה לפירוט לפי סעיפים</span>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#997404", opacity: 0.6 }} />
              </div>
            )}
          <div style={{ background: "#fff", borderRadius: "20px", overflow: "hidden", boxShadow: "0 1px 2px rgba(31,36,33,0.04), 0 12px 32px -12px rgba(31,36,33,0.10)" }}>
            {/* Horizontal scroll wrapper */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: "700px" }}>
                {/* Table header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: HORIM_GRID,
                  padding: "12px 20px", borderBottom: "1px solid rgba(31,36,33,0.08)",
                  fontSize: "12px", fontWeight: "600", color: "#98A09A",
                  letterSpacing: "0.04em", gap: "12px", background: "#FAFAF8",
                }}>
                  <span style={{ textAlign: "right" }}>שכבה</span>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#997404", flexShrink: 0 }} />יעד ({basis}%)</span>
                  <span style={{ textAlign: "right" }}>נגבה</span>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#CE2458", flexShrink: 0 }} />יצא</span>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "4px" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0B7A5C", flexShrink: 0 }} />נשאר בקופה</span>
                  <span style={{ textAlign: "right" }}>התקדמות</span>
                  <span />
                </div>

                {/* Grade rows */}
                {grades.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#98A09A", fontSize: "14px" }}>אין שכבות מוגדרות</div>
                ) : (
                  grades.map((g, i) => (
                    <GradeRow
                      key={g.id}
                      grade={g}
                      sections={sections}
                      gsaMap={gsaMap}
                      collectionsMap={collectionsMap}
                      spend={spendByGrade.get(g.id)!}
                      index={i}
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
          </div>
        )}

        {/* Unassigned collections summary — money collected but not tied to a section */}
        {!isLoading && (() => {
          const totalUnassigned = collections
            .filter((c) => c.parent_section_id === null)
            .reduce((sum, c) => sum + c.amount, 0);
          if (totalUnassigned <= 0) return null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#FDF8EC", border: "1px solid #F0D9A8", borderRadius: "10px", padding: "10px 16px" }}>
              <span style={{ fontSize: "13px" }}>💡</span>
              <span style={{ fontSize: "12.5px", color: "#92400E" }}>
                נגבו ₪{totalUnassigned.toLocaleString("he-IL")} שאינם משויכים לסעיף — הסכום נספר בסך הגבייה. ניתן לשייך דרך עריכת הגבייה בהיסטוריית השכבה.
              </span>
            </div>
          );
        })()}

        {/* Refunds summary */}
        {!isLoading && (
          <RefundsSummary
            refunds={refunds}
            grades={grades}
            sections={sections}
            canWrite={canWrite}
          />
        )}

      </div>
    </>
  );
}
