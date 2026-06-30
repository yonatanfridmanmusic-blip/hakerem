import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import {
  useGrades,
  useParentSections,
  useGradeSectionAmounts,
  useParentCollections,
  computeTarget,
} from "@/hooks/use-horim";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

type Tab = "annual" | "horim";

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  "₪" + Math.round(n).toLocaleString("he-IL");

const pctBar = (pct: number) => {
  const clamped = Math.min(pct, 100);
  const color = pct > 100 ? "#e05555" : pct > 80 ? "#F5A623" : "#34a853";
  return (
    <div style={{ background: "#f0f0f0", borderRadius: "4px", height: "6px", width: "100%", marginTop: "4px" }}>
      <div style={{ width: `${clamped}%`, height: "100%", borderRadius: "4px", background: color, transition: "width 0.3s" }} />
    </div>
  );
};

// ─── Shared styles ─────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "right",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--hk-ink-3)",
  borderBottom: "1px solid var(--hk-border)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "right",
  fontSize: "13.5px",
  color: "var(--hk-ink-1)",
  borderBottom: "1px solid var(--hk-border)",
};

// ─── Main page ─────────────────────────────────────────────────────────────

function ReportsPage() {
  const [tab, setTab] = useState<Tab>("annual");

  const tabItems: { key: Tab; label: string }[] = [
    { key: "annual", label: "דוח שנתי" },
    { key: "horim", label: "גבייה מהורים לפי שכבה" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--hk-ink-1)", margin: 0 }}>
          דוחות
        </h1>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: "var(--hk-green)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "Rubik, sans-serif",
          }}
        >
          הדפסה / PDF
        </button>
      </div>

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

      {tab === "annual" && <AnnualReport />}
      {tab === "horim" && <HorimReport />}
    </div>
  );
}

// ─── Annual Report ─────────────────────────────────────────────────────────

