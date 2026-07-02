import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useQuery<SchoolYear[]>({
    queryKey: ["school-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_years")
        .select("id, name, start_date, end_date, is_active, collection_percentage, created_at")
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

      const { error } = await supabase.from("school_years").insert({
        ...payload,
        is_active: false,
        created_by: user.id,
        organization_id: mem.organization_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
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

export function useSetActiveYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (yearId: string) => {
      // Deactivate all years first
      const { error: e1 } = await supabase
        .from("school_years")
        .update({ is_active: false })
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
