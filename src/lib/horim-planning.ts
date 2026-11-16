/**
 * 2.9.0 — תכנון פעילויות במסך ההורים (בקשת נורית, כרמים).
 *
 * המודל: לכל שכבה × סעיף יש "קופה". הבסיס שלה הוא היעד (לפי אחוז הגבייה של השנה),
 * ממנו יורד מה שכבר יצא ומה שתוכנן ועוד לא יצא. מה שנשאר = "נשאר לתכנן".
 *
 * פעילות = שורת budget_activities עם תכנון (planned_amount > 0 או רכיבים). שורה בלי
 * תכנון היא תת-קטגוריה רגילה (2.8.0) ואינה מוצגת כפעילות.
 *
 * אין כאן שום מושג של העברה בין סעיפים או בין שכבות: פעילות שייכת לסעיף אחד,
 * וכל שכבה משלמת רק את החלק שלה (לפי מספר תלמידים).
 *
 * פונקציות טהורות בלבד — בלי I/O — כדי שאפשר לבדוק אותן מול נתונים אמיתיים.
 * כל הסכומים הפנימיים באגורות שלמות.
 */

export type PlanComponentKind = "per_student" | "quantity" | "fixed";

export interface PlanComponent {
  name: string;
  kind: PlanComponentKind;
  /** per_student: מחיר לילד · quantity: מחיר ליחידה · fixed: הסכום כולו */
  price: number;
  /** quantity בלבד */
  qty?: number;
}

export interface PlannedActivity {
  id: string;
  name: string;
  budget_category_id: string;
  planned_amount: number;
  grade_id: string | null;
  target_grade_ids: string[];
  notes: string | null;
  components: PlanComponent[];
}

export interface GradeLite { id: string; name: string; student_count: number }
export interface SectionLite { id: string; name: string }

/** מה שמסך ההורים כבר מחשב לכל שכבה (GradeSpend) — רק השדות שנחוצים כאן. */
export interface SpendLike {
  bySectionAg: Map<string, number>;
  subsBySection: Map<string, Map<string, { name: string; ag: number }>>;
}

export const toAg = (n: number) => Math.round((Number(n) || 0) * 100);
export const fromAg = (ag: number) => ag / 100;

/** חלוקה באגורות שלמות לפי משקלים, בשיטת השארית הגדולה — הסכום נשמר בדיוק.
 *  אותה שיטה כמו בחלוקת הוצאות במסך ההורים (2.7.0). */
export function splitByWeights(cents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (cents <= 0) return weights.map(() => 0);
  // שכבות בלי תלמידים מוגדרים — חלוקה שווה, כדי שהסכום לא ייעלם
  if (weights.reduce((a, b) => a + b, 0) <= 0) weights = weights.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (cents * w) / total);
  const out = exact.map((x) => Math.floor(x));
  const rem = cents - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; k < rem && k < order.length; k++) out[order[k].i] += 1;
  return out;
}

export const hasPlan = (a: Pick<PlannedActivity, "planned_amount" | "components">) =>
  (a.components?.length ?? 0) > 0 || Number(a.planned_amount) > 0;

/** השכבות שהפעילות מיועדת להן: אחת (grade_id) · כמה (target_grade_ids) · אף אחת = כולן. */
export function targetGradesOf(
  a: Pick<PlannedActivity, "grade_id" | "target_grade_ids">,
  grades: GradeLite[],
): GradeLite[] {
  if (a.grade_id) {
    const g = grades.find((x) => x.id === a.grade_id);
    if (g) return [g];
  }
  const several = grades.filter((g) => (a.target_grade_ids ?? []).includes(g.id));
  return several.length > 0 ? several : grades;
}

export function componentAg(c: PlanComponent, students: number): number {
  const price = Number(c.price) || 0;
  if (c.kind === "per_student") return toAg(price * students);
  if (c.kind === "quantity") return toAg(price * (Number(c.qty) || 0));
  return toAg(price);
}

