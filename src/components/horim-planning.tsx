import { useMemo, useState } from "react";
import { Plus, X, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeReportName } from "@/components/kesafim-import";
import {
  useHorimPlanning, useSavePlannedActivity, useRemovePlannedActivity, useRestorePlannedActivity,
} from "@/hooks/use-planned-activities";
import {
  buildPlanningView, activityTotalAg, targetGradesOf, componentAg, gradeFieldsOf, fromAg,
  type GradeLite, type SectionLite, type SpendLike, type PlannedActivity, type PlanComponent,
  type PlanComponentKind, type PlanSectionBox, type PlanGradeView,
} from "@/lib/horim-planning";

/**
 * 2.9.0 — לשונית "תכנון" במסך ההורים (בקשת נורית, כרמים).
 * לכל שכבה × סעיף: קופה עם מספר אחד — "נשאר לתכנן" — ורשימת הפעילויות שתוכננו.
 * אין כאן העברה בין סעיפים או בין שכבות, ואין ניסוח שמרמז עליה: הסך הכולל הוא סכום בלבד.
 */

const INK = "#1F2421", DIM = "#98A09A", GREEN = "#0B7A5C", RED = "#CE2458", GOLD = "#997404";
// מסך תכנון — מציגים בשקלים שלמים. החישוב עצמו נשאר באגורות.
const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtAg = (ag: number) => fmt(fromAg(ag));
const KIND_LABEL: Record<PlanComponentKind, string> = { per_student: "לכל ילד", quantity: "לפי כמות", fixed: "סכום קבוע" };

interface Props {
  grades: GradeLite[];
  sections: SectionLite[];
  gsaMap: Map<string, { amount_per_student: number }>;
  collectionsMap: Map<string, number>;
  spendByGrade: Map<string, SpendLike>;
  /** אחוז הגבייה שלפיו מחושב היעד (0-1) והתווית שלו */
  multiplier: number;
  basis: number;
  canWrite: boolean;
  isMobile: boolean;
  isLoading: boolean;
}

interface Editing {
  section: SectionLite;
  categoryId: string;
  fromGradeId: string;
  activity: PlannedActivity | null;
}

