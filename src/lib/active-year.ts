// ─── Shared active year utility ───────────────────────────────────────────────
// Single getActiveYearId — import from here, do not redefine in hooks.

import { supabase } from "@/integrations/supabase/client";
import { getViewAsOrg } from "@/lib/view-as";

export async function getActiveYearId(): Promise<string | null> {
  // Super-admin "View As" override — use the target org's active year
  const viewAs = getViewAsOrg();
  if (viewAs) {
    const { data } = await supabase
      .from("school_years")
      .select("id")
      .eq("organization_id", viewAs.orgId)
      .eq("is_active", true)
      .maybeSingle();
    return data?.id ?? null;
  }

  // Normal path: current user's org
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
