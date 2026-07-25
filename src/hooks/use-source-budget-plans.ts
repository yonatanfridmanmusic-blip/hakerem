import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";

/**
 * Global planned income per source for the active school year,
 * as a map: { gefen: 120000, iriyah: 80000, ... }.
 * Sources without a plan are simply absent. horim never has a row —
 * its planned income is derived from collection targets (see use-horim).
 */
export function useSourceBudgetPlans() {
  return useQuery<Record<string, number>>({
    queryKey: ["source-budget-plans"],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return {};
      const { data, error } = await supabase
        .from("source_budget_plans")
        .select("source, planned_income")
        .eq("school_year_id", yearId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.source] = Number(row.planned_income);
      return map;
    },
    staleTime: 1000 * 60 * 2,
  });
}
