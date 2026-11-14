/**
 * Dashboard accordion — category view for regular sources (gefen / iriyah / custom).
 *
 * Money for these sources arrives in lump tranches ("פעימות") that belong to the
 * source as a whole, not to a single category. So at category level the honest
 * question is "how much of my PLAN is left" (planned − used), never income − used.
 * The actual cash balance (income − used) stays at SOURCE level only.
 *
 * Pure function — no I/O — so it can be tested against real data.
 */
export interface CategoryInputRow {
  id: string;
  name: string;
  planned: number;
  income: number;
  used: number;
  unassigned?: boolean;
}

/** planned = has a plan, within it · over = spent more than planned ·
 *  unplanned = spent with no plan · idle = nothing planned, nothing spent */
export type CategoryState = "planned" | "over" | "unplanned" | "idle";

export interface CategorySpendRow {
  id: string;
  name: string;
  planned: number;
  used: number;
  /** planned − used; null when the category has no plan */
  remaining: number | null;
  state: CategoryState;
  unassigned?: boolean;
}

export interface CategoryIncomeLine {
  id: string;
  name: string;
  amount: number;
  unassigned?: boolean;
}

export interface CategoryView {
  spend: CategorySpendRow[];
  incomeLines: CategoryIncomeLine[];
  totals: { planned: number; used: number; remaining: number; income: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildCategoryView(rows: CategoryInputRow[]): CategoryView {
  // A category that only ever received income (a tranche, an opening balance)
  // is not a spending line — it moves to the "what came in" list.
  const isIncomeOnly = (r: CategoryInputRow) => r.income > 0 && r.used <= 0 && r.planned <= 0;

  const spend: CategorySpendRow[] = rows
    .filter((r) => !isIncomeOnly(r))
    .map((r) => {
      const planned = r2(r.planned);
      const used = r2(r.used);
      if (planned > 0) {
        const remaining = r2(planned - used);
        return { id: r.id, name: r.name, planned, used, remaining, state: remaining < 0 ? "over" : "planned", unassigned: r.unassigned };
      }
      return { id: r.id, name: r.name, planned: 0, used, remaining: null, state: used > 0 ? "unplanned" : "idle", unassigned: r.unassigned };
    });

  const incomeLines: CategoryIncomeLine[] = rows
    .filter((r) => r.income > 0)
    .map((r) => ({ id: r.id, name: r.name, amount: r2(r.income), unassigned: r.unassigned }))
    .sort((a, b) => b.amount - a.amount);

  const planned = r2(spend.reduce((s, r) => s + r.planned, 0));
  const used = r2(spend.reduce((s, r) => s + r.used, 0));
  const income = r2(incomeLines.reduce((s, l) => s + l.amount, 0));

  return { spend, incomeLines, totals: { planned, used, remaining: r2(planned - used), income } };
}
