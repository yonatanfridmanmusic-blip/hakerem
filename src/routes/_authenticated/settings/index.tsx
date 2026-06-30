import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  useSchoolYears,
  useCreateSchoolYear,
  useUpdateSchoolYear,
  useSetActiveYear,
} from "@/hooks/use-school-years";
import { useGrades, useAddGrade, useUpdateGrade, useDeleteGrade } from "@/hooks/use-grades";
import {
  useAddBudgetCategory,
  useBudgetPlan,
  type BudgetSource,
} from "@/hooks/use-budget-plan";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsPage,
});

type Tab = "years" | "grades" | "categories";

const SOURCE_TABS: { key: BudgetSource; label: string }[] = [
  { key: "gefen", label: "גפן" },
  { key: "iriyah", label: "עירייה" },
  { key: "horim", label: "הורים" },
];

// ─── Shared styles ─────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  border: "1px solid var(--hk-border)",
  padding: "24px",
  marginBottom: "16px",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--hk-border)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "14px",
  fontFamily: "Rubik, sans-serif",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--hk-green)",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  padding: "8px 18px",
  fontSize: "13.5px",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "Rubik, sans-serif",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--hk-green)",
  border: "1px solid var(--hk-green)",
  borderRadius: "8px",
  padding: "6px 14px",
  fontSize: "13px",
  cursor: "pointer",
  fontFamily: "Rubik, sans-serif",
};

const btnDanger: React.CSSProperties = {
  background: "transparent",
  color: "#e05555",
  border: "1px solid #e05555",
  borderRadius: "8px",
  padding: "6px 12px",
  fontSize: "12px",
  cursor: "pointer",
  fontFamily: "Rubik, sans-serif",
};

