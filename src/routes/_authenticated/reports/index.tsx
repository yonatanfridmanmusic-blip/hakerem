import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDashboardSummary, type DashboardSummary } from "@/hooks/use-dashboard-summary";
import { useOrgBudgetSources, FALLBACK_SOURCES } from "@/hooks/use-budget-sources";
import {
  useGrades, useParentSections, useGradeSectionAmounts,
  useParentCollections, computeTarget,
  type Grade, type ParentSection, type GradeSectionAmount, type ParentCollection,
} from "@/hooks/use-horim";
import {
  usePeriodicReport, usePeriodicCategoryReport, useActiveSchoolYearMeta,
  getMonthRanges, getQuarterRanges,
  type PeriodicSummary, type PeriodicCategory, type DateRange,
} from "@/hooks/use-periodic-report";
import { useAllBudgetCategoriesWithSpend, type CategoryReport } from "@/hooks/use-budget-plan";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

type Tab = "annual" | "horim" | "periodic";
type PeriodType = "monthly" | "quarterly" | "custom";

// ─── Formatting ───────────────────────────────────────────────────────────────

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");
const toDate = () => new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });

type SourceCfgEntry = { label: string; color: string; bg: string; textColor: string };
type SourceCfgMap = Record<string, SourceCfgEntry>;

