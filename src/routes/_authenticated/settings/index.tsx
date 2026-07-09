import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useSchoolYears,
  useCreateSchoolYear,
  useSetActiveYear,
  useDeleteSchoolYear,
} from "@/hooks/use-school-years";
import { useGrades, useAddGrade, useUpdateGrade, useDeleteGrade } from "@/hooks/use-grades";
import {
  useAddBudgetCategory,
  useBudgetPlan,
  type BudgetSource,
} from "@/hooks/use-budget-plan";
import {
  useOrganization,
  useOrgMembers,
  useUpdateMemberStatus,
  useRemoveMember,
  useCurrentProfile,
  type OrgRole,
  type MemberStatus,
} from "@/hooks/use-organization";
import {
  useOrgBudgetSources,
  useAddBudgetSource,
  useUpdateBudgetSource,
  useDeleteBudgetSource,
  FALLBACK_SOURCES,
} from "@/hooks/use-budget-sources";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsPage,
});

type Tab = "years" | "grades" | "categories" | "sources" | "team" | "license" | "notifications";

// ─── Source config (matches rest of app) ──────────────────────────────────

const SOURCE_CFG: Record<string, { label: string; color: string; bg: string; textColor: string; gradient: string }> = {
  gefen:  { label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534", gradient: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 100%)" },
  iriyah: { label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010", gradient: "linear-gradient(160deg, #7C2E18 0%, #3A140A 100%)" },
  horim:  { label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356", gradient: "linear-gradient(160deg, #4A1A38 0%, #1F0B17 100%)" },
};

// ─── Shared styles ─────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "14px",
  border: "1px solid #E8EDE9",
  padding: "20px 24px",
  marginBottom: "12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
};

const inputStyle: React.CSSProperties = {
  border: "1.5px solid #E2E8E4",
  borderRadius: "9px",
  padding: "9px 13px",
  fontSize: "14px",
  fontFamily: "Rubik, sans-serif",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  color: "var(--hk-ink-1)",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
  color: "#fff",
  border: "none",
  borderRadius: "9px",
  padding: "9px 20px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Rubik, sans-serif",
  boxShadow: "0 2px 8px rgba(26,61,43,0.25)",
};

const btnOutline: React.CSSProperties = {
  background: "#fff",
  color: "#2D6644",
  border: "1.5px solid #2D6644",
  borderRadius: "9px",
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "Rubik, sans-serif",
};

const btnDanger: React.CSSProperties = {
  background: "#fff",
  color: "#C0392B",
  border: "1.5px solid #E8C5C0",
  borderRadius: "9px",
  padding: "7px 13px",
  fontSize: "12.5px",
  cursor: "pointer",
  fontFamily: "Rubik, sans-serif",
};

// ─── Main page ─────────────────────────────────────────────────────────────

function SettingsPage() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("years");

  const tabs: { key: Tab; label: string }[] = [
    { key: "years",      label: "שנות לימודים" },
    { key: "grades",     label: "שכבות וכיתות" },
    { key: "categories", label: "קטגוריות תקציב" },
    { key: "sources",    label: "מקורות תקציב" },
    { key: "team",       label: "צוות" },
    { key: "license",       label: "רישיון" },
    { key: "notifications", label: "התראות" },
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 55%, #081510 100%)",
        borderRadius: "20px",
        padding: isMobile ? "20px 16px" : "28px 32px",
        marginBottom: "28px",
        boxShadow: "0 8px 32px rgba(15,36,25,0.4)",
      }}>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "4px", letterSpacing: "0.06em" }}>ניהול מערכת</div>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>הגדרות</h1>
        <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
          שנות לימודים · שכבות · קטגוריות תקציב · צוות
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: "6px",
        marginBottom: "24px",
        background: "#E8EDE9",
        borderRadius: "12px",
        padding: "4px",
        maxWidth: "100%",
        overflowX: "auto",
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: "9px 22px",
              borderRadius: "9px",
              border: "none",
              fontSize: "13.5px",
              fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key
                ? "linear-gradient(135deg, #2D6644, #1A3D2B)"
                : "transparent",
              color: tab === t.key ? "#fff" : "#4A6656",
              cursor: "pointer",
              fontFamily: "Rubik, sans-serif",
              boxShadow: tab === t.key ? "0 2px 8px rgba(26,61,43,0.25)" : "none",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "years"      && <YearsTab />}
      {tab === "grades"     && <GradesTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "sources"    && <SourcesTab />}
      {tab === "team"       && <TeamTab />}
      {tab === "license"        && <LicenseTab />}
      {tab === "notifications"  && <NotificationsTab />}
    </div>
  );
}

// ─── Years tab ─────────────────────────────────────────────────────────────