/** עלות הפעילות כולה. עם רכיבים — מחושבת מהם (רכיב "לכל ילד" לפי מספר התלמידים העדכני). */
export function activityTotalAg(
  a: Pick<PlannedActivity, "planned_amount" | "components" | "grade_id" | "target_grade_ids">,
  grades: GradeLite[],
): number {
  const comps = a.components ?? [];
  if (comps.length === 0) return toAg(a.planned_amount);
  const students = targetGradesOf(a, grades).reduce((s, g) => s + g.student_count, 0);
  return comps.reduce((s, c) => s + componentAg(c, students), 0);
}

/** החלק של כל שכבה בעלות הפעילות — לפי מספר תלמידים. */
export function activityShares(
  a: Pick<PlannedActivity, "planned_amount" | "components" | "grade_id" | "target_grade_ids">,
  grades: GradeLite[],
): Map<string, number> {
  const targets = targetGradesOf(a, grades);
  const alloc = splitByWeights(activityTotalAg(a, grades), targets.map((g) => g.student_count));
  return new Map(targets.map((g, i) => [g.id, alloc[i]]));
}

export interface PlanActivityRow {
  activity: PlannedActivity;
  /** החלק של השכבה הזו בתכנון */
  plannedAg: number;
  /** מה שכבר יצא על הפעילות, בחלק של השכבה הזו */
  spentAg: number;
  /** מתוכנן שעוד לא יצא (לא יורד מתחת לאפס) */
  openAg: number;
  /** הפעילות משותפת לכמה שכבות */
  sharedWith: string[];
}

export interface PlanSectionBox {
  sectionId: string;
  name: string;
  targetAg: number;
  collectedAg: number;
  spentAg: number;
  /** הוצאות בסעיף שלא שייכות לאף פעילות מתוכננת */
  spentUnplannedAg: number;
  plannedOpenAg: number;
  /** יעד − יצא − מתוכנן שעוד לא יצא */
  leftAg: number;
  activities: PlanActivityRow[];
}

export interface PlanGradeView {
  gradeId: string;
  name: string;
  students: number;
  targetAg: number;
  collectedAg: number;
  spentAg: number;
  plannedOpenAg: number;
  /** סכום הקופות שנשאר בהן כסף. קופה בחריגה לא מקטינה אותו — אין העברה בין סעיפים. */
  leftAg: number;
  /** סכום החריגות בקופות שחרגו, ומספרן */
  overAg: number;
  overCount: number;
  sections: PlanSectionBox[];
}

export interface PlanningView {
  grades: PlanGradeView[];
  totals: { targetAg: number; collectedAg: number; spentAg: number; plannedOpenAg: number; leftAg: number; overAg: number; overCount: number };
}

