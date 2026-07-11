import { getActiveYearId } from "@/lib/active-year";
import { useGrades as _useGradesCanonical } from "@/hooks/use-grades";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showDeleteUndoToast, useUndoAuditEntry } from "@/hooks/use-audit-log";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Grade {
  id: string;
  name: string;
  student_count: number;
  order_index: number;
}

export interface ParentSection {
  id: string;
  name: string;
  order_index: number;
  is_active: boolean;
}

export interface GradeSectionAmount {
  id?: string;
  grade_id: string;
  parent_section_id: string;
  amount_per_student: number;
  actual_collected: number | null;
  working_budget_basis: "p85" | "p100" | "actual" | "custom";
  custom_working_budget: number | null;
}

export interface ParentCollection {
  id: string;
  grade_id: string;
  parent_section_id: string;
  collection_date: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

// ─── Active year ──────────────────────────────────────────────────────────────


// ─── Hooks ────────────────────────────────────────────────────────────────────

// Delegates to the canonical useGrades hook (use-grades.ts) using active year
export function useGrades() {
  return _useGradesCanonical(undefined);
}

export function useParentSections() {
  return useQuery<ParentSection[]>({
    queryKey: ["parent-sections"],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];
      const { data, error } = await supabase
        .from("parent_sections")
        .select("id, name, order_index, is_active")
        .eq("school_year_id", yearId)
        .eq("is_active", true)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** All sections (active AND inactive) — for manage/toggle UI */
export function useAllParentSections() {
  return useQuery<ParentSection[]>({
    queryKey: ["parent-sections-all"],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];
      const { data, error } = await supabase
        .from("parent_sections")
        .select("id, name, order_index, is_active")
        .eq("school_year_id", yearId)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useGradeSectionAmounts() {
  return useQuery<GradeSectionAmount[]>({
    queryKey: ["grade-section-amounts"],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];
      const { data, error } = await supabase
        .from("grade_section_amounts")
        .select("id, grade_id, parent_section_id, amount_per_student, actual_collected, working_budget_basis, custom_working_budget")
        .eq("school_year_id", yearId);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        amount_per_student: Number(r.amount_per_student),
        actual_collected: r.actual_collected != null ? Number(r.actual_collected) : null,
        custom_working_budget: r.custom_working_budget != null ? Number(r.custom_working_budget) : null,
      }));
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useParentCollections() {
  return useQuery<ParentCollection[]>({
    queryKey: ["parent-collections"],
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return [];
      const { data, error } = await supabase
        .from("parent_collections")
        .select("id, grade_id, parent_section_id, collection_date, amount, notes, created_at")
        .eq("school_year_id", yearId)
        .order("collection_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
    },
    staleTime: 1000 * 60 * 2,
  });
}

// Add a new parent section
export function useAddParentSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: existing } = await supabase
        .from("parent_sections")
        .select("order_index")
        .eq("school_year_id", yearId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = (existing?.order_index ?? -1) + 1;
      const { error } = await supabase.from("parent_sections").insert({
        school_year_id: yearId,
        name,
        order_index: nextOrder,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-sections"] });
      queryClient.invalidateQueries({ queryKey: ["parent-sections-all"] });
    },
  });
}

// Toggle section active/inactive
export function useToggleParentSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("parent_sections")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-sections"] });
      queryClient.invalidateQueries({ queryKey: ["parent-sections-all"] });
    },
  });
}

// ─── Horim → budget_category sync ────────────────────────────────────────────

/**
 * After any grade_section_amount change, recompute the total planned amount
 * for the section across all grades and upsert it as a budget_category
 * for the "horim" source. This lets the budget planning screen show
 * planned vs. actual for parent collections.
 */
