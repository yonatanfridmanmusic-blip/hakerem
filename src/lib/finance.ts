// Shared finance helpers (school year months + calculations)

export const SCHOOL_MONTHS = [
  { key: 9, label: "ספטמבר" },
  { key: 10, label: "אוקטובר" },
  { key: 11, label: "נובמבר" },
  { key: 12, label: "דצמבר" },
  { key: 1, label: "ינואר" },
  { key: 2, label: "פברואר" },
  { key: 3, label: "מרץ" },
  { key: 4, label: "אפריל" },
  { key: 5, label: "מאי" },
  { key: 6, label: "יוני" },
  { key: 7, label: "יולי" },
  { key: 8, label: "אוגוסט" },
] as const;

export const SOURCE_LABEL: Record<string, string> = {
  gefen: "גפן",
  iriyah: "עירייה",
  horim: "הורים",
};

export const ACCOUNT_LABEL: Record<string, string> = {
  school: "חשבון בית ספר",
  parents: "חשבון הורים",
};

export const DEFAULT_GRADES = ["שכבת א", "שכבת ב", "שכבת ג", "שכבת ד", "שכבת ה", "שכבת ו"];

export const DEFAULT_PARENT_SECTIONS = [
  "סל תרבות",
  "סיורים",
  "טיול שנתי",
  'תל"ן',
  "השאלת ספרים",
  "למידה מרצון",
  "מסיבת סיום",
  "מוזיקה",
  "אוטובוסים",
  "אחר",
];

export const DEFAULT_GEFEN_CATEGORIES = [
  "פעילויות חינוכיות",
  "ציוד למידה",
  "השתלמויות צוות",
  "תחזוקה ושיפוצים",
  "ספרים וחומרי הוראה",
  "אחר",
];

export const DEFAULT_IRIYAH_CATEGORIES = [
  "תחזוקה שוטפת",
  "ניקיון",
  "טכנולוגיה",
  "ציוד משרדי",
  "אירועים",
  "אחר",
];

export function formatILS(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Math.abs(v));
  return `${v < 0 ? "-" : ""}${abs}₪`;
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Number(n ?? 0));
}

export function formatPercent(n: number | null | undefined): string {
  return `${Math.round(Number(n ?? 0))}%`;
}

export function monthFromDate(dateStr: string): number {
  return new Date(dateStr).getMonth() + 1;
}

export function usageStatus(pct: number): "ok" | "warn" | "danger" {
  if (pct >= 100) return "danger";
  if (pct >= 80) return "warn";
  return "ok";
}

export type WorkingBudgetBasis = "p85" | "p100" | "actual" | "custom";

export const BASIS_LABEL: Record<WorkingBudgetBasis, string> = {
  p85: "85% גבייה (שמרני)",
  p100: "100% גבייה",
  actual: "גבייה בפועל",
  custom: "סכום מותאם",
};

export const BASIS_LONG_LABEL: Record<WorkingBudgetBasis, string> = {
  p85: "85% גבייה — תרחיש שמרני (לא כל ההורים משלמים)",
  p100: "100% גבייה — אם כל ההורים משלמים",
  actual: "גבייה בפועל — לפי כסף שנכנס בפועל",
  custom: "סכום מותאם אישית",
};

export function computeWorkingBudget(
  basis: WorkingBudgetBasis,
  p100: number,
  actual: number,
  custom: number | null | undefined,
): number {
  switch (basis) {
    case "p100": return p100;
    case "p85": return p100 * 0.85;
    case "actual": return actual;
    case "custom": return Number(custom ?? 0);
  }
}

export function scenarioStatus(spent: number, p85: number, actual: number, p100: number): "safe" | "caution" | "risk" {
  if (spent > Math.max(actual, p100)) return "risk";
  if (spent > p85) return "caution";
  return "safe";
}

export function currentSchoolYearLabel(d = new Date()): string {
  const y = d.getMonth() + 1 >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export function defaultSchoolYearDates(d = new Date()): { start: string; end: string; name: string } {
  const y = d.getMonth() + 1 >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  return {
    start: `${y}-09-01`,
    end: `${y + 1}-08-31`,
    name: `${y}-${y + 1}`,
  };
}
