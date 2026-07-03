import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  beforeLoad: async () => {
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
  plan_expires_at: string | null;
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

interface PreviewExpense {
  id: string;
  description: string | null;
  amount: number;
  source: string;
  expense_date: string;
}

interface PreviewCategory {
  id: string;
  name: string;
  source: string;
  planned_amount: number;
}

interface PreviewGrade {
  id: string;
  name: string;
  student_count: number;
}

interface OrgPreviewData {
  activeYear: YearRow | null;
  members: MemberRow[];
  categories: PreviewCategory[];
  expensesBySource: Record<string, number>;
  incomeBySource: Record<string, number>;
  parentCollTotal: number;
  grades: PreviewGrade[];
  recentExpenses: PreviewExpense[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultExpiryDate(): string {
  const now = new Date();
  const sept1NextYear = new Date(now.getFullYear() + 1, 8, 1);
  return sept1NextYear.toISOString().split("T")[0];
}

function expiryStatus(expiresAt: string | null): { label: string; color: string; bg: string } {
  if (!expiresAt) return { label: "ללא הגבלה", color: "#1D4ED8", bg: "#DBEAFE" };
  const exp = new Date(expiresAt);
  const now = new Date();
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "פג תוקף", color: "#991B1B", bg: "#FEE2E2" };
  if (diffDays <= 30) return { label: `ניסיון — ${diffDays} ימים`, color: "#92400E", bg: "#FEF3C7" };
  return {
    label: `עד ${exp.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}`,
    color: "#166534", bg: "#DCFCE7",
  };
}

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useAllOrgs() {
  return useQuery<OrgRow[]>({
    queryKey: ["admin-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, city, plan, plan_expires_at, created_at")
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

function useOrgPreview(orgId: string | null) {
  return useQuery<OrgPreviewData>({
    queryKey: ["admin-org-preview", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // Fetch members + years
      const [membersRes, yearsRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select("id, user_id, role, status, joined_at, profiles(full_name, email)")
          .eq("organization_id", orgId!),
        supabase
          .from("school_years")
          .select("id, name, is_active, start_date, end_date")
          .eq("organization_id", orgId!)
          .order("start_date", { ascending: false }),
      ]);
      const years = (yearsRes.data ?? []) as YearRow[];
      const activeYear = years.find((y) => y.is_active) ?? null;
      const yearId = activeYear?.id ?? null;

      if (!yearId) {
        return {
          activeYear: null,
          members: (membersRes.data ?? []) as unknown as MemberRow[],
          categories: [],
          expensesBySource: {},
          incomeBySource: {},
          parentCollTotal: 0,
          grades: [],
          recentExpenses: [],
        };
      }

      // Fetch all data for the active year
      const [catsRes, expsRes, incRes, collRes, gradesRes] = await Promise.all([
        supabase
          .from("budget_categories")
          .select("id, name, source, planned_amount")
          .eq("school_year_id", yearId)
          .order("order_index"),
        supabase
          .from("expenses")
          .select("id, description, amount, source, expense_date")
          .eq("school_year_id", yearId)
          .order("expense_date", { ascending: false })
          .limit(20),
        supabase
          .from("income")
          .select("amount, source")
          .eq("school_year_id", yearId),
        supabase
          .from("parent_collections")
          .select("amount")
          .eq("school_year_id", yearId),
        supabase
          .from("grades")
          .select("id, name, student_count")
          .eq("school_year_id", yearId)
          .order("name"),
      ]);

      const expenses = expsRes.data ?? [];
      const income = incRes.data ?? [];
      const collections = collRes.data ?? [];

      const expensesBySource: Record<string, number> = {};
      for (const e of expenses) {
        expensesBySource[e.source] = (expensesBySource[e.source] ?? 0) + Number(e.amount);
      }
      const incomeBySource: Record<string, number> = {};
      for (const i of income) {
        incomeBySource[i.source] = (incomeBySource[i.source] ?? 0) + Number(i.amount);
      }

      return {
        activeYear,
        members: (membersRes.data ?? []) as unknown as MemberRow[],
        categories: (catsRes.data ?? []) as PreviewCategory[],
        expensesBySource,
        incomeBySource,
        parentCollTotal: collections.reduce((s, c) => s + Number(c.amount), 0),
        grades: (gradesRes.data ?? []) as PreviewGrade[],
        recentExpenses: expenses as PreviewExpense[],
      };
    },
    staleTime: 1000 * 30,
  });
}

function useGenerateCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, expiresAt }: { orgId: string; expiresAt: string }) => {
      const { data, error } = await supabase.rpc("generate_license_code", {
        p_organization_id: orgId,
        p_expires_at: new Date(expiresAt).toISOString(),
        p_notes: undefined,
      });
      if (error) throw error;
      return data as { code: string; expires_at: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });
}

function usePauseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const { error } = await supabase
        .from("organizations")
        .update({ plan_expires_at: yesterday })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });
}

function useDeleteOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
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
  whiteSpace: "nowrap" as const,
});

const SOURCE_LABELS: Record<string, string> = { gefen: "גפן", iriyah: "עירייה", horim: "הורים" };
const SOURCE_COLORS: Record<string, { color: string; bg: string }> = {
  gefen:  { color: "#166534", bg: "#F0FDF4" },
  iriyah: { color: "#7C2D12", bg: "#FFF7ED" },
  horim:  { color: "#6B21A8", bg: "#FAF5FF" },
};

// ─── Main page ─────────────────────────────────────────────────────────────────

function AdminPage() {
  const { data: orgs = [], isLoading } = useAllOrgs();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [codeModalOrg, setCodeModalOrg] = useState<OrgRow | null>(null);
  const [previewOrg, setPreviewOrg] = useState<OrgRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrgRow | null>(null);
  const pauseSub = usePauseSubscription();
  const deleteOrg = useDeleteOrg();

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
        borderRadius: "20px", padding: "28px 32px", marginBottom: "28px",
        boxShadow: "0 8px 32px rgba(15,23,42,0.4)",
        display: "flex", alignItems: "center", gap: "16px",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: "4px" }}>SUPER ADMIN</div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>לוח בקרה — כל בתי הספר</h1>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>{orgs.length} ארגונים רשומים</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 20px", textAlign: "center" }}>
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
          onGenerateCode={() => setCodeModalOrg(org)}
          onPreview={() => setPreviewOrg(org)}
          onPause={() => {
            if (window.confirm(`לעצור את המנוי של "${org.name}"? המשתמשים יועברו למסך פג תוקף.`))
              pauseSub.mutate(org.id);
          }}
          onDelete={() => setConfirmDelete(org)}
        />
      ))}
      {!isLoading && orgs.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "#888", padding: "48px" }}>אין ארגונים רשומים עדיין</div>
      )}

      {codeModalOrg && <CodeModal org={codeModalOrg} onClose={() => setCodeModalOrg(null)} />}
      {previewOrg && <PreviewModal org={previewOrg} onClose={() => setPreviewOrg(null)} />}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div style={{ background: "#fff", borderRadius: "18px", padding: "32px 28px", maxWidth: "400px", width: "100%", fontFamily: "Rubik, sans-serif", direction: "rtl" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#111", marginBottom: "12px" }}>מחיקת ארגון</div>
            <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "10px", padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ fontWeight: 600, color: "#991B1B", marginBottom: "4px" }}>⚠️ פעולה בלתי הפיכה</div>
              <div style={{ fontSize: "13px", color: "#7F1D1D", lineHeight: 1.6 }}>
                מחיקת <strong>{confirmDelete.name}</strong> תמחק גם את כל הנתונים שלהם — שנות לימודים, הוצאות, הכנסות, גבייה מהורים וחברי צוות.
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: "11px", borderRadius: "9px", border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: "14px", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
                ביטול
              </button>
              <button type="button"
                disabled={deleteOrg.isPending}
                onClick={() => deleteOrg.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })}
                style={{ flex: 2, padding: "11px", borderRadius: "9px", border: "none", background: "#DC2626", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
                {deleteOrg.isPending ? "מוחק..." : `מחק את "${confirmDelete.name}"`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Org card ─────────────────────────────────────────────────────────────────

function OrgCard({
  org, expanded, onToggle, onGenerateCode, onPreview, onPause, onDelete,
}: {
  org: OrgRow; expanded: boolean; onToggle: () => void;
  onGenerateCode: () => void; onPreview: () => void;
  onPause: () => void; onDelete: () => void;
}) {
  const { data: detail, isLoading } = useOrgDetail(expanded ? org.id : null);
  const expiry = expiryStatus(org.plan_expires_at);
  const isExpired = org.plan_expires_at && new Date(org.plan_expires_at) < new Date();
  const pendingMembers = detail?.members.filter((m) => m.status === "pending").length ?? 0;

  return (
    <div style={{ ...card, marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {/* Clickable area */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, cursor: "pointer" }} onClick={onToggle}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
            background: "linear-gradient(135deg, #1E293B, #0F172A)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px", fontWeight: 700, color: "#fff",
          }}>
            {org.name[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
              <span style={{ fontWeight: 700, fontSize: "15.5px", color: "#111" }}>{org.name}</span>
              {org.plan === "pro" && <span style={chip("#7C3AED", "#EDE9FE")}>PRO</span>}
            </div>
            <div style={{ fontSize: "12.5px", color: "#6B7280", marginTop: "2px" }}>
              {org.city ?? "ללא עיר"}
              <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
              נוצר {org.created_at ? new Date(org.created_at).toLocaleDateString("he-IL") : "—"}
            </div>
          </div>
        </div>

        {/* Badges + actions */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, flexWrap: "wrap" as const }}>
          {pendingMembers > 0 && <span style={chip("#B45309", "#FEF3C7")}>{pendingMembers} ממתינ{pendingMembers > 1 ? "ים" : ""}</span>}
          <span style={chip(expiry.color, expiry.bg)}>{expiry.label}</span>

          {/* Preview */}
          <button type="button" onClick={(e) => { e.stopPropagation(); onPreview(); }}
            style={{ background: "#1E293B", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
            👁 צפה
          </button>

          {/* License */}
          <button type="button" onClick={(e) => { e.stopPropagation(); onGenerateCode(); }}
            style={{ background: "linear-gradient(135deg, #1A3D2B, #2D6644)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
            🔑 הנפק קוד
          </button>

          {/* Pause / Resume */}
          {!isExpired ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onPause(); }}
              style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
              ⏸ עצור מנוי
            </button>
          ) : null}

          {/* Delete */}
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
            🗑 מחק
          </button>

          <div onClick={onToggle} style={{ transform: `rotate(${expanded ? "180deg" : "0deg"})`, transition: "transform 0.2s", color: "#9CA3AF", cursor: "pointer" }}>▼</div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: "20px", borderTop: "1px solid #F1F5F9", paddingTop: "20px" }}>
          {isLoading ? (
            <div style={{ color: "#9CA3AF", fontSize: "13px" }}>טוען פרטים...</div>
          ) : detail ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.05em", marginBottom: "10px" }}>חברי צוות ({detail.members.length})</div>
                {detail.members.length === 0 && <div style={{ fontSize: "13px", color: "#9CA3AF" }}>אין חברים</div>}
                {detail.members.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #F8FAFC" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0, background: m.status === "active" ? "#1A3D2B" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: m.status === "active" ? "#fff" : "#6B7280" }}>
                      {(m.profiles?.full_name ?? m.profiles?.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#111", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                        {m.role === "owner" ? "מנהל/ת ראשי/ת" : m.role === "admin" ? "מנהל/ת" : "צופה"}
                        {m.status === "pending" && " · ממתין/ת לאישור"}
                      </div>
                    </div>
                    {m.status === "pending" && <span style={chip("#B45309", "#FEF3C7")}>ממתין/ת</span>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.05em", marginBottom: "10px" }}>שנות לימודים ({detail.years.length})</div>
                {detail.years.map((y) => (
                  <div key={y.id} style={{ padding: "8px 12px", borderRadius: "8px", background: y.is_active ? "#F0FDF4" : "#F8FAFC", border: y.is_active ? "1px solid #BBF7D0" : "1px solid #F1F5F9", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: y.is_active ? 600 : 400, color: "#111" }}>{y.name}</div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>{y.start_date.slice(0, 7)} – {y.end_date.slice(0, 7)}</div>
                    </div>
                    {y.is_active && <span style={chip("#166534", "#DCFCE7")}>פעיל</span>}
                  </div>
                ))}
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

// ─── Preview modal ────────────────────────────────────────────────────────────

function PreviewModal({ org, onClose }: { org: OrgRow; onClose: () => void }) {
  const { data, isLoading } = useOrgPreview(org.id);
  const [tab, setTab] = useState<"overview" | "expenses" | "members">("overview");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#F5F7FA", borderRadius: "20px", width: "100%", maxWidth: "760px", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "Rubik, sans-serif", direction: "rtl", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0F172A, #1E293B)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", marginBottom: "2px" }}>תצוגת מנהל · {org.name}</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>
              {data?.activeYear ? `שנה פעילה: ${data.activeYear.name}` : "אין שנת לימודים פעילה"}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", color: "#fff", fontSize: "18px", cursor: "pointer", padding: "6px 12px", lineHeight: 1 }}>×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "4px", padding: "12px 16px 0", background: "#fff", borderBottom: "1px solid #E8EDE9" }}>
          {([["overview", "סקירה"], ["expenses", "הוצאות אחרונות"], ["members", "צוות"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              style={{ padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none", fontSize: "13px", fontWeight: tab === key ? 600 : 400, background: tab === key ? "#F5F7FA" : "transparent", color: tab === key ? "#1A3D2B" : "#6B7280", cursor: "pointer", fontFamily: "Rubik, sans-serif", borderBottom: tab === key ? "2px solid #2D6644" : "2px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {isLoading && <div style={{ color: "#9CA3AF", textAlign: "center", padding: "40px" }}>טוען נתונים...</div>}

          {!isLoading && data && tab === "overview" && (
            <div>
              {/* Budget per source */}
              {["gefen", "iriyah", "horim"].map((src) => {
                const cats = data.categories.filter((c) => c.source === src);
                const planned = cats.reduce((s, c) => s + Number(c.planned_amount), 0);
                const used = data.expensesBySource[src] ?? 0;
                const income = data.incomeBySource[src] ?? 0;
                const pct = planned > 0 ? Math.min(Math.round((used / planned) * 100), 100) : 0;
                const sc = SOURCE_COLORS[src];
                const lbl = SOURCE_LABELS[src];
                return (
                  <div key={src} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", padding: "16px 18px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ ...chip(sc.color, sc.bg), fontSize: "12.5px" }}>{lbl}</span>
                      <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#6B7280" }}>
                        <span>מתוכנן: <strong style={{ color: "#111" }}>{fmt(planned)}</strong></span>
                        <span>הכנסות: <strong style={{ color: "#166534" }}>{fmt(income)}</strong></span>
                        <span>הוצאות: <strong style={{ color: "#991B1B" }}>{fmt(used)}</strong></span>
                      </div>
                    </div>
                    <div style={{ background: "#F1F5F9", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: used > planned ? "#DC2626" : sc.color, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>{pct}% מהתקציב · {cats.length} קטגוריות</div>
                  </div>
                );
              })}

              {/* Parent collections + grades */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", padding: "16px 18px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", marginBottom: "8px" }}>גבייה מהורים</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "#6B21A8" }}>{fmt(data.parentCollTotal)}</div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "3px" }}>{data.grades.length} שכבות · {data.grades.reduce((s, g) => s + g.student_count, 0)} תלמידים</div>
                </div>
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", padding: "16px 18px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", marginBottom: "8px" }}>שכבות</div>
                  {data.grades.length === 0 ? <div style={{ fontSize: "13px", color: "#9CA3AF" }}>אין שכבות</div> : (
                    data.grades.map((g) => (
                      <div key={g.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#374151", padding: "2px 0" }}>
                        <span>{g.name}</span><span style={{ color: "#9CA3AF" }}>{g.student_count} תלמידים</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {!isLoading && data && tab === "expenses" && (
            <div>
              {data.recentExpenses.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px" }}>אין הוצאות בשנה הפעילה</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["תאריך", "תיאור", "מקור", "סכום"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentExpenses.map((e) => {
                      const sc = SOURCE_COLORS[e.source] ?? { color: "#374151", bg: "#F8FAFC" };
                      return (
                        <tr key={e.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "10px 14px", fontSize: "12.5px", color: "#6B7280" }}>{e.expense_date}</td>
                          <td style={{ padding: "10px 14px", fontSize: "13px", color: "#111" }}>{e.description ?? "—"}</td>
                          <td style={{ padding: "10px 14px" }}><span style={chip(sc.color, sc.bg)}>{SOURCE_LABELS[e.source] ?? e.source}</span></td>
                          <td style={{ padding: "10px 14px", fontSize: "13.5px", fontWeight: 600, color: "#991B1B" }}>{fmt(e.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {!isLoading && data && tab === "members" && (
            <div>
              {data.members.map((m) => {
                const statusColors = { active: { color: "#166534", bg: "#F0FDF4", label: "פעיל/ה" }, pending: { color: "#92400E", bg: "#FEF3C7", label: "ממתין/ת" }, rejected: { color: "#991B1B", bg: "#FEF2F2", label: "נדחה/ת" } };
                const sc = statusColors[m.status as keyof typeof statusColors] ?? statusColors.pending;
                return (
                  <div key={m.id} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #E8EDE9", padding: "14px 16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1A3D2B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {(m.profiles?.full_name ?? m.profiles?.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "#111" }}>{m.profiles?.full_name ?? "—"}</div>
                      <div style={{ fontSize: "12px", color: "#9CA3AF" }}>{m.profiles?.email}</div>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span style={chip("#374151", "#F1F5F9")}>{m.role === "owner" ? "מנהל/ת ראשי/ת" : m.role === "admin" ? "מנהל/ת" : "צופה"}</span>
                      <span style={chip(sc.color, sc.bg)}>{sc.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Code modal ───────────────────────────────────────────────────────────────

function CodeModal({ org, onClose }: { org: OrgRow; onClose: () => void }) {
  const [expiresAt, setExpiresAt] = useState(defaultExpiryDate);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { mutate: generate, isPending } = useGenerateCode();

  const handleGenerate = () => {
    generate({ orgId: org.id, expiresAt }, {
      onSuccess: (data) => setGeneratedCode(data.code),
      onError: (err) => alert("שגיאה: " + (err as Error).message),
    });
  };

  const handleCopy = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "18px", padding: "32px 28px", width: "100%", maxWidth: "400px", boxShadow: "0 24px 80px rgba(0,0,0,0.3)", fontFamily: "Rubik, sans-serif", direction: "rtl" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#111" }}>הנפקת קוד הפעלה</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#9CA3AF" }}>×</button>
        </div>
        <div style={{ background: "#F8FAFC", borderRadius: "10px", padding: "10px 14px", marginBottom: "20px", fontSize: "13.5px", color: "#374151", fontWeight: 500 }}>
          🏫 {org.name}
        </div>
        {!generatedCode ? (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>תוקף הרישיון עד</label>
              <input type="date" value={expiresAt} min={new Date().toISOString().split("T")[0]} onChange={(e) => setExpiresAt(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1.5px solid #D1D5DB", borderRadius: "9px", outline: "none", fontFamily: "Rubik, sans-serif", boxSizing: "border-box" as const }} />
              <div style={{ fontSize: "11.5px", color: "#9CA3AF", marginTop: "4px" }}>ברירת מחדל: 1 בספטמבר {new Date().getFullYear() + 1}</div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: "9px", border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: "14px", fontWeight: 500, cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>ביטול</button>
              <button type="button" onClick={handleGenerate} disabled={isPending}
                style={{ flex: 2, padding: "10px", borderRadius: "9px", background: "linear-gradient(135deg, #1A3D2B, #2D6644)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.7 : 1, fontFamily: "Rubik, sans-serif" }}>
                {isPending ? "מייצר…" : "🔑 צור קוד"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "14px", textAlign: "right" }}>
              ✅ הקוד נוצר והמנוי הוארך אוטומטית. שלח את הקוד ל{org.name}.
            </div>
            <div style={{ background: "#F0FDF4", border: "2px solid #86EFAC", borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
              <span style={{ fontSize: "26px", fontFamily: "monospace", fontWeight: 700, color: "#166534", letterSpacing: "0.15em" }}>{generatedCode}</span>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={handleCopy}
                style={{ flex: 1, padding: "10px", borderRadius: "9px", background: copied ? "#166534" : "linear-gradient(135deg, #1A3D2B, #2D6644)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "Rubik, sans-serif", transition: "background 0.2s" }}>
                {copied ? "✓ הועתק!" : "העתק קוד"}
              </button>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: "10px", borderRadius: "9px", border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: "14px", fontWeight: 500, cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
                סגור
              </button>
            </div>
            <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "12px" }}>
              תוקף עד: {new Date(expiresAt).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FinStat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: "10px", padding: "10px 14px" }}>
      <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color }}>₪{value.toLocaleString()}</div>
    </div>
  );
}
