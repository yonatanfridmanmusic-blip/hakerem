import { getActiveYearId } from "@/lib/active-year";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetSource } from "@/types/budget";

export type { BudgetSource };

export interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  source: BudgetSource;
  budget_category_id: string | null;
  activity_name: string | null;
  supplier: string | null;
  description: string | null;
  bank_account: "school" | "parents" | null;
  receipt_url: string | null;
  budget_categories?: { name: string } | null;
}

export interface NewExpense {
  expense_date: string;
  amount: number;
  source: BudgetSource;
  budget_category_id?: string | null;
  activity_name?: string | null;
  supplier?: string | null;
  description?: string | null;
  bank_account: "school" | "parents";
  receipt_url?: string | null;
}

// ─── Active year ──────────────────────────────────────────────────────────────


// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useExpenses(sourceFilter?: BudgetSource | "all") {
  return useQuery<Expense[]>({
    queryKey: ["expenses", sourceFilter],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];

      let query = supabase
        .from("expenses")
        .select("id, expense_date, amount, source, budget_category_id, activity_name, supplier, description, bank_account, receipt_url, budget_categories(name)")
        .eq("school_year_id", yearId)
        .order("expense_date", { ascending: false });

      if (sourceFilter && sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Expense[];
    },
    staleTime: 1000 * 60,
  });
}

export function useAddExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expense: NewExpense) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        ...expense,
        school_year_id: yearId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: Partial<NewExpense> & { id: string }) => {
      const { error } = await supabase.from("expenses").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
    },
  });
}

export function useBudgetCategories(source?: BudgetSource) {
  return useQuery({
    queryKey: ["budget-categories", source],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];
      let query = supabase
        .from("budget_categories")
        .select("id, name, source")
        .eq("school_year_id", yearId)
        .order("order_index");
      if (source) query = query.eq("source", source);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: true,
    staleTime: 1000 * 60 * 5,
  });
}