function AnnualReport() {
  const { data, isLoading } = useDashboardSummary();

  if (isLoading) return <div style={{ color: "var(--hk-ink-3)", padding: "24px" }}>טוען...</div>;
  if (!data?.schoolYear) return (
    <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid var(--hk-border)", padding: "40px", textAlign: "center", color: "var(--hk-ink-3)" }}>
      אין שנת לימודים פעילה
    </div>
  );

  const { schoolYear, sources, totals, incomeTotals } = data;

  return (
    <div>
      {/* Header card */}
      <div style={{
        background: "linear-gradient(135deg, #1A3D2B 0%, #22503A 100%)",
        borderRadius: "16px",
        padding: "28px 32px",
        marginBottom: "20px",
        color: "#fff",
      }}>
        <div style={{ fontSize: "13px", opacity: 0.6, marginBottom: "6px" }}>דוח שנתי — {schoolYear.name}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
          <div>
            <div style={{ fontSize: "11px", opacity: 0.55, marginBottom: "4px" }}>סה״כ מתוכנן</div>
            <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt(totals.planned)}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", opacity: 0.55, marginBottom: "4px" }}>סה״כ הוצאות</div>
            <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt(totals.used)}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", opacity: 0.55, marginBottom: "4px" }}>הכנסות שנרשמו</div>
            <div style={{ fontSize: "22px", fontWeight: 700 }}>{fmt(incomeTotals.grand)}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", opacity: 0.55, marginBottom: "4px" }}>יתרת תקציב</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: totals.balance >= 0 ? "#7AAA8E" : "#e07070" }}>
              {fmt(totals.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Per-source table */}
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid var(--hk-border)", overflow: "hidden", marginBottom: "20px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--hk-bg-2)" }}>
            <tr>
              <th style={th}>מקור</th>
              <th style={{ ...th, textAlign: "left" }}>מתוכנן</th>
              <th style={{ ...th, textAlign: "left" }}>הכנסות שנרשמו</th>
              <th style={{ ...th, textAlign: "left" }}>הוצאות</th>
              <th style={{ ...th, textAlign: "left" }}>יתרת תקציב</th>
              <th style={{ ...th, textAlign: "left" }}>ניצול</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const balance = s.planned - s.used;
              const pct = s.planned > 0 ? Math.round((s.used / s.planned) * 100) : 0;
              return (
                <tr key={s.source}>
                  <td style={{ ...td, fontWeight: 600 }}>{s.label}</td>
                  <td style={{ ...td, textAlign: "left" }}>{fmt(s.planned)}</td>
                  <td style={{ ...td, textAlign: "left", color: "var(--hk-green)" }}>{fmt(s.income)}</td>
                  <td style={{ ...td, textAlign: "left" }}>{fmt(s.used)}</td>
                  <td style={{
                    ...td, textAlign: "left",
                    fontWeight: 600,
                    color: balance >= 0 ? "var(--hk-green)" : "#e05555",
                  }}>
                    {fmt(balance)}
                  </td>
                  <td style={{ ...td, textAlign: "left", minWidth: "120px" }}>
                    <span style={{ fontSize: "12px", color: "var(--hk-ink-2)" }}>{pct}%</span>
                    {pctBar(pct)}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ background: "var(--hk-bg-2)" }}>
              <td style={{ ...td, fontWeight: 700, color: "var(--hk-ink-1)" }}>סה״כ</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{fmt(totals.planned)}</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: "var(--hk-green)" }}>{fmt(incomeTotals.grand)}</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{fmt(totals.used)}</td>
              <td style={{
                ...td, textAlign: "left", fontWeight: 700,
                color: totals.balance >= 0 ? "var(--hk-green)" : "#e05555",
              }}>
                {fmt(totals.balance)}
              </td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                {totals.pct}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Income breakdown */}
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid var(--hk-border)", padding: "20px 24px" }}>
        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--hk-ink-1)", marginBottom: "12px" }}>פירוט הכנסות</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          <div style={{ background: "var(--hk-bg-2)", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: "var(--hk-ink-3)", marginBottom: "4px" }}>הכנסות ממקורות</div>
            <div style={{ fontWeight: 700, fontSize: "18px", color: "var(--hk-ink-1)" }}>{fmt(incomeTotals.fromIncome)}</div>
          </div>
          <div style={{ background: "var(--hk-bg-2)", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: "var(--hk-ink-3)", marginBottom: "4px" }}>גבייה מהורים</div>
            <div style={{ fontWeight: 700, fontSize: "18px", color: "var(--hk-ink-1)" }}>{fmt(incomeTotals.fromParentCollections)}</div>
          </div>
          <div style={{ background: "rgba(52,168,83,0.08)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(52,168,83,0.2)" }}>
            <div style={{ fontSize: "11px", color: "var(--hk-ink-3)", marginBottom: "4px" }}>סה״כ הכנסות</div>
            <div style={{ fontWeight: 700, fontSize: "18px", color: "var(--hk-green)" }}>{fmt(incomeTotals.grand)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Horim Report ──────────────────────────────────────────────────────────

function HorimReport() {
  const { data: grades = [], isLoading: gradesLoading } = useGrades();
  const { data: sections = [] } = useParentSections();
  const { data: amounts = [] } = useGradeSectionAmounts();
  const { data: collections = [] } = useParentCollections();

  if (gradesLoading) return <div style={{ color: "var(--hk-ink-3)", padding: "24px" }}>טוען...</div>;
  if (grades.length === 0) return (
    <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid var(--hk-border)", padding: "40px", textAlign: "center", color: "var(--hk-ink-3)" }}>
      אין שכבות — הגדר שכבות במסך ההגדרות
    </div>
  );

  // Compute per-grade totals
  const gradeRows = grades.map((grade) => {
    const gradeAmounts = amounts.filter((a) => a.grade_id === grade.id);
    const target = sections.reduce((sum, sec) => {
      const gsa = gradeAmounts.find((a) => a.parent_section_id === sec.id);
      return sum + computeTarget(grade, gsa);
    }, 0);

    const collected = collections
      .filter((c) => c.grade_id === grade.id)
      .reduce((sum, c) => sum + c.amount, 0);

    const remaining = target - collected;
    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;

    return { grade, target, collected, remaining, pct };
  });

  const totalTarget = gradeRows.reduce((s, r) => s + r.target, 0);
  const totalCollected = gradeRows.reduce((s, r) => s + r.collected, 0);
  const totalRemaining = totalTarget - totalCollected;
  const totalPct = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
        {[
          { label: "יעד גבייה", value: totalTarget, color: "var(--hk-ink-1)" },
          { label: "נגבה", value: totalCollected, color: "var(--hk-green)" },
          { label: "טרם נגבה", value: totalRemaining, color: totalRemaining > 0 ? "#F5A623" : "var(--hk-green)" },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", borderRadius: "16px", border: "1px solid var(--hk-border)", padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", color: "var(--hk-ink-3)", marginBottom: "6px" }}>{c.label}</div>
            <div style={{ fontWeight: 700, fontSize: "22px", color: c.color }}>{fmt(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Per-grade table */}
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid var(--hk-border)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--hk-bg-2)" }}>
            <tr>
              <th style={th}>שכבה</th>
              <th style={{ ...th, textAlign: "left" }}>תלמידים</th>
              <th style={{ ...th, textAlign: "left" }}>יעד גבייה</th>
              <th style={{ ...th, textAlign: "left" }}>נגבה</th>
              <th style={{ ...th, textAlign: "left" }}>נותר</th>
              <th style={{ ...th, textAlign: "left" }}>התקדמות</th>
            </tr>
          </thead>
          <tbody>
            {gradeRows.map(({ grade, target, collected, remaining, pct }) => (
              <tr key={grade.id}>
                <td style={{ ...td, fontWeight: 600 }}>{grade.name}</td>
                <td style={{ ...td, textAlign: "left", color: "var(--hk-ink-2)" }}>{grade.student_count}</td>
                <td style={{ ...td, textAlign: "left" }}>{fmt(target)}</td>
                <td style={{ ...td, textAlign: "left", color: "var(--hk-green)", fontWeight: 600 }}>{fmt(collected)}</td>
                <td style={{
                  ...td, textAlign: "left", fontWeight: 600,
                  color: remaining > 0 ? "#F5A623" : "var(--hk-green)",
                }}>
                  {remaining > 0 ? fmt(remaining) : "✓ הושלם"}
                </td>
                <td style={{ ...td, textAlign: "left", minWidth: "120px" }}>
                  <span style={{ fontSize: "12px", color: "var(--hk-ink-2)" }}>{pct}%</span>
                  {pctBar(pct)}
                </td>
              </tr>
            ))}
            {/* Totals */}
            <tr style={{ background: "var(--hk-bg-2)" }}>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: "var(--hk-ink-2)" }}>
                {grades.reduce((s, g) => s + g.student_count, 0)}
              </td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{fmt(totalTarget)}</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: "var(--hk-green)" }}>{fmt(totalCollected)}</td>
              <td style={{
                ...td, textAlign: "left", fontWeight: 700,
                color: totalRemaining > 0 ? "#F5A623" : "var(--hk-green)",
              }}>
                {fmt(totalRemaining)}
              </td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                {totalPct}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
