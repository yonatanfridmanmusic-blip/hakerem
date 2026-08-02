import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";
import { computeTarget, type Grade, type GradeSectionAmount } from "@/hooks/use-horim";

/**
 * Per-section breakdown for the dashboard accordion (phase 1.4 part 3).
 * Lazy — fetched only when a source card is expanded (enabled flag).
 *
 * Regular sources: one row per budget category —
 *   planned = category planned_amount, income/used by category linkage,
 *   plus an "לא משויך" bucket for unlinked income/expenses.
 * horim: one row per active parent section —
 *   planned = derived collection target (basis-aware, same computeTarget
 *   as the horim screen), income = collections, used = refunds,
 *   plus "לא משויך" (null-section collections/refunds + horim income rows).
 * Iron rule everywhere: balance = income − used.
 */
export interface BreakdownRow {
  id: string;
  name: string;
  planned: number;
  income: number;
  used: number;
  balance: number;
  unassigned?: boolean;
}

export function useSourceBreakdown(source: string, enabled: boolean) {
  return useQuery<BreakdownRow[]>({
    queryKey: ["source-breakdown", source],
    enabled,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];

      if (source === "horim") {
        const [{ data: sections }, { data: gsa }, { data: grades }, { data: colls }, { data: refunds }, { data: horimIncome }] = await Promise.all([
          supabase.from("parent_sections").select("id, name").eq("school_year_id", yearId).eq("is_active", true).order("order_index"),
          supabase.from("grade_section_amounts").select("id, grade_id, parent_section_id, amount_per_student, working_budget_basis, custom_working_budget, actual_collected").eq("school_year_id", yearId),
          supabase.from("grades").select("id, name, student_count").eq("school_year_id", yearId),
          supabase.from("parent_collections").select("parent_section_id, amount").eq("school_year_id", yearId),
          supabase.from("parent_refunds").select("parent_section_id, amount").eq("school_year_id", yearId),
          supabase.from("income").select("amount").eq("school_year_id", yearId).eq("source", "horim"),
        ]);

        const rows: BreakdownRow[] = (sections ?? []).map((sec) => {
          const planned = (gsa ?? [])
            .filter((row) => row.parent_section_id === sec.id)
            .reduce((sum, row) => {
              const grade = (grades ?? []).find((g) => g.id === row.grade_id);
              if (!grade) return sum;
              return sum + computeTarget(
                grade as unknown as Grade,
                { ...row, amount_per_student: Number(row.amount_per_student) } as unknown as GradeSectionAmount,
              );
            }, 0);
          const income = (colls ?? []).filter((c) => c.parent_section_id === sec.id).reduce((s, c) => s + Number(c.amount), 0);
          const used = (refunds ?? []).filter((r) => r.parent_section_id === sec.id).reduce((s, r) => s + Number(r.amount), 0);
          return { id: sec.id, name: sec.name, planned, income, used, balance: income - used };
        });

        const unassignedIncome =
          (colls ?? []).filter((c) => c.parent_section_id === null).reduce((s, c) => s + Number(c.amount), 0)
          + (horimIncome ?? []).reduce((s, r) => s + Number(r.amount), 0);
        const unassignedUsed = (refunds ?? []).filter((r) => r.parent_section_id === null).reduce((s, r) => s + Number(r.amount), 0);
        if (unassignedIncome > 0 || unassignedUsed > 0) {
          rows.push({
            id: "__unassigned__", name: "לא משויך", planned: 0,
            income: unassignedIncome, used: unassignedUsed,
            balance: unassignedIncome - unassignedUsed, unassigned: true,
          });
        }
        return rows;
      }

      // Regular sources — per budget category
      const [{ data: cats }, { data: exps }, { data: incs }] = await Promise.all([
        supabase.from("budget_categories").select("id, name, planned_amount").eq("school_year_id", yearId).eq("source", source).order("order_index"),
        supabase.from("expenses").select("budget_category_id, amount").eq("school_year_id", yearId).eq("source", source),
        supabase.from("income").select("budget_category_id, amount").eq("school_year_id", yearId).eq("source", source),
      ]);

      const rows: BreakdownRow[] = (cats ?? []).map((c) => {
        const income = (incs ?? []).filter((i) => i.budget_category_id === c.id).reduce((s, i) => s + Number(i.amount), 0);
        const used = (exps ?? []).filter((e) => e.budget_category_id === c.id).reduce((s, e) => s + Number(e.amount), 0);
        return { id: c.id, name: c.name, planned: Number(c.planned_amount), income, used, balance: income - used };
      });

      const unassignedIncome = (incs ?? []).filter((i) => !i.budget_category_id).reduce((s, i) => s + Number(i.amount), 0);
      const unassignedUsed = (exps ?? []).filter((e) => !e.budget_category_id).reduce((s, e) => s + Number(e.amount), 0);
      if (unassignedIncome > 0 || unassignedUsed > 0) {
        rows.push({
          id: "__unassigned__", name: "לא משויך", planned: 0,
          income: unassignedIncome, used: unassignedUsed,
          balance: unassignedIncome - unassignedUsed, unassigned: true,
        });
      }
      return rows;
    },
  });
}
