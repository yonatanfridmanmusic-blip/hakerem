import { getActiveYearId } from "@/lib/active-year";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BudgetSource = "gefen" | "iriyah" | "horim";

export interface BudgetCategory {
  id: string;
  name: string;
  source: BudgetSource;
  planned_amount: number;
  order_index: number;
  used: number; // calculated from expenses (categorized only)
}

export interface BudgetPlanData {
  categories: BudgetCategory[];
  totalSourceUsed: number; // ALL expenses for source, including uncategorized
}

// ─── Active year ──────────────────────────────────────────────────────────────


// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useBudgetPlan(source: BudgetSource) {
  return useQuery<BudgetPlanData>({
    queryKey: ["budget-plan", source],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return { categories: [], totalSourceUsed: 0 };

      // Fetch categories for this source
      const { data: cats, error: catErr } = await supabase
        .from("budget_categories")
        .select("id, name, source, planned_amount, order_index")
        .eq("school_year_id", yearId)
        .eq("source", source)
        .order("order_index");

      if (catErr) throw catErr;

      // Fetch ALL expenses for this source (categorized + uncategorized)
      const { data: exps, error: expErr } = await supabase
        .from("expenses")
        .select("budget_category_id, amount")
        .eq("school_year_id", yearId)
        .eq("source", source);

      if (expErr) throw expErr;

      // Total source used (ALL expenses — matches dashboard)
      const totalSourceUsed = (exps ?? []).reduce((s, e) => s + Number(e.amount), 0);

      // Per-category used (categorized expenses only)
      const usedMap: Record<string, number> = {};
      for (const exp of exps ?? []) {
        if (exp.budget_category_id) {
          usedMap[exp.budget_category_id] =
            (usedMap[exp.budget_category_id] ?? 0) + Number(exp.amount);
        }
      }

      const categories = (cats ?? []).map((c) => ({
        ...c,
        planned_amount: Number(c.planned_amount),
        used: usedMap[c.id] ?? 0,
      }));

      return { categories, totalSourceUsed };
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useUpdatePlannedAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      plannedAmount,
    }: {
      categoryId: string;
      plannedAmount: number;
    }) => {
      const { error } = await supabase
        .from("budget_categories")
        .update({ planned_amount: plannedAmount })
        .eq("id", categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAddBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      source,
      plannedAmount,
    }: {
      name: string;
      source: BudgetSource;
      plannedAmount: number;
    }) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");

      // Get max order_index for this source
      const { data: existing } = await supabase
        .from("budget_categories")
        .select("order_index")
        .eq("school_year_id", yearId)
        .eq("source", source)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (existing?.order_index ?? 0) + 1;

      const { data: inserted, error } = await supabase.from("budget_categories").insert({
        name,
        source,
        planned_amount: plannedAmount,
        school_year_id: yearId,
        order_index: nextOrder,
      }).select("id").single();
      if (error) throw error;
      return inserted as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
