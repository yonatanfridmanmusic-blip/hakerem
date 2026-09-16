import { getActiveYearId } from "@/lib/active-year";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetSource } from "@/types/budget";
import { showDeleteUndoToast, useUndoAuditEntry } from "@/hooks/use-audit-log";

export type { BudgetSource };

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
  linkedExpense?: boolean; // 2.4.0 נושא 2: ההכנסה היא חלק מזוג צבוע (יש הוצאה עם linked_income_id=זה)
  split_group_id: string | null; // 2.6.0 (P3): שורה מפעימה מפוצלת (אותו ערך = אותה פעימה); NULL = הכנסה רגילה
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
  notes?: string | null;
  split_group_id?: string | null;
}


export function useIncome(sourceFilter?: BudgetSource | "all") {
  return useQuery<Income[]>({
    queryKey: ["income", sourceFilter],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];

      let query = supabase
        .from("income")
        .select("id, income_date, amount, source, bank_account, payer, description, payment_method, reference_number, notes, budget_category_id, split_group_id, budget_categories(name)")
        .eq("school_year_id", yearId)
        .order("income_date", { ascending: false });

      if (sourceFilter && sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Income[];

      // 2.4.0 נושא 2: זיהוי הכנסות שהן חלק מזוג צבוע — שאילתה אחת (לא N+1):
      // אילו expenses.linked_income_id מצביעים על ההכנסות שנטענו.
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: links } = await supabase
          .from("expenses")
          .select("linked_income_id")
          .in("linked_income_id", ids);
        const linkedSet = new Set((links ?? []).map((l) => l.linked_income_id).filter(Boolean));
        for (const r of rows) r.linkedExpense = linkedSet.has(r.id);
      }
      return rows;
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

// 2.6.0 (P3): פיצול פעימה — יצירת N שורות הכנסה עם split_group_id משותף, ב-insert אחד.
export function useAddIncomeSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ split_group_id, base, legs }: {
      split_group_id: string;
      base: Omit<NewIncome, "amount" | "budget_category_id" | "split_group_id">;
      legs: { budget_category_id: string; amount: number }[];
    }) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();
      const rows = legs.map((l) => ({
        ...base, amount: l.amount, budget_category_id: l.budget_category_id,
        split_group_id, school_year_id: yearId, created_by: user?.id,
      }));
      const { error } = await supabase.from("income").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// 2.6.0 (P3): מחיקת פעימה מפוצלת כיחידה — כל השורות עם אותו split_group_id.
export function useDeleteIncomeGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (splitGroupId: string) => {
      const { error } = await supabase.from("income").delete().eq("split_group_id", splitGroupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export function useUpdateIncome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: Partial<NewIncome> & { id: string }) => {
      const { error } = await supabase.from("income").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteIncome() {
  const queryClient = useQueryClient();
  const undoEntry = useUndoAuditEntry();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("income").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      showDeleteUndoToast(id, "ההכנסה נמחקה", (entryId) => undoEntry.mutate(entryId));
    },
  });
}