function YearsTab() {
  const isMobile = useIsMobile();
  const { data: years = [], isLoading } = useSchoolYears();
  const createYear  = useCreateSchoolYear();
  const setActive   = useSetActiveYear();
  const deleteYear  = useDeleteSchoolYear();

  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [name, setName]         = useState("");
  const [startDate, setStart]   = useState("");
  const [endDate, setEnd]       = useState("");
  const [pct, setPct]           = useState("85");

  const handleCreate = async () => {
    if (!name.trim()) { alert("נא להזין שם לשנת הלימודים"); return; }
    if (!startDate || !endDate) { alert("נא להזין תאריכי התחלה וסיום"); return; }
    if (endDate <= startDate) { alert("תאריך הסיום חייב להיות אחרי תאריך ההתחלה"); return; }
    await createYear.mutateAsync({ name, start_date: startDate, end_date: endDate, collection_percentage: Number(pct) });
    setName(""); setStart(""); setEnd(""); setPct("85");
    setShowForm(false);
  };

  if (isLoading) return <Loader />;

  const hasNoActiveYear = years.length > 0 && !years.some((y) => y.is_active);

  return (
    <div>
      {/* Banner: years exist but none active */}
      {hasNoActiveYear && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "14px",
          background: "linear-gradient(135deg, #FFF8E6 0%, #FFFDF5 100%)",
          border: "1.5px solid #F5C842",
          borderRadius: "14px", padding: "18px 20px", marginBottom: "18px",
          boxShadow: "0 2px 12px rgba(245,200,66,0.15)",
        }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "500", color: "#92400E", marginBottom: "4px" }}>
              שנת הלימודים לא פעילה
            </div>
            <div style={{ fontSize: "13px", color: "#B45309", lineHeight: 1.55 }}>
              יצרת שנת לימודים אך היא אינה פעילה עדיין. לחץ/י על <strong>הגדר כפעיל</strong> כדי שלוח הבקרה יתחיל לעבוד.
            </div>
          </div>
        </div>
      )}

      {years.map((y) => (
        <div key={y.id} style={{
          ...card,
          borderRight: y.is_active ? "4px solid #2D6644" : "4px solid transparent",
          background: y.is_active ? "linear-gradient(to left, #EDFBF3, #fff)" : "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--hk-ink-1)", marginBottom: "3px" }}>
                {y.name}
                {y.is_active && (
                  <span style={{ marginRight: "10px", background: "#2D6644", color: "#fff", borderRadius: "20px", padding: "2px 10px", fontSize: "11px", fontWeight: 600 }}>
                    פעיל ✓
                  </span>
                )}
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--hk-ink-3)" }}>
                {y.start_date} — {y.end_date}
                <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span>
                יעד גבייה: {y.collection_percentage}%
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {!y.is_active && (
                <button type="button" style={btnOutline} onClick={() => setActive.mutate(y.id)} disabled={setActive.isPending}>
                  הגדר כפעיל
                </button>
              )}
              {confirmDeleteId === y.id ? (
                <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "5px 10px" }}>
                  <span style={{ fontSize: "12px", color: "#991B1B" }}>למחוק את "{y.name}"?</span>
                  <button type="button"
                    onClick={async () => { await deleteYear.mutateAsync(y.id); setConfirmDeleteId(null); }}
                    disabled={deleteYear.isPending}
                    style={{ padding: "3px 10px", borderRadius: "6px", border: "none", background: "#B91C1C", color: "#fff", fontSize: "11px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                    {deleteYear.isPending ? "..." : "מחק"}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)}
                    style={{ padding: "3px 8px", borderRadius: "6px", border: "1px solid #E8E2D9", background: "#fff", fontSize: "11px", fontFamily: "Rubik, sans-serif", cursor: "pointer", color: "#888" }}>
                    בטל
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteId(y.id)}
                  style={{ padding: "6px 8px", borderRadius: "7px", border: "1px solid #E8E2D9", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", color: "#C8C2BB" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#B91C1C")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#C8C2BB")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <div style={{ ...card, border: "1.5px solid #2D6644", boxShadow: "0 0 0 3px rgba(45,102,68,0.08)" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--hk-ink-1)", marginBottom: "16px" }}>
            ➕ שנת לימודים חדשה
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
              <Label>שם</Label>
              <input style={inputStyle} placeholder="לדוגמה: תשפ״ז 2026-2027" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>תאריך התחלה</Label>
              <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>תאריך סיום</Label>
              <input style={inputStyle} type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <Label>יעד גבייה מהורים (%)</Label>
              <input style={inputStyle} type="number" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
          </div>
          <Row>
            <button type="button" style={btnPrimary} onClick={handleCreate} disabled={createYear.isPending}>
              {createYear.isPending ? "שומר..." : "צור שנה"}
            </button>
            <button type="button" style={btnOutline} onClick={() => setShowForm(false)}>ביטול</button>
          </Row>
        </div>
      ) : (
        <button type="button" style={{ ...btnOutline, marginTop: "4px" }} onClick={() => setShowForm(true)}>
          + הוסף שנת לימודים
        </button>
      )}
    </div>
  );
}

// ─── Grades tab ─────────────────────────────────────────────────────────────

function GradesTab() {
  const isMobile = useIsMobile();
  const { data: years = [] }   = useSchoolYears();
  const activeYear              = years.find((y) => y.is_active);
  const { data: grades = [], isLoading } = useGrades(activeYear?.id);
  const addGrade    = useAddGrade();
  const updateGrade = useUpdateGrade();
  const deleteGrade = useDeleteGrade();

  const [showForm, setShowForm]   = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [count, setCount]         = useState("0");
  const [editId, setEditId]       = useState<string | null>(null);
  const [editVals, setEditVals]   = useState({ name: "", count: "0" });
  const [confirmDeleteGradeId, setConfirmDeleteGradeId] = useState<string | null>(null);

  const GRADE_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"];
  const resolvedName = customName.trim() || (selectedLetter ? `שכבה ${selectedLetter}'` : "");

  const handleAdd = async () => {
    if (!resolvedName || !activeYear) return;
    await addGrade.mutateAsync({ name: resolvedName, student_count: Number(count), yearId: activeYear.id });
    setSelectedLetter(""); setCustomName(""); setCount("0"); setShowForm(false);
  };

  if (!activeYear) return (
    <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)", padding: "40px" }}>
      אין שנת לימודים פעילה — הגדר שנה פעילה קודם
    </div>
  );

  if (isLoading) return <Loader />;

  return (
    <div>
      {/* Active year label */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#EDFBF3", border: "1px solid #C6E8D0", borderRadius: "8px", padding: "5px 12px", fontSize: "12.5px", color: "#166534", marginBottom: "16px", fontWeight: 500 }}>
        <span style={{ fontSize: "10px" }}>●</span> שנה פעילה: {activeYear.name}
      </div>

      {grades.length === 0 && !showForm && (
        <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)", padding: "40px 24px", fontSize: "14px" }}>
          אין שכבות עדיין
        </div>
      )}

      {grades.map((g) => (
        <div key={g.id} style={card}>
          {editId === g.id ? (
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <Label>שם שכבה</Label>
                <input style={inputStyle} value={editVals.name} onChange={(e) => setEditVals((v) => ({ ...v, name: e.target.value }))} />
              </div>
              <div style={{ width: isMobile ? "100%" : "130px" }}>
                <Label>מספר תלמידים</Label>
                <input style={inputStyle} type="number" min="0" value={editVals.count} onChange={(e) => setEditVals((v) => ({ ...v, count: e.target.value }))} />
              </div>
              <Row>
                <button type="button" style={btnPrimary} onClick={async () => {
                  await updateGrade.mutateAsync({ id: editId, name: editVals.name, student_count: Number(editVals.count) });
                  setEditId(null);
                }} disabled={updateGrade.isPending}>שמור</button>
                <button type="button" style={btnOutline} onClick={() => setEditId(null)}>ביטול</button>
              </Row>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14.5px", color: "var(--hk-ink-1)" }}>{g.name}</div>
                <div style={{ fontSize: "12.5px", color: "var(--hk-ink-3)", marginTop: "2px" }}>
                  {g.student_count} תלמידים
                </div>
              </div>
              <Row>
                <button type="button" style={btnOutline} onClick={() => { setEditId(g.id); setEditVals({ name: g.name, count: String(g.student_count) }); }}>ערוך</button>
                {confirmDeleteGradeId === g.id ? (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "5px 10px" }}>
                    <span style={{ fontSize: "12px", color: "#991B1B" }}>למחוק את "{g.name}"?</span>
                    <button type="button"
                      onClick={async () => { await deleteGrade.mutateAsync(g.id); setConfirmDeleteGradeId(null); }}
                      disabled={deleteGrade.isPending}
                      style={{ padding: "3px 10px", borderRadius: "6px", border: "none", background: "#B91C1C", color: "#fff", fontSize: "11px", fontFamily: "Rubik, sans-serif", cursor: "pointer" }}>
                      {deleteGrade.isPending ? "..." : "מחק"}
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteGradeId(null)}
                      style={{ padding: "3px 8px", borderRadius: "6px", border: "1px solid #E8E2D9", background: "#fff", fontSize: "11px", fontFamily: "Rubik, sans-serif", cursor: "pointer", color: "#888" }}>
                      בטל
                    </button>
                  </div>
                ) : (
                  <button type="button" style={btnDanger} onClick={() => setConfirmDeleteGradeId(g.id)}>מחק</button>
                )}
              </Row>
            </div>
          )}
        </div>
      ))}

      {showForm ? (
        <div style={{ ...card, border: "1.5px solid #2D6644", boxShadow: "0 0 0 3px rgba(45,102,68,0.08)" }}>
          <div style={{ fontWeight: "500", fontSize: "15px", color: "#1A1A1A", marginBottom: "16px" }}>שכבה חדשה</div>

          {/* Grade letter chips */}
          <Label>בחר שכבה</Label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", marginTop: "6px" }}>
            {GRADE_LETTERS.map((letter) => {
              const active = selectedLetter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => { setSelectedLetter(active ? "" : letter); setCustomName(""); }}
                  style={{
                    width: "44px", height: "44px",
                    borderRadius: "10px",
                    border: active ? "none" : "1.5px solid #E2E8E4",
                    background: active ? "linear-gradient(135deg, #2D6644, #1A3D2B)" : "#fff",
                    color: active ? "#fff" : "#4A6656",
                    fontSize: "16px",
                    fontWeight: active ? "600" : "400",
                    fontFamily: "Rubik, sans-serif",
                    cursor: "pointer",
                    boxShadow: active ? "0 3px 10px rgba(26,61,43,0.3)" : "0 1px 3px rgba(0,0,0,0.06)",
                    transition: "all 0.12s",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {letter}
                </button>
              );
            })}
          </div>

          {/* Preview + optional custom name */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <Label>שם מותאם אישית <span style={{ color: "#AAA099", fontWeight: "400" }}>(אופציונלי)</span></Label>
              <input
                style={{ ...inputStyle, color: customName ? "#1A1A1A" : "#AAA099" }}
                placeholder={selectedLetter ? `שכבה ${selectedLetter}' (ברירת מחדל)` : "לדוגמה: שכבת ביניים"}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
            <div style={{ width: isMobile ? "100%" : "150px" }}>
              <Label>מספר תלמידים</Label>
              <input style={inputStyle} type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>

          {/* Preview of final name */}
          {resolvedName && (
            <div style={{ fontSize: "12.5px", color: "#2D6644", background: "#EDFBF3", border: "1px solid #C6E8D0", borderRadius: "8px", padding: "7px 12px", marginBottom: "14px" }}>
              תישמר בתור: <strong>{resolvedName}</strong>
            </div>
          )}

          <Row>
            <button type="button" style={{ ...btnPrimary, opacity: !resolvedName ? 0.5 : 1 }} onClick={handleAdd} disabled={addGrade.isPending || !resolvedName}>
              {addGrade.isPending ? "מוסיף..." : "הוסף שכבה"}
            </button>
            <button type="button" style={btnOutline} onClick={() => { setShowForm(false); setSelectedLetter(""); setCustomName(""); setCount("0"); }}>ביטול</button>
          </Row>
        </div>
      ) : (
        <button type="button" style={{ ...btnOutline, marginTop: "4px" }} onClick={() => setShowForm(true)}>
          + הוסף שכבה
        </button>
      )}
    </div>
  );
}

