import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgRole = "owner" | "admin" | "viewer";
export type MemberStatus = "pending" | "active" | "rejected";

export interface Organization {
  id: string;
  name: string;
  city: string | null;
  plan: string;
  created_at: string;
}

export interface OrgMembership {
  organization: Organization;
  role: OrgRole;
  status: MemberStatus;
  joined_at: string | null;
}

export interface OrgMember {
  id: string;
  user_id: string;
  role: OrgRole;
  status: MemberStatus;
  joined_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

// ─── Current user's membership ────────────────────────────────────────────────

/**
 * Returns the current user's active membership (org + role).
 * null if not yet in an org.
 */
export function useOrganization() {
  return useQuery<OrgMembership | null>({
    queryKey: ["organization"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select(`
          role,
          status,
          joined_at,
          organizations (id, name, city, plan, created_at)
        `)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        organization: data.organizations as unknown as Organization,
        role: data.role as OrgRole,
        status: data.status as MemberStatus,
        joined_at: data.joined_at,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Convenience — just returns the org_id string or null. */
export function useOrgId(): string | null {
  const { data } = useOrganization();
  return data?.organization?.id ?? null;
}

// ─── List all organizations (for join flow) ───────────────────────────────────

export function useAllOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ["all-organizations"],
    queryFn: async () => {
      // We need to read orgs without being a member yet.
      // This requires a separate RPC or we open orgs to authenticated reads.
      // For now: use a public-read RPC function.
      const { data, error } = await supabase.rpc("list_public_organizations");
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Members of the current user's org ───────────────────────────────────────

export function useOrgMembers() {
  const { data: membership } = useOrganization();
  const orgId = membership?.organization?.id;

  return useQuery<OrgMember[]>({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select(`
          id, user_id, role, status, joined_at, created_at,
          profiles (full_name, email)
        `)
        .eq("organization_id", orgId!)
        .order("created_at");

      if (error) throw error;
      return (data ?? []) as unknown as OrgMember[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Create organization (principal signup) ────────────────────────────────────

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, city }: { name: string; city?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      // 1. Create the org
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name, city: city ?? null, created_by: user.id })
        .select("id, name")
        .single();
      if (orgErr) throw orgErr;

      // 2. Make the creator the owner (active immediately)
      const { error: memErr } = await supabase
        .from("organization_members")
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: "owner",
          status: "active",
          joined_at: new Date().toISOString(),
        });
      if (memErr) throw memErr;

      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization"] });
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
    },
  });
}

// ─── Request to join an existing org ─────────────────────────────────────────

export function useRequestJoinOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      const { error } = await supabase
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          role: "admin",
          status: "pending",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });
}

// ─── Approve / reject a join request (owner only) ─────────────────────────────

export function useUpdateMemberStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      memberId,
      status,
      role,
    }: {
      memberId: string;
      status: MemberStatus;
      role?: OrgRole;
    }) => {
      const update: {
        status: MemberStatus;
        joined_at?: string;
        role?: OrgRole;
      } = { status };
      if (status === "active") update.joined_at = new Date().toISOString();
      if (role) update.role = role;

      const { error } = await supabase
        .from("organization_members")
        .update(update)
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    },
  });
}

// ─── Remove a member (owner only) ─────────────────────────────────────────────

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    },
  });
}
