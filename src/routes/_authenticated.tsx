import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { AiAgentProvider, AiChatPanel, AiFloatingButton } from "@/components/ai-agent";
import { getViewAsOrg, clearViewAsOrg } from "@/lib/view-as";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Must be logged in
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // 2. Must belong to an org
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
      const { data: isExpired } = await supabase.rpc("check_my_org_expired");
      if (isExpired) throw redirect({ to: "/expired" });
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function ViewAsBanner() {
  const [viewAs, setViewAs] = useState(getViewAsOrg());
  const qc = useQueryClient();
  if (!viewAs) return null;
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: "linear-gradient(90deg, #7C2D12, #B45309)",
      padding: "10px 24px", display: "flex", alignItems: "center",
      gap: "14px", fontFamily: "Rubik, sans-serif", direction: "rtl",
      boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
    }}>
      <span style={{ fontSize: "16px" }}>👁</span>
      <span style={{ color: "#FDE68A", fontWeight: 700, fontSize: "13px" }}>מצב תצפית</span>
      <span style={{ color: "#fff", fontSize: "13px" }}>— אתה צופה בנתונים של <strong>{viewAs.orgName}</strong></span>
      <button
        onClick={() => {
          clearViewAsOrg();
          qc.invalidateQueries();
          setViewAs(null);
          window.location.href = "/admin";
        }}
        style={{
          marginRight: "auto", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)",
          color: "#fff", borderRadius: "8px", padding: "5px 14px", fontSize: "12px",
          fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif",
        }}
      >
        ✕ יציאה ממצב תצפית
      </button>
    </div>
  );
}

function AuthenticatedLayout() {
  const [viewAs, setViewAs] = useState(getViewAsOrg);
  useEffect(() => { setViewAs(getViewAsOrg()); }, []);
  return (
    <AiAgentProvider>
      <AppShell>
        <div style={{ paddingBottom: viewAs ? "52px" : undefined }}>
          <Outlet />
        </div>
      </AppShell>
      {!viewAs && <AiChatPanel />}
      {!viewAs && <AiFloatingButton />}
      <ViewAsBanner />
    </AiAgentProvider>
  );
}