export function buildPlanningView(input: {
  grades: GradeLite[];
  sections: SectionLite[];
  /** יעד בשקלים לשכבה × סעיף (כבר לפי אחוז הגבייה שנבחר) */
  targetOf: (gradeId: string, sectionId: string) => number;
  /** נגבה בשקלים לשכבה × סעיף */
  collectedOf: (gradeId: string, sectionId: string) => number;
  spendByGrade: Map<string, SpendLike>;
  activities: PlannedActivity[];
  /** קטגוריית התקציב של הפעילות → הסעיף שלה */
  sectionIdOfCategory: (budgetCategoryId: string) => string | undefined;
}): PlanningView {
  const { grades, sections, targetOf, collectedOf, spendByGrade, activities, sectionIdOfCategory } = input;

  // activity → section, shares per grade (computed once)
  const planned = activities.filter(hasPlan).map((a) => ({
    a,
    sectionId: sectionIdOfCategory(a.budget_category_id),
    shares: activityShares(a, grades),
    sharedWith: targetGradesOf(a, grades).map((g) => g.name),
  })).filter((p) => !!p.sectionId);

  const gradeViews: PlanGradeView[] = grades.map((g) => {
    const spend = spendByGrade.get(g.id);
    const boxes: PlanSectionBox[] = [];
    for (const s of sections) {
      const targetAg = toAg(targetOf(g.id, s.id));
      const collectedAg = toAg(collectedOf(g.id, s.id));
      const spentAg = spend?.bySectionAg.get(s.id) ?? 0;
      const subs = spend?.subsBySection.get(s.id);
      const rows: PlanActivityRow[] = planned
        .filter((p) => p.sectionId === s.id && p.shares.has(g.id))
        .map((p) => {
          const plannedAg = p.shares.get(g.id) ?? 0;
          const rowSpent = subs?.get(p.a.id)?.ag ?? 0;
          return {
            activity: p.a, plannedAg, spentAg: rowSpent,
            openAg: Math.max(plannedAg - rowSpent, 0),
            sharedWith: p.sharedWith.length > 1 ? p.sharedWith : [],
          };
        });
      // a section that has nothing for this grade is not a box
      if (targetAg === 0 && collectedAg === 0 && spentAg === 0 && rows.length === 0) continue;
      const plannedOpenAg = rows.reduce((sm, r) => sm + r.openAg, 0);
      const spentOnPlanned = rows.reduce((sm, r) => sm + r.spentAg, 0);
      boxes.push({
        sectionId: s.id, name: s.name, targetAg, collectedAg, spentAg,
        spentUnplannedAg: Math.max(spentAg - spentOnPlanned, 0),
        plannedOpenAg, leftAg: targetAg - spentAg - plannedOpenAg, activities: rows,
      });
    }
    const sum = (f: (b: PlanSectionBox) => number) => boxes.reduce((sm, b) => sm + f(b), 0);
    return {
      gradeId: g.id, name: g.name, students: g.student_count,
      targetAg: sum((b) => b.targetAg), collectedAg: sum((b) => b.collectedAg), spentAg: sum((b) => b.spentAg),
      plannedOpenAg: sum((b) => b.plannedOpenAg),
      leftAg: sum((b) => Math.max(b.leftAg, 0)), overAg: sum((b) => Math.max(-b.leftAg, 0)),
      overCount: boxes.filter((b) => b.leftAg < 0).length, sections: boxes,
    };
  });

  const tot = (f: (g: PlanGradeView) => number) => gradeViews.reduce((sm, g) => sm + f(g), 0);
  return {
    grades: gradeViews,
    totals: {
      targetAg: tot((g) => g.targetAg), collectedAg: tot((g) => g.collectedAg), spentAg: tot((g) => g.spentAg),
      plannedOpenAg: tot((g) => g.plannedOpenAg), leftAg: tot((g) => g.leftAg),
      overAg: tot((g) => g.overAg), overCount: tot((g) => g.overCount),
    },
  };
}

/** שדות השכבה לשמירה — אותו מודל כמו בהוצאות (2.8.0). */
export function gradeFieldsOf(selected: string[], allGradeIds: string[]): { grade_id: string | null; target_grade_ids: string[] } {
  const picked = allGradeIds.filter((id) => selected.includes(id));
  if (picked.length === 0 || picked.length === allGradeIds.length) return { grade_id: null, target_grade_ids: [] };
  if (picked.length === 1) return { grade_id: picked[0], target_grade_ids: [] };
  return { grade_id: null, target_grade_ids: picked };
}

/** ניקוי רכיבים לפני שמירה: בלי שורות ריקות, מספרים תקינים. */
export function cleanComponents(list: PlanComponent[]): PlanComponent[] {
  return list
    .map((c) => ({
      name: (c.name ?? "").trim().replace(/\s+/g, " "),
      kind: c.kind,
      price: Math.max(Number(c.price) || 0, 0),
      ...(c.kind === "quantity" ? { qty: Math.max(Number(c.qty) || 0, 0) } : {}),
    }))
    .filter((c) => c.price > 0 && (c.kind !== "quantity" || (c.qty ?? 0) > 0));
}

/** קריאת רכיבים מה-DB (jsonb) בלי להניח שהמבנה תקין. */
export function parseComponents(raw: unknown): PlanComponent[] {
  if (!Array.isArray(raw)) return [];
  const kinds: PlanComponentKind[] = ["per_student", "quantity", "fixed"];
  const out: PlanComponent[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const kind = kinds.includes(o.kind as PlanComponentKind) ? (o.kind as PlanComponentKind) : "fixed";
    const price = Number(o.price) || 0;
    if (price <= 0) continue;
    out.push({ name: typeof o.name === "string" ? o.name : "", kind, price, ...(kind === "quantity" ? { qty: Number(o.qty) || 0 } : {}) });
  }
  return out;
}
