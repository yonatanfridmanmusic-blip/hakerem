import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useActiveYear() {
  return useQuery({
    queryKey: ["active-year"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_years")
        .select("*")
        .order("is_active", { ascending: false })
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
