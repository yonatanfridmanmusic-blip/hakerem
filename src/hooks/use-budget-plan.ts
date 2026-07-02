import { getActiveYearId } from "@/lib/active-year";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetSource } from "@/types/budget";

export type { BudgetSource };

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

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch budget plan for a given source.
 * Pass `targetYearId` to view/plan a specific year without switching the active year.
 * If omitted, falls back to the active year.
 */
export function useBudgetPlan(source: BudgetSource, targetYearId?: string | null) {
  return useQuery<BudgetPlanData>({
    queryKey: ["budget-plan", source, targetYearId ?? "active"],
    queryFn: async () => {
      const yid = targetYearId ?? (await getActiveYearId());
      if (!yid) return { categories: [], totalSourceUsed: 0 };

      // Fetch categories for this source
      const { data: cats, error: catErr } = await supabase
        .from("budget_categories")
        .select("id, name, source, planned_amount, order_index")
        .eq("school_year_id", yid)
        .eq("source", source)
        .order("order_index");

      if (catErr) throw catErr;

      // Fetch ALL expenses for this source (categorized + uncategorized)
      const { data: exps, error: expErr } = await supabase
        .from("expenses")
        .select("budget_category_id, amount")
        .eq("school_year_id", yid)
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
      targetYearId,
    }: {
      name: string;
      source: BudgetSource;
      plannedAmount: number;
      targetYearId?: string | null;
    }) => {
      const yid = targetYearId ?? (await getActiveYearId());
      if (!yid) throw new Error("אין שנת לימודים פעילה");

      // Get max order_index for this source
      const { data: existing } = await supabase
        .from("budget_categories")
        .select("order_index")
        .eq("school_year_id", yid)
        .eq("source", source)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (existing?.order_index ?? 0) + 1;

      const { data: inserted, error } = await supabase
        .from("budget_categories")
        .insert({
          name,
          source,
          planned_amount: plannedAmount,
          school_year_id: yid,
          order_index: nextOrder,
        })
        .select("id")
        .single();
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

// ─── Copy categories from one year to another ─────────────────────────────────

export function useCopyBudgetCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromYearId,
      toYearId,
    }: {
      fromYearId: string;
      toYearId: string;
    }) => {
      // Fetch all categories from source year
      const { data: sourceCats, error: fetchErr } = await supabase
        .from("budget_categories")
        .select("name, source, planned_amount, order_index")
        .eq("school_year_id", fromYearId)
        .order("order_index");

      if (fetchErr) throw fetchErr;
      if (!sourceCats || sourceCats.length === 0) throw new Error("אין קטגוריות להעתקה");

      // Insert them into the target year
      const rows = sourceCats.map((c) => ({
        name: c.name,
        source: c.source,
        planned_amount: c.planned_amount,
        order_index: c.order_index,
        school_year_id: toYearId,
      }));

      const { error: insertErr } = await supabase.from("budget_categories").insert(rows);
      if (insertErr) throw insertErr;

      return sourceCats.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories"] });
    },
  });
}