export function HorimPlanning({
  grades, sections, gsaMap, collectionsMap, spendByGrade, multiplier, basis, canWrite, isMobile, isLoading,
}: Props) {
  const { data, isLoading: planLoading } = useHorimPlanning();
  const remove = useRemovePlannedActivity();
  const restore = useRestorePlannedActivity();
  const [openGrade, setOpenGrade] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const activities = data?.activities ?? [];
  // סעיף ↔ קטגוריית התקציב שלו: לפי שם מנורמל, כמו בשאר מסך ההורים.
  const { categoryIdOfSection, sectionIdOfCategory } = useMemo(() => {
    const secByNorm = new Map(sections.map((s) => [normalizeReportName(s.name), s.id]));
    const catToSec = new Map<string, string>();
    const secToCat = new Map<string, string>();
    (data?.categories ?? []).forEach((c) => {
      const secId = secByNorm.get(normalizeReportName(c.name));
      if (secId) { catToSec.set(c.id, secId); if (!secToCat.has(secId)) secToCat.set(secId, c.id); }
    });
    return {
      categoryIdOfSection: (id: string) => secToCat.get(id),
      sectionIdOfCategory: (id: string) => catToSec.get(id),
    };
  }, [sections, data?.categories]);

  const viewOf = (acts: PlannedActivity[]) => buildPlanningView({
    grades, sections,
    targetOf: (g, s) => (gsaMap.get(`${g}:${s}`)?.amount_per_student ?? 0) * (grades.find((x) => x.id === g)?.student_count ?? 0) * multiplier,
    collectedOf: (g, s) => collectionsMap.get(`${g}:${s}`) ?? 0,
    spendByGrade, activities: acts, sectionIdOfCategory,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => viewOf(activities), [grades, sections, gsaMap, collectionsMap, spendByGrade, multiplier, activities, sectionIdOfCategory]);

  /** "מה יישאר בקופה" אם הטיוטה תישמר — לכל שכבה שהפעילות נוגעת בה. */
  const previewOf = (draft: PlannedActivity, sectionId: string) => {
    const v = viewOf([...activities.filter((a) => a.id !== draft.id), draft]);
    return targetGradesOf(draft, grades).map((g) => {
      const box = v.grades.find((x) => x.gradeId === g.id)?.sections.find((b) => b.sectionId === sectionId);
      const row = box?.activities.find((r) => r.activity.id === draft.id);
      return { gradeId: g.id, gradeName: g.name, shareAg: row?.plannedAg ?? 0, leftAg: box?.leftAg ?? 0 };
    });
  };

  const handleRemove = async (a: PlannedActivity) => {
    try {
      const removed = await remove.mutateAsync(a.id);
      toast(removed.mode === "deleted" ? `"${a.name}" הוסרה מהתכנון` : `התכנון של "${a.name}" הוסר. ההוצאות שנרשמו עליה נשארו`, {
        duration: 8000,
        action: {
          label: "ביטול",
          onClick: () => restore.mutate(removed, { onError: () => toast.error("לא הצלחנו להחזיר את הפעילות") }),
        },
      });
    } catch {
      toast.error("לא הצלחנו להסיר את הפעילות");
    }
  };

  if (isLoading || planLoading) {
    return <div style={{ padding: "40px", textAlign: "center", color: DIM, fontSize: "14px" }}>טוען את התכנון...</div>;
  }
  if (grades.length === 0 || sections.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: "20px", padding: "40px 24px", textAlign: "center", color: DIM, fontSize: "14px", boxShadow: "0 1px 2px rgba(31,36,33,0.04)" }}>
        כדי לתכנן צריך קודם להגדיר שכבות וסעיפי גבייה.
      </div>
    );
  }

  const t = view.totals;

  return (
    <>
      {editing && (
        <ActivityModal
          editing={editing} grades={grades} isMobile={isMobile}
          previewOf={(d) => previewOf(d, editing.section.id)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Hero — מספר אחד */}
      <div className="hk-fade-in" style={{
        background: "radial-gradient(120% 180% at 85% -20%, #552549 0%, #37152F 38%, #200C1C 100%)",
        borderRadius: "24px", padding: isMobile ? "24px" : "32px 40px", position: "relative", overflow: "hidden",
        boxShadow: "0 1px 2px rgba(12,35,27,0.2), 0 20px 48px -18px rgba(12,35,27,0.45)",
      }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: isMobile ? "20px" : "44px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "12px", color: "rgba(242,239,232,0.62)", letterSpacing: "0.02em" }}>
              נשאר לתכנן — כל השכבות
            </span>
            <div className="num" style={{ fontSize: isMobile ? "38px" : "54px", fontWeight: 300, color: "#F7F4EC", letterSpacing: "-0.025em", lineHeight: 1.05 }}>
              {new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(fromAg(t.leftAg))}
              <span style={{ fontSize: "0.44em", fontWeight: 400, opacity: 0.55, marginInlineStart: "0.12em", letterSpacing: 0 }}>₪</span>
            </div>
            <div style={{ marginTop: "8px", fontSize: "13px", color: "#E8C97E" }}>
              מתוך יעד שנתי <b className="num" style={{ fontWeight: 500 }}>{fmtAg(t.targetAg)}</b> ({basis}%)
            </div>
          </div>
          <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: isMobile ? "20px" : "32px", flexWrap: "wrap" }}>
            <HeroStat label="מתוכנן, עוד לא יצא" value={fmtAg(t.plannedOpenAg)} color="#E8C97E" />
            <HeroStat label="יצא" value={fmtAg(t.spentAg)} color="#F2A0B4" />
            <HeroStat label="נגבה עד היום" value={fmtAg(t.collectedAg)} color="#F7F4EC" />
            {t.overAg > 0 && <HeroStat label={t.overCount === 1 ? "חריגה בקופה אחת" : `חריגה ב-${t.overCount} קופות`} value={fmtAg(t.overAg)} color="#F2A0B4" />}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: DIM, fontSize: "12.5px", margin: "8px 0 2px", textAlign: "center" }}>
        <span>לכל סעיף בכל שכבה יש קופה משלו. לחצו על שכבה, והוסיפו פעילות לקופה.</span>
      </div>

      <div className="hk-fade-in" style={{ background: "#fff", borderRadius: "20px", overflow: "hidden", boxShadow: "0 1px 2px rgba(31,36,33,0.04), 0 12px 32px -12px rgba(31,36,33,0.10)" }}>
        {view.grades.map((g, i) => (
          <GradeBlock
            key={g.gradeId} g={g} first={i === 0} isMobile={isMobile} canWrite={canWrite}
            open={openGrade === g.gradeId}
            onToggle={() => setOpenGrade((cur) => (cur === g.gradeId ? null : g.gradeId))}
            categoryIdOfSection={categoryIdOfSection}
            onAdd={(box, categoryId) => setEditing({ section: { id: box.sectionId, name: box.name }, categoryId, fromGradeId: g.gradeId, activity: null })}
            onEdit={(box, categoryId, activity) => setEditing({ section: { id: box.sectionId, name: box.name }, categoryId, fromGradeId: g.gradeId, activity })}
            onRemove={handleRemove}
            removing={remove.isPending}
          />
        ))}
      </div>
    </>
  );
}

function HeroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span style={{ fontSize: "12px", color: "rgba(242,239,232,0.5)", letterSpacing: "0.02em" }}>{label}</span>
      <div className="num" style={{ fontSize: "19px", fontWeight: 400, color, lineHeight: 1.05 }}>{value}</div>
    </div>
  );
}

/** "נשאר לתכנן ₪X" או "חריגה של ₪X" — אותו רכיב בכל מקום. */
function LeftAmount({ ag, size = 15 }: { ag: number; size?: number }) {
  const over = ag < 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
      <span style={{ fontSize: "11px", color: over ? RED : DIM }}>{over ? "חריגה של" : "נשאר לתכנן"}</span>
      <span className="num" style={{ fontSize: `${size}px`, fontWeight: 600, color: over ? RED : GREEN }}>{fmtAg(Math.abs(ag))}</span>
    </div>
  );
}

function GradeBlock({
  g, first, open, onToggle, isMobile, canWrite, categoryIdOfSection, onAdd, onEdit, onRemove, removing,
}: {
  g: PlanGradeView; first: boolean; open: boolean; onToggle: () => void; isMobile: boolean; canWrite: boolean;
  categoryIdOfSection: (sectionId: string) => string | undefined;
  onAdd: (box: PlanSectionBox, categoryId: string) => void;
  onEdit: (box: PlanSectionBox, categoryId: string, a: PlannedActivity) => void;
  onRemove: (a: PlannedActivity) => void;
  removing: boolean;
}) {
  return (
    <div style={{ borderTop: first ? "none" : "1px solid rgba(31,36,33,0.07)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: isMobile ? "14px 16px" : "16px 22px",
        background: open ? "#FBFAF7" : "transparent", border: "none", cursor: "pointer", textAlign: "right", fontFamily: "inherit",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: 600, color: INK }}>{g.name}</div>
          <div style={{ fontSize: "12px", color: DIM, marginTop: "2px" }}>
            {g.students} תלמידים · {g.sections.length} סעיפים
            {g.plannedOpenAg > 0 && <> · מתוכנן <span className="num">{fmtAg(g.plannedOpenAg)}</span></>}
          </div>
          {g.overAg > 0 && (
            <div style={{ fontSize: "12px", color: RED, marginTop: "2px" }}>
              {g.overCount === 1 ? "חריגה בקופה אחת" : `חריגה ב-${g.overCount} קופות`}: <span className="num">{fmtAg(g.overAg)}</span>
            </div>
          )}
        </div>
        <LeftAmount ag={g.leftAg} size={17} />
        {open ? <ChevronUp size={18} color={DIM} /> : <ChevronDown size={18} color={DIM} />}
      </button>

      {open && (
        <div style={{ padding: isMobile ? "4px 12px 16px" : "4px 22px 20px", display: "flex", flexDirection: "column", gap: "10px", background: "#FBFAF7" }}>
          {g.sections.length === 0 && (
            <div style={{ padding: "16px", color: DIM, fontSize: "13px", textAlign: "center" }}>לשכבה הזו עוד לא הוגדרו סעיפי גבייה.</div>
          )}
          {g.sections.map((box) => {
            const categoryId = categoryIdOfSection(box.sectionId);
            return (
              <div key={box.sectionId} style={{ background: "#fff", borderRadius: "14px", border: "1px solid rgba(31,36,33,0.07)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14.5px", fontWeight: 600, color: INK }}>{box.name}</div>
                    <div style={{ fontSize: "12px", color: DIM, marginTop: "3px", lineHeight: 1.6 }}>
                      <span style={{ color: GOLD }}>יעד <span className="num">{fmtAg(box.targetAg)}</span></span>
                      {" · "}נגבה <span className="num">{fmtAg(box.collectedAg)}</span>
                      {" · "}יצא <span className="num">{fmtAg(box.spentAg)}</span>
                      {box.plannedOpenAg > 0 && <>{" · "}מתוכנן <span className="num">{fmtAg(box.plannedOpenAg)}</span></>}
                    </div>
                  </div>
                  <LeftAmount ag={box.leftAg} />
                </div>

                {box.activities.map((r) => (
                  <div key={r.activity.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderTop: "1px solid rgba(31,36,33,0.05)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13.5px", color: INK, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span>{r.activity.name}</span>
                        {r.sharedWith.length > 0 && (
                          <span style={{ fontSize: "11px", padding: "1px 8px", borderRadius: "99px", background: "#F1EEE8", color: "#6B6459" }}>
                            משותף: {r.sharedWith.join(", ")}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: DIM, marginTop: "2px" }}>
                        תוכנן <span className="num">{fmtAg(r.plannedAg)}</span>
                        {r.spentAg > 0 && <> · יצא <span className="num" style={{ color: r.spentAg > r.plannedAg ? RED : undefined }}>{fmtAg(r.spentAg)}</span></>}
                        {r.activity.notes && <> · {r.activity.notes}</>}
                      </div>
                    </div>
                    {canWrite && categoryId && (
                      <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                        <IconBtn label={`עריכת ${r.activity.name}`} onClick={() => onEdit(box, categoryId, r.activity)}><Pencil size={15} /></IconBtn>
                        <IconBtn label={`הסרת ${r.activity.name}`} disabled={removing} onClick={() => onRemove(r.activity)}><Trash2 size={15} /></IconBtn>
                      </div>
                    )}
                  </div>
                ))}

                {box.spentUnplannedAg > 0 && box.activities.length > 0 && (
                  <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(31,36,33,0.05)", fontSize: "12px", color: DIM }}>
                    יצא בסעיף בלי פעילות מתוכננת: <span className="num">{fmtAg(box.spentUnplannedAg)}</span>
                  </div>
                )}

                {canWrite && categoryId && (
                  <button type="button" onClick={() => onAdd(box, categoryId)} style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    padding: "10px 16px", background: "#F6FBF9", border: "none", borderTop: "1px solid rgba(31,36,33,0.05)",
                    color: GREEN, fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    <Plus size={15} /> פעילות חדשה
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{
      width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center",
      background: "none", border: "none", borderRadius: "8px", cursor: disabled ? "default" : "pointer", color: "#6B6459", opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

// ─── טופס פעילות ─────────────────────────────────────────────────────────────

interface CompDraft { name: string; kind: PlanComponentKind; price: string; qty: string }
const emptyComp = (): CompDraft => ({ name: "", kind: "per_student", price: "", qty: "" });
const toComp = (c: CompDraft): PlanComponent => ({ name: c.name, kind: c.kind, price: Number(c.price) || 0, ...(c.kind === "quantity" ? { qty: Number(c.qty) || 0 } : {}) });

function ActivityModal({
  editing, grades, isMobile, previewOf, onClose,
}: {
  editing: Editing; grades: GradeLite[]; isMobile: boolean;
  previewOf: (draft: PlannedActivity) => { gradeId: string; gradeName: string; shareAg: number; leftAg: number }[];
  onClose: () => void;
}) {
  const { activity, section, categoryId, fromGradeId } = editing;
  const save = useSavePlannedActivity();
  const allIds = grades.map((g) => g.id);
  const [name, setName] = useState(activity?.name ?? "");
  const [gradeIds, setGradeIds] = useState<string[]>(
    activity ? targetGradesOf(activity, grades).map((g) => g.id) : [fromGradeId],
  );
  const [mode, setMode] = useState<"one" | "parts">(activity && activity.components.length > 0 ? "parts" : "one");
  const [amount, setAmount] = useState(activity && activity.components.length === 0 && activity.planned_amount > 0 ? String(activity.planned_amount) : "");
  const [comps, setComps] = useState<CompDraft[]>(
    activity && activity.components.length > 0
      ? activity.components.map((c) => ({ name: c.name, kind: c.kind, price: String(c.price), qty: c.qty ? String(c.qty) : "" }))
      : [emptyComp()],
  );
  const [notes, setNotes] = useState(activity?.notes ?? "");

  const allSelected = gradeIds.length === allIds.length;
  const toggleGrade = (id: string) =>
    setGradeIds((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));

  const draft: PlannedActivity = {
    id: activity?.id ?? "__draft__", name, budget_category_id: categoryId, notes: notes || null,
    planned_amount: mode === "one" ? Number(amount) || 0 : 0,
    components: mode === "parts" ? comps.map(toComp).filter((c) => c.price > 0) : [],
    ...gradeFieldsOf(gradeIds, allIds),
  };
  const students = targetGradesOf(draft, grades).reduce((s, g) => s + g.student_count, 0);
  const totalAg = activityTotalAg(draft, grades);
  const preview = totalAg > 0 ? previewOf(draft) : [];

  const setComp = (i: number, patch: Partial<CompDraft>) => setComps((cur) => cur.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("יש לתת שם לפעילות"); return; }
    if (totalAg <= 0) { toast.error("יש להזין כמה הפעילות צפויה לעלות"); return; }
    try {
      await save.mutateAsync({
        id: activity?.id, budgetCategoryId: categoryId, name, gradeIds, grades,
        amount: draft.planned_amount, components: draft.components, notes,
      });
      toast.success(activity ? "הפעילות עודכנה" : "הפעילות נוספה לתכנון");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "לא הצלחנו לשמור את הפעילות");
    }
  };

  const input: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1px solid #E8E2D9", borderRadius: "8px", fontSize: "14px",
    background: "#fff", color: INK, outline: "none", fontFamily: "var(--font-sans)", direction: "rtl", boxSizing: "border-box",
  };
  const label: React.CSSProperties = { display: "block", fontSize: "12.5px", fontWeight: 600, color: "#6B6459", marginBottom: "6px" };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: "99px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? GREEN : "#E8E2D9"}`, background: active ? "#E7F4EF" : "#fff", color: active ? GREEN : "#6B6459", fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : "20px" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={{
        background: "#fff", borderRadius: isMobile ? "18px 18px 0 0" : "18px", width: "100%", maxWidth: "520px", maxHeight: "92vh",
        display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 600, color: INK }}>{activity ? "עריכת פעילות" : "פעילות חדשה"}</div>
            <div style={{ fontSize: "12.5px", color: DIM, marginTop: "2px" }}>סעיף: {section.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", cursor: "pointer", color: DIM, padding: "4px" }}><X size={20} /></button>
        </div>

        <div style={{ padding: "4px 22px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={label} htmlFor="plan-name">מה הפעילות?</label>
            <input id="plan-name" style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: טיול לחרמון" autoFocus />
          </div>

          <div>
            <span style={label}>לאילו שכבות?</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {grades.map((g) => (
                <button key={g.id} type="button" onClick={() => toggleGrade(g.id)} aria-pressed={gradeIds.includes(g.id)} style={chip(gradeIds.includes(g.id))}>{g.name}</button>
              ))}
              {grades.length > 1 && (
                <button type="button" onClick={() => setGradeIds(allSelected ? [fromGradeId] : allIds)} aria-pressed={allSelected} style={chip(allSelected)}>כל השכבות</button>
              )}
            </div>
            {gradeIds.length > 1 && (
              <div style={{ fontSize: "12px", color: DIM, marginTop: "6px" }}>העלות מתחלקת בין השכבות לפי מספר התלמידים ({students} תלמידים).</div>
            )}
          </div>

          <div>
            <span style={label}>כמה זה צפוי לעלות?</span>
            <div style={{ display: "flex", background: "#F4F1EB", borderRadius: "10px", padding: "3px", gap: "2px", marginBottom: "10px" }}>
              {([["one", "סכום אחד"], ["parts", "פירוט לפי רכיבים"]] as const).map(([m, text]) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} style={{
                  flex: 1, padding: "7px 10px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontFamily: "inherit",
                  background: mode === m ? "#fff" : "transparent", color: mode === m ? INK : "#6B6459", fontWeight: mode === m ? 600 : 400,
                  boxShadow: mode === m ? "0 1px 2px rgba(31,36,33,0.1)" : "none",
                }}>{text}</button>
              ))}
            </div>

            {mode === "one" ? (
              <input style={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="סכום בשקלים" aria-label="סכום בשקלים" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {comps.map((c, i) => {
                  const rowAg = componentAg(toComp(c), students);
                  return (
                    <div key={i} style={{ border: "1px solid #EFEAE2", borderRadius: "10px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input style={{ ...input, flex: 1 }} value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} placeholder="מה הרכיב? (אוטובוס, כניסה, מים)" aria-label="שם הרכיב" />
                        {comps.length > 1 && (
                          <button type="button" onClick={() => setComps((cur) => cur.filter((_, k) => k !== i))} aria-label="הסרת הרכיב" style={{ background: "none", border: "none", cursor: "pointer", color: DIM, padding: "4px", flexShrink: 0 }}><X size={16} /></button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: c.kind === "quantity" ? "1.15fr 1fr 0.8fr auto" : "1.15fr 1fr auto auto", gap: "8px", alignItems: "center" }}>
                        <select style={{ ...input, minWidth: 0 }} value={c.kind} onChange={(e) => setComp(i, { kind: e.target.value as PlanComponentKind })} aria-label="איך מחשבים">
                          {(Object.keys(KIND_LABEL) as PlanComponentKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </select>
                        <input style={{ ...input, minWidth: 0 }} inputMode="decimal" value={c.price} onChange={(e) => setComp(i, { price: e.target.value.replace(/[^\d.]/g, "") })}
                          placeholder={c.kind === "per_student" ? "מחיר לילד" : c.kind === "quantity" ? "מחיר ליחידה" : "סכום"} aria-label="מחיר" />
                        {c.kind === "quantity" && (
                          <input style={{ ...input, minWidth: 0 }} inputMode="decimal" value={c.qty} onChange={(e) => setComp(i, { qty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="כמות" aria-label="כמות" />
                        )}
                        {c.kind === "per_student" && <span style={{ fontSize: "12.5px", color: DIM, whiteSpace: "nowrap" }}>× {students} ילדים</span>}
                        {c.kind === "fixed" && <span />}
                        <span className="num" style={{ fontSize: "13.5px", fontWeight: 600, color: rowAg > 0 ? INK : DIM, whiteSpace: "nowrap", minWidth: "64px", textAlign: "left" }}>{fmtAg(rowAg)}</span>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setComps((cur) => [...cur, emptyComp()])} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px", borderRadius: "10px",
                  border: "1px dashed #D8D1C5", background: "none", color: "#6B6459", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
                }}><Plus size={14} /> רכיב נוסף</button>
              </div>
            )}
          </div>

          <div>
            <label style={label} htmlFor="plan-notes">הערה (לא חובה)</label>
            <input id="plan-notes" style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: מאי, יום שלם" />
          </div>

          {totalAg > 0 && (
            <div style={{ background: "#FBFAF7", borderRadius: "12px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "13px", color: "#6B6459" }}>סה״כ לפעילות</span>
                <span className="num" style={{ fontSize: "19px", fontWeight: 600, color: INK }}>{fmtAg(totalAg)}</span>
              </div>
              {preview.map((p) => (
                <div key={p.gradeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12.5px", gap: "8px" }}>
                  <span style={{ color: "#6B6459" }}>
                    {p.gradeName}{preview.length > 1 && <> · <span className="num">{fmtAg(p.shareAg)}</span></>}
                  </span>
                  <span style={{ color: p.leftAg < 0 ? RED : GREEN, fontWeight: 600, textAlign: "left" }}>
                    {p.leftAg < 0 ? "חריגה בקופה של " : "יישאר בקופה "}
                    <span className="num">{fmtAg(Math.abs(p.leftAg))}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", padding: "12px 22px 18px", borderTop: "1px solid #F1EEE8" }}>
          <button type="submit" disabled={save.isPending} style={{
            flex: 1, padding: "11px", borderRadius: "10px", border: "none", background: GREEN, color: "#fff", fontSize: "14.5px", fontWeight: 600,
            cursor: save.isPending ? "default" : "pointer", opacity: save.isPending ? 0.6 : 1, fontFamily: "inherit",
          }}>{save.isPending ? "שומר..." : activity ? "שמירה" : "הוספה לתכנון"}</button>
          <button type="button" onClick={onClose} style={{ padding: "11px 18px", borderRadius: "10px", border: "1px solid #E8E2D9", background: "#fff", color: "#6B6459", fontSize: "14.5px", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
        </div>
      </form>
    </div>
  );
}