// ─── Sources tab ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { color: "#166534", bg: "#F0FDF4" },
  { color: "#7C2D12", bg: "#FFF7ED" },
  { color: "#6B21A8", bg: "#FAF5FF" },
  { color: "#0E7490", bg: "#ECFEFF" },
  { color: "#9A3412", bg: "#FFF7ED" },
  { color: "#1E40AF", bg: "#EFF6FF" },
  { color: "#0F766E", bg: "#F0FDFA" },
  { color: "#065F46", bg: "#ECFDF5" },
];

function SourcesTab() {
  const { data: sources = [], isLoading } = useOrgBudgetSources();
  const addSource    = useAddBudgetSource();
  const updateSource = useUpdateBudgetSource();
  const deleteSource = useDeleteBudgetSource();

  // Add form state
  const [showAdd, setShowAdd]       = useState(false);
  const [newLabel, setNewLabel]     = useState("");
  const [newColor, setNewColor]     = useState(PRESET_COLORS[3].color);
  const [newBg, setNewBg]           = useState(PRESET_COLORS[3].bg);

  // Edit state
  const [editId, setEditId]         = useState<string | null>(null);
  const [editLabel, setEditLabel]   = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      await addSource.mutateAsync({ label: newLabel.trim(), color: newColor, bg_color: newBg });
      toast.success(`מקור "${newLabel.trim()}" נוסף`);
      setNewLabel(""); setShowAdd(false);
    } catch { toast.error("שגיאה בהוספת מקור"); }
  };

  const handleUpdate = async (id: string) => {
    if (!editLabel.trim()) return;
    try {
      await updateSource.mutateAsync({ id, label: editLabel.trim() });
      toast.success("שם המקור עודכן");
      setEditId(null);
    } catch { toast.error("שגיאה בעדכון"); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSource.mutateAsync(id);
      toast.success("מקור נמחק");
      setConfirmDeleteId(null);
    } catch { toast.error("שגיאה במחיקה"); }
  };

  if (isLoading) return <Loader />;

  return (
    <div>
      <div style={{ fontSize: "13px", color: "#6B6560", marginBottom: "20px", lineHeight: 1.6 }}>
        מקורות התקציב הם הקטגוריות הראשיות שלפיהן מסווגות ההוצאות וההכנסות.
        מקורות ברירת המחדל (גפן, עירייה, הורים) ניתנים לשינוי שם בלבד. מקורות מותאמים אישית ניתנים לעריכה ומחיקה.
      </div>

      {/* Sources list */}
      {sources.map((src) => {
        const isEditing = editId === src.id;
        const isConfirmDelete = confirmDeleteId === src.id;

        return (
          <div key={src.id} style={{
            ...card,
            borderRight: `4px solid ${src.color}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Color dot + badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "4px 12px", borderRadius: "20px",
                background: src.bg_color, color: src.color,
                fontSize: "13px", fontWeight: 600, flexShrink: 0,
              }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: src.color }} />
                {src.label}
              </div>

              {/* Slug chip */}
              <span style={{ fontSize: "11px", color: "#AAA099", background: "#F5F2EE", borderRadius: "5px", padding: "2px 7px" }}>
                {src.slug}
              </span>

              {src.is_default && (
                <span style={{ fontSize: "11px", color: "#6B6560", background: "#F0EBE5", borderRadius: "5px", padding: "2px 7px" }}>
                  ברירת מחדל
                </span>
              )}

              {/* Edit label inline */}
              <div style={{ flex: 1 }} />
              {isEditing ? (
                <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleUpdate(src.id); if (e.key === "Escape") setEditId(null); }}
                    style={{ ...inputStyle, width: "140px", padding: "6px 10px" }}
                  />
                  <button onClick={() => handleUpdate(src.id)} style={{ ...btnPrimary, padding: "6px 14px", fontSize: "12.5px" }}>שמור</button>
                  <button onClick={() => setEditId(null)} style={{ ...btnOutline, padding: "6px 10px", fontSize: "12.5px" }}>ביטול</button>
                </div>
              ) : isConfirmDelete ? (
                <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
                  <span style={{ fontSize: "12.5px", color: "#C0392B" }}>למחוק את "{src.label}"?</span>
                  <button onClick={() => handleDelete(src.id)} style={{ ...btnDanger, padding: "6px 14px" }}>מחק</button>
                  <button onClick={() => setConfirmDeleteId(null)} style={{ ...btnOutline, padding: "6px 10px", fontSize: "12.5px" }}>ביטול</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => { setEditId(src.id); setEditLabel(src.label); }}
                    style={{ ...btnOutline, padding: "6px 12px", fontSize: "12.5px" }}
                  >
                    שנה שם
                  </button>
                  {!src.is_default && (
                    <button
                      onClick={() => setConfirmDeleteId(src.id)}
                      style={{ ...btnDanger, padding: "6px 12px" }}
                    >
                      מחק
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Add new source */}
      {showAdd ? (
        <div style={{ ...card, border: "1.5px dashed #D0DDD4" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#1A1A1A", marginBottom: "14px" }}>
            הוספת מקור תקציב חדש
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#6B6560", display: "block", marginBottom: "5px" }}>שם המקור</label>
              <input
                autoFocus
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
                placeholder='לדוגמה: צהרון'
                style={{ ...inputStyle, maxWidth: "260px" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#6B6560", display: "block", marginBottom: "8px" }}>צבע</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {PRESET_COLORS.map((p) => (
                  <button
                    key={p.color}
                    type="button"
                    onClick={() => { setNewColor(p.color); setNewBg(p.bg); }}
                    style={{
                      width: "28px", height: "28px", borderRadius: "50%",
                      background: p.color, border: "none", cursor: "pointer",
                      outline: newColor === p.color ? `3px solid ${p.color}` : "none",
                      outlineOffset: "2px",
                      boxShadow: newColor === p.color ? "0 0 0 4px rgba(0,0,0,0.08)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>
            {newLabel && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "#6B6560", display: "block", marginBottom: "5px" }}>תצוגה מקדימה</label>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "4px 12px", borderRadius: "20px",
                  background: newBg, color: newColor, fontSize: "13px", fontWeight: 600,
                }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: newColor }} />
                  {newLabel}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button onClick={handleAdd} disabled={!newLabel.trim() || addSource.isPending} style={btnPrimary}>
                {addSource.isPending ? "מוסיף..." : "הוסף מקור"}
              </button>
              <button onClick={() => { setShowAdd(false); setNewLabel(""); }} style={btnOutline}>ביטול</button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            width: "100%", padding: "14px", marginTop: "4px",
            border: "1.5px dashed #D0DDD4", borderRadius: "14px",
            background: "#FAFAF8", color: "#6B6560",
            fontSize: "14px", cursor: "pointer", fontFamily: "Rubik, sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#2D6644"; e.currentTarget.style.color = "#2D6644"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#D0DDD4"; e.currentTarget.style.color = "#6B6560"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          הוסף מקור מותאם אישית
        </button>
      )}
    </div>
  );
}

// ─── Categories tab ─────────────────────────────────────────────────────────

function CategoriesTab() {
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const [src, setSrc] = useState<string>("");

  // Effective source: use selection if valid, else first available
  const effectiveSrc = src && sources.some(s => s.slug === src) ? src : (sources[0]?.slug ?? "gefen");

  // Build cfg for any source slug
  const getCfg = (slug: string) => {
    if (SOURCE_CFG[slug]) return SOURCE_CFG[slug];
    const orgSrc = sources.find(s => s.slug === slug);
    return {
      label: orgSrc?.label ?? slug,
      color: orgSrc?.color ?? "#6B6560",
      bg: orgSrc?.bg_color ?? "#F5F5F2",
      textColor: orgSrc?.color ?? "#6B6560",
      gradient: "linear-gradient(160deg, #2A2A2A 0%, #111 100%)",
    };
  };

  const cfg = getCfg(effectiveSrc);

  return (
    <div>
      {/* Source selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {sources.map((s) => {
          const c = getCfg(s.slug);
          const active = effectiveSrc === s.slug;
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => setSrc(s.slug)}
              style={{
                padding: "8px 22px",
                borderRadius: "9px",
                border: active ? "none" : `1.5px solid ${c.color}30`,
                fontSize: "13.5px",
                fontWeight: active ? 700 : 400,
                background: active ? c.gradient : "#fff",
                color: active ? "#fff" : c.textColor,
                cursor: "pointer",
                fontFamily: "Rubik, sans-serif",
                boxShadow: active ? `0 3px 12px ${c.color}35` : "none",
                transition: "all 0.15s",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Source summary strip */}
      <div style={{ background: cfg.gradient, borderRadius: "12px", padding: "14px 20px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ fontWeight: 700, fontSize: "16px", color: "#fff" }}>{cfg.label}</div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>קטגוריות תקציב</div>
      </div>

      <CategoryList source={effectiveSrc} color={cfg.color} bg={cfg.bg} textColor={cfg.textColor} />
    </div>
  );
}

function CategoryList({ source, color, bg, textColor }: { source: BudgetSource; color: string; bg: string; textColor: string }) {
  const { data, isLoading } = useBudgetPlan(source);
  const addCategory = useAddBudgetCategory();

  const [showForm, setShowForm] = useState(false);
  const [catName, setCatName]   = useState("");
  const [planned, setPlanned]   = useState("0");

  const handleAdd = async () => {
    const trimmed = catName.trim();
    if (!trimmed) return;
    const duplicate = categories.some((c) => c.name.trim() === trimmed);
    if (duplicate) { alert(`קטגוריה בשם "${trimmed}" כבר קיימת`); return; }
    await addCategory.mutateAsync({ name: trimmed, source, plannedAmount: Number(planned) });
    setCatName(""); setPlanned("0"); setShowForm(false);
  };

  const categories = data?.categories ?? [];

  if (isLoading) return <Loader />;

  return (
    <div>
      {categories.length === 0 && !showForm && (
        <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)", padding: "36px 24px", fontSize: "14px" }}>
          אין קטגוריות עדיין
        </div>
      )}

      {categories.map((c) => {
        const pct = c.planned_amount > 0 ? Math.round((c.used / c.planned_amount) * 100) : 0;
        const overBudget = c.used > c.planned_amount;
        return (
          <div key={c.id} style={{ ...card, borderRight: `4px solid ${color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14.5px", color: "var(--hk-ink-1)", marginBottom: "4px" }}>{c.name}</div>
                <div style={{ display: "flex", gap: "16px" }}>
                  <span style={{ background: bg, color: textColor, borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 500 }}>
                    מתוכנן: ₪{c.planned_amount.toLocaleString()}
                  </span>
                  <span style={{ background: overBudget ? "#FDF1EA" : "#f5f5f5", color: overBudget ? "#B5472A" : "var(--hk-ink-2)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px" }}>
                    נוצל: ₪{c.used.toLocaleString()} ({pct}%)
                  </span>
                </div>
                {/* Mini bar */}
                <div style={{ background: "#f0f0f0", borderRadius: "4px", height: "4px", marginTop: "8px" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: "4px", background: overBudget ? "#B5472A" : color, transition: "width 0.3s" }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {showForm ? (
        <div style={{ ...card, border: `1.5px solid ${color}`, boxShadow: `0 0 0 3px ${color}12` }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--hk-ink-1)", marginBottom: "14px" }}>➕ קטגוריה חדשה</div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
            <div style={{ flex: 1 }}>
              <Label>שם קטגוריה</Label>
              <input style={inputStyle} placeholder="לדוגמה: ציוד משרדי" value={catName} onChange={(e) => setCatName(e.target.value)} />
            </div>
            <div style={{ width: "170px" }}>
              <Label>סכום מתוכנן (₪)</Label>
              <input style={inputStyle} type="number" min="0" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </div>
          </div>
          <Row>
            <button type="button" style={{ ...btnPrimary, background: `linear-gradient(135deg, ${color}, ${color}CC)` }} onClick={handleAdd} disabled={addCategory.isPending}>
              {addCategory.isPending ? "מוסיף..." : "הוסף קטגוריה"}
            </button>
            <button type="button" style={{ ...btnOutline, color, borderColor: color }} onClick={() => setShowForm(false)}>ביטול</button>
          </Row>
        </div>
      ) : (
        <button type="button" style={{ ...btnOutline, color, borderColor: color, marginTop: "4px" }} onClick={() => setShowForm(true)}>
          + הוסף קטגוריה
        </button>
      )}
    </div>
  );
}

// ─── Team tab ───────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<OrgRole, string> = {
  owner:  "מנהל/ת ראשי/ת",
  admin:  "מנהל/ת",
  viewer: "צופה",
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  active:   "פעיל/ה",
  pending:  "ממתין/ת לאישור",
  rejected: "נדחה/ת",
  blocked:  "חסום/ה",
};

function TeamTab() {
  const { data: membership } = useOrganization();
  const { data: members = [], isLoading } = useOrgMembers();
  const updateStatus = useUpdateMemberStatus();
  const removeMember = useRemoveMember();
  const queryClient = useQueryClient();

  // Role selection for pending/rejected members
  const [roleMap, setRoleMap] = useState<Record<string, "viewer" | "admin">>({});
  const getRoleFor = (memberId: string): "viewer" | "admin" => roleMap[memberId] ?? "viewer";
  const setRoleFor = (memberId: string, role: "viewer" | "admin") =>
    setRoleMap((prev) => ({ ...prev, [memberId]: role }));

  // Approve a member: update status + toast + email notification
  const handleApproveMember = (memberId: string, role: "viewer" | "admin") => {
    updateStatus.mutate(
      { memberId, status: "active", role },
      {
        onSuccess: () => {
          toast.success("איש הצוות אושר בהצלחה ✓");
          // Send approval email (best-effort — don't block on result)
          const orgId = membership?.organization?.id;
          if (orgId) {
            void supabase.functions.invoke("notify-member-approved", {
              body: { member_id: memberId, organization_id: orgId },
            });
          }
        },
        onError: () => toast.error("שגיאה באישור איש הצוות"),
      },
    );
  };

  // Reject a member: update status + toast
  const handleRejectMember = (memberId: string) => {
    updateStatus.mutate(
      { memberId, status: "rejected" },
      {
        onSuccess: () => toast.success("הבקשה נדחתה"),
        onError: () => toast.error("שגיאה בדחיית הבקשה"),
      },
    );
  };

  // Profile name editing
  const { data: currentProfile } = useCurrentProfile();
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  useEffect(() => {
    if (currentProfile?.full_name) setDisplayName(currentProfile.full_name);
  }, [currentProfile?.full_name]);

  const saveDisplayName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setNameSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");
      const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["current-profile"] });
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("השם עודכן");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירת השם");
    } finally {
      setNameSaving(false);
    }
  };

  // Ownership transfer requests (visible to owner only)
  const orgId = membership?.organization?.id;
  const isOwner = membership?.role === "owner";

  const { data: transferRequests = [] } = useQuery({
    queryKey: ["transfer-requests", orgId],
    enabled: !!orgId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ownership_transfer_requests")
        .select("*")
        .eq("org_id", orgId!)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        requested_by_user_id: string;
        requested_by_name: string;
        current_owner_user_id: string;
        created_at: string;
      }>;
    },
    staleTime: 1000 * 60,
  });

  const [transferLoading, setTransferLoading] = useState<string | null>(null);

  const handleApproveTransfer = async (req: {
    id: string;
    requested_by_user_id: string;
    requested_by_name: string;
    current_owner_user_id: string;
  }) => {
    setTransferLoading(req.id);
    try {
      // 1. Create or update org membership for new owner
      const existingMember = members.find((m) => m.user_id === req.requested_by_user_id);
      if (existingMember) {
        const { error } = await supabase.from("organization_members")
          .update({ role: "owner", status: "active", joined_at: new Date().toISOString() })
          .eq("id", existingMember.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("organization_members").insert({
          organization_id: orgId!,
          user_id: req.requested_by_user_id,
          role: "owner",
          status: "active",
          joined_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      // 2. Block the old owner
      const oldOwnerMember = members.find(
        (m) => m.user_id === req.current_owner_user_id && m.role === "owner"
      );
      if (oldOwnerMember) {
        const { error } = await supabase.from("organization_members")
          .update({ status: "blocked" })
          .eq("id", oldOwnerMember.id);
        if (error) throw error;
      }
      // 3. Mark transfer approved
      const { error: tErr } = await supabase.from("ownership_transfer_requests")
        .update({ status: "approved", resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (tErr) throw tErr;

      toast.success("הבעלות הועברה בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      queryClient.invalidateQueries({ queryKey: ["transfer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעברת בעלות");
    } finally {
      setTransferLoading(null);
    }
  };

  const handleRejectTransfer = async (reqId: string) => {
    setTransferLoading(reqId);
    try {
      const { error } = await supabase.from("ownership_transfer_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", reqId);
      if (error) throw error;
      toast.success("הבקשה נדחתה");
      queryClient.invalidateQueries({ queryKey: ["transfer-requests"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בדחיית בקשה");
    } finally {
      setTransferLoading(null);
    }
  };

  if (isLoading) return <Loader />;

  const pending  = members.filter((m) => m.status === "pending");
  const active   = members.filter((m) => m.status === "active");
  const rejected = members.filter((m) => m.status === "rejected");

  return (
    <div>
      {/* ── Profile name edit ───────────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <SectionTitle>הפרופיל שלי</SectionTitle>
        <div style={card}>
          <Label>שם תצוגה</Label>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="שם מלא"
              onKeyDown={(e) => { if (e.key === "Enter") void saveDisplayName(); }}
            />
            <button
              type="button"
              style={{ ...btnPrimary, whiteSpace: "nowrap" }}
              disabled={nameSaving || !displayName.trim()}
              onClick={() => void saveDisplayName()}
            >
              {nameSaving ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Org info strip ──────────────────────────────────────────── */}
      {membership?.organization && (
        <div style={{
          ...card,
          background: "linear-gradient(to left, #EDFBF3, #fff)",
          borderRight: "4px solid #2D6644",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "var(--hk-ink-3)", marginBottom: "2px" }}>ארגון</div>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--hk-ink-1)" }}>
              {membership.organization.name}
            </div>
            {membership.organization.city && (
              <div style={{ fontSize: "12.5px", color: "var(--hk-ink-3)", marginTop: "2px" }}>
                {membership.organization.city}
              </div>
            )}
          </div>
          <div style={{
            background: "#2D6644",
            color: "#fff",
            borderRadius: "20px",
            padding: "4px 14px",
            fontSize: "12px",
            fontWeight: 600,
          }}>
            {ROLE_LABEL[membership.role]}
          </div>
        </div>
      )}

      {/* ── Ownership transfer requests ─────────────────────────────── */}
      {isOwner && transferRequests.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <SectionTitle>
            <span style={{
              background: "#7C3AED", color: "#fff", borderRadius: "50%",
              width: "20px", height: "20px", display: "inline-flex",
              alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 700, marginLeft: "6px",
            }}>
              {transferRequests.length}
            </span>
            בקשות העברת בעלות
          </SectionTitle>
          {transferRequests.map((req) => (
            <div key={req.id} style={{
              ...card,
              borderRight: "4px solid #7C3AED",
              background: "linear-gradient(to left, #F5F3FF, #fff)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "38px", height: "38px", borderRadius: "50%",
                  background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: "15px", fontWeight: 700, flexShrink: 0,
                }}>
                  {req.requested_by_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14.5px", color: "var(--hk-ink-1)" }}>
                    {req.requested_by_name}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#7C3AED", marginTop: "2px" }}>
                    מבקש להחליף אותך כמנהל הראשי
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#B5472A", marginTop: "3px", fontWeight: 500 }}>
                    ⚠️ אם תאשר — הגישה שלך לאפליקציה תיחסם
                  </div>
                </div>
                <Row>
                  <button
                    type="button"
                    style={{
                      ...btnPrimary,
                      background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
                      boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
                      fontSize: "12.5px",
                    }}
                    disabled={transferLoading === req.id}
                    onClick={() => void handleApproveTransfer(req)}
                  >
                    {transferLoading === req.id ? "מעביר..." : "אשר העברה"}
                  </button>
                  <button
                    type="button"
                    style={btnDanger}
                    disabled={transferLoading === req.id}
                    onClick={() => void handleRejectTransfer(req.id)}
                  >
                    דחה
                  </button>
                </Row>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pending join requests ────────────────────────────────────── */}
      {isOwner && pending.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <SectionTitle>
            <span style={{ background: "#B5472A", color: "#fff", borderRadius: "50%", width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, marginLeft: "6px" }}>
              {pending.length}
            </span>
            בקשות הצטרפות
          </SectionTitle>
          {pending.map((m) => (
            <div key={m.id} style={{
              ...card,
              borderRight: "4px solid #F59E0B",
              background: "linear-gradient(to left, #FFFBEB, #fff)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Avatar name={m.profiles?.full_name ?? m.profiles?.email ?? "?"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14.5px", color: "var(--hk-ink-1)" }}>
                    {m.profiles?.full_name ?? "—"}
                  </div>
                  {m.job_title && (
                    <div style={{ fontSize: "12px", color: "#B5472A", fontWeight: 500, marginTop: "2px" }}>
                      {m.job_title}
                    </div>
                  )}
                  <div style={{ fontSize: "12.5px", color: "var(--hk-ink-3)", marginTop: "2px" }}>
                    {m.profiles?.email}
                  </div>
                </div>
                <Row>
                  <select
                    value={getRoleFor(m.id)}
                    onChange={(e) => setRoleFor(m.id, e.target.value as "viewer" | "admin")}
                    style={{
                      padding: "6px 10px", borderRadius: "8px",
                      border: "1.5px solid #E8E2D9", fontSize: "13px",
                      color: "#1A1A1A", background: "#fff",
                      fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    <option value="viewer">צופה</option>
                    <option value="admin">מנהל</option>
                  </select>
                  <button
                    type="button"
                    style={btnPrimary}
                    disabled={updateStatus.isPending}
                    onClick={() => handleApproveMember(m.id, getRoleFor(m.id))}
                  >
                    אשר
                  </button>
                  <button
                    type="button"
                    style={btnDanger}
                    disabled={updateStatus.isPending}
                    onClick={() => handleRejectMember(m.id)}
                  >
                    דחה
                  </button>
                </Row>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Active members ───────────────────────────────────────────── */}
      <SectionTitle>חברי הצוות ({active.length})</SectionTitle>
      {active.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)", padding: "36px 24px" }}>
          אין חברי צוות עדיין
        </div>
      )}
      {active.map((m) => (
        <div key={m.id} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Avatar name={m.profiles?.full_name ?? m.profiles?.email ?? "?"} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: 600, fontSize: "14.5px", color: "var(--hk-ink-1)" }}>
                  {m.profiles?.full_name ?? "—"}
                </span>
                <RoleBadge role={m.role as OrgRole} />
              </div>
              {m.job_title && (
                <div style={{ fontSize: "12px", color: "var(--hk-ink-2)", fontWeight: 500, marginTop: "2px" }}>
                  {m.job_title}
                </div>
              )}
              <div style={{ fontSize: "12.5px", color: "var(--hk-ink-3)", marginTop: "2px" }}>
                {m.profiles?.email}
              </div>
              {m.joined_at && (
                <div style={{ fontSize: "11.5px", color: "var(--hk-ink-3)", marginTop: "2px" }}>
                  הצטרף: {new Date(m.joined_at).toLocaleDateString("he-IL")}
                </div>
              )}
            </div>
            {isOwner && m.role !== "owner" && (
              <button
                type="button"
                style={btnDanger}
                onClick={() => removeMember.mutate(m.id)}
                disabled={removeMember.isPending}
              >
                הסר
              </button>
            )}
          </div>
        </div>
      ))}

      {/* ── Rejected (owner only) ────────────────────────────────────── */}
      {isOwner && rejected.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <SectionTitle>נדחו ({rejected.length})</SectionTitle>
          {rejected.map((m) => (
            <div key={m.id} style={{ ...card, opacity: 0.75 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Avatar name={m.profiles?.full_name ?? "?"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--hk-ink-1)" }}>{m.profiles?.full_name ?? "—"}</div>
                  <div style={{ fontSize: "12px", color: "var(--hk-ink-3)" }}>{m.profiles?.email}</div>
                </div>
                <select
                  value={getRoleFor(m.id)}
                  onChange={(e) => setRoleFor(m.id, e.target.value as "viewer" | "admin")}
                  style={{
                    padding: "6px 10px", borderRadius: "8px",
                    border: "1.5px solid #E8E2D9", fontSize: "13px",
                    color: "#1A1A1A", background: "#fff",
                    fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  <option value="viewer">צופה</option>
                  <option value="admin">מנהל</option>
                </select>
                <button
                  type="button"
                  style={{ ...btnOutline, fontSize: "12px", padding: "6px 12px" }}
                  onClick={() => handleApproveMember(m.id, getRoleFor(m.id))}
                >
                  אשר בכל זאת
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div style={{
      width: "38px", height: "38px",
      borderRadius: "50%",
      background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
      color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "14px", fontWeight: 700,
      flexShrink: 0,
    }}>
      {initials || "?"}
    </div>
  );
}

function RoleBadge({ role }: { role: OrgRole }) {
  const colors: Record<OrgRole, { bg: string; color: string }> = {
    owner:  { bg: "#1A3D2B", color: "#fff" },
    admin:  { bg: "#EDFBF3", color: "#2D6644" },
    viewer: { bg: "#f5f5f5", color: "#888" },
  };
  const c = colors[role];
  return (
    <span style={{
      background: c.bg, color: c.color,
      borderRadius: "12px", padding: "2px 10px",
      fontSize: "11px", fontWeight: 600,
    }}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "13px", fontWeight: 600, color: "var(--hk-ink-2)",
      marginBottom: "10px", display: "flex", alignItems: "center",
    }}>
      {children}
    </div>
  );
}

// ─── Micro helpers ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "12px", color: "var(--hk-ink-3)", fontWeight: 500, marginBottom: "5px" }}>{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>{children}</div>;
}

function Loader() {
  return <div style={{ color: "var(--hk-ink-3)", padding: "24px", fontSize: "14px" }}>טוען...</div>;
}

// ─── License tab ──────────────────────────────────────────────────────────────

function LicenseTab() {
  const { data: membership } = useOrganization();
  const org = membership?.organization;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const expiresAt = org?.plan_expires_at ? new Date(org.plan_expires_at) : null;
  const isActive = expiresAt ? expiresAt > new Date() : false;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : 0;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setErrMsg(null);
    setSuccess(null);
    try {
      const { data, error } = await supabase.rpc("redeem_license_code", { p_code: trimmed });
      if (error) throw error;
      const result = data as { success?: boolean; message?: string; expires_at?: string };
      if (result?.success === false) {
        setErrMsg(result.message ?? "קוד לא תקין");
      } else {
        setSuccess(result.message ?? "הרישיון הופעל בהצלחה!");
        setCode("");
        toast.success("הרישיון הופעל בהצלחה");
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "שגיאה בהפעלת הקוד");
    } finally {
      setLoading(false);
    }
  };

  const inputSt: React.CSSProperties = {
    flex: 1, padding: "10px 14px",
    border: "1.5px solid #E8E2D9", borderRadius: "10px",
    fontSize: "15px", fontFamily: "monospace",
    direction: "ltr", textAlign: "center", letterSpacing: "0.15em",
    outline: "none", textTransform: "uppercase",
  };

  return (
    <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Current status */}
      <div style={{
        background: isActive ? "linear-gradient(135deg, #1A3D2B, #0F2419)" : "#F5F3F0",
        borderRadius: "14px", padding: "20px 24px",
        border: isActive ? "none" : "1px solid #E8E2D9",
      }}>
        <div style={{ fontSize: "12px", color: isActive ? "rgba(255,255,255,0.5)" : "#AAA099", marginBottom: "4px", letterSpacing: "0.05em" }}>
          מצב רישיון
        </div>
        <div style={{ fontSize: "20px", fontWeight: "600", color: isActive ? "#fff" : "#1A1A1A" }}>
          {isActive ? "פעיל" : "לא פעיל"}
        </div>
        {expiresAt && (
          <div style={{ marginTop: "6px", fontSize: "13px", color: isActive ? "rgba(255,255,255,0.6)" : "#888" }}>
            {isActive
              ? `תוקף עד ${expiresAt.toLocaleDateString("he-IL")} · עוד ${daysLeft} ימים`
              : `פג תוקף ב-${expiresAt.toLocaleDateString("he-IL")}`}
          </div>
        )}
        {!expiresAt && (
          <div style={{ marginTop: "6px", fontSize: "13px", color: "#AAA099" }}>לא הוזן קוד רישיון</div>
        )}
      </div>

      {/* Redeem form */}
      <div style={{ background: "#fff", border: "1px solid #EAE5DE", borderRadius: "14px", padding: "24px" }}>
        <div style={{ fontSize: "16px", fontWeight: "500", color: "#1A1A1A", marginBottom: "6px" }}>הפעלת קוד רישיון</div>
        <div style={{ fontSize: "13px", color: "#888079", marginBottom: "18px" }}>
          הכנס/י את הקוד שקיבלת מהכרם להפעלת המנוי
        </div>
        <form onSubmit={handleRedeem} style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setErrMsg(null); setSuccess(null); }}
            placeholder="XXXX-XXXX-XXXX"
            style={inputSt}
            maxLength={20}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              padding: "10px 20px", border: "none", borderRadius: "10px",
              background: code.trim() && !loading ? "linear-gradient(135deg, #2D6644, #1A3D2B)" : "#E8E2D9",
              color: code.trim() && !loading ? "#fff" : "#AAA099",
              fontSize: "14px", fontWeight: "500", cursor: code.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: "var(--font-sans)", whiteSpace: "nowrap",
            }}
          >
            {loading ? "מפעיל..." : "הפעל"}
          </button>
        </form>

        {errMsg && (
          <div style={{ marginTop: "12px", padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", fontSize: "13px", color: "#B91C1C" }}>
            {errMsg}
          </div>
        )}
        {success && (
          <div style={{ marginTop: "12px", padding: "10px 14px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "8px", fontSize: "13px", color: "#065F46" }}>
            ✓ {success}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab() {
  const [alertStatus, setAlertStatus]   = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");

  async function callFunction(fn: "budget-alerts" | "weekly-summary", setStatus: (s: typeof alertStatus) => void) {
    setStatus("loading");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setStatus("err"); return; }
      const res = await fetch(
        `https://jzadxvhtshfgqouxoprq.supabase.co/functions/v1/${fn}`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
        },
      );
      setStatus(res.ok ? "ok" : "err");
    } catch {
      setStatus("err");
    }
  }

  const card = (
    title: string,
    subtitle: string,
    description: string,
    schedule: string,
    icon: string,
    status: typeof alertStatus,
    onSend: () => void,
  ) => (
    <div style={{
      background: "#fff",
      border: "1px solid #E5EDE8",
      borderRadius: "14px",
      padding: "22px 24px",
      marginBottom: "16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "22px" }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#1A3D2B" }}>{title}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "1px" }}>{subtitle}</div>
            </div>
          </div>
          <div style={{ fontSize: "13px", color: "#555", lineHeight: 1.6, marginBottom: "12px" }}>
            {description}
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "#F0FAF5", borderRadius: "6px", padding: "4px 10px",
            fontSize: "12px", color: "#2D6644", fontWeight: 500,
          }}>
            🕐 {schedule}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <button
            type="button"
            onClick={onSend}
            disabled={status === "loading"}
            style={{
              padding: "10px 20px",
              borderRadius: "9px",
              border: "none",
              background: status === "ok"  ? "linear-gradient(135deg,#2D6644,#1A3D2B)"
                        : status === "err" ? "linear-gradient(135deg,#DC2626,#991B1B)"
                        : "linear-gradient(135deg,#2D6644,#1A3D2B)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "13px",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              opacity: status === "loading" ? 0.7 : 1,
              fontFamily: "Rubik, sans-serif",
              whiteSpace: "nowrap",
              minWidth: "110px",
            }}
          >
            {status === "loading" ? "שולח..." : status === "ok" ? "✓ נשלח!" : status === "err" ? "✗ שגיאה" : "שלח עכשיו"}
          </button>
          {status === "ok" && (
            <div style={{ fontSize: "11px", color: "#2D6644" }}>בדוק את תיבת הדואר שלך</div>
          )}
          {status === "err" && (
            <div style={{ fontSize: "11px", color: "#DC2626" }}>נסה שוב בעוד רגע</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{
        background: "linear-gradient(135deg, rgba(45,102,68,0.06), rgba(26,61,43,0.03))",
        border: "1px solid #D4EDE0",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "24px",
        fontSize: "13px",
        color: "#1A3D2B",
        lineHeight: 1.7,
      }}>
        <strong>📬 התראות אוטומטיות</strong> — המערכת שולחת מייל לבעל הארגון וכל המנהלים באופן אוטומטי.
        ניתן גם לשלוח ידנית בכל עת באמצעות הכפתורים למטה.
      </div>

      {card(
        "התראת חריגה תקציבית",
        "שולח מדי יום בשעה 10:00",
        "בודק אם מקור תקציבי חרג מ-100% או עבר 80% מהתקציב המאושר. אם יש חריגה — נשלח מייל אדום. אם יש אזהרה — מייל צהוב.",
        "כל יום ב-10:00 (אם יש חריגה/אזהרה)",
        "🔴",
        alertStatus,
        () => callFunction("budget-alerts", setAlertStatus),
      )}

      {card(
        "דוח שבועי למנהל",
        "שולח כל יום ראשון בשעה 10:00",
        "מסכם את המצב הכולל: ניצול תקציב לפי מקור, הוצאות השבוע, מצב גבייה מהורים, ותובנות AI בעברית.",
        "כל יום ראשון ב-10:00",
        "📊",
        summaryStatus,
        () => callFunction("weekly-summary", setSummaryStatus),
      )}

      <div style={{
        background: "#FFFBEB",
        border: "1px solid #F5C842",
        borderRadius: "10px",
        padding: "14px 18px",
        fontSize: "12px",
        color: "#92400E",
        lineHeight: 1.7,
      }}>
        <strong>⚙️ הגדרת CRON_SECRET</strong> — כדי שהמשלוח האוטומטי יפעל, יש להגדיר בפאנל Supabase:
        <br />
        Dashboard → Edge Functions → Secrets → הוסף: <code style={{ background: "#FEF9C3", padding: "1px 5px", borderRadius: "3px" }}>CRON_SECRET</code> עם ערך כלשהו,
        ואז הרץ ב-SQL Editor: <code style={{ background: "#FEF9C3", padding: "1px 5px", borderRadius: "3px" }}>ALTER DATABASE postgres SET app.cron_secret = 'same_value';</code>
      </div>
    </div>
  );
}