export async function syncHorimBudgetCategory(
  yearId: string,
  sectionId: string,
  sectionName: string,
) {
  // All amounts for this section
  const { data: allGSA } = await supabase
    .from("grade_section_amounts")
    .select("grade_id, amount_per_student")
    .eq("school_year_id", yearId)
    .eq("parent_section_id", sectionId);

  // All grades with student_count
  const { data: grades } = await supabase
    .from("grades")
    .select("id, student_count")
    .eq("school_year_id", yearId);

  const gradeMap: Record<string, number> = Object.fromEntries(
    (grades ?? []).map((g) => [g.id, Number(g.student_count)]),
  );

  const totalPlanned = (allGSA ?? []).reduce((sum, gsa) => {
    return sum + Number(gsa.amount_per_student) * (gradeMap[gsa.grade_id] ?? 0);
  }, 0);

  // True upsert — relies on UNIQUE (school_year_id, source, name) constraint
  // We need order_index for new rows; on conflict we only update planned_amount.
  const { data: maxOrder } = await supabase
    .from("budget_categories")
    .select("order_index")
    .eq("school_year_id", yearId)
    .eq("source", "horim")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("budget_categories").upsert(
    {
      school_year_id: yearId,
      name: sectionName,
      source: "horim",
      planned_amount: totalPlanned,
      order_index: (maxOrder?.order_index ?? 0) + 1,
    },
    { onConflict: "school_year_id,source,name", ignoreDuplicates: false },
  );
}

/**
 * Sync ALL horim sections to budget_categories at once.
 * Call this on page load to ensure budget planning always reflects current amounts
 * even if data was entered before the per-section sync was introduced.
 */
export async function syncAllHorimBudgetCategories(
  sections: ParentSection[],
): Promise<void> {
  const yearId = await getActiveYearId();
  if (!yearId || sections.length === 0) return;
  for (const section of sections) {
    await syncHorimBudgetCategory(yearId, section.id, section.name);
  }
}

// Upsert grade_section_amount (set amount_per_student for a grade+section)
export function useUpsertGradeSectionAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gradeId,
      sectionId,
      sectionName,
      amountPerStudent,
      existingId,
    }: {
      gradeId: string;
      sectionId: string;
      sectionName: string;
      amountPerStudent: number;
      existingId?: string;
    }) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");

      if (existingId) {
        const { error } = await supabase
          .from("grade_section_amounts")
          .update({ amount_per_student: amountPerStudent })
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("grade_section_amounts").insert({
          school_year_id: yearId,
          grade_id: gradeId,
          parent_section_id: sectionId,
          amount_per_student: amountPerStudent,
          working_budget_basis: "p85",
        });
        if (error) throw error;
      }

      // Sync budget_category planned amount for this horim section
      await syncHorimBudgetCategory(yearId, sectionId, sectionName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grade-section-amounts"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Record a parent collection payment
export function useAddParentCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gradeId,
      sectionId,
      amount,
      collectionDate,
      notes,
    }: {
      gradeId: string;
      sectionId: string;
      amount: number;
      collectionDate: string;
      notes?: string;
    }) => {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("parent_collections").insert({
        school_year_id: yearId,
        grade_id: gradeId,
        parent_section_id: sectionId,
        amount,
        collection_date: collectionDate,
        notes: notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Update a parent collection
export function useUpdateParentCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      amount,
      collectionDate,
      notes,
    }: {
      id: string;
      amount: number;
      collectionDate: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("parent_collections")
        .update({ amount, collection_date: collectionDate, notes: notes || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Delete a parent collection
export function useDeleteParentCollection() {
  const queryClient = useQueryClient();
  const undoEntry = useUndoAuditEntry();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parent_collections").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["parent-collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      showDeleteUndoToast(id, "הגבייה נמחקה", (entryId) => undoEntry.mutate(entryId));
    },
  });
}

// Helper: compute target for a grade+section
export function computeTarget(
  grade: Grade,
  gsa: GradeSectionAmount | undefined
): number {
  if (!gsa || gsa.amount_per_student === 0) return 0;
  const basis = gsa.working_budget_basis ?? "p85";
  if (basis === "p85") return gsa.amount_per_student * grade.student_count * 0.85;
  if (basis === "p100") return gsa.amount_per_student * grade.student_count;
  if (basis === "custom") return gsa.custom_working_budget ?? 0;
  if (basis === "actual") return gsa.actual_collected ?? 0;
  return gsa.amount_per_student * grade.student_count * 0.85;
}
