import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // 1. Must be logged in
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const skip = location.pathname.startsWith("/onboarding") || location.pathname.startsWith("/expired");

    // 2. Must belong to an org (skip on onboarding / expired pages)
    if (!skip) {
      const [{ data: mem }, { data: profile }] = await Promise.all([
        supabase
          .from("organization_members")
          .select("organization_id, status")
          .eq("user_id", data.user.id)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("system_role")
          .eq("id", data.user.id)
          .single(),
      ]);

      if (!mem) throw redirect({ to: "/onboarding" });

      // 3. Check subscription expiry (super_admin is never blocked)
      if (profile?.system_role !== "super_admin") {
        const { data: org } = await supabase
          .from("organizations")
          .select("plan_expires_at")
          .eq("id", mem.organization_id)
          .single();

        if (org?.plan_expires_at && new Date(org.plan_expires_at) < new Date()) {
          throw redirect({ to: "/expired" });
        }
      }
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
