import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  beforeLoad: async () => {
    // Super-admin only
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("system_role")
      .eq("id", user.id)
      .single();
    if (profile?.system_role !== "super_admin") throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  city: string | null;
  plan: string;
  created_at: string | null;
}

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
}

interface YearRow {
  id: string;
  name: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
}

interface OrgDetail {
  members: MemberRow[];
  years: YearRow[];
  expenseTotal: number;
  incomeTotal: number;
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useAllOrgs() {
  return useQuery<OrgRow[]>({
    queryKey: ["admin-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, city, plan, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });
}

function useOrgDetail(orgId: string | null) {
  return useQuery<OrgDetail>({
    queryKey: ["admin-org-detail", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [membersRes, yearsRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select("id, user_id, role, status, joined_at, profiles(full_name, email)")
          .eq("organization_id", orgId!)
          .order("created_at"),
        supabase
          .from("school_years")
          .select("id, name, is_active, start_date, end_date")
          .eq("organization_id", orgId!)
          .order("start_date", { ascending: false }),
      ]);

      const yearIds = (yearsRes.data ?? []).map((y) => y.id);

      // Financial totals
      let expenseTotal = 0;
      let incomeTotal = 0;
      if (yearIds.length > 0) {
        const [expRes, incRes] = await Promise.all([
          supabase.from("expenses").select("amount").in("school_year_id", yearIds),
          supabase.from("income").select("amount").in("school_year_id", yearIds),
        ]);
        expenseTotal = (expRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
        incomeTotal = (incRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      }

      return {
        members: (membersRes.data ?? []) as unknown as MemberRow[],
        years: yearsRes.data ?? [],
        expenseTotal,
        incomeTotal,
      };
    },
    staleTime: 1000 * 30,
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E5EAE7",
  borderRadius: "14px",
  padding: "20px 24px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
};

const chip = (color: string, bg: string): React.CSSProperties => ({
  display: "inline-block",
  background: bg,
  color,
  borderRadius: "20px",
  padding: "2px 10px",
  fontSize: "11.5px",
  fontWeight: 600,
});

// ─── Main page ─────────────────────────────────────────────────────────────────

function AdminPage() {
  const { data: orgs = [], isLoading } = useAllOrgs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
        borderRadius: "20px",
        padding: "28px 32px",
        marginBottom: "28px",
        boxShadow: "0 8px 32px rgba(15,23,42,0.4)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: "4px" }}>
            SUPER ADMIN
          </div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>
            לוח בקרה — כל בתי הספר
          </h1>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>
            {orgs.length} ארגונים רשומים
          </div>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.08)",
          borderRadius: "12px",
          padding: "12px 20px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#fff" }}>{orgs.length}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>ארגונים</div>
        </div>
      </div>

      {/* Org list */}
      {isLoading && <div style={{ color: "#888", padding: "24px" }}>טוען...</div>}
      {orgs.map((org) => (
        <OrgCard
          key={org.id}
          org={org}
          expanded={expandedId === org.id}
          onToggle={() => toggle(org.id)}
        />
      ))}

      {!isLoading && orgs.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "#888", padding: "48px" }}>
          אין ארגונים רשומים עדיין
        </div>
      )}
    </div>
  );
}

// ─── Org card ─────────────────────────────────────────────────────────────────

function OrgCard({ org, expanded, onToggle }: {
  org: OrgRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: detail, isLoading } = useOrgDetail(expanded ? org.id : null);

  const activeMembers = detail?.members.filter((m) => m.status === "active").length ?? 0;
  const pendingMembers = detail?.members.filter((m) => m.status === "pending").length ?? 0;
  const activeYear = detail?.years.find((y) => y.is_active);

  return (
    <div style={{ ...card, marginBottom: "12px" }}>
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "14px", cursor: "pointer" }}
        onClick={onToggle}
      >
        {/* Org avatar */}
        <div style={{
          width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
          background: "linear-gradient(135deg, #1E293B, #0F172A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", fontWeight: 700, color: "#fff",
        }}>
          {org.name[0]}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "15.5px", color: "#111" }}>{org.name}</span>
            {org.plan === "pro" && (
              <span style={chip("#7C3AED", "#EDE9FE")}>PRO</span>
            )}
          </div>
          <div style={{ fontSize: "12.5px", color: "#6B7280", marginTop: "2px" }}>
            {org.city ?? "ללא עיר"}
            <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
            נוצר {org.created_at ? new Date(org.created_at).toLocaleDateString("he-IL") : "—"}
          </div>
        </div>

        {/* Quick badges */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {pendingMembers > 0 && (
            <span style={chip("#B45309", "#FEF3C7")}>
              {pendingMembers} ממתינ{pendingMembers > 1 ? "ים" : ""}
            </span>
          )}
          <span style={chip("#166534", "#DCFCE7")}>פעיל</span>
          <div style={{
            transform: `rotate(${expanded ? "180deg" : "0deg"})`,
            transition: "transform 0.2s",
            color: "#9CA3AF",
          }}>
            ▼
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: "20px", borderTop: "1px solid #F1F5F9", paddingTop: "20px" }}>
          {isLoading ? (
            <div style={{ color: "#9CA3AF", fontSize: "13px" }}>טוען פרטים...</div>
          ) : detail ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {/* Members */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.05em", marginBottom: "10px" }}>
                  חברי צוות ({detail.members.length})
                </div>
                {detail.members.length === 0 && (
                  <div style={{ fontSize: "13px", color: "#9CA3AF" }}>אין חברים</div>
                )}
                {detail.members.map((m) => (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 0",
                    borderBottom: "1px solid #F8FAFC",
                  }}>
                    <div style={{
                      width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                      background: m.status === "active" ? "#1A3D2B" : "#E5E7EB",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700,
                      color: m.status === "active" ? "#fff" : "#6B7280",
                    }}>
                      {(m.profiles?.full_name ?? m.profiles?.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                        {m.role === "owner" ? "מנהל ראשי" : m.role === "admin" ? "מנהל" : "צופה"}
                        {m.status === "pending" && " · ממתין לאישור"}
                      </div>
                    </div>
                    {m.status === "pending" && (
                      <span style={chip("#B45309", "#FEF3C7")}>ממתין</span>
                    )}
                  </div>
                ))}
              </div>

              {/* School years + financials */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.05em", marginBottom: "10px" }}>
                  שנות לימודים ({detail.years.length})
                </div>
                {detail.years.map((y) => (
                  <div key={y.id} style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: y.is_active ? "#F0FDF4" : "#F8FAFC",
                    border: y.is_active ? "1px solid #BBF7D0" : "1px solid #F1F5F9",
                    marginBottom: "6px",
                    display: "flex", alignItems: "center", gap: "8px",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: y.is_active ? 600 : 400, color: "#111" }}>
                        {y.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
                        {y.start_date.slice(0, 7)} – {y.end_date.slice(0, 7)}
                      </div>
                    </div>
                    {y.is_active && <span style={chip("#166534", "#DCFCE7")}>פעיל</span>}
                  </div>
                ))}

                {/* Financial summary */}
                <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <FinStat label="סה״כ הכנסות" value={detail.incomeTotal} color="#166534" bg="#F0FDF4" />
                  <FinStat label="סה״כ הוצאות" value={detail.expenseTotal} color="#991B1B" bg="#FEF2F2" />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FinStat({ label, value, color, bg }: {
  label: string; value: number; color: string; bg: string;
}) {
  return (
    <div style={{ background: bg, borderRadius: "10px", padding: "10px 14px" }}>
      <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color }}>
        ₪{value.toLocaleString()}
      </div>
    </div>
  );
}
