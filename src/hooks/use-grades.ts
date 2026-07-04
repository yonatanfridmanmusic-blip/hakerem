import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";

export interface Grade {
  id: string;
  school_year_id: string;
  name: string;
  student_count: number;
  order_index: number;
}

export function useGrades(yearId?: string | null) {
  return useQuery<Grade[]>({
    queryKey: ["grades", yearId],
    queryFn: async () => {
      const id = yearId ?? (await getActiveYearId());
      if (!id) return [];
      const { data, error } = await supabase
        .from("grades")
        .select("id, school_year_id, name, student_count, order_index")
        .eq("school_year_id", id)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
    enabled: yearId !== null,  // null = explicitly disabled; undefined = use active year
    staleTime: 1000 * 60 * 5,
  });
}

export function useAddGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; student_count: number; yearId: string }) => {
      const { data: existing } = await supabase
        .from("grades")
        .select("order_index")
        .eq("school_year_id", payload.yearId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (existing?.order_index ?? 0) + 1;

      const { data: inserted, error } = await supabase.from("grades").insert({
        name: payload.name,
        student_count: payload.student_count,
        school_year_id: payload.yearId,
        order_index: nextOrder,
      }).select("id").single();
      if (error) throw error;
      return inserted as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["horim"] });
    },
  });
}

export function useUpdateGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<Grade> & { id: string }) => {
      const { error } = await supabase
        .from("grades")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["horim"] });
    },
  });
}

export function useDeleteGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["grade-section-amounts"] });
      queryClient.invalidateQueries({ queryKey: ["parent-collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
