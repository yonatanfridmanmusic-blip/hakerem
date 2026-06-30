import { getActiveYearId } from "@/lib/active-year";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BudgetSource = "gefen" | "iriyah" | "horim";

export interface Income {
  id: string;
  income_date: string;
  amount: number;
  source: BudgetSource;
  bank_account: "school" | "parents";
  payer: string | null;
  description: string | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  budget_category_id: string | null;
  budget_categories?: { name: string } | null;
}

export interface NewIncome {
  income_date: string;
  amount: number;
  source: BudgetSource;
  bank_account: "school" | "parents";
  payer?: string | null;
  description?: string | null;
  payment_method?: string | null;
  reference_number?: string | null;
  budget_category_id?: string | null;
}


export function useIncome(sourceFilter?: BudgetSource | "all") {
  return useQuery<Income[]>({
    queryKey: ["income", sourceFilter],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];

      let query = supabase
        .from("income")
        .select("id, income_date, amount, source, bank_account, payer, description, payment_method, reference_number, notes, budget_category_id, budget_categories(name)")
        .eq("school_year_id", yearId)
        .order("income_date", { ascending: false });

      if (sourceFilter && sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Income[];
    },
    staleTime: 1000 * 60,
  });
}

export function useUpdateIncomeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, budget_category_id }: { id: string; budget_category_id: string | null }) => {
      const { error } = await supabase
        .from("income")
        .update({ budget_category_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
    },
  });
}

export function useAddIncome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (income: NewIncome) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("income").insert({
        ...income,
        school_year_id: yearId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
