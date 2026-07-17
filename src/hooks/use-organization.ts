import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getViewAsOrg } from "@/lib/view-as";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgRole = "owner" | "admin" | "viewer";
export type MemberStatus = "pending" | "active" | "rejected" | "blocked";

export interface Organization {
  id: string;
  name: string;
  city: string | null;
  plan: string;
  created_at: string;
  plan_expires_at?: string | null;
  setup_completed_at?: string | null;
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
  job_title: string | null;
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
      // Super-admin "View As" override
      const viewAs = getViewAsOrg();
      if (viewAs) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name, city, plan, created_at, plan_expires_at, setup_completed_at")
          .eq("id", viewAs.orgId)
          .maybeSingle();
        if (!org) return null;
        return {
          organization: org as Organization,
          role: "owner" as OrgRole,   // admin sees everything
          status: "active" as MemberStatus,
          joined_at: null,
        };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from("organization_members")
        .select(`
          role,
          status,
          joined_at,
          organizations (id, name, city, plan, created_at, plan_expires_at, setup_completed_at)
        `)
        .eq("user_id", session.user.id)
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

/**
 * Returns true if the current user can write (insert/update/delete) data.
 * Viewers are read-only; owners and admins have full write access.
 * View As mode is always read-only regardless of role.
 */
export function useCanWrite(): boolean {
  const { data } = useOrganization();
  const role = data?.role;
  if (getViewAsOrg()) return false; // View As is always read-only
  return role === "owner" || role === "admin";
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
          id, user_id, role, status, joined_at, created_at, job_title,
          profiles (full_name, email)
        `)
        .eq("organization_id", orgId!)
        .order("created_at");

      if (error) throw error;
      return (data ?? []) as unknown as OrgMember[];
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 60_000,
  });
}

// ─── Create organization (principal signup) ────────────────────────────────────

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, city }: { name: string; city?: string }) => {
      // Use RPC (SECURITY DEFINER) so it can insert 'active' owner membership
      const { data, error } = await supabase.rpc("create_organization", {
        p_name: name,
        p_city: city ?? undefined,
      });
      if (error) throw error;
      return data as { id: string; name: string };
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
    mutationFn: async ({ orgId, jobTitle }: { orgId: string; jobTitle?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      const { error } = await supabase
        .from("organization_members")
        .insert({
          organization_id: orgId,
          user_id: user.id,
          role: "viewer",
          status: "pending",
          job_title: jobTitle ?? null,
        });
      if (error) throw error;

      // Best-effort: notify org owner via Edge Function (fire-and-forget)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle();

        await supabase.functions.invoke("notify-join-request", {
          body: {
            organization_id: orgId,
            requester_name: profile?.full_name ?? null,
            requester_email: profile?.email ?? user.email ?? null,
          },
        });
      } catch {
        // Email failure must never block the join request
      }
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

// ─── Pending members count (lightweight — owners only) ───────────────────────

export function usePendingMembersCount() {
  const { data: membership } = useOrganization();
  const orgId = membership?.organization?.id;
  const isOwner = membership?.role === "owner";

  return useQuery<number>({
    queryKey: ["pending-members-count", orgId],
    enabled: !!orgId && isOwner,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

// ─── Current user's profile ────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function useCurrentProfile() {
  return useQuery<UserProfile | null>({
    queryKey: ["current-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    },
    staleTime: 1000 * 60 * 5,
  });
}
