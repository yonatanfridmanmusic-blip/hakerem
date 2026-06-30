import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDashboardSummary, type DashboardSummary } from "@/hooks/use-dashboard-summary";
import {
  useGrades, useParentSections, useGradeSectionAmounts,
  useParentCollections, computeTarget,
  type Grade, type ParentSection, type GradeSectionAmount, type ParentCollection,
} from "@/hooks/use-horim";
import {
  usePeriodicReport, useActiveSchoolYearMeta,
  getMonthRanges, getQuarterRanges,
  type PeriodicSummary, type DateRange,
} from "@/hooks/use-periodic-report";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

type Tab = "annual" | "horim" | "periodic";
type PeriodType = "monthly" | "quarterly" | "custom";

// ─── Formatting ───────────────────────────────────────────────────────────────

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");
const toDate = () => new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });

const SOURCE_CFG = {
  gefen:  { label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534" },
  iriyah: { label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010" },
  horim:  { label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356" },
} as const;

// ─── Shared table styles ──────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: "11px 18px", textAlign: "right", fontSize: "11px", fontWeight: 600,
  color: "#6B7A72", borderBottom: "1px solid #EEE9E2", whiteSpace: "nowrap",
  letterSpacing: "0.03em", textTransform: "uppercase",
};
const td: React.CSSProperties = { padding: "13px 18px", textAlign: "right", fontSize: "13.5px", color: "#1A1A1A", borderBottom: "1px solid #F4F1EC" };
const tdL: React.CSSProperties = { ...td, textAlign: "left" };
const thL: React.CSSProperties = { ...th, textAlign: "left" };

function PctBar({ pct, color }: { pct: number; color?: string }) {
  const c = Math.min(pct, 100);
  const fill = pct > 100 ? "#C0392B" : pct > 80 ? "#E67E22" : (color ?? "#2D6644");
  return (
    <div style={{ background: "#EFEFEF", borderRadius: "6px", height: "7px", width: "100%", marginTop: "5px" }}>
      <div style={{ width: `${c}%`, height: "100%", borderRadius: "6px", background: fill, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Rubik',sans-serif; direction:rtl; color:#1A1A1A; background:white; font-size:12.5px; line-height:1.55; }
  .page-header { background:linear-gradient(160deg,#1A3D2B 0%,#0F2419 100%); color:white; padding:26px 36px; display:flex; justify-content:space-between; align-items:flex-end; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page-header h1 { font-size:21px; font-weight:700; margin:4px 0; }
  .page-header .sub { font-size:11px; color:rgba(255,255,255,0.5); }
  .page-header .meta { text-align:left; font-size:10.5px; color:rgba(255,255,255,0.45); line-height:1.7; }
  .content { padding:26px 36px; }
  h2 { font-size:14px; font-weight:700; color:#1A1A1A; margin-bottom:13px; border-bottom:2px solid #EEE9E2; padding-bottom:7px; }
  .kpi-grid { display:grid; gap:12px; margin-bottom:22px; }
  .kpi-4 { grid-template-columns:repeat(4,1fr); } .kpi-3 { grid-template-columns:repeat(3,1fr); }
  .kpi-card { background:#FAFAF8; border:1px solid #EEE9E2; border-radius:10px; padding:13px 15px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .kpi-label { font-size:9.5px; color:#6B7A72; font-weight:500; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.04em; }
  .kpi-value { font-size:19px; font-weight:700; } .kpi-sub { font-size:10px; color:#9BA8A2; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin-bottom:22px; }
  thead { background:#F7F4EF; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  th { padding:9px 13px; text-align:right; font-size:10px; font-weight:600; color:#6B7A72; border-bottom:2px solid #E8E2D9; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap; }
  th.l { text-align:left; } td { padding:10px 13px; text-align:right; font-size:12px; border-bottom:1px solid #F4F1EC; } td.l { text-align:left; }
  .total-row { background:#F0EDE8; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-weight:700; }
  .badge { display:inline-block; padding:2px 9px; border-radius:6px; font-size:11px; font-weight:600; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bar-wrap { background:#E8E8E8; border-radius:4px; height:6px; width:100%; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bar-fill { height:100%; border-radius:4px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bar-label { font-size:10.5px; color:#6B7A72; margin-bottom:3px; }
  .income-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:14px; }
  .income-card { background:#FAFAF8; border:1px solid #EEE9E2; border-radius:10px; padding:13px 15px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .income-card.accent { background:linear-gradient(135deg,#EDFBF3,#D4F0DF); border-color:#C6E8D0; }
  .green{color:#2D6644;} .rust{color:#B5472A;} .plum{color:#8B2F6E;}
  .done-badge { background:#EDFBF3; color:#2D6644; border-radius:5px; padding:2px 7px; font-size:10.5px; font-weight:600; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .divider { border:none; border-top:1px solid #EEE9E2; margin:20px 0; }
  .footer { margin-top:28px; padding-top:10px; border-top:1px solid #EEE9E2; font-size:9.5px; color:#AAB4AE; text-align:center; }
  @media print { @page { margin:12mm 14mm; size:A4; } body { font-size:11px; } .kpi-value { font-size:16px; } }
`;

// ─── HTML builders ────────────────────────────────────────────────────────────

function buildAnnualHTML(data: DashboardSummary): string {
  const { schoolYear, sources, totals, incomeTotals } = data;
  const yearName = schoolYear?.name ?? "";
  const sourceRows = sources.map((s) => {
    const cfg = SOURCE_CFG[s.source as keyof typeof SOURCE_CFG];
    const balance = s.planned - s.used;
    const pct = s.planned > 0 ? Math.round((s.used / s.planned) * 100) : 0;
    const barColor = pct > 100 ? "#C0392B" : pct > 80 ? "#E67E22" : cfg.color;
    return `<tr><td><span class="badge" style="background:${cfg.bg};color:${cfg.textColor}">${cfg.label}</span></td><td class="l">${fmt(s.planned)}</td><td class="l green" style="font-weight:600">${fmt(s.income)}</td><td class="l">${fmt(s.used)}</td><td class="l" style="font-weight:700;color:${balance >= 0 ? "#2D6644" : "#B5472A"}">${fmt(balance)}</td><td class="l" style="min-width:110px"><div class="bar-label">${pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div></div></td></tr>`;
  }).join("");
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח שנתי – ${yearName}</title><style>${PRINT_CSS}</style></head><body>
  <div class="page-header"><div><div class="sub">הכרם · ניהול פיננסי בית ספרי</div><h1>דוח שנתי</h1><div class="sub" style="margin-top:2px">${yearName}</div></div><div class="meta"><div>תאריך הפקה</div><div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">${toDate()}</div></div></div>
  <div class="content">
    <h2>סיכום תקציבי</h2>
    <div class="kpi-grid kpi-4">
      <div class="kpi-card"><div class="kpi-label">סה"כ מתוכנן</div><div class="kpi-value">${fmt(totals.planned)}</div><div class="kpi-sub">תקציב שנתי</div></div>
      <div class="kpi-card" style="border-color:#EDCFC6"><div class="kpi-label">סה"כ הוצאות</div><div class="kpi-value rust">${fmt(totals.used)}</div><div class="kpi-sub">${totals.pct}% מהתקציב</div></div>
      <div class="kpi-card" style="border-color:#C6E8D0"><div class="kpi-label">הכנסות שנרשמו</div><div class="kpi-value green">${fmt(incomeTotals.grand)}</div><div class="kpi-sub">כולל גבייה</div></div>
      <div class="kpi-card" style="border-color:${totals.balance >= 0 ? "#C6E8D0" : "#EDCFC6"}"><div class="kpi-label">יתרת תקציב</div><div class="kpi-value ${totals.balance >= 0 ? "green" : "rust"}">${fmt(totals.balance)}</div><div class="kpi-sub">${totals.balance >= 0 ? "עודף" : "גרעון"}</div></div>
    </div>
    <h2>פירוט לפי מקור תקציב</h2>
    <table><thead><tr><th>מקור</th><th class="l">מתוכנן</th><th class="l">הכנסות</th><th class="l">הוצאות</th><th class="l">יתרה</th><th class="l">ניצול</th></tr></thead>
    <tbody>${sourceRows}<tr class="total-row"><td>סה"כ</td><td class="l">${fmt(totals.planned)}</td><td class="l green">${fmt(incomeTotals.grand)}</td><td class="l">${fmt(totals.used)}</td><td class="l" style="color:${totals.balance >= 0 ? "#2D6644" : "#B5472A"}">${fmt(totals.balance)}</td><td class="l"><div class="bar-label">${totals.pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(totals.pct, 100)}%;background:#2D6644"></div></div></td></tr></tbody></table>
    <hr class="divider">
    <h2>פירוט הכנסות</h2>
    <div class="income-grid">
      <div class="income-card"><div class="kpi-label">הכנסות ממקורות (גפן / עירייה)</div><div class="kpi-value">${fmt(incomeTotals.fromIncome)}</div></div>
      <div class="income-card"><div class="kpi-label">גבייה מהורים</div><div class="kpi-value plum">${fmt(incomeTotals.fromParentCollections)}</div></div>
      <div class="income-card accent"><div class="kpi-label">סה"כ הכנסות</div><div class="kpi-value green">${fmt(incomeTotals.grand)}</div></div>
    </div>
    <div class="footer">הכרם — מערכת ניהול פיננסי לבתי ספר · נוצר אוטומטית ${toDate()}</div>
  </div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),600));</script></body></html>`;
}

function buildHorimHTML(grades: Grade[], sections: ParentSection[], amounts: GradeSectionAmount[], collections: ParentCollection[], yearName: string): string {
  const rows = grades.map((grade) => {
    const ga = amounts.filter((a) => a.grade_id === grade.id);
    const target = sections.reduce((s, sec) => s + computeTarget(grade, ga.find((a) => a.parent_section_id === sec.id)), 0);
    const collected = collections.filter((c) => c.grade_id === grade.id).reduce((s, c) => s + c.amount, 0);
    const remaining = target - collected;
    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    const barColor = pct >= 100 ? "#2D6644" : pct > 80 ? "#E67E22" : "#8B2F6E";
    return `<tr><td style="font-weight:600">${grade.name}</td><td class="l" style="color:#6B7A72">${grade.student_count}</td><td class="l">${fmt(target)}</td><td class="l green" style="font-weight:600">${fmt(collected)}</td><td class="l" style="font-weight:700;color:${remaining <= 0 ? "#2D6644" : "#B5472A"}">${remaining <= 0 ? '<span class="done-badge">✓ הושלם</span>' : fmt(remaining)}</td><td class="l" style="min-width:110px"><div class="bar-label">${pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div></div></td></tr>`;
  }).join("");
  const tT = grades.map((g) => { const ga = amounts.filter((a) => a.grade_id === g.id); return sections.reduce((s, sec) => s + computeTarget(g, ga.find((a) => a.parent_section_id === sec.id)), 0); }).reduce((a, b) => a + b, 0);
  const tC = collections.reduce((s, c) => s + c.amount, 0);
  const tR = tT - tC;
  const tP = tT > 0 ? Math.round((tC / tT) * 100) : 0;
  const tS = grades.reduce((s, g) => s + g.student_count, 0);
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>גבייה מהורים – ${yearName}</title><style>${PRINT_CSS}</style></head><body>
  <div class="page-header"><div><div class="sub">הכרם · ניהול פיננסי בית ספרי</div><h1>דוח גבייה מהורים</h1><div class="sub" style="margin-top:2px">${yearName}</div></div><div class="meta"><div>תאריך הפקה</div><div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">${toDate()}</div></div></div>
  <div class="content">
    <h2>סיכום גבייה</h2>
    <div class="kpi-grid kpi-3">
      <div class="kpi-card"><div class="kpi-label">יעד גבייה</div><div class="kpi-value">${fmt(tT)}</div><div class="kpi-sub">${tS} תלמידים</div></div>
      <div class="kpi-card" style="background:#EDFBF3;border-color:#C6E8D0"><div class="kpi-label">נגבה עד כה</div><div class="kpi-value green">${fmt(tC)}</div><div style="margin-top:8px"><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(tP, 100)}%;background:#2D6644"></div></div><div style="font-size:10px;color:#4A6656;margin-top:3px;font-weight:500">${tP}% מהיעד</div></div></div>
      <div class="kpi-card" style="background:${tR <= 0 ? "#EDFBF3" : "#FDF1EA"};border-color:${tR <= 0 ? "#C6E8D0" : "#EDCFC6"}"><div class="kpi-label">טרם נגבה</div><div class="kpi-value ${tR <= 0 ? "green" : "rust"}">${fmt(tR)}</div></div>
    </div>
    <h2>פירוט לפי שכבה</h2>
    <table><thead><tr><th>שכבה</th><th class="l">תלמידים</th><th class="l">יעד</th><th class="l">נגבה</th><th class="l">טרם נגבה</th><th class="l">התקדמות</th></tr></thead>
    <tbody>${rows}<tr class="total-row"><td>סה"כ</td><td class="l" style="color:#6B7A72">${tS}</td><td class="l">${fmt(tT)}</td><td class="l green">${fmt(tC)}</td><td class="l" style="color:${tR <= 0 ? "#2D6644" : "#B5472A"}">${fmt(tR)}</td><td class="l"><div class="bar-label">${tP}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(tP, 100)}%;background:#8B2F6E"></div></div></td></tr></tbody></table>
    <div class="footer">הכרם — מערכת ניהול פיננסי לבתי ספר · נוצר אוטומטית ${toDate()}</div>
  </div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),600));</script></body></html>`;
}

function buildPeriodicHTML(data: PeriodicSummary, periodLabel: string, yearName: string): string {
  const { sources, totals } = data;
  const sourceRows = sources.map((s) => {
    const cfg = SOURCE_CFG[s.source as keyof typeof SOURCE_CFG];
    const barColor = s.expenses > s.income ? "#B5472A" : cfg.color;
    return `<tr><td><span class="badge" style="background:${cfg.bg};color:${cfg.textColor}">${cfg.label}</span></td><td class="l green" style="font-weight:600">${fmt(s.income)}</td><td class="l">${fmt(s.expenses)}</td><td class="l" style="font-weight:700;color:${s.net >= 0 ? "#2D6644" : "#B5472A"}">${fmt(s.net)}</td></tr>`;
  }).join("");
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח תקופתי – ${periodLabel}</title><style>${PRINT_CSS}</style></head><body>
  <div class="page-header"><div><div class="sub">הכרם · ניהול פיננסי בית ספרי</div><h1>דוח תקופתי</h1><div class="sub" style="margin-top:2px">${periodLabel} · ${yearName}</div></div><div class="meta"><div>תאריך הפקה</div><div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">${toDate()}</div></div></div>
  <div class="content">
    <h2>סיכום תקופה</h2>
    <div class="kpi-grid kpi-4">
      <div class="kpi-card" style="border-color:#C6E8D0"><div class="kpi-label">הכנסות בתקופה</div><div class="kpi-value green">${fmt(totals.income)}</div><div class="kpi-sub">ממקורות</div></div>
      <div class="kpi-card" style="border-color:#DDD0E8"><div class="kpi-label">גבייה מהורים</div><div class="kpi-value plum">${fmt(totals.parentCollections)}</div></div>
      <div class="kpi-card" style="border-color:#EDCFC6"><div class="kpi-label">הוצאות בתקופה</div><div class="kpi-value rust">${fmt(totals.expenses)}</div></div>
      <div class="kpi-card" style="border-color:${totals.net >= 0 ? "#C6E8D0" : "#EDCFC6"}"><div class="kpi-label">מאזן תקופה</div><div class="kpi-value ${totals.net >= 0 ? "green" : "rust"}">${fmt(totals.net)}</div><div class="kpi-sub">${totals.net >= 0 ? "עודף" : "גרעון"}</div></div>
    </div>
    <h2>פירוט לפי מקור</h2>
    <table><thead><tr><th>מקור</th><th class="l">הכנסות</th><th class="l">הוצאות</th><th class="l">מאזן</th></tr></thead>
    <tbody>${sourceRows}<tr class="total-row"><td>סה"כ</td><td class="l green">${fmt(totals.totalIncome)}</td><td class="l">${fmt(totals.expenses)}</td><td class="l" style="color:${totals.net >= 0 ? "#2D6644" : "#B5472A"}">${fmt(totals.net)}</td></tr></tbody></table>
    <div class="footer">הכרם — מערכת ניהול פיננסי לבתי ספר · נוצר אוטומטית ${toDate()}</div>
  </div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),600));</script></body></html>`;
}

// ─── Open print window ────────────────────────────────────────────────────────

function openPrint(html: string) {
  const win = window.open("", "_blank", "width=960,height=720,menubar=yes,toolbar=yes");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ReportsPage() {
  const [tab, setTab] = useState<Tab>("annual");

  const annualQuery   = useDashboardSummary();
  const gradesQuery   = useGrades();
  const sectionsQuery = useParentSections();
  const amountsQuery  = useGradeSectionAmounts();
  const collectQuery  = useParentCollections();

  // Periodic state
  const [periodType, setPeriodType]   = useState<PeriodType>("monthly");
  const [selectedRange, setRange]     = useState<DateRange | null>(null);
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");

  const { data: yearMeta } = useActiveSchoolYearMeta();

  const periodicFrom = periodType === "custom" ? (customFrom || null) : (selectedRange?.from ?? null);
  const periodicTo   = periodType === "custom" ? (customTo   || null) : (selectedRange?.to   ?? null);
  const { data: periodicData, isLoading: periodicLoading } = usePeriodicReport(periodicFrom, periodicTo);

  const monthRanges   = yearMeta?.start_date && yearMeta.end_date ? getMonthRanges(yearMeta.start_date, yearMeta.end_date)   : [];
  const quarterRanges = yearMeta?.start_date                       ? getQuarterRanges(yearMeta.start_date)                    : [];

  function handlePrint() {
    if (tab === "annual") {
      if (!annualQuery.data) return;
      openPrint(buildAnnualHTML(annualQuery.data));
    } else if (tab === "horim") {
      openPrint(buildHorimHTML(
        gradesQuery.data   ?? [],
        sectionsQuery.data  ?? [],
        amountsQuery.data   ?? [],
        collectQuery.data   ?? [],
        annualQuery.data?.schoolYear?.name ?? "",
      ));
    } else if (tab === "periodic" && periodicData) {
      const label = periodType === "custom"
        ? `${customFrom} — ${customTo}`
        : (selectedRange?.label ?? "תקופה נבחרת");
      openPrint(buildPeriodicHTML(periodicData, label, annualQuery.data?.schoolYear?.name ?? ""));
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "annual",   label: "דוח שנתי"    },
    { key: "horim",    label: "גבייה מהורים" },
    { key: "periodic", label: "דוח תקופתי"  },
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{ background: "linear-gradient(160deg, #1A3D2B 0%, #0F2419 55%, #081510 100%)", borderRadius: "20px", padding: "28px 32px", marginBottom: "28px", boxShadow: "0 8px 32px rgba(15,36,25,0.4)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", letterSpacing: "0.07em", textTransform: "uppercase" }}>ניתוח נתונים</div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>דוחות</h1>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>שנתי · גבייה מהורים · חודשי / רבעוני</div>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          style={{ background: "#FFFFFF", color: "#1A3D2B", border: "none", borderRadius: "11px", padding: "12px 22px", fontSize: "13.5px", fontWeight: 700, cursor: "pointer", fontFamily: "Rubik, sans-serif", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}
        >
          <span style={{ fontSize: "16px" }}>📄</span> ייצוא PDF
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px", background: "#E8EDE9", borderRadius: "12px", padding: "4px", width: "fit-content" }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{ padding: "9px 24px", borderRadius: "9px", border: "none", fontSize: "13.5px", fontWeight: tab === t.key ? 600 : 400, background: tab === t.key ? "linear-gradient(135deg, #2D6644, #1A3D2B)" : "transparent", color: tab === t.key ? "#fff" : "#4A6656", cursor: "pointer", fontFamily: "Rubik, sans-serif", boxShadow: tab === t.key ? "0 2px 8px rgba(26,61,43,0.25)" : "none", transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "annual"   && <AnnualReport   data={annualQuery.data} isLoading={annualQuery.isLoading} />}
      {tab === "horim"    && <HorimReport    grades={gradesQuery.data ?? []} sections={sectionsQuery.data ?? []} amounts={amountsQuery.data ?? []} collections={collectQuery.data ?? []} isLoading={gradesQuery.isLoading} />}
      {tab === "periodic" && (
        <PeriodicReport
          periodType={periodType}
          onPeriodType={(pt) => { setPeriodType(pt); setRange(null); }}
          monthRanges={monthRanges}
          quarterRanges={quarterRanges}
          selectedRange={selectedRange}
          onSelectRange={setRange}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
          data={periodicData ?? null}
          isLoading={periodicLoading}
          hasQuery={!!(periodicFrom && periodicTo)}
        />
      )}
    </div>
  );
}

// ─── Annual Report ────────────────────────────────────────────────────────────

function AnnualReport({ data, isLoading }: { data: DashboardSummary | undefined; isLoading: boolean }) {
  if (isLoading) return <Loader />;
  if (!data?.schoolYear) return <EmptyState text="אין שנת לימודים פעילה" />;
  const { sources, totals, incomeTotals } = data;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "סה״כ מתוכנן",   value: totals.planned,     color: "#1A1A1A", sub: "תקציב שנתי",            border: "#EEE9E2", bg: "#FAFAF8" },
          { label: "סה״כ הוצאות",   value: totals.used,        color: "#B5472A", sub: `${totals.pct}% מהתקציב`,border: "#EDCFC6", bg: "#FDF9F8" },
          { label: "הכנסות שנרשמו", value: incomeTotals.grand, color: "#2D6644", sub: "כולל גבייה",             border: "#C6E8D0", bg: "#F4FBF7" },
          { label: "יתרת תקציב",    value: totals.balance,     color: totals.balance >= 0 ? "#2D6644" : "#B5472A", sub: totals.balance >= 0 ? "עודף" : "גרעון", border: totals.balance >= 0 ? "#C6E8D0" : "#EDCFC6", bg: totals.balance >= 0 ? "#F4FBF7" : "#FDF9F8" },
        ].map((k) => (
          <div key={k.label} style={{ background: k.bg, borderRadius: "14px", border: `1px solid ${k.border}`, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "11px", color: "#6B7A72", fontWeight: 500, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{k.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: k.color, marginBottom: "3px" }}>{fmt(k.value)}</div>
            <div style={{ fontSize: "11.5px", color: "#9BA8A2" }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "18px" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #F4F1EC" }}><div style={{ fontWeight: 700, fontSize: "14.5px", color: "#1A1A1A" }}>פירוט לפי מקור תקציב</div></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#FAFAF8" }}><tr><th style={th}>מקור</th><th style={thL}>מתוכנן</th><th style={thL}>הכנסות</th><th style={thL}>הוצאות</th><th style={thL}>יתרה</th><th style={{ ...thL, minWidth: "140px" }}>ניצול</th></tr></thead>
          <tbody>
            {sources.map((s) => {
              const cfg = SOURCE_CFG[s.source as keyof typeof SOURCE_CFG];
              const balance = s.planned - s.used;
              const pct = s.planned > 0 ? Math.round((s.used / s.planned) * 100) : 0;
              return (
                <tr key={s.source}>
                  <td style={td}><span style={{ background: cfg.bg, color: cfg.textColor, borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 600 }}>{cfg.label}</span></td>
                  <td style={tdL}>{fmt(s.planned)}</td>
                  <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(s.income)}</td>
                  <td style={tdL}>{fmt(s.used)}</td>
                  <td style={{ ...tdL, fontWeight: 700, color: balance >= 0 ? "#2D6644" : "#B5472A" }}>{fmt(balance)}</td>
                  <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{pct}%</div><PctBar pct={pct} color={cfg.color} /></td>
                </tr>
              );
            })}
            <tr style={{ background: "#F7F4EF" }}>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
              <td style={{ ...tdL, fontWeight: 700 }}>{fmt(totals.planned)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(incomeTotals.grand)}</td>
              <td style={{ ...tdL, fontWeight: 700 }}>{fmt(totals.used)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: totals.balance >= 0 ? "#2D6644" : "#B5472A" }}>{fmt(totals.balance)}</td>
              <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{totals.pct}%</div><PctBar pct={totals.pct} /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A", marginBottom: "14px" }}>פירוט הכנסות</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
          {[
            { label: "הכנסות ממקורות (גפן / עירייה)", value: incomeTotals.fromIncome, accent: false },
            { label: "גבייה מהורים",                  value: incomeTotals.fromParentCollections, accent: false },
            { label: "סה״כ הכנסות",                   value: incomeTotals.grand, accent: true },
          ].map((item) => (
            <div key={item.label} style={{ background: item.accent ? "linear-gradient(135deg,#EDFBF3,#D4F0DF)" : "#FAFAF8", borderRadius: "11px", padding: "14px 18px", border: item.accent ? "1px solid #C6E8D0" : "1px solid #EEE9E2" }}>
              <div style={{ fontSize: "11px", color: "#6B7A72", marginBottom: "6px", fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontWeight: 700, fontSize: "19px", color: item.accent ? "#2D6644" : "#1A1A1A" }}>{fmt(item.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Horim Report ─────────────────────────────────────────────────────────────

function HorimReport({ grades, sections, amounts, collections, isLoading }: { grades: Grade[]; sections: ParentSection[]; amounts: GradeSectionAmount[]; collections: ParentCollection[]; isLoading: boolean }) {
  if (isLoading) return <Loader />;
  if (grades.length === 0) return <EmptyState text="אין שכבות — הגדר שכבות במסך ההגדרות" />;
  const rows = grades.map((grade) => {
    const ga = amounts.filter((a) => a.grade_id === grade.id);
    const target = sections.reduce((s, sec) => s + computeTarget(grade, ga.find((a) => a.parent_section_id === sec.id)), 0);
    const collected = collections.filter((c) => c.grade_id === grade.id).reduce((s, c) => s + c.amount, 0);
    const remaining = target - collected;
    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    return { grade, target, collected, remaining, pct };
  });
  const tT = rows.reduce((s, r) => s + r.target, 0);
  const tC = rows.reduce((s, r) => s + r.collected, 0);
  const tR = tT - tC;
  const tP = tT > 0 ? Math.round((tC / tT) * 100) : 0;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "יעד גבייה", value: tT, color: "#1A1A1A", bg: "#FAFAF8", border: "#EEE9E2", extra: null },
          { label: "נגבה",      value: tC, color: "#2D6644", bg: "#EDFBF3", border: "#C6E8D0", extra: tP },
          { label: "טרם נגבה",  value: tR, color: tR > 0 ? "#B5472A" : "#2D6644", bg: tR > 0 ? "#FDF1EA" : "#EDFBF3", border: tR > 0 ? "#EDCFC6" : "#C6E8D0", extra: null },
        ].map((c) => (
          <div key={c.label} style={{ background: c.bg, borderRadius: "14px", border: `1px solid ${c.border}`, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: "11px", color: "#6B7A72", fontWeight: 500, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{c.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: c.color }}>{fmt(c.value)}</div>
            {c.extra !== null && <div style={{ marginTop: "9px" }}><PctBar pct={tP} color="#2D6644" /><div style={{ fontSize: "11px", color: "#4A6656", marginTop: "4px", fontWeight: 500 }}>{tP}% מהיעד</div></div>}
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #F4F1EC" }}><div style={{ fontWeight: 700, fontSize: "14.5px", color: "#1A1A1A" }}>גבייה לפי שכבה</div></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#FAFAF8" }}><tr><th style={th}>שכבה</th><th style={thL}>תלמידים</th><th style={thL}>יעד גבייה</th><th style={thL}>נגבה</th><th style={thL}>טרם נגבה</th><th style={{ ...thL, minWidth: "140px" }}>התקדמות</th></tr></thead>
          <tbody>
            {rows.map(({ grade, target, collected, remaining, pct }) => (
              <tr key={grade.id}>
                <td style={{ ...td, fontWeight: 600 }}>{grade.name}</td>
                <td style={{ ...tdL, color: "#6B7A72" }}>{grade.student_count}</td>
                <td style={tdL}>{fmt(target)}</td>
                <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(collected)}</td>
                <td style={{ ...tdL, fontWeight: 700, color: remaining <= 0 ? "#2D6644" : "#B5472A" }}>
                  {remaining <= 0 ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 600 }}>✓ הושלם</span> : fmt(remaining)}
                </td>
                <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{pct}%</div><PctBar pct={pct} color="#8B2F6E" /></td>
              </tr>
            ))}
            <tr style={{ background: "#F7F4EF" }}>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
              <td style={{ ...tdL, fontWeight: 700, color: "#6B7A72" }}>{grades.reduce((s, g) => s + g.student_count, 0)}</td>
              <td style={{ ...tdL, fontWeight: 700 }}>{fmt(tT)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(tC)}</td>
              <td style={{ ...tdL, fontWeight: 700, color: tR <= 0 ? "#2D6644" : "#B5472A" }}>{fmt(tR)}</td>
              <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{tP}%</div><PctBar pct={tP} color="#8B2F6E" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Periodic Report ──────────────────────────────────────────────────────────

function PeriodicReport({
  periodType, onPeriodType,
  monthRanges, quarterRanges,
  selectedRange, onSelectRange,
  customFrom, customTo, onCustomFrom, onCustomTo,
  data, isLoading, hasQuery,
}: {
  periodType: PeriodType; onPeriodType: (pt: PeriodType) => void;
  monthRanges: DateRange[]; quarterRanges: DateRange[];
  selectedRange: DateRange | null; onSelectRange: (r: DateRange) => void;
  customFrom: string; customTo: string;
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void;
  data: PeriodicSummary | null; isLoading: boolean; hasQuery: boolean;
}) {
  const periodTypeOptions: { key: PeriodType; label: string; emoji: string }[] = [
    { key: "monthly",   label: "חודשי",           emoji: "📅" },
    { key: "quarterly", label: "רבעוני",          emoji: "📊" },
    { key: "custom",    label: "תקופה מותאמת",   emoji: "🗓️" },
  ];

  const selectorCard: React.CSSProperties = {
    background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2",
    padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: "20px",
  };

  return (
    <div>
      {/* Period type selector */}
      <div style={selectorCard}>
        <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A", marginBottom: "14px" }}>בחר סוג תקופה</div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {periodTypeOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onPeriodType(opt.key)}
              style={{
                padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer",
                fontFamily: "Rubik, sans-serif", fontSize: "13px", fontWeight: periodType === opt.key ? 600 : 400,
                background: periodType === opt.key ? "linear-gradient(135deg, #2D6644, #1A3D2B)" : "#F2F5F3",
                color: periodType === opt.key ? "#fff" : "#4A6656",
                boxShadow: periodType === opt.key ? "0 2px 8px rgba(26,61,43,0.2)" : "none",
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              <span>{opt.emoji}</span> {opt.label}
            </button>
          ))}
        </div>

        {/* Month picker */}
        {periodType === "monthly" && (
          <div>
            <div style={{ fontSize: "12px", color: "#6B7A72", fontWeight: 500, marginBottom: "10px" }}>בחר חודש</div>
            {monthRanges.length === 0
              ? <div style={{ fontSize: "13px", color: "#9BA8A2" }}>הגדר תאריכי התחלה וסיום לשנת הלימודים בהגדרות</div>
              : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                  {monthRanges.map((r) => {
                    const active = selectedRange?.from === r.from;
                    return (
                      <button
                        key={r.from}
                        type="button"
                        onClick={() => onSelectRange(r)}
                        style={{
                          padding: "7px 14px", borderRadius: "8px", border: active ? "none" : "1px solid #D8E2DA",
                          cursor: "pointer", fontFamily: "Rubik, sans-serif", fontSize: "12.5px", fontWeight: active ? 600 : 400,
                          background: active ? "linear-gradient(135deg, #2D6644, #1A3D2B)" : "#F7FAF8",
                          color: active ? "#fff" : "#3A5544",
                          boxShadow: active ? "0 2px 6px rgba(26,61,43,0.2)" : "none",
                          transition: "all 0.12s",
                        }}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* Quarter picker */}
        {periodType === "quarterly" && (
          <div>
            <div style={{ fontSize: "12px", color: "#6B7A72", fontWeight: 500, marginBottom: "10px" }}>בחר רבעון</div>
            {quarterRanges.length === 0
              ? <div style={{ fontSize: "13px", color: "#9BA8A2" }}>הגדר תאריכי התחלה לשנת הלימודים בהגדרות</div>
              : (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {quarterRanges.map((r, i) => {
                    const active = selectedRange?.from === r.from;
                    return (
                      <button
                        key={r.from}
                        type="button"
                        onClick={() => onSelectRange(r)}
                        style={{
                          padding: "12px 20px", borderRadius: "11px", border: active ? "none" : "1px solid #D8E2DA",
                          cursor: "pointer", fontFamily: "Rubik, sans-serif", fontSize: "13px", fontWeight: active ? 600 : 400,
                          background: active ? "linear-gradient(135deg, #2D6644, #1A3D2B)" : "#F7FAF8",
                          color: active ? "#fff" : "#3A5544",
                          boxShadow: active ? "0 2px 8px rgba(26,61,43,0.2)" : "none",
                          transition: "all 0.12s", minWidth: "200px",
                        }}
                      >
                        <div style={{ fontWeight: active ? 700 : 600, marginBottom: "2px" }}>רבעון {["א׳","ב׳","ג׳","ד׳"][i]}</div>
                        <div style={{ fontSize: "11px", opacity: 0.75 }}>{r.label.split("·")[1]?.trim()}</div>
                      </button>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* Custom date range */}
        {periodType === "custom" && (
          <div>
            <div style={{ fontSize: "12px", color: "#6B7A72", fontWeight: 500, marginBottom: "10px" }}>בחר טווח תאריכים</div>
            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#6B7A72", marginBottom: "5px" }}>מתאריך</div>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => onCustomFrom(e.target.value)}
                  style={{ padding: "9px 13px", borderRadius: "9px", border: "1px solid #D8E2DA", fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none", color: "#1A1A1A", background: "#FAFAF8", cursor: "pointer" }}
                />
              </div>
              <div style={{ color: "#9BA8A2", fontSize: "18px", marginTop: "16px" }}>—</div>
              <div>
                <div style={{ fontSize: "11px", color: "#6B7A72", marginBottom: "5px" }}>עד תאריך</div>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => onCustomTo(e.target.value)}
                  style={{ padding: "9px 13px", borderRadius: "9px", border: "1px solid #D8E2DA", fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none", color: "#1A1A1A", background: "#FAFAF8", cursor: "pointer" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {!hasQuery && (
        <div style={{ background: "#F7FAF8", borderRadius: "16px", border: "1px solid #D8E2DA", padding: "48px 24px", textAlign: "center", color: "#6B7A72", fontSize: "14px" }}>
          בחר תקופה כדי להציג את הדוח
        </div>
      )}

      {hasQuery && isLoading && <Loader />}

      {hasQuery && !isLoading && data && (
        <div>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
            {[
              { label: "הכנסות בתקופה",  value: data.totals.income,             color: "#2D6644",                                bg: "#F4FBF7", border: "#C6E8D0", sub: "ממקורות" },
              { label: "גבייה מהורים",   value: data.totals.parentCollections,  color: "#8B2F6E",                                bg: "#F7F0F5", border: "#DDD0E8", sub: "תשלומים שנרשמו" },
              { label: "הוצאות בתקופה",  value: data.totals.expenses,           color: "#B5472A",                                bg: "#FDF9F8", border: "#EDCFC6", sub: "סה״כ הוצאות" },
              { label: "מאזן תקופה",     value: data.totals.net,                color: data.totals.net >= 0 ? "#2D6644" : "#B5472A", bg: data.totals.net >= 0 ? "#F4FBF7" : "#FDF9F8", border: data.totals.net >= 0 ? "#C6E8D0" : "#EDCFC6", sub: data.totals.net >= 0 ? "עודף" : "גרעון" },
            ].map((k) => (
              <div key={k.label} style={{ background: k.bg, borderRadius: "14px", border: `1px solid ${k.border}`, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: "11px", color: "#6B7A72", fontWeight: 500, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{k.label}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: k.color, marginBottom: "3px" }}>{fmt(k.value)}</div>
                <div style={{ fontSize: "11.5px", color: "#9BA8A2" }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Per-source table */}
          <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #F4F1EC" }}><div style={{ fontWeight: 700, fontSize: "14.5px", color: "#1A1A1A" }}>פירוט לפי מקור</div></div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#FAFAF8" }}>
                <tr>
                  <th style={th}>מקור</th>
                  <th style={thL}>הכנסות</th>
                  <th style={thL}>הוצאות</th>
                  <th style={thL}>מאזן</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => {
                  const cfg = SOURCE_CFG[s.source as keyof typeof SOURCE_CFG];
                  return (
                    <tr key={s.source}>
                      <td style={td}><span style={{ background: cfg.bg, color: cfg.textColor, borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 600 }}>{cfg.label}</span></td>
                      <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(s.income)}</td>
                      <td style={tdL}>{fmt(s.expenses)}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: s.net >= 0 ? "#2D6644" : "#B5472A" }}>{fmt(s.net)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#F7F4EF" }}>
                  <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
                  <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(data.totals.totalIncome)}</td>
                  <td style={{ ...tdL, fontWeight: 700 }}>{fmt(data.totals.expenses)}</td>
                  <td style={{ ...tdL, fontWeight: 700, color: data.totals.net >= 0 ? "#2D6644" : "#B5472A" }}>{fmt(data.totals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasQuery && !isLoading && data &&
        data.totals.expenses === 0 && data.totals.income === 0 && data.totals.parentCollections === 0 && (
        <div style={{ marginTop: "16px", background: "#F7FAF8", borderRadius: "12px", border: "1px solid #D8E2DA", padding: "20px 24px", textAlign: "center", color: "#6B7A72", fontSize: "13px" }}>
          לא נמצאו רשומות בתקופה הנבחרת
        </div>
      )}
    </div>
  );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────

function Loader() {
  return <div style={{ color: "#6B7A72", padding: "40px", fontSize: "14px", textAlign: "center" }}>טוען...</div>;
}
function EmptyState({ text }: { text: string }) {
  return <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", padding: "60px 24px", textAlign: "center", color: "#6B7A72", fontSize: "14px" }}>{text}</div>;
}
