import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getViewAsOrg } from "@/lib/view-as";

export interface SchoolYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  collection_percentage: number;
  created_at: string;
}

export function useSchoolYears() {
  // Read View As org synchronously so it can go into the queryKey.
  // This prevents cache collisions when the super-admin switches between orgs.
  const viewAs = getViewAsOrg();
  const viewAsOrgId = viewAs?.orgId ?? null;

  return useQuery<SchoolYear[]>({
    queryKey: ["school-years", viewAsOrgId ?? "self"],
    queryFn: async () => {
      // Super-admin "View As" — return the target org's school years
      if (viewAsOrgId) {
        const { data, error } = await supabase
          .from("school_years")
          .select("id, name, start_date, end_date, is_active, collection_percentage, created_at")
          .eq("organization_id", viewAsOrgId)
          .order("start_date", { ascending: false });
        if (error) throw error;
        return (data ?? []).map((y) => ({
          ...y,
          collection_percentage: Number(y.collection_percentage),
        }));
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      // Explicit org filter — super_admin RLS policy sees all orgs otherwise
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!mem?.organization_id) return [];

      const { data, error } = await supabase
        .from("school_years")
        .select("id, name, start_date, end_date, is_active, collection_percentage, created_at")
        .eq("organization_id", mem.organization_id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((y) => ({
        ...y,
        collection_percentage: Number(y.collection_percentage),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateSchoolYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      start_date: string;
      end_date: string;
      collection_percentage: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      // Resolve the user's active organization
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!mem?.organization_id) throw new Error("לא שויכת לארגון. צור ארגון תחילה.");

      // Auto-activate if there's no currently active year in this org
      const { data: activeYears } = await supabase
        .from("school_years")
        .select("id")
        .eq("organization_id", mem.organization_id)
        .eq("is_active", true)
        .limit(1);

      const shouldActivate = !activeYears || activeYears.length === 0;

      const { data: newYear, error } = await supabase
        .from("school_years")
        .insert({
          ...payload,
          is_active: shouldActivate,
          created_by: user.id,
          organization_id: mem.organization_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return newYear?.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteSchoolYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (yearId: string) => {
      const { error } = await supabase
        .from("school_years")
        .delete()
        .eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
    },
  });
}

export function useUpdateSchoolYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<SchoolYear> & { id: string }) => {
      const { error } = await supabase
        .from("school_years")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["income"] });
    },
  });
}

// ─── Copy year data ────────────────────────────────────────────────────────────

export interface CopyYearOptions {
  copyGrades: boolean;
  copySections: boolean;
  copyAmounts: boolean;          // grade_section_amounts (needs grades+sections)
  copyBudgetCategories: boolean;
}

export interface CopyYearResult {
  grades: number;
  sections: number;
  amounts: number;
  categories: number;
}

export function useCopyYearData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromYearId,
      toYearId,
      options,
    }: {
      fromYearId: string;
      toYearId: string;
      options: CopyYearOptions;
    }): Promise<CopyYearResult> => {
      const result: CopyYearResult = { grades: 0, sections: 0, amounts: 0, categories: 0 };
      const gradeIdMap: Record<string, string> = {};
      const sectionIdMap: Record<string, string> = {};

      // 1. Copy grades
      if (options.copyGrades) {
        const { data: src, error: e1 } = await supabase
          .from("grades")
          .select("id, name, student_count, order_index")
          .eq("school_year_id", fromYearId)
          .order("order_index");
        if (e1) throw e1;
        if (src && src.length > 0) {
          const { data: inserted, error: e2 } = await supabase
            .from("grades")
            .insert(src.map((g) => ({ name: g.name, student_count: g.student_count, order_index: g.order_index, school_year_id: toYearId })))
            .select("id");
          if (e2) throw e2;
          src.forEach((g, i) => { if (inserted?.[i]) gradeIdMap[g.id] = inserted[i].id; });
          result.grades = src.length;
        }
      }

      // 2. Copy parent sections
      if (options.copySections) {
        const { data: src, error: e3 } = await supabase
          .from("parent_sections")
          .select("id, name, order_index")
          .eq("school_year_id", fromYearId)
          .order("order_index");
        if (e3) throw e3;
        if (src && src.length > 0) {
          const { data: inserted, error: e4 } = await supabase
            .from("parent_sections")
            .insert(src.map((s) => ({ name: s.name, order_index: s.order_index, school_year_id: toYearId })))
            .select("id");
          if (e4) throw e4;
          src.forEach((s, i) => { if (inserted?.[i]) sectionIdMap[s.id] = inserted[i].id; });
          result.sections = src.length;
        }
      }

      // 3. Copy grade_section_amounts (requires grades + sections maps)
      if (options.copyAmounts) {
        const { data: src, error: e5 } = await supabase
          .from("grade_section_amounts")
          .select("grade_id, parent_section_id, amount_per_student")
          .eq("school_year_id", fromYearId);
        if (e5) throw e5;
        if (src && src.length > 0) {
          const rows = src
            .filter((a) => gradeIdMap[a.grade_id] && sectionIdMap[a.parent_section_id])
            .map((a) => ({
              grade_id: gradeIdMap[a.grade_id],
              parent_section_id: sectionIdMap[a.parent_section_id],
              amount_per_student: a.amount_per_student,
              school_year_id: toYearId,
            }));
          if (rows.length > 0) {
            const { error: e6 } = await supabase.from("grade_section_amounts").insert(rows);
            if (e6) throw e6;
            result.amounts = rows.length;
          }
        }
      }

      // 4. Copy budget categories
      if (options.copyBudgetCategories) {
        const { data: src, error: e7 } = await supabase
          .from("budget_categories")
          .select("name, source, planned_amount, order_index")
          .eq("school_year_id", fromYearId)
          .order("order_index");
        if (e7) throw e7;
        if (src && src.length > 0) {
          const { error: e8 } = await supabase
            .from("budget_categories")
            .insert(src.map((c) => ({ name: c.name, source: c.source, planned_amount: c.planned_amount, order_index: c.order_index, school_year_id: toYearId })));
          if (e8) throw e8;
          result.categories = src.length;
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["parent-sections"] });
      queryClient.invalidateQueries({ queryKey: ["grade-section-amounts"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["horim"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSetActiveYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (yearId: string) => {
      // Resolve current user's org — needed for explicit org-scoped deactivation
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!mem?.organization_id) throw new Error("לא שויכת לארגון");

      // Deactivate all OTHER years in this org (explicit org filter — never touches other orgs)
      const { error: e1 } = await supabase
        .from("school_years")
        .update({ is_active: false })
        .eq("organization_id", mem.organization_id)
        .neq("id", yearId);
      if (e1) throw e1;

      // Activate the selected year
      const { error: e2 } = await supabase
        .from("school_years")
        .update({ is_active: true })
        .eq("id", yearId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["horim"] });
    },
  });
}