// ─── Main page ─────────────────────────────────────────────────────────────

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("years");

  const tabItems: { key: Tab; label: string }[] = [
    { key: "years", label: "שנות לימודים" },
    { key: "grades", label: "שכבות וכיתות" },
    { key: "categories", label: "קטגוריות תקציב" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--hk-ink-1)", marginBottom: "24px" }}>
        הגדרות
      </h1>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px", background: "var(--hk-bg-2)", borderRadius: "12px", padding: "4px", width: "fit-content" }}>
        {tabItems.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13.5px",
              fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? "#fff" : "transparent",
              color: tab === t.key ? "var(--hk-green)" : "var(--hk-ink-3)",
              cursor: "pointer",
              fontFamily: "Rubik, sans-serif",
              boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.12s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "years" && <YearsTab />}
      {tab === "grades" && <GradesTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}

// ─── Years tab ─────────────────────────────────────────────────────────────

function YearsTab() {
  const { data: years = [], isLoading } = useSchoolYears();
  const createYear = useCreateSchoolYear();
  const setActive = useSetActiveYear();
  const updateYear = useUpdateSchoolYear();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pct, setPct] = useState("85");
  const [editId, setEditId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name || !startDate || !endDate) return;
    await createYear.mutateAsync({
      name,
      start_date: startDate,
      end_date: endDate,
      collection_percentage: Number(pct),
    });
    setName(""); setStartDate(""); setEndDate(""); setPct("85");
    setShowForm(false);
  };

  const handleSaveEdit = async (id: string) => {
    const y = years.find((y) => y.id === id);
    if (!y) return;
    await updateYear.mutateAsync({ id, name: y.name, collection_percentage: y.collection_percentage });
    setEditId(null);
  };

  if (isLoading) return <div style={{ color: "var(--hk-ink-3)", padding: "24px" }}>טוען...</div>;

  return (
    <div>
      {years.map((y) => (
        <div key={y.id} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              {editId === y.id ? (
                <input
                  style={{ ...inputStyle, width: "220px" }}
                  value={y.name}
                  onChange={(e) =>
                    updateYear.reset()
                  }
                />
              ) : (
                <div style={{ fontWeight: 600, fontSize: "15px", color: "var(--hk-ink-1)" }}>
                  {y.name}
                </div>
              )}
              <div style={{ fontSize: "12px", color: "var(--hk-ink-3)", marginTop: "4px" }}>
                {y.start_date} — {y.end_date} | גבייה: {y.collection_percentage}%
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {y.is_active ? (
                <span style={{
                  background: "rgba(52,168,83,0.1)", color: "var(--hk-green)",
                  borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: 600,
                }}>
                  פעילה ✓
                </span>
              ) : (
                <button
                  type="button"
                  style={btnGhost}
                  onClick={() => setActive.mutate(y.id)}
                  disabled={setActive.isPending}
                >
                  הגדר כפעילה
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <div style={{ ...card, border: "1px solid var(--hk-green)" }}>
          <div style={{ fontWeight: 600, marginBottom: "16px", fontSize: "14px", color: "var(--hk-ink-1)" }}>
            שנת לימודים חדשה
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>שם</label>
              <input style={inputStyle} placeholder="לדוגמה: תשפ״ו 2025-2026" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>תאריך התחלה</label>
              <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>תאריך סיום</label>
              <input style={inputStyle} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>יעד גבייה (%)</label>
              <input style={inputStyle} type="number" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={btnPrimary} onClick={handleCreate} disabled={createYear.isPending}>
              {createYear.isPending ? "שומר..." : "צור שנה"}
            </button>
            <button type="button" style={btnGhost} onClick={() => setShowForm(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button type="button" style={{ ...btnGhost, marginTop: "4px" }} onClick={() => setShowForm(true)}>
          + הוסף שנת לימודים
        </button>
      )}
    </div>
  );
}

// ─── Grades tab ────────────────────────────────────────────────────────────

function GradesTab() {
  const { data: years = [] } = useSchoolYears();
  const activeYear = years.find((y) => y.is_active);
  const { data: grades = [], isLoading } = useGrades(activeYear?.id);
  const addGrade = useAddGrade();
  const updateGrade = useUpdateGrade();
  const deleteGrade = useDeleteGrade();

  const [showForm, setShowForm] = useState(false);
  const [gradeName, setGradeName] = useState("");
  const [studentCount, setStudentCount] = useState("0");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; student_count: string }>({ name: "", student_count: "0" });

  const handleAdd = async () => {
    if (!gradeName || !activeYear) return;
    await addGrade.mutateAsync({ name: gradeName, student_count: Number(studentCount), yearId: activeYear.id });
    setGradeName(""); setStudentCount("0"); setShowForm(false);
  };

  const startEdit = (g: { id: string; name: string; student_count: number }) => {
    setEditId(g.id);
    setEditValues({ name: g.name, student_count: String(g.student_count) });
  };

  const handleSave = async () => {
    if (!editId) return;
    await updateGrade.mutateAsync({ id: editId, name: editValues.name, student_count: Number(editValues.student_count) });
    setEditId(null);
  };

  if (!activeYear) return (
    <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)" }}>
      אין שנת לימודים פעילה. הגדר שנה פעילה בלשונית "שנות לימודים" קודם.
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: "16px", fontSize: "13px", color: "var(--hk-ink-3)" }}>
        שנה פעילה: <strong style={{ color: "var(--hk-ink-1)" }}>{activeYear.name}</strong>
      </div>

      {isLoading ? (
        <div style={{ color: "var(--hk-ink-3)" }}>טוען...</div>
      ) : (
        <>
          {grades.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)", fontSize: "14px" }}>
              אין שכבות עדיין — הוסף שכבה ראשונה
            </div>
          )}

          {grades.map((g) => (
            <div key={g.id} style={card}>
              {editId === g.id ? (
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "11px", color: "var(--hk-ink-3)", display: "block", marginBottom: "3px" }}>שם שכבה</label>
                    <input style={inputStyle} value={editValues.name} onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} />
                  </div>
                  <div style={{ width: "120px" }}>
                    <label style={{ fontSize: "11px", color: "var(--hk-ink-3)", display: "block", marginBottom: "3px" }}>מספר תלמידים</label>
                    <input style={inputStyle} type="number" min="0" value={editValues.student_count} onChange={(e) => setEditValues((v) => ({ ...v, student_count: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignSelf: "flex-end" }}>
                    <button type="button" style={btnPrimary} onClick={handleSave} disabled={updateGrade.isPending}>שמור</button>
                    <button type="button" style={btnGhost} onClick={() => setEditId(null)}>ביטול</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "15px", color: "var(--hk-ink-1)" }}>{g.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--hk-ink-3)", marginTop: "3px" }}>
                      {g.student_count} תלמידים
                    </div>
                  </div>
                  <button type="button" style={btnGhost} onClick={() => startEdit(g)}>ערוך</button>
                  <button type="button" style={btnDanger} onClick={() => deleteGrade.mutate(g.id)}>מחק</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {showForm ? (
        <div style={{ ...card, border: "1px solid var(--hk-green)" }}>
          <div style={{ fontWeight: 600, marginBottom: "12px", fontSize: "14px" }}>שכבה חדשה</div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>שם שכבה</label>
              <input style={inputStyle} placeholder="לדוגמה: כיתה א׳" value={gradeName} onChange={(e) => setGradeName(e.target.value)} />
            </div>
            <div style={{ width: "140px" }}>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>מספר תלמידים</label>
              <input style={inputStyle} type="number" min="0" value={studentCount} onChange={(e) => setStudentCount(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={btnPrimary} onClick={handleAdd} disabled={addGrade.isPending}>
              {addGrade.isPending ? "מוסיף..." : "הוסף שכבה"}
            </button>
            <button type="button" style={btnGhost} onClick={() => setShowForm(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button type="button" style={{ ...btnGhost, marginTop: "4px" }} onClick={() => setShowForm(true)}>
          + הוסף שכבה
        </button>
      )}
    </div>
  );
}

// ─── Categories tab ─────────────────────────────────────────────────────────

function CategoriesTab() {
  const [srcTab, setSrcTab] = useState<BudgetSource>("gefen");

  return (
    <div>
      {/* Source sub-tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {SOURCE_TABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSrcTab(s.key)}
            style={{
              padding: "6px 18px",
              borderRadius: "8px",
              border: srcTab === s.key ? "none" : "1px solid var(--hk-border)",
              fontSize: "13px",
              fontWeight: srcTab === s.key ? 600 : 400,
              background: srcTab === s.key ? "var(--hk-green)" : "#fff",
              color: srcTab === s.key ? "#fff" : "var(--hk-ink-2)",
              cursor: "pointer",
              fontFamily: "Rubik, sans-serif",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <CategoryList source={srcTab} />
    </div>
  );
}

function CategoryList({ source }: { source: BudgetSource }) {
  const { data, isLoading } = useBudgetPlan(source);
  const addCategory = useAddBudgetCategory();

  const [showForm, setShowForm] = useState(false);
  const [catName, setCatName] = useState("");
  const [planned, setPlanned] = useState("0");

  const handleAdd = async () => {
    if (!catName) return;
    await addCategory.mutateAsync({ name: catName, source, plannedAmount: Number(planned) });
    setCatName(""); setPlanned("0"); setShowForm(false);
  };

  const categories = data?.categories ?? [];

  if (isLoading) return <div style={{ color: "var(--hk-ink-3)" }}>טוען...</div>;

  return (
    <div>
      {categories.length === 0 && !showForm && (
        <div style={{ ...card, textAlign: "center", color: "var(--hk-ink-3)", fontSize: "14px" }}>
          אין קטגוריות עדיין
        </div>
      )}

      {categories.map((c) => (
        <div key={c.id} style={{ ...card, display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--hk-ink-1)" }}>{c.name}</div>
            <div style={{ fontSize: "12px", color: "var(--hk-ink-3)", marginTop: "2px" }}>
              תקציב: ₪{c.planned_amount.toLocaleString()} | נוצל: ₪{c.used.toLocaleString()}
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <div style={{ ...card, border: "1px solid var(--hk-green)" }}>
          <div style={{ fontWeight: 600, marginBottom: "12px", fontSize: "14px" }}>קטגוריה חדשה</div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>שם קטגוריה</label>
              <input style={inputStyle} placeholder="לדוגמה: ציוד משרדי" value={catName} onChange={(e) => setCatName(e.target.value)} />
            </div>
            <div style={{ width: "160px" }}>
              <label style={{ fontSize: "12px", color: "var(--hk-ink-3)", display: "block", marginBottom: "4px" }}>סכום מתוכנן (₪)</label>
              <input style={inputStyle} type="number" min="0" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={btnPrimary} onClick={handleAdd} disabled={addCategory.isPending}>
              {addCategory.isPending ? "מוסיף..." : "הוסף קטגוריה"}
            </button>
            <button type="button" style={btnGhost} onClick={() => setShowForm(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button type="button" style={{ ...btnGhost, marginTop: "4px" }} onClick={() => setShowForm(true)}>
          + הוסף קטגוריה
        </button>
      )}
    </div>
  );
}
