import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";

/**
 * 2.8.0 — תת-קטגוריות (הורים).
 * A sub-category is a `budget_activities` row under a budget category; an expense
 * points at it through `expenses.budget_activity_id`. Both already exist in the
 * schema (dev + prod, RLS included) — no DB change. planned_amount stays 0 here;
 * it is reserved for the activity-planning feature.
 */
export interface SubCategory {
  id: string;
  name: string;
  budget_category_id: string;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

export function useSubCategories(source: string, enabled = true) {
  return useQuery<SubCategory[]>({
    queryKey: ["sub-categories", source],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];
      const { data, error } = await supabase
        .from("budget_activities")
        .select("id, name, budget_category_id")
        .eq("school_year_id", yearId)
        .eq("source", source)
        .order("order_index")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddSubCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, budgetCategoryId }: { name: string; budgetCategoryId: string }) => {
      const trimmed = clean(name);
      if (!trimmed) throw new Error("יש להזין שם לתת-הקטגוריה");

      // The sub-category lives in the same year + source as its parent category.
      const { data: cat, error: catErr } = await supabase
        .from("budget_categories")
        .select("school_year_id, source")
        .eq("id", budgetCategoryId)
        .single();
      if (catErr || !cat) throw catErr ?? new Error("הקטגוריה לא נמצאה");

      const { data: existing, error: exErr } = await supabase
        .from("budget_activities")
        .select("id, name")
        .eq("budget_category_id", budgetCategoryId);
      if (exErr) throw exErr;

      // Same name under the same category → reuse, never duplicate.
      const hit = (existing ?? []).find((a) => clean(a.name) === trimmed);
      if (hit) return { id: hit.id, existed: true };

      const { data, error } = await supabase
        .from("budget_activities")
        .insert({
          school_year_id: cat.school_year_id,
          source: cat.source,
          budget_category_id: budgetCategoryId,
          name: trimmed,
          planned_amount: 0,
          order_index: existing?.length ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, existed: false };
    },
    // Returned promise is awaited — the list is fresh before the caller selects the new id.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sub-categories"] }),
  });
}
