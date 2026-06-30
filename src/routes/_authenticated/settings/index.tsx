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

// ─── Source config (matches rest of app) ──────────────────────────────────

const SOURCE_CFG = {
  gefen:  { label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534", gradient: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 100%)" },
  iriyah: { label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010", gradient: "linear-gradient(160deg, #7C2E18 0%, #3A140A 100%)" },
  horim:  { label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356", gradient: "linear-gradient(160deg, #4A1A38 0%, #1F0B17 100%)" },
} as const;

const SOURCES = (["gefen", "iriyah", "horim"] as BudgetSource[]);

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
  const [tab, setTab] = useState<Tab>("years");

  const tabs: { key: Tab; label: string }[] = [
    { key: "years",      label: "שנות לימודים" },
    { key: "grades",     label: "שכבות וכיתות" },
    { key: "categories", label: "קטגוריות תקציב" },
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 55%, #081510 100%)",
        borderRadius: "20px",
        padding: "28px 32px",
        marginBottom: "28px",
        boxShadow: "0 8px 32px rgba(15,36,25,0.4)",
      }}>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "4px", letterSpacing: "0.06em" }}>ניהול מערכת</div>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>הגדרות</h1>
        <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
          שנות לימודים · שכבות · קטגוריות תקציב
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
        width: "fit-content",
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
    </div>
  );
}

// ─── Years tab ─────────────────────────────────────────────────────────────

function YearsTab() {
  const { data: years = [], isLoading } = useSchoolYears();
  const createYear  = useCreateSchoolYear();
  const setActive   = useSetActiveYear();

  const [showForm, setShowForm] = useState(false);
  const [name, setName]         = useState("");
  const [startDate, setStart]   = useState("");
  const [endDate, setEnd]       = useState("");
  const [pct, setPct]           = useState("85");

  const handleCreate = async () => {
    if (!name || !startDate || !endDate) return;
    await createYear.mutateAsync({ name, start_date: startDate, end_date: endDate, collection_percentage: Number(pct) });
    setName(""); setStart(""); setEnd(""); setPct("85");
    setShowForm(false);
  };

  if (isLoading) return <Loader />;

  return (
    <div>
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
            {!y.is_active && (
              <button
                type="button"
                style={btnOutline}
                onClick={() => setActive.mutate(y.id)}
                disabled={setActive.isPending}
              >
                הגדר כפעיל
              </button>
            )}
          </div>
        </div>
      ))}

      {showForm ? (
        <div style={{ ...card, border: "1.5px solid #2D6644", boxShadow: "0 0 0 3px rgba(45,102,68,0.08)" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--hk-ink-1)", marginBottom: "16px" }}>
            ➕ שנת לימודים חדשה
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
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
  const { data: years = [] }   = useSchoolYears();
  const activeYear              = years.find((y) => y.is_active);
  const { data: grades = [], isLoading } = useGrades(activeYear?.id);
  const addGrade    = useAddGrade();
  const updateGrade = useUpdateGrade();
  const deleteGrade = useDeleteGrade();

  const [showForm, setShowForm]   = useState(false);
  const [gradeName, setGradeName] = useState("");
  const [count, setCount]         = useState("0");
  const [editId, setEditId]       = useState<string | null>(null);
  const [editVals, setEditVals]   = useState({ name: "", count: "0" });

  const handleAdd = async () => {
    if (!gradeName || !activeYear) return;
    await addGrade.mutateAsync({ name: gradeName, student_count: Number(count), yearId: activeYear.id });
    setGradeName(""); setCount("0"); setShowForm(false);
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
              <div style={{ width: "130px" }}>
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
                <button type="button" style={btnDanger} onClick={() => deleteGrade.mutate(g.id)}>מחק</button>
              </Row>
            </div>
          )}
        </div>
      ))}

      {showForm ? (
        <div style={{ ...card, border: "1.5px solid #2D6644", boxShadow: "0 0 0 3px rgba(45,102,68,0.08)" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--hk-ink-1)", marginBottom: "14px" }}>➕ שכבה חדשה</div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
            <div style={{ flex: 1 }}>
              <Label>שם שכבה</Label>
              <input style={inputStyle} placeholder="לדוגמה: כיתה א׳" value={gradeName} onChange={(e) => setGradeName(e.target.value)} />
            </div>
            <div style={{ width: "150px" }}>
              <Label>מספר תלמידים</Label>
              <input style={inputStyle} type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <Row>
            <button type="button" style={btnPrimary} onClick={handleAdd} disabled={addGrade.isPending}>
              {addGrade.isPending ? "מוסיף..." : "הוסף שכבה"}
            </button>
            <button type="button" style={btnOutline} onClick={() => setShowForm(false)}>ביטול</button>
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

// ─── Categories tab ─────────────────────────────────────────────────────────

function CategoriesTab() {
  const [src, setSrc] = useState<BudgetSource>("gefen");
  const cfg = SOURCE_CFG[src];

  return (
    <div>
      {/* Source selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {SOURCES.map((s) => {
          const c = SOURCE_CFG[s];
          const active = src === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSrc(s)}
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

      <CategoryList source={src} color={cfg.color} bg={cfg.bg} textColor={cfg.textColor} />
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
    if (!catName) return;
    await addCategory.mutateAsync({ name: catName, source, plannedAmount: Number(planned) });
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
