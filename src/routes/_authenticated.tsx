import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // 1. Must be logged in
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // 2. Must belong to an org (skip check when already on onboarding)
    if (!location.pathname.startsWith("/onboarding")) {
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id, status")
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!mem) throw redirect({ to: "/onboarding" });
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