// Static config for the 3 built-in sources — used as fallback / baseline
const BASE_SOURCE_CFG: SourceCfgMap = {
  gefen:  { label: "גפן",    color: "#2D6644", bg: "#EDFBF3", textColor: "#166534" },
  iriyah: { label: "עירייה", color: "#B5472A", bg: "#FDF1EA", textColor: "#7C3010" },
  horim:  { label: "הורים",  color: "#8B2F6E", bg: "#F4EBF2", textColor: "#6B2356" },
};
const NEUTRAL_CFG: SourceCfgEntry = { label: "", color: "#6B6560", bg: "#F5F5F2", textColor: "#6B6560" };

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
  html, body { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  body { font-family:'Rubik',sans-serif; direction:rtl; color:#1A1A1A; background:white; font-size:12.5px; line-height:1.55; }

  /* ── Action bar (screen only) ── */
  .print-bar {
    position:sticky; top:0; z-index:999;
    background:#fff; border-bottom:2px solid #E8EDE9;
    padding:12px 28px; display:flex; justify-content:space-between; align-items:center;
  }
  .print-bar-title { font-size:13px; font-weight:600; color:#4A6656; }
  .print-bar-hint { font-size:11px; color:#9BA8A2; margin-top:2px; }
  .btn-print {
    background:#1A3D2B; color:#fff; border:none; border-radius:9px;
    padding:10px 22px; font-family:'Rubik',sans-serif; font-size:13px; font-weight:700;
    cursor:pointer; display:flex; align-items:center; gap:7px;
    box-shadow:0 2px 8px rgba(26,61,43,0.3);
  }
  .btn-close {
    background:#F2F5F3; color:#4A6656; border:1px solid #D0DDD4; border-radius:9px;
    padding:10px 16px; font-family:'Rubik',sans-serif; font-size:13px; cursor:pointer; margin-right:8px;
  }
  @media print { .print-bar { display:none !important; } }

  /* ── Page header ── */
  .page-header {
    background:#1A3D2B; color:white; padding:24px 36px;
    display:flex; justify-content:space-between; align-items:flex-end;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .page-header h1 { font-size:20px; font-weight:700; margin:4px 0; }
  .page-header .sub { font-size:11px; color:rgba(255,255,255,0.55); }
  .page-header .meta { text-align:left; font-size:10.5px; color:rgba(255,255,255,0.5); line-height:1.8; }

  .content { padding:22px 36px; }
  h2 { font-size:13.5px; font-weight:700; color:#1A1A1A; margin-bottom:12px; border-bottom:2px solid #EEE9E2; padding-bottom:6px; }

  /* ── KPI cards — colored left border (works with or without bg-graphics) ── */
  .kpi-grid { display:grid; gap:11px; margin-bottom:20px; }
  .kpi-4 { grid-template-columns:repeat(4,1fr); }
  .kpi-3 { grid-template-columns:repeat(3,1fr); }
  .kpi-card {
    background:#FAFAF8; border:1px solid #E4EDE7;
    border-right:4px solid #2D6644;
    border-radius:10px; padding:12px 15px;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .kpi-label { font-size:9px; color:#6B7A72; font-weight:600; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.05em; }
  .kpi-value { font-size:18px; font-weight:700; }
  .kpi-sub { font-size:9.5px; color:#9BA8A2; margin-top:2px; }

  /* ── Table ── */
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  thead { background:#F5F2EC; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  th { padding:9px 13px; text-align:right; font-size:9.5px; font-weight:700; color:#5A6B62; border-bottom:2px solid #DDD8CF; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; }
  th.l { text-align:left; }
  td { padding:10px 13px; text-align:right; font-size:12px; border-bottom:1px solid #F0EDE8; }
  td.l { text-align:left; }
  .total-row { background:#EDE9E2 !important; font-weight:700; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  /* ── Source badge ── */
  .badge { display:inline-block; padding:2px 9px; border-radius:5px; font-size:10.5px; font-weight:700; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  /* ── Progress bar ── */
  .bar-wrap { background:#E2E8E4; border-radius:4px; height:5px; width:100%; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bar-fill { height:100%; border-radius:4px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bar-label { font-size:10px; color:#6B7A72; margin-bottom:2px; }

  /* ── Income breakdown ── */
  .income-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:11px; margin-top:12px; }
  .income-card { background:#FAFAF8; border:1px solid #E4EDE7; border-radius:10px; padding:12px 14px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .income-card.accent { background:#EEF8F3; border-color:#B8DFCA; border-right:4px solid #2D6644; }

  /* ── Utilities ── */
  .green { color:#2D6644; } .rust { color:#B5472A; } .plum { color:#8B2F6E; }
  .done-badge { background:#E8F7EF; color:#1D6640; border-radius:5px; padding:2px 7px; font-size:10px; font-weight:700; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .divider { border:none; border-top:1px solid #EEE9E2; margin:18px 0; }
  .footer { margin-top:24px; padding-top:10px; border-top:1px solid #E8EDE9; font-size:9px; color:#B0BAB4; text-align:center; }

  /* ── Section page breaks (print only) ── */
  .section-break { break-before: page; page-break-before: always; }

  @media print {
    @page { margin:15mm 18mm; size:A4; }
    body { font-size:11px; }
    .kpi-value { font-size:15px; }
    /* Cover page: header fills the first page */
    .page-header {
      min-height: 220mm;
      justify-content: center;
      break-after: page;
      page-break-after: always;
    }
    .section-break { padding-top: 8px; }
  }
`;

// ─── HTML builders ────────────────────────────────────────────────────────────

function buildAnnualHTML(
  data: DashboardSummary,
  cfgMap: SourceCfgMap,
  categories: CategoryReport[],
  grades: Grade[] = [],
  sections: ParentSection[] = [],
  amounts: GradeSectionAmount[] = [],
  collections: ParentCollection[] = [],
): string {
  const { schoolYear, sources, totals, incomeTotals } = data;
  const yearName = schoolYear?.name ?? "";
  const sourceRows = sources.map((s) => {
    const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.label };
    const balance = s.planned - s.used;
    const pct = s.planned > 0 ? Math.round((s.used / s.planned) * 100) : 0;
    const barColor = pct > 100 ? "#C0392B" : pct > 80 ? "#E67E22" : cfg.color;
    return `<tr><td><span class="badge" style="background:${cfg.bg};color:${cfg.textColor}">${cfg.label}</span></td><td class="l">${fmt(s.planned)}</td><td class="l green" style="font-weight:600">${fmt(s.income)}</td><td class="l">${fmt(s.used)}</td><td class="l" style="font-weight:700;color:${balance >= 0 ? "#2D6644" : "#B5472A"}">${fmt(balance)}</td><td class="l" style="min-width:110px"><div class="bar-label">${pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div></div></td></tr>`;
  }).join("");

  // Per-source category tables for PDF (skip horim — uses collections, not expenses)
  const catBySource = sources.map((s) => {
    if (s.source === "horim") return "";
    const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.label };
    const cats = categories.filter((c) => c.source === s.source);
    if (cats.length === 0) return "";
    const catRows = cats.map((c) => {
      const pct = c.planned > 0 ? Math.round((c.spent / c.planned) * 100) : 0;
      const barColor = pct > 100 ? "#C0392B" : pct > 80 ? "#E67E22" : cfg.color;
      return `<tr><td>${c.name}</td><td class="l">${fmt(c.planned)}</td><td class="l rust">${fmt(c.spent)}</td><td class="l" style="font-weight:700;color:${c.remaining >= 0 ? "#2D6644" : "#B5472A"}">${fmt(c.remaining)}</td><td class="l" style="min-width:100px"><div class="bar-label">${pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div></div></td></tr>`;
    }).join("");
    return `<div class="section-break"><h2 style="border-right:4px solid ${cfg.color};padding-right:10px">${cfg.label} — פירוט קטגוריות</h2>
    <table><thead><tr><th>קטגוריה</th><th class="l">תוכנן</th><th class="l">הוצאות</th><th class="l">נותר</th><th class="l">ניצול</th></tr></thead>
    <tbody>${catRows}</tbody></table></div>`;
  }).join("");

  // Horim: per-section then per-grade breakdown
  const horimDetail = sections.map((sec) => {
    const gradeData = grades.map((g) => {
      const a = amounts.find(am => am.grade_id === g.id && am.parent_section_id === sec.id);
      if (!a || a.amount_per_student === 0) return null;
      const t100 = a.amount_per_student * g.student_count;
      const t85 = t100 * 0.85;
      const coll = collections.filter(c => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
      const rem = Math.max(0, t85 - coll);
      const pct = t85 > 0 ? Math.round((coll / t85) * 100) : 0;
      return { g, t100, t85, coll, rem, pct };
    }).filter(Boolean) as { g: Grade; t100: number; t85: number; coll: number; rem: number; pct: number }[];
    if (gradeData.length === 0) return "";
    const totT100 = gradeData.reduce((s, r) => s + r.t100, 0);
    const totT85  = gradeData.reduce((s, r) => s + r.t85, 0);
    const totColl = gradeData.reduce((s, r) => s + r.coll, 0);
    const totRem  = Math.max(0, totT85 - totColl);
    const totPct  = totT85 > 0 ? Math.round((totColl / totT85) * 100) : 0;
    const gradeRowsHtml = gradeData.map(r =>
      `<tr><td style="font-weight:600">${r.g.name}</td><td class="l" style="color:#6B7A72">${r.g.student_count}</td><td class="l">${fmt(r.t100)}</td><td class="l" style="color:#8B2F6E">${fmt(r.t85)}</td><td class="l green" style="font-weight:600">${fmt(r.coll)}</td><td class="l" style="font-weight:700;color:${r.rem <= 0 ? "#2D6644" : "#B5472A"}">${r.rem <= 0 ? '<span class="done-badge">✓ הושלם</span>' : fmt(r.rem)}</td><td class="l" style="min-width:90px"><div class="bar-label">${r.pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(r.pct, 100)}%;background:#8B2F6E"></div></div></td></tr>`
    ).join("");
    const footRow = gradeData.length > 1 ? `<tr class="total-row"><td>סה"כ</td><td class="l" style="color:#6B7A72">${gradeData.reduce((s,r)=>s+r.g.student_count,0)}</td><td class="l">${fmt(totT100)}</td><td class="l" style="color:#8B2F6E">${fmt(totT85)}</td><td class="l green">${fmt(totColl)}</td><td class="l" style="color:${totRem<=0?"#2D6644":"#B5472A"}">${totRem<=0?'<span class="done-badge">✓</span>':fmt(totRem)}</td><td class="l"><div class="bar-label">${totPct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(totPct,100)}%;background:#8B2F6E"></div></div></td></tr>` : "";
    return `<div class="section-break"><h2 style="border-right:4px solid #8B2F6E;padding-right:10px">הורים · ${sec.name} — פירוט לפי שכבה</h2>
    <table><thead><tr><th>שכבה</th><th class="l">תלמידים</th><th class="l">יעד 100%</th><th class="l">יעד 85%</th><th class="l">נגבה</th><th class="l">נותר</th><th class="l">התקדמות</th></tr></thead>
    <tbody>${gradeRowsHtml}${footRow}</tbody></table></div>`;
  }).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח שנתי – ${yearName}</title><style>${PRINT_CSS}</style></head><body>
  <div class="print-bar">
    <div><div class="print-bar-title">📋 דוח שנתי — ${yearName}</div><div class="print-bar-hint">לחצו על "ייצוא PDF" כדי לשמור את הדוח</div></div>
    <div style="display:flex;align-items:center">
      <button class="btn-close" onclick="window.close()">✕ סגור</button>
      <button class="btn-print" onclick="window.print()">📄 ייצוא PDF / הדפסה</button>
    </div>
  </div>
  <div class="page-header"><div><div class="sub">הכרם · ניהול פיננסי בית ספרי</div><h1>דוח שנתי</h1><div class="sub" style="margin-top:2px">${yearName}</div></div><div class="meta"><div>תאריך הפקה</div><div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">${toDate()}</div></div></div>
  <div class="content">
    <h2>סיכום תקציבי</h2>
    <div class="kpi-grid kpi-4">
      <div class="kpi-card"><div class="kpi-label">סה"כ מתוכנן</div><div class="kpi-value">${fmt(totals.planned)}</div><div class="kpi-sub">תקציב שנתי</div></div>
      <div class="kpi-card" style="border-color:#EDCFC6"><div class="kpi-label">סה"כ הוצאות</div><div class="kpi-value rust">${fmt(totals.used)}</div><div class="kpi-sub">${totals.pct}% מהתקציב</div></div>
      <div class="kpi-card" style="border-color:#C6E8D0"><div class="kpi-label">הכנסות שנרשמו</div><div class="kpi-value green">${fmt(incomeTotals.grand)}</div><div class="kpi-sub">כולל גבייה</div></div>
      <div class="kpi-card" style="border-color:${totals.balance >= 0 ? "#C6E8D0" : "#EDCFC6"}"><div class="kpi-label">יתרת תקציב</div><div class="kpi-value ${totals.balance >= 0 ? "green" : "rust"}">${fmt(totals.balance)}</div><div class="kpi-sub">${totals.balance >= 0 ? "עודף" : "גרעון"}</div></div>
    </div>
    <h2>סיכום לפי מקור תקציב</h2>
    <table><thead><tr><th>מקור</th><th class="l">מתוכנן</th><th class="l">הכנסות</th><th class="l">הוצאות</th><th class="l">יתרה</th><th class="l">ניצול</th></tr></thead>
    <tbody>${sourceRows}<tr class="total-row"><td>סה"כ</td><td class="l">${fmt(totals.planned)}</td><td class="l green">${fmt(incomeTotals.grand)}</td><td class="l">${fmt(totals.used)}</td><td class="l" style="color:${totals.balance >= 0 ? "#2D6644" : "#B5472A"}">${fmt(totals.balance)}</td><td class="l"><div class="bar-label">${totals.pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(totals.pct, 100)}%;background:#2D6644"></div></div></td></tr></tbody></table>
    ${catBySource}
    ${horimDetail}
    <hr class="divider">
    <h2>פירוט הכנסות</h2>
    <div class="income-grid">
      <div class="income-card"><div class="kpi-label">הכנסות ממקורות (גפן / עירייה)</div><div class="kpi-value">${fmt(incomeTotals.fromIncome)}</div></div>
      <div class="income-card"><div class="kpi-label">גבייה מהורים</div><div class="kpi-value plum">${fmt(incomeTotals.fromParentCollections)}</div></div>
      <div class="income-card accent"><div class="kpi-label">סה"כ הכנסות</div><div class="kpi-value green">${fmt(incomeTotals.grand)}</div></div>
    </div>
    <div class="footer">הכרם — מערכת ניהול פיננסי לבתי ספר · נוצר אוטומטית ${toDate()}</div>
  </div>
</body></html>`;
}

function buildHorimHTML(grades: Grade[], sections: ParentSection[], amounts: GradeSectionAmount[], collections: ParentCollection[], yearName: string, cfgMapPdf?: SourceCfgMap): string {
  void cfgMapPdf;
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

  // Per-section summary rows
  const secRows = sections.map((sec) => {
    let total100 = 0;
    let collected = 0;
    grades.forEach((g) => {
      const a = amounts.find((a) => a.grade_id === g.id && a.parent_section_id === sec.id);
      if (a) total100 += a.amount_per_student * g.student_count;
      collected += collections.filter((c) => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
    });
    if (total100 === 0) return "";
    const total85 = total100 * 0.85;
    const remaining85 = Math.max(0, total85 - collected);
    const pct = total85 > 0 ? Math.round((collected / total85) * 100) : 0;
    const barColor = pct >= 100 ? "#2D6644" : pct > 80 ? "#E67E22" : "#8B2F6E";
    return `<tr><td style="font-weight:600">${sec.name}</td><td class="l">${fmt(total100)}</td><td class="l" style="color:#8B2F6E">${fmt(total85)}</td><td class="l green" style="font-weight:600">${fmt(collected)}</td><td class="l" style="font-weight:700;color:${remaining85 <= 0 ? "#2D6644" : "#B5472A"}">${remaining85 <= 0 ? '<span class="done-badge">✓ הושלם</span>' : fmt(remaining85)}</td><td class="l" style="min-width:100px"><div class="bar-label">${pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div></div></td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>גבייה מהורים – ${yearName}</title><style>${PRINT_CSS}</style></head><body>
  <div class="print-bar">
    <div><div class="print-bar-title">📋 גבייה מהורים — ${yearName}</div><div class="print-bar-hint">לחצו על "ייצוא PDF" כדי לשמור את הדוח</div></div>
    <div style="display:flex;align-items:center">
      <button class="btn-close" onclick="window.close()">✕ סגור</button>
      <button class="btn-print" onclick="window.print()">📄 ייצוא PDF / הדפסה</button>
    </div>
  </div>
  <div class="page-header"><div><div class="sub">הכרם · ניהול פיננסי בית ספרי</div><h1>דוח גבייה מהורים</h1><div class="sub" style="margin-top:2px">${yearName}</div></div><div class="meta"><div>תאריך הפקה</div><div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">${toDate()}</div></div></div>
  <div class="content">
    <h2>סיכום גבייה</h2>
    <div class="kpi-grid kpi-4">
      <div class="kpi-card"><div class="kpi-label">יעד גבייה (100%)</div><div class="kpi-value">${fmt(tT)}</div><div class="kpi-sub">${tS} תלמידים</div></div>
      <div class="kpi-card" style="border-color:#DDD0E8"><div class="kpi-label">יעד גבייה (85%)</div><div class="kpi-value plum">${fmt(tT * 0.85)}</div></div>
      <div class="kpi-card" style="background:#EDFBF3;border-color:#C6E8D0"><div class="kpi-label">נגבה עד כה</div><div class="kpi-value green">${fmt(tC)}</div><div style="margin-top:8px"><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(tP, 100)}%;background:#2D6644"></div></div><div style="font-size:10px;color:#4A6656;margin-top:3px;font-weight:500">${tP}% מהיעד</div></div></div>
      <div class="kpi-card" style="background:${tR <= 0 ? "#EDFBF3" : "#FDF1EA"};border-color:${tR <= 0 ? "#C6E8D0" : "#EDCFC6"}"><div class="kpi-label">טרם נגבה</div><div class="kpi-value ${tR <= 0 ? "green" : "rust"}">${fmt(tR)}</div></div>
    </div>
    ${secRows ? `<h2>גבייה לפי סעיף</h2>
    <table><thead><tr><th>סעיף</th><th class="l">יעד 100%</th><th class="l">יעד 85%</th><th class="l">נגבה</th><th class="l">נותר (מ-85%)</th><th class="l">התקדמות</th></tr></thead>
    <tbody>${secRows}</tbody></table>` : ""}
    ${sections.map((sec) => {
      const gradeData = grades.map((g) => {
        const a = amounts.find(am => am.grade_id === g.id && am.parent_section_id === sec.id);
        if (!a || a.amount_per_student === 0) return null;
        const t100 = a.amount_per_student * g.student_count;
        const t85 = t100 * 0.85;
        const coll = collections.filter(c => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
        const rem = Math.max(0, t85 - coll);
        const pct = t85 > 0 ? Math.round((coll / t85) * 100) : 0;
        return { g, t100, t85, coll, rem, pct };
      }).filter(Boolean) as { g: Grade; t100: number; t85: number; coll: number; rem: number; pct: number }[];
      if (gradeData.length === 0) return "";
      const totT100 = gradeData.reduce((s, r) => s + r.t100, 0);
      const totT85  = gradeData.reduce((s, r) => s + r.t85, 0);
      const totColl = gradeData.reduce((s, r) => s + r.coll, 0);
      const totRem  = Math.max(0, totT85 - totColl);
      const totPct  = totT85 > 0 ? Math.round((totColl / totT85) * 100) : 0;
      const gradeRows = gradeData.map(r =>
        `<tr><td style="font-weight:600">${r.g.name}</td><td class="l" style="color:#6B7A72">${r.g.student_count}</td><td class="l">${fmt(r.t100)}</td><td class="l" style="color:#8B2F6E">${fmt(r.t85)}</td><td class="l green" style="font-weight:600">${fmt(r.coll)}</td><td class="l" style="font-weight:700;color:${r.rem <= 0 ? "#2D6644" : "#B5472A"}">${r.rem <= 0 ? '<span class="done-badge">✓ הושלם</span>' : fmt(r.rem)}</td><td class="l" style="min-width:90px"><div class="bar-label">${r.pct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(r.pct, 100)}%;background:#8B2F6E"></div></div></td></tr>`
      ).join("");
      const footRow = gradeData.length > 1 ? `<tr class="total-row"><td>סה"כ</td><td class="l" style="color:#6B7A72">${gradeData.reduce((s,r)=>s+r.g.student_count,0)}</td><td class="l">${fmt(totT100)}</td><td class="l" style="color:#8B2F6E">${fmt(totT85)}</td><td class="l green">${fmt(totColl)}</td><td class="l" style="color:${totRem<=0?"#2D6644":"#B5472A"}">${totRem<=0?'<span class="done-badge">✓</span>':fmt(totRem)}</td><td class="l"><div class="bar-label">${totPct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(totPct,100)}%;background:#8B2F6E"></div></div></td></tr>` : "";
      return `<div class="section-break"><h2 style="border-right:4px solid #8B2F6E;padding-right:10px">${sec.name} — פירוט לפי שכבה</h2>
    <table><thead><tr><th>שכבה</th><th class="l">תלמידים</th><th class="l">יעד 100%</th><th class="l">יעד 85%</th><th class="l">נגבה</th><th class="l">נותר</th><th class="l">התקדמות</th></tr></thead>
    <tbody>${gradeRows}${footRow}</tbody></table></div>`;
    }).join("")}
    <h2>פירוט לפי שכבה</h2>
    <table><thead><tr><th>שכבה</th><th class="l">תלמידים</th><th class="l">יעד</th><th class="l">נגבה</th><th class="l">טרם נגבה</th><th class="l">התקדמות</th></tr></thead>
    <tbody>${rows}<tr class="total-row"><td>סה"כ</td><td class="l" style="color:#6B7A72">${tS}</td><td class="l">${fmt(tT)}</td><td class="l green">${fmt(tC)}</td><td class="l" style="color:${tR <= 0 ? "#2D6644" : "#B5472A"}">${fmt(tR)}</td><td class="l"><div class="bar-label">${tP}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(tP, 100)}%;background:#8B2F6E"></div></div></td></tr></tbody></table>
    <div class="footer">הכרם — מערכת ניהול פיננסי לבתי ספר · נוצר אוטומטית ${toDate()}</div>
  </div>
</body></html>`;
}

function buildPeriodicHTML(
  data: PeriodicSummary,
  periodLabel: string,
  yearName: string,
  cfgMap: SourceCfgMap,
  categories: PeriodicCategory[],
  grades: Grade[] = [],
  sections: ParentSection[] = [],
  amounts: GradeSectionAmount[] = [],
  collections: ParentCollection[] = [],
  periodFrom: string | null = null,
  periodTo: string | null = null,
): string {
  const { sources, totals } = data;
  const sourceRows = sources.map((s) => {
    const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.source };
    const barColor = s.expenses > s.income ? "#B5472A" : cfg.color;
    void barColor;
    return `<tr><td><span class="badge" style="background:${cfg.bg};color:${cfg.textColor}">${cfg.label}</span></td><td class="l green" style="font-weight:600">${fmt(s.income)}</td><td class="l">${fmt(s.expenses)}</td><td class="l" style="font-weight:700;color:${s.net >= 0 ? "#2D6644" : "#B5472A"}">${fmt(s.net)}</td></tr>`;
  }).join("");

  // Per-source category detail for PDF (skip horim — uses collections, not expenses)
  const catDetail = sources.map((s) => {
    if (s.source === "horim") return "";
    const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.source };
    const cats = categories.filter((c) => c.source === s.source);
    if (cats.length === 0) return "";
    const catRows = cats.map((c) => {
      const pctYtd = c.planned_annual > 0 ? Math.round((c.spent_ytd / c.planned_annual) * 100) : 0;
      const barColor = pctYtd > 100 ? "#C0392B" : pctYtd > 80 ? "#E67E22" : cfg.color;
      return `<tr>
        <td>${c.name}</td>
        <td class="l rust">${fmt(c.spent_in_period)}</td>
        <td class="l rust">${fmt(c.spent_ytd)}</td>
        <td class="l">${fmt(c.planned_annual)}</td>
        <td class="l" style="font-weight:700;color:${c.remaining_annual >= 0 ? "#2D6644" : "#B5472A"}">${fmt(c.remaining_annual)}</td>
        <td class="l" style="min-width:100px"><div class="bar-label">${pctYtd}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(pctYtd, 100)}%;background:${barColor}"></div></div></td>
      </tr>`;
    }).join("");
    return `<div class="section-break"><h2 style="border-right:4px solid ${cfg.color};padding-right:10px">${cfg.label} — פירוט קטגוריות</h2>
    <table><thead><tr><th>קטגוריה</th><th class="l">הוצאה בתקופה</th><th class="l">הוצאה מצטברת</th><th class="l">תוכנן שנתי</th><th class="l">נותר שנתי</th><th class="l">ניצול</th></tr></thead>
    <tbody>${catRows}</tbody></table></div>`;
  }).join("");

  // Horim: period-filtered collections per section per grade
  const periodCollections = collections.filter((c) => {
    if (periodFrom && c.collection_date < periodFrom) return false;
    if (periodTo   && c.collection_date > periodTo)   return false;
    return true;
  });
  const horimPeriodDetail = sections.map((sec) => {
    const gradeData = grades.map((g) => {
      const a = amounts.find(am => am.grade_id === g.id && am.parent_section_id === sec.id);
      if (!a || a.amount_per_student === 0) return null;
      const t100 = a.amount_per_student * g.student_count;
      const t85  = t100 * 0.85;
      const collPeriod = periodCollections.filter(c => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
      const collYtd    = collections.filter(c => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
      if (collPeriod === 0 && collYtd === 0) return null;
      const pctYtd = t85 > 0 ? Math.round((collYtd / t85) * 100) : 0;
      return { g, t100, t85, collPeriod, collYtd, pctYtd };
    }).filter(Boolean) as { g: Grade; t100: number; t85: number; collPeriod: number; collYtd: number; pctYtd: number }[];
    if (gradeData.length === 0) return "";
    const gradeRowsHtml = gradeData.map(r =>
      `<tr><td style="font-weight:600">${r.g.name}</td><td class="l" style="color:#6B7A72">${r.g.student_count}</td><td class="l">${fmt(r.t100)}</td><td class="l" style="color:#8B2F6E">${fmt(r.t85)}</td><td class="l green" style="font-weight:600">${fmt(r.collPeriod)}</td><td class="l green">${fmt(r.collYtd)}</td><td class="l" style="min-width:90px"><div class="bar-label">${r.pctYtd}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(r.pctYtd, 100)}%;background:#8B2F6E"></div></div></td></tr>`
    ).join("");
    const totPeriod = gradeData.reduce((s, r) => s + r.collPeriod, 0);
    const totYtd    = gradeData.reduce((s, r) => s + r.collYtd,    0);
    const totT85    = gradeData.reduce((s, r) => s + r.t85,        0);
    const totPct    = totT85 > 0 ? Math.round((totYtd / totT85) * 100) : 0;
    const footRow   = gradeData.length > 1
      ? `<tr class="total-row"><td>סה"כ</td><td class="l" style="color:#6B7A72">${gradeData.reduce((s,r)=>s+r.g.student_count,0)}</td><td class="l">${fmt(gradeData.reduce((s,r)=>s+r.t100,0))}</td><td class="l" style="color:#8B2F6E">${fmt(totT85)}</td><td class="l green">${fmt(totPeriod)}</td><td class="l green">${fmt(totYtd)}</td><td class="l"><div class="bar-label">${totPct}%</div><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(totPct,100)}%;background:#8B2F6E"></div></div></td></tr>`
      : "";
    return `<div class="section-break"><h2 style="border-right:4px solid #8B2F6E;padding-right:10px">הורים · ${sec.name} — גבייה בתקופה</h2>
    <table><thead><tr><th>שכבה</th><th class="l">תלמידים</th><th class="l">יעד 100%</th><th class="l">יעד 85%</th><th class="l">נגבה בתקופה</th><th class="l">נגבה מצטבר</th><th class="l">התקדמות</th></tr></thead>
    <tbody>${gradeRowsHtml}${footRow}</tbody></table></div>`;
  }).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>דוח תקופתי – ${periodLabel}</title><style>${PRINT_CSS}</style></head><body>
  <div class="print-bar">
    <div><div class="print-bar-title">📋 דוח תקופתי — ${periodLabel}</div><div class="print-bar-hint">לחצו על "ייצוא PDF" כדי לשמור את הדוח</div></div>
    <div style="display:flex;align-items:center">
      <button class="btn-close" onclick="window.close()">✕ סגור</button>
      <button class="btn-print" onclick="window.print()">📄 ייצוא PDF / הדפסה</button>
    </div>
  </div>
  <div class="page-header"><div><div class="sub">הכרם · ניהול פיננסי בית ספרי</div><h1>דוח תקופתי</h1><div class="sub" style="margin-top:2px">${periodLabel} · ${yearName}</div></div><div class="meta"><div>תאריך הפקה</div><div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">${toDate()}</div></div></div>
  <div class="content">
    <h2>סיכום תקופה</h2>
    <div class="kpi-grid kpi-4">
      <div class="kpi-card" style="border-color:#C6E8D0"><div class="kpi-label">הכנסות בתקופה</div><div class="kpi-value green">${fmt(totals.income)}</div><div class="kpi-sub">ממקורות</div></div>
      <div class="kpi-card" style="border-color:#DDD0E8"><div class="kpi-label">גבייה מהורים</div><div class="kpi-value plum">${fmt(totals.parentCollections)}</div></div>
      <div class="kpi-card" style="border-color:#EDCFC6"><div class="kpi-label">הוצאות בתקופה</div><div class="kpi-value rust">${fmt(totals.expenses)}</div></div>
      <div class="kpi-card" style="border-color:${totals.net >= 0 ? "#C6E8D0" : "#EDCFC6"}"><div class="kpi-label">מאזן תקופה</div><div class="kpi-value ${totals.net >= 0 ? "green" : "rust"}">${fmt(totals.net)}</div><div class="kpi-sub">${totals.net >= 0 ? "עודף" : "גרעון"}</div></div>
    </div>
    <h2>סיכום לפי מקור</h2>
    <table><thead><tr><th>מקור</th><th class="l">הכנסות</th><th class="l">הוצאות</th><th class="l">מאזן</th></tr></thead>
    <tbody>${sourceRows}<tr class="total-row"><td>סה"כ</td><td class="l green">${fmt(totals.totalIncome)}</td><td class="l">${fmt(totals.expenses)}</td><td class="l" style="color:${totals.net >= 0 ? "#2D6644" : "#B5472A"}">${fmt(totals.net)}</td></tr></tbody></table>
    ${catDetail}
    ${horimPeriodDetail}
    <div class="footer">הכרם — מערכת ניהול פיננסי לבתי ספר · נוצר אוטומטית ${toDate()}</div>
  </div>
</body></html>`;
}

// ─── Open print window ────────────────────────────────────────────────────────

function openPrint(html: string) {
  // Open a clean popup — user clicks the "ייצוא PDF" button inside it to print
  const win = window.open("", "_blank", "width=1040,height=820,menubar=no,toolbar=no,scrollbars=yes");
  if (!win) {
    // Popup was blocked — fall back to current-page print with a warning
    toast.error("הדפדפן חסם את חלון הדוח — אנא אפשר חלונות קופצים לאתר זה ונסה שוב.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ReportsPage() {
  const [tab, setTab] = useState<Tab>("annual");

  const annualQuery   = useDashboardSummary();
  const gradesQuery   = useGrades();
  const sectionsQuery = useParentSections();
  const amountsQuery  = useGradeSectionAmounts();
  const collectQuery  = useParentCollections();

  // Dynamic source config — merges org sources with static baseline
  const { data: orgSources } = useOrgBudgetSources();
  const cfgMap = useMemo<SourceCfgMap>(() => {
    const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
    const map: SourceCfgMap = { ...BASE_SOURCE_CFG };
    sources.forEach(s => {
      if (!(s.slug in map)) {
        map[s.slug] = { label: s.label, color: s.color, bg: s.bg_color, textColor: s.color };
      } else {
        // Update the label from org (may have been customized)
        map[s.slug] = { ...map[s.slug], label: s.label };
      }
    });
    return map;
  }, [orgSources]);

  // Periodic state
  const [periodType, setPeriodType]   = useState<PeriodType>("monthly");
  const [selectedRange, setRange]     = useState<DateRange | null>(null);
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");

  const { data: yearMeta } = useActiveSchoolYearMeta();

  const periodicFrom = periodType === "custom" ? (customFrom || null) : (selectedRange?.from ?? null);
  const periodicTo   = periodType === "custom" ? (customTo   || null) : (selectedRange?.to   ?? null);
  const { data: periodicData, isLoading: periodicLoading } = usePeriodicReport(periodicFrom, periodicTo);
  const { data: allCategories } = useAllBudgetCategoriesWithSpend();
  const { data: periodicCategories } = usePeriodicCategoryReport(periodicFrom, periodicTo);

  const monthRanges   = yearMeta?.start_date && yearMeta.end_date ? getMonthRanges(yearMeta.start_date, yearMeta.end_date)   : [];
  const quarterRanges = yearMeta?.start_date                       ? getQuarterRanges(yearMeta.start_date)                    : [];

  function handlePrint() {
    const grades      = gradesQuery.data   ?? [];
    const sections    = sectionsQuery.data  ?? [];
    const amounts     = amountsQuery.data   ?? [];
    const collections = collectQuery.data   ?? [];
    const yearName    = annualQuery.data?.schoolYear?.name ?? "";
    if (tab === "annual") {
      if (!annualQuery.data) return;
      openPrint(buildAnnualHTML(annualQuery.data, cfgMap, allCategories ?? [], grades, sections, amounts, collections));
    } else if (tab === "horim") {
      openPrint(buildHorimHTML(grades, sections, amounts, collections, yearName));
    } else if (tab === "periodic" && periodicData) {
      const label = periodType === "custom"
        ? `${customFrom} — ${customTo}`
        : (selectedRange?.label ?? "תקופה נבחרת");
      const fromD = periodType === "custom" ? (customFrom || null) : (selectedRange?.from ?? null);
      const toD   = periodType === "custom" ? (customTo   || null) : (selectedRange?.to   ?? null);
      openPrint(buildPeriodicHTML(periodicData, label, yearName, cfgMap, periodicCategories ?? [], grades, sections, amounts, collections, fromD, toD));
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

      {tab === "annual"   && <AnnualReport   data={annualQuery.data} isLoading={annualQuery.isLoading} cfgMap={cfgMap} categories={allCategories ?? []} grades={gradesQuery.data ?? []} sections={sectionsQuery.data ?? []} amounts={amountsQuery.data ?? []} collections={collectQuery.data ?? []} />}
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
          cfgMap={cfgMap}
          categories={periodicCategories ?? []}
          grades={gradesQuery.data ?? []}
          sections={sectionsQuery.data ?? []}
          amounts={amountsQuery.data ?? []}
          collections={collectQuery.data ?? []}
        />
      )}
    </div>
  );
}

// ─── Annual Report ────────────────────────────────────────────────────────────

function AnnualReport({ data, isLoading, cfgMap, categories, grades, sections, amounts, collections }: {
  data: DashboardSummary | undefined; isLoading: boolean; cfgMap: SourceCfgMap; categories: CategoryReport[];
  grades: Grade[]; sections: ParentSection[]; amounts: GradeSectionAmount[]; collections: ParentCollection[];
}) {
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
              const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.label };
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
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: "18px" }}>
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

      {/* Per-source breakdown tables */}
      {sources.map((s) => {
        const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.label };

        // ── Horim: show section collection table (not expense categories which are always 0) ──
        if (s.source === "horim" && sections.length > 0) {
          const horimRows = sections.map((sec) => {
            const t100 = grades.reduce((sum, g) => {
              const a = amounts.find(am => am.grade_id === g.id && am.parent_section_id === sec.id);
              return sum + (a ? a.amount_per_student * g.student_count : 0);
            }, 0);
            if (t100 === 0) return null;
            const t85 = t100 * 0.85;
            const coll = collections.filter(c => c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
            const rem = Math.max(0, t85 - coll);
            const pct = t85 > 0 ? Math.round((coll / t85) * 100) : 0;
            return { sec, t100, t85, coll, rem, pct };
          }).filter((r): r is NonNullable<typeof r> => r !== null);
          if (horimRows.length === 0) return null;
          const ttlT100 = horimRows.reduce((s, r) => s + r.t100, 0);
          const ttlT85  = horimRows.reduce((s, r) => s + r.t85, 0);
          const ttlColl = horimRows.reduce((s, r) => s + r.coll, 0);
          const ttlRem  = Math.max(0, ttlT85 - ttlColl);
          const ttlPct  = ttlT85 > 0 ? Math.round((ttlColl / ttlT85) * 100) : 0;
          return (
            <div key={s.source} style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
              <div style={{ padding: "14px 22px", borderBottom: "1px solid #F4F1EC", borderRight: `4px solid ${cfg.color}`, display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ background: cfg.bg, color: cfg.textColor, borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 700 }}>{cfg.label}</span>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>גבייה לפי סעיף</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#FAF5F9" }}>
                  <tr>
                    <th style={th}>סעיף</th>
                    <th style={thL}>יעד 100%</th>
                    <th style={thL}>יעד 85%</th>
                    <th style={thL}>נגבה</th>
                    <th style={thL}>נותר (מ-85%)</th>
                    <th style={{ ...thL, minWidth: "140px" }}>התקדמות</th>
                  </tr>
                </thead>
                <tbody>
                  {horimRows.map((r) => (
                    <tr key={r.sec.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.sec.name}</td>
                      <td style={tdL}>{fmt(r.t100)}</td>
                      <td style={{ ...tdL, color: "#8B2F6E", fontWeight: 500 }}>{fmt(r.t85)}</td>
                      <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(r.coll)}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: r.rem <= 0 ? "#2D6644" : "#B5472A" }}>
                        {r.rem <= 0 ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "6px", padding: "2px 8px", fontSize: "12px" }}>✓ הושלם</span> : fmt(r.rem)}
                      </td>
                      <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{r.pct}%</div><PctBar pct={r.pct} color={cfg.color} /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#F7F4EF" }}>
                    <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
                    <td style={{ ...tdL, fontWeight: 700 }}>{fmt(ttlT100)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: "#8B2F6E" }}>{fmt(ttlT85)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(ttlColl)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: ttlRem <= 0 ? "#2D6644" : "#B5472A" }}>{ttlRem <= 0 ? "✓ הושלם" : fmt(ttlRem)}</td>
                    <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{ttlPct}%</div><PctBar pct={ttlPct} color={cfg.color} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }

        // ── Other sources: per-category expense table ──
        const cats = categories.filter((c) => c.source === s.source);
        if (cats.length === 0) return null;
        return (
          <div key={s.source} style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid #F4F1EC", borderRight: `4px solid ${cfg.color}`, display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ background: cfg.bg, color: cfg.textColor, borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 700 }}>{cfg.label}</span>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>פירוט קטגוריות</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#FAFAF8" }}>
                <tr>
                  <th style={th}>קטגוריה</th>
                  <th style={thL}>תוכנן</th>
                  <th style={thL}>הוצאות</th>
                  <th style={thL}>נותר</th>
                  <th style={{ ...thL, minWidth: "140px" }}>ניצול</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => {
                  const pct = c.planned > 0 ? Math.round((c.spent / c.planned) * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td style={{ ...td, fontWeight: 500 }}>{c.name}</td>
                      <td style={tdL}>{fmt(c.planned)}</td>
                      <td style={{ ...tdL, color: "#B5472A" }}>{fmt(c.spent)}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: c.remaining >= 0 ? "#2D6644" : "#B5472A" }}>{fmt(c.remaining)}</td>
                      <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{pct}%</div><PctBar pct={pct} color={cfg.color} /></td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#F7F4EF" }}>
                  <td style={{ ...td, fontWeight: 700 }}>סה״כ {cfg.label}</td>
                  <td style={{ ...tdL, fontWeight: 700 }}>{fmt(cats.reduce((a, c) => a + c.planned, 0))}</td>
                  <td style={{ ...tdL, fontWeight: 700, color: "#B5472A" }}>{fmt(cats.reduce((a, c) => a + c.spent, 0))}</td>
                  <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(cats.reduce((a, c) => a + c.remaining, 0))}</td>
                  <td style={tdL} />
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
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
  const tT85 = tT * 0.85;

  // Per-section summary
  const sectionSummary = sections.map((sec) => {
    let total100 = 0;
    let secCollected = 0;
    grades.forEach((g) => {
      const a = amounts.find((am) => am.grade_id === g.id && am.parent_section_id === sec.id);
      if (a) total100 += a.amount_per_student * g.student_count;
      secCollected += collections.filter((c) => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
    });
    if (total100 === 0) return null;
    const total85 = total100 * 0.85;
    const remaining85 = Math.max(0, total85 - secCollected);
    const pct = total85 > 0 ? Math.round((secCollected / total85) * 100) : 0;
    return { sec, total100, total85, secCollected, remaining85, pct };
  }).filter(Boolean) as { sec: typeof sections[0]; total100: number; total85: number; secCollected: number; remaining85: number; pct: number }[];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "יעד גבייה (100%)", value: tT,   color: "#1A1A1A", bg: "#FAFAF8", border: "#EEE9E2",  sub: null },
          { label: "יעד גבייה (85%)", value: tT85,  color: "#8B2F6E", bg: "#F7F0F5", border: "#DDD0E8",  sub: null },
          { label: "נגבה",            value: tC,    color: "#2D6644", bg: "#EDFBF3", border: "#C6E8D0",  sub: tP },
          { label: "טרם נגבה",        value: tR,    color: tR > 0 ? "#B5472A" : "#2D6644", bg: tR > 0 ? "#FDF1EA" : "#EDFBF3", border: tR > 0 ? "#EDCFC6" : "#C6E8D0", sub: null },
        ].map((c) => (
          <div key={c.label} style={{ background: c.bg, borderRadius: "14px", border: `1px solid ${c.border}`, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: "11px", color: "#6B7A72", fontWeight: 500, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{c.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: c.color }}>{fmt(c.value)}</div>
            {c.sub !== null && <div style={{ marginTop: "9px" }}><PctBar pct={tP} color="#2D6644" /><div style={{ fontSize: "11px", color: "#4A6656", marginTop: "4px", fontWeight: 500 }}>{tP}% מהיעד</div></div>}
          </div>
        ))}
      </div>

      {/* Per-section summary table */}
      {sectionSummary.length > 0 && (
        <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "18px" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #F4F1EC", borderRight: "4px solid #8B2F6E" }}>
            <div style={{ fontWeight: 700, fontSize: "14.5px", color: "#1A1A1A" }}>סיכום גבייה לפי סעיף</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#FAF5F9" }}>
              <tr>
                <th style={th}>סעיף</th>
                <th style={thL}>יעד 100%</th>
                <th style={thL}>יעד 85%</th>
                <th style={thL}>נגבה</th>
                <th style={thL}>נותר (מ-85%)</th>
                <th style={{ ...thL, minWidth: "140px" }}>התקדמות</th>
              </tr>
            </thead>
            <tbody>
              {sectionSummary.map(({ sec, total100, total85, secCollected, remaining85, pct }) => (
                <tr key={sec.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{sec.name}</td>
                  <td style={tdL}>{fmt(total100)}</td>
                  <td style={{ ...tdL, color: "#8B2F6E", fontWeight: 500 }}>{fmt(total85)}</td>
                  <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(secCollected)}</td>
                  <td style={{ ...tdL, fontWeight: 700, color: remaining85 <= 0 ? "#2D6644" : "#B5472A" }}>
                    {remaining85 <= 0
                      ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 600 }}>✓ הושלם</span>
                      : fmt(remaining85)}
                  </td>
                  <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{pct}%</div><PctBar pct={pct} color="#8B2F6E" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-section, per-grade breakdown */}
      {sections.length > 0 && sections.map((sec) => {
        const gradeRows = grades.map((g) => {
          const a = amounts.find(am => am.grade_id === g.id && am.parent_section_id === sec.id);
          if (!a || a.amount_per_student === 0) return null;
          const t100 = a.amount_per_student * g.student_count;
          const t85 = t100 * 0.85;
          const coll = collections.filter(c => c.grade_id === g.id && c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
          const rem = Math.max(0, t85 - coll);
          const pct = t85 > 0 ? Math.round((coll / t85) * 100) : 0;
          return { grade: g, t100, t85, coll, rem, pct };
        }).filter((r): r is NonNullable<typeof r> => r !== null);
        if (gradeRows.length === 0) return null;
        const totT100 = gradeRows.reduce((s, r) => s + r.t100, 0);
        const totT85  = gradeRows.reduce((s, r) => s + r.t85, 0);
        const totColl = gradeRows.reduce((s, r) => s + r.coll, 0);
        const totRem  = Math.max(0, totT85 - totColl);
        const totPct  = totT85 > 0 ? Math.round((totColl / totT85) * 100) : 0;
        return (
          <div key={sec.id} style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid #F4F1EC", borderRight: "4px solid #8B2F6E", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ background: "#F4EBF2", color: "#6B2356", borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 700 }}>{sec.name}</span>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>פירוט לפי שכבה</span>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: totPct >= 85 ? "#2D6644" : "#8B2F6E" }}>{totPct}% נגבה מיעד 85%</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#FAF5F9" }}>
                <tr>
                  <th style={th}>שכבה</th>
                  <th style={thL}>תלמידים</th>
                  <th style={thL}>יעד 100%</th>
                  <th style={thL}>יעד 85%</th>
                  <th style={thL}>נגבה</th>
                  <th style={thL}>נותר</th>
                  <th style={{ ...thL, minWidth: "140px" }}>התקדמות</th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((r) => (
                  <tr key={r.grade.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.grade.name}</td>
                    <td style={{ ...tdL, color: "#6B7A72" }}>{r.grade.student_count}</td>
                    <td style={tdL}>{fmt(r.t100)}</td>
                    <td style={{ ...tdL, color: "#8B2F6E", fontWeight: 500 }}>{fmt(r.t85)}</td>
                    <td style={{ ...tdL, color: "#2D6644", fontWeight: 600 }}>{fmt(r.coll)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: r.rem <= 0 ? "#2D6644" : "#B5472A" }}>
                      {r.rem <= 0 ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 600 }}>✓ הושלם</span> : fmt(r.rem)}
                    </td>
                    <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{r.pct}%</div><PctBar pct={r.pct} color="#8B2F6E" /></td>
                  </tr>
                ))}
              </tbody>
              {gradeRows.length > 1 && (
                <tfoot>
                  <tr style={{ background: "#F4EBF2" }}>
                    <td style={{ ...td, fontWeight: 700 }}>סה״כ</td>
                    <td style={{ ...tdL, fontWeight: 700, color: "#6B7A72" }}>{gradeRows.reduce((s, r) => s + r.grade.student_count, 0)}</td>
                    <td style={{ ...tdL, fontWeight: 700 }}>{fmt(totT100)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: "#8B2F6E" }}>{fmt(totT85)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(totColl)}</td>
                    <td style={{ ...tdL, fontWeight: 700, color: totRem <= 0 ? "#2D6644" : "#B5472A" }}>
                      {totRem <= 0 ? <span style={{ background: "#EDFBF3", color: "#2D6644", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 600 }}>✓ הושלם</span> : fmt(totRem)}
                    </td>
                    <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "3px" }}>{totPct}%</div><PctBar pct={totPct} color="#8B2F6E" /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        );
      })}

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
  data, isLoading, hasQuery, cfgMap, categories,
  grades, sections, amounts, collections,
}: {
  periodType: PeriodType; onPeriodType: (pt: PeriodType) => void;
  monthRanges: DateRange[]; quarterRanges: DateRange[];
  selectedRange: DateRange | null; onSelectRange: (r: DateRange) => void;
  customFrom: string; customTo: string;
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void;
  data: PeriodicSummary | null; isLoading: boolean; hasQuery: boolean;
  cfgMap: SourceCfgMap; categories: PeriodicCategory[];
  grades: Grade[]; sections: ParentSection[]; amounts: GradeSectionAmount[]; collections: ParentCollection[];
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
            <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
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
                  min={customFrom || undefined}
                  onChange={(e) => {
                    const newTo = e.target.value;
                    if (customFrom && newTo && newTo < customFrom) return; // block invalid range
                    onCustomTo(newTo);
                  }}
                  style={{ padding: "9px 13px", borderRadius: "9px", border: `1px solid ${customFrom && customTo && customTo < customFrom ? "#EF4444" : "#D8E2DA"}`, fontSize: "13px", fontFamily: "Rubik, sans-serif", outline: "none", color: "#1A1A1A", background: "#FAFAF8", cursor: "pointer" }}
                />
              </div>
            </div>
            {customFrom && customTo && customTo < customFrom && (
              <div style={{ marginTop: "8px", fontSize: "12.5px", color: "#EF4444" }}>
                תאריך הסיום חייב להיות אחרי תאריך ההתחלה
              </div>
            )}
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
          <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "18px" }}>
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
                  const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.source };
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

          {/* Per-source category detail tables */}
          {data.sources.map((s) => {
            const cfg = cfgMap[s.source] ?? { ...NEUTRAL_CFG, label: s.source };
            const cats = categories.filter((c) => c.source === s.source);
            if (cats.length === 0) return null;
            return (
              <div key={s.source} style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
                <div style={{ padding: "14px 22px", borderBottom: "1px solid #F4F1EC", borderRight: `4px solid ${cfg.color}`, display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ background: cfg.bg, color: cfg.textColor, borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 700 }}>{cfg.label}</span>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>פירוט קטגוריות — הוצאות ותקציב</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "#FAFAF8" }}>
                    <tr>
                      <th style={th}>קטגוריה</th>
                      <th style={thL}>הוצאה בתקופה</th>
                      <th style={thL}>הוצאה מצטברת</th>
                      <th style={thL}>תוכנן שנתי</th>
                      <th style={thL}>נותר שנתי</th>
                      <th style={{ ...thL, minWidth: "140px" }}>ניצול שנתי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((c) => {
                      const pctYtd = c.planned_annual > 0 ? Math.round((c.spent_ytd / c.planned_annual) * 100) : 0;
                      return (
                        <tr key={c.id}>
                          <td style={{ ...td, fontWeight: 500 }}>{c.name}</td>
                          <td style={{ ...tdL, color: "#B5472A" }}>{fmt(c.spent_in_period)}</td>
                          <td style={{ ...tdL, color: "#B5472A", fontWeight: 600 }}>{fmt(c.spent_ytd)}</td>
                          <td style={tdL}>{fmt(c.planned_annual)}</td>
                          <td style={{ ...tdL, fontWeight: 700, color: c.remaining_annual >= 0 ? "#2D6644" : "#B5472A" }}>{fmt(c.remaining_annual)}</td>
                          <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{pctYtd}%</div><PctBar pct={pctYtd} color={cfg.color} /></td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#F7F4EF" }}>
                      <td style={{ ...td, fontWeight: 700 }}>סה״כ {cfg.label}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: "#B5472A" }}>{fmt(cats.reduce((a, c) => a + c.spent_in_period, 0))}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: "#B5472A" }}>{fmt(cats.reduce((a, c) => a + c.spent_ytd, 0))}</td>
                      <td style={{ ...tdL, fontWeight: 700 }}>{fmt(cats.reduce((a, c) => a + c.planned_annual, 0))}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: "#2D6644" }}>{fmt(cats.reduce((a, c) => a + c.remaining_annual, 0))}</td>
                      <td style={tdL} />
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
          {/* Horim collections breakdown for this period */}
          {sections.length > 0 && (() => {
            const pFrom = selectedRange?.from ?? (periodType === "custom" ? customFrom : null);
            const pTo   = selectedRange?.to   ?? (periodType === "custom" ? customTo   : null);
            const periodColl = collections.filter(c =>
              (!pFrom || c.collection_date >= pFrom) &&
              (!pTo   || c.collection_date <= pTo)
            );
            if (periodColl.length === 0) return null;
            const secRows = sections.map((sec) => {
              const t100 = grades.reduce((sum, g) => {
                const a = amounts.find(am => am.grade_id === g.id && am.parent_section_id === sec.id);
                return sum + (a ? a.amount_per_student * g.student_count : 0);
              }, 0);
              const coll = periodColl.filter(c => c.parent_section_id === sec.id).reduce((s, c) => s + c.amount, 0);
              if (coll === 0) return null;
              const t85 = t100 * 0.85;
              const pct = t85 > 0 ? Math.round((coll / t85) * 100) : 0;
              return { sec, t85, coll, pct };
            }).filter((r): r is NonNullable<typeof r> => r !== null);
            if (secRows.length === 0) return null;
            const ttlColl = secRows.reduce((s, r) => s + r.coll, 0);
            const ttlT85  = secRows.reduce((s, r) => s + r.t85, 0);
            const ttlPct  = ttlT85 > 0 ? Math.round((ttlColl / ttlT85) * 100) : 0;
            const plumCfg = cfgMap["horim"] ?? { ...NEUTRAL_CFG, label: "הורים" };
            return (
              <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #EEE9E2", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
                <div style={{ padding: "14px 22px", borderBottom: "1px solid #F4F1EC", borderRight: "4px solid #8B2F6E", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ background: plumCfg.bg, color: plumCfg.textColor, borderRadius: "8px", padding: "3px 10px", fontSize: "12.5px", fontWeight: 700 }}>{plumCfg.label}</span>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>גבייה בתקופה לפי סעיף</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "#FAF5F9" }}>
                    <tr>
                      <th style={th}>סעיף</th>
                      <th style={thL}>יעד 85% (שנתי)</th>
                      <th style={thL}>נגבה בתקופה</th>
                      <th style={{ ...thL, minWidth: "140px" }}>% מהיעד השנתי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secRows.map((r) => (
                      <tr key={r.sec.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{r.sec.name}</td>
                        <td style={tdL}>{fmt(r.t85)}</td>
                        <td style={{ ...tdL, color: "#8B2F6E", fontWeight: 600 }}>{fmt(r.coll)}</td>
                        <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{r.pct}%</div><PctBar pct={r.pct} color="#8B2F6E" /></td>
                      </tr>
                    ))}
                    <tr style={{ background: "#F7F4EF" }}>
                      <td style={{ ...td, fontWeight: 700 }}>סה״כ גבייה בתקופה</td>
                      <td style={{ ...tdL, fontWeight: 700 }}>{fmt(ttlT85)}</td>
                      <td style={{ ...tdL, fontWeight: 700, color: "#8B2F6E" }}>{fmt(ttlColl)}</td>
                      <td style={tdL}><div style={{ fontSize: "12px", color: "#6B7A72", marginBottom: "2px" }}>{ttlPct}%</div><PctBar pct={ttlPct} color="#8B2F6E" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
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
