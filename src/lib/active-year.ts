// ─── Shared active year utility ───────────────────────────────────────────────
// Single getActiveYearId — import from here, do not redefine in hooks.

import { supabase } from "@/integrations/supabase/client";

export async function getActiveYearId(): Promise<string | null> {
  // Always filter by the current user's org to prevent super_admin cross-tenant leak
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: mem } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", session.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!mem?.organization_id) return null;

  const { data } = await supabase
    .from("school_years")
    .select("id")
    .eq("organization_id", mem.organization_id)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}
