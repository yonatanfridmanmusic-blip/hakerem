import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-organization";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgBudgetSource {
  id: string;
  org_id: string;
  slug: string;       // 'gefen' | 'iriyah' | 'horim' | any custom
  label: string;      // display name: 'גפן' | 'עירייה' | 'הורים' | 'צהרון'
  color: string;      // text / badge color
  bg_color: string;   // badge background
  is_default: boolean;
  order_index: number;
}

// Fallback sources when org sources aren't loaded yet
export const FALLBACK_SOURCES: OrgBudgetSource[] = [
  { id: "gefen",  org_id: "", slug: "gefen",  label: "גפן",    color: "#166534", bg_color: "#F0FDF4", is_default: true, order_index: 1 },
  { id: "iriyah", org_id: "", slug: "iriyah", label: "עירייה", color: "#7C2D12", bg_color: "#FFF7ED", is_default: true, order_index: 2 },
  { id: "horim",  org_id: "", slug: "horim",  label: "הורים",  color: "#8B2F6E", bg_color: "#F4EBF2", is_default: true, order_index: 3 },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useOrgBudgetSources() {
  const orgId = useOrgId();

  return useQuery<OrgBudgetSource[]>({
    queryKey: ["org_budget_sources", orgId],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5, // 5 min — sources rarely change
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_budget_sources")
        .select("*")
        .eq("org_id", orgId!)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as OrgBudgetSource[];
    },
  });
}

/** Returns the source object for a given slug, or a generic fallback */
export function useSourceBySlug(slug: string): OrgBudgetSource | undefined {
  const { data: sources } = useOrgBudgetSources();
  const pool = sources?.length ? sources : FALLBACK_SOURCES;
  return pool.find(s => s.slug === slug) ?? {
    id: slug,
    org_id: "",
    slug,
    label: slug,
    color: "#6B6560",
    bg_color: "#F5F5F2",
    is_default: false,
    order_index: 99,
  };
}

/** Add a new custom source for the org */
export function useAddBudgetSource() {
  const orgId = useOrgId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      label,
      color = "#6B6560",
      bg_color = "#F5F5F2",
    }: {
      label: string;
      color?: string;
      bg_color?: string;
    }) => {
      if (!orgId) throw new Error("אין ארגון פעיל");
      // slug = label trimmed, lowercased, spaces → underscore
      const slug = label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_֐-׿]/g, "");

      // Find max order_index
      const { data: existing } = await supabase
        .from("org_budget_sources")
        .select("order_index")
        .eq("org_id", orgId)
        .order("order_index", { ascending: false })
        .limit(1);

      const maxOrder = existing?.[0]?.order_index ?? 3;

      const { data, error } = await supabase
        .from("org_budget_sources")
        .insert({ org_id: orgId, slug, label: label.trim(), color, bg_color, is_default: false, order_index: maxOrder + 1 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org_budget_sources", orgId] }),
  });
}

/** Rename/recolor an existing source */
export function useUpdateBudgetSource() {
  const orgId = useOrgId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      label,
      color,
      bg_color,
    }: {
      id: string;
      label?: string;
      color?: string;
      bg_color?: string;
    }) => {
      const updates: { label?: string; color?: string; bg_color?: string } = {};
      if (label !== undefined) updates.label = label.trim();
      if (color !== undefined) updates.color = color;
      if (bg_color !== undefined) updates.bg_color = bg_color;

      const { error } = await supabase
        .from("org_budget_sources")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org_budget_sources", orgId] }),
  });
}

/** Delete a custom (non-default) source */
export function useDeleteBudgetSource() {
  const orgId = useOrgId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("org_budget_sources")
        .delete()
        .eq("id", id)
        .eq("is_default", false); // safety: never delete built-ins
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org_budget_sources", orgId] }),
  });
}

// ─── Pure helpers (no hooks) ──────────────────────────────────────────────────

/** Get source label from a list — safe fallback to slug */
export function getSourceLabel(sources: OrgBudgetSource[], slug: string): string {
  return sources.find(s => s.slug === slug)?.label ?? slug;
}

/** Get source style (color + bg_color) — safe fallback */
export function getSourceStyle(
  sources: OrgBudgetSource[],
  slug: string,
): Pick<OrgBudgetSource, "color" | "bg_color"> {
  const found = sources.find(s => s.slug === slug);
  return found
    ? { color: found.color, bg_color: found.bg_color }
    : { color: "#6B6560", bg_color: "#F5F5F2" };
}

/** Seed sources for a brand-new org (called during onboarding if trigger fails) */
export async function seedDefaultSourcesForOrg(orgId: string, extras: { label: string }[] = []) {
  const defaults = [
    { slug: "gefen",  label: "גפן",    color: "#166534", bg_color: "#F0FDF4", order_index: 1, is_default: true },
    { slug: "iriyah", label: "עירייה", color: "#7C2D12", bg_color: "#FFF7ED", order_index: 2, is_default: true },
    { slug: "horim",  label: "הורים",  color: "#8B2F6E", bg_color: "#F4EBF2", order_index: 3, is_default: true },
  ];

  const rows = [
    ...defaults,
    ...extras.map((e, i) => ({
      slug: e.label.trim().toLowerCase().replace(/\s+/g, "_"),
      label: e.label.trim(),
      color: "#0E7490",
      bg_color: "#ECFEFF",
      order_index: defaults.length + 1 + i,
      is_default: false,
    })),
  ].map(r => ({ ...r, org_id: orgId }));

  await supabase.from("org_budget_sources").upsert(rows, { onConflict: "org_id,slug" });
}
