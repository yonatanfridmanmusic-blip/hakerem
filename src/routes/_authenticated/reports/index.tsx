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

const SOURCE_CFG = {
  gefen:  { label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534" },
  iriyah: { label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010" },
  horim:  { label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356" },
} as const;

function PctBar({ pct, color }: { pct: number; color?: string }) {
  const clamped = Math.min(pct, 100);
  const barColor = pct > 100 ? "#C0392B" : pct > 80 ? "#E67E22" : (color ?? "#2D6644");
  return (
    <div style={{ background: "#EFEFEF", borderRadius: "6px", height: "7px", width: "100%", marginTop: "5px" }}>
      <div style={{ width: `${clamped}%`, height: "100%", borderRadius: "6px", background: barColor, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ─── Shared table styles ────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: "11px 18px",
  textAlign: "right",
  fontSize: "11.5px",
  fontWeight: 600,
  color: "#6B7A72",
  borderBottom: "1px solid #EEE9E2",
  whiteSpace: "nowrap",
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

const td: React.CSSProperties = {
  padding: "13px 18px",
  textAlign: "right",
  fontSize: "13.5px",
  color: "#1A1A1A",
  borderBottom: "1px solid #F4F1EC",
};

const tdL: React.CSSProperties = { ...td, textAlign: "left" };
const thL: React.CSSProperties = { ...th, textAlign: "left" };

// ─── Main page ──────────────────────────────────────────────────────────────

function ReportsPage() {
  const [tab, setTab] = useState<Tab>("annual");

  const tabs: { key: Tab; label: string }[] = [
    { key: "annual", label: "דוח שנתי" },
    { key: "horim",  label: "גבייה מהורים" },
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            ניתוח נתונים
          </div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>דוחות</h1>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>
            סיכום שנתי · גבייה מהורים לפי שכבה
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "10px",
            padding: "10px 20px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "Rubik, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: "7px",
            backdropFilter: "blur(4px)",
          }}
        >
          🖨️ הדפסה / PDF
        </button>
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
              padding: "9px 24px",
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

      {tab === "annual" && <AnnualReport />}
      {tab === "horim"  && <HorimReport />}
    </div>
  );
}

// ─── Annual Report ──────────────────────────────────────────────────────────

function AnnualReport() {
  const { data, isLoading } = useDashboardSummary();

  if (isLoading) return <Loader />;
  if (!data?.schoolYear) return <EmptyState text="אין שנת לימודים פעילה" />;

  const { schoolYear, sources, totals, incomeTotals } = data;

  return (
    <div>
      {/* 4 KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "סה״כ מתוכנן",    value: totals.planned,          color: "#1A1A1A", sub: "תקציב שנתי" },
          { label: "סה״כ הוצאות",    value: totals.used,             color: "#B5472A", sub: `${totals.pct}% מהתקציב` },
          { label: "הכנסות שנרשמו",  value: incomeTotals.grand,      color: "#2D6644", sub: "כולל גבייה" },
          { label: "יתרת תקציב",     value: totals.balance,          color: totals.balance >= 0 ? "#2D6644" : "#B5472A", sub: totals.balance >= 0 ? "עודף" : "גרעון" },
        ].map((k) => (
          <div key={k.label} style={{
            background: "#fff",
            borderRadius: "14px",
            border: "1px solid #EEE9E2",
            padding: "18px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: "11px", color: "#6B7A72", fontWeight: 500, marginBottom: "6px" }}>{k.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: k.color, marginBottom: "3px" }}>{fmt(k.value)}</div>
            <div style={{ fontSize: "11.5px", color: "#9BA8A2" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Per-source table */}
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        border: "1px solid #EEE9E2",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        marginBottom: "18px",
      }}>
        <div style={{ padding: "18px 22px 0", borderBottom: "1px solid #F4F1EC" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "#1A1A1A", marginBottom: "14px" }}>
            פירוט לפי מקור תקציב
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#FAFAF8" }}>
            <tr>
              <th style={th}>מקור</th>
              <th style={thL}>מתוכנן</th>
              <th style={thL}>הכנסות שנרשמו</th>
              <th style={thL}>הוצאות</th>
              <th style={thL}>יתרה</th>
              <th style={{ ...thL, minWidth: "140px" }}>ניצול תקציב</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const cfg = SOURCE_CFG[s.source as keyof typeof SOURCE_CFG];
              const balance = s.planned - s.used;
              const pct = s.planned > 0 ? Math.round((s.used / s.planned) * 100) : 0;
              return (
                <tr key={s.source} style={{ transition: "background 0.1s" }}>
                  <td style={td}>
                    <span style={{
                      background: cfg.bg,
                      color: cfg.textColor,
                      borderRadius: "8px",
                      padding: "3px 10px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                    }}>
                      {cfg.label}
                    </span>
                  </td>
                  <td style={tdL}>{fmt(s.planned)}</td>
                  <td style={{ ...tdL, color: "#2D6644", fontWeight: 500 }}>{fmt(s.income)}</td>
                  <td style={tdL}>{fmt(s.used)}</td>
                  <td style={{ ...tdL, fontWeight: 600, color: balance >= 0 ? "#2D6644" : "#B5472A" }}>
                    {fmt(balance)}
                  </td>
                  <td style={tdL}>
                    <div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{pct}%</div>
                    <PctBar pct={pct} color={cfg.color} />
                  </td>
                </tr>
              );
            })}

            {/* Total row */}
            <tr style={{ background: "#F7F4EF" }}>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
              <td style={{ ...tdL, fontWeight: 700 }}>{fmt(totals.planned)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(incomeTotals.grand)}</td>
              <td style={{ ...tdL, fontWeight: 700 }}>{fmt(totals.used)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: totals.balance >= 0 ? "#2D6644" : "#B5472A" }}>
                {fmt(totals.balance)}
              </td>
              <td style={tdL}>
                <div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{totals.pct}%</div>
                <PctBar pct={totals.pct} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Income breakdown */}
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        border: "1px solid #EEE9E2",
        padding: "20px 24px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A", marginBottom: "14px" }}>פירוט הכנסות</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
          {[
            { label: "הכנסות ממקורות (גפן/עירייה)", value: incomeTotals.fromIncome, accent: false },
            { label: "גבייה מהורים",                value: incomeTotals.fromParentCollections, accent: false },
            { label: "סה״כ הכנסות",                 value: incomeTotals.grand, accent: true },
          ].map((item) => (
            <div key={item.label} style={{
              background: item.accent ? "linear-gradient(135deg, #EDFBF3, #D4F0DF)" : "#FAFAF8",
              borderRadius: "11px",
              padding: "14px 18px",
              border: item.accent ? "1px solid #C6E8D0" : "1px solid #EEE9E2",
            }}>
              <div style={{ fontSize: "11px", color: "#6B7A72", marginBottom: "6px", fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontWeight: 700, fontSize: "19px", color: item.accent ? "#2D6644" : "#1A1A1A" }}>
                {fmt(item.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Horim Report ───────────────────────────────────────────────────────────

function HorimReport() {
  const { data: grades = [],      isLoading } = useGrades();
  const { data: sections = [] }               = useParentSections();
  const { data: amounts = [] }                = useGradeSectionAmounts();
  const { data: collections = [] }            = useParentCollections();

  if (isLoading) return <Loader />;
  if (grades.length === 0) return <EmptyState text="אין שכבות — הגדר שכבות במסך ההגדרות" />;

  const rows = grades.map((grade) => {
    const gradeAmounts = amounts.filter((a) => a.grade_id === grade.id);
    const target = sections.reduce((sum, sec) => {
      const gsa = gradeAmounts.find((a) => a.parent_section_id === sec.id);
      return sum + computeTarget(grade, gsa);
    }, 0);
    const collected = collections.filter((c) => c.grade_id === grade.id).reduce((s, c) => s + c.amount, 0);
    const remaining = target - collected;
    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    return { grade, target, collected, remaining, pct };
  });

  const totalTarget    = rows.reduce((s, r) => s + r.target, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalRemaining = totalTarget - totalCollected;
  const totalPct       = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "יעד גבייה",  value: totalTarget,    color: "#1A1A1A", bg: "#FAFAF8",     border: "#EEE9E2" },
          { label: "נגבה",       value: totalCollected, color: "#2D6644", bg: "#EDFBF3",     border: "#C6E8D0" },
          { label: "טרם נגבה",   value: totalRemaining, color: totalRemaining > 0 ? "#B5472A" : "#2D6644", bg: totalRemaining > 0 ? "#FDF1EA" : "#EDFBF3", border: totalRemaining > 0 ? "#EDCFC6" : "#C6E8D0" },
        ].map((c) => (
          <div key={c.label} style={{
            background: c.bg,
            borderRadius: "14px",
            border: `1px solid ${c.border}`,
            padding: "18px 22px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: "11px", color: "#6B7A72", fontWeight: 500, marginBottom: "6px" }}>{c.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: c.color }}>{fmt(c.value)}</div>
            {c.label === "נגבה" && (
              <div style={{ marginTop: "8px" }}>
                <PctBar pct={totalPct} color="#2D6644" />
                <div style={{ fontSize: "11px", color: "#6B7A72", marginTop: "4px" }}>{totalPct}% מהיעד</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Per-grade table */}
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        border: "1px solid #EEE9E2",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F4F1EC" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "#1A1A1A" }}>גבייה לפי שכבה</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#FAFAF8" }}>
            <tr>
              <th style={th}>שכבה</th>
              <th style={thL}>תלמידים</th>
              <th style={thL}>יעד גבייה</th>
              <th style={thL}>נגבה</th>
              <th style={thL}>נותר</th>
              <th style={{ ...thL, minWidth: "140px" }}>התקדמות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ grade, target, collected, remaining, pct }) => (
              <tr key={grade.id}>
                <td style={{ ...td, fontWeight: 600 }}>{grade.name}</td>
                <td style={{ ...tdL, color: "#6B7A72" }}>{grade.student_count}</td>
                <td style={tdL}>{fmt(target)}</td>
                <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(collected)}</td>
                <td style={{
                  ...tdL, fontWeight: 600,
                  color: remaining <= 0 ? "#2D6644" : remaining < target * 0.2 ? "#E67E22" : "#B5472A",
                }}>
                  {remaining <= 0
                    ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 600 }}>✓ הושלם</span>
                    : fmt(remaining)}
                </td>
                <td style={tdL}>
                  <div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{pct}%</div>
                  <PctBar pct={pct} color="#8B2F6E" />
                </td>
              </tr>
            ))}

            {/* Totals */}
            <tr style={{ background: "#F7F4EF" }}>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
              <td style={{ ...tdL, fontWeight: 700, color: "#6B7A72" }}>
                {grades.reduce((s, g) => s + g.student_count, 0)}
              </td>
              <td style={{ ...tdL, fontWeight: 700 }}>{fmt(totalTarget)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(totalCollected)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: totalRemaining <= 0 ? "#2D6644" : "#B5472A" }}>
                {fmt(totalRemaining)}
              </td>
              <td style={tdL}>
                <div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{totalPct}%</div>
                <PctBar pct={totalPct} color="#8B2F6E" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Micro helpers ───────────────────────────────────────────────────────────

function Loader() {
  return <div style={{ color: "#6B7A72", padding: "32px", fontSize: "14px", textAlign: "center" }}>טוען...</div>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "16px",
      border: "1px solid #EEE9E2",
      padding: "60px 24px",
      textAlign: "center",
      color: "#6B7A72",
      fontSize: "14px",
    }}>
      {text}
    </div>
  );
}
