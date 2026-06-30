// ─── Shared active year utility ───────────────────────────────────────────────
// Single getActiveYearId — import from here, do not redefine in hooks.

import { supabase } from "@/integrations/supabase/client";

export async function getActiveYearId(): Promise<string | null> {
  const { data } = await supabase
    .from("school_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}
