import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setViewAsOrg } from "@/lib/view-as";

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

// Deep dive types
interface FullCategory {
  id: string;
  name: string;
  source: string;
  planned_amount: number;
  planned: number;
  spent: number;
  remaining: number;
  pct: number;
}

interface FullGrade {
  id: string;
  name: string;
  student_count: number;
}

interface SectionRow {
  id: string;
  name: string;
  order_index: number;
}

interface GSARow {
  grade_id: string;
  parent_section_id: string;
  amount_per_student: number;
}

interface CollectionRow {
  id: string;
  grade_id: string;
  parent_section_id: string;
  amount: number;
  collection_date: string;
  notes: string | null;
}

interface FullExpense {
  id: string;
  description: string | null;
  amount: number;
  source: string;
  expense_date: string;
  budget_category_id: string | null;
  category_name: string | null;
  supplier: string | null;
}

interface FullIncome {
  id: string;
  description: string | null;
  amount: number;
  source: string;
  income_date: string;
  budget_category_id: string | null;
  category_name: string | null;
}

interface OrgSource { slug: string; label: string }

interface Diagnostic {
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
}

interface OrgFullData {
  activeYear: YearRow | null;
  allYears: YearRow[];
  members: MemberRow[];
  sources: OrgSource[];
  categories: FullCategory[];
  grades: FullGrade[];
  sections: SectionRow[];
  gsaRows: GSARow[];
  collections: CollectionRow[];
  allExpenses: FullExpense[];
  allIncome: FullIncome[];
  diagnostics: Diagnostic[];
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
const fmtDate = (d: string) => new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "2-digit" });

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

// ─── Full deep-dive hook ──────────────────────────────────────────────────────

function useOrgFullData(orgId: string | null) {
  return useQuery<OrgFullData>({
    queryKey: ["admin-org-full", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // 1. Members + years + sources (parallel, org-level)
      const [membersRes, yearsRes, srcRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select("id, user_id, role, status, joined_at, profiles(full_name, email)")
          .eq("organization_id", orgId!),
        supabase
          .from("school_years")
          .select("id, name, is_active, start_date, end_date")
          .eq("organization_id", orgId!)
          .order("start_date", { ascending: false }),
        supabase
          .from("org_budget_sources")
          .select("slug, label")
          .eq("org_id", orgId!)
          .order("order_index"),
      ]);

      const years = (yearsRes.data ?? []) as YearRow[];
      const activeYear = years.find((y) => y.is_active) ?? null;
      const yearId = activeYear?.id ?? null;

      const FALLBACK_SOURCES: OrgSource[] = [
        { slug: "gefen", label: "גפן" },
        { slug: "iriyah", label: "עירייה" },
        { slug: "horim", label: "הורים" },
      ];
      const sources: OrgSource[] = srcRes.data?.length ? (srcRes.data as OrgSource[]) : FALLBACK_SOURCES;

      if (!yearId) {
        return {
          activeYear: null,
          allYears: years,
          members: (membersRes.data ?? []) as unknown as MemberRow[],
          sources,
          categories: [],
          grades: [],
          sections: [],
          gsaRows: [],
          collections: [],
          allExpenses: [],
          allIncome: [],
          diagnostics: [{ level: "error", title: "אין שנת לימודים פעילה", detail: "המשתמשים לא יכולים להשתמש במערכת ללא שנה פעילה." }],
        };
      }

      // 2. All year-level data in parallel
      const [catsRes, expRes, incRes, colRes, gradesRes, sectionsRes, gsaRes] = await Promise.all([
        supabase
          .from("budget_categories")
          .select("id, name, source, planned_amount, order_index")
          .eq("school_year_id", yearId)
          .order("source").order("order_index"),
        supabase
          .from("expenses")
          .select("id, description, amount, source, expense_date, budget_category_id, supplier")
          .eq("school_year_id", yearId)
          .order("expense_date", { ascending: false })
          .limit(300),
        supabase
          .from("income")
          .select("id, description, amount, source, income_date, budget_category_id")
          .eq("school_year_id", yearId)
          .order("income_date", { ascending: false })
          .limit(300),
        supabase
          .from("parent_collections")
          .select("id, grade_id, parent_section_id, amount, collection_date, notes")
          .eq("school_year_id", yearId)
          .order("collection_date", { ascending: false }),
        supabase
          .from("grades")
          .select("id, name, student_count")
          .eq("school_year_id", yearId)
          .order("name"),
        supabase
          .from("parent_sections")
          .select("id, name, order_index")
          .eq("school_year_id", yearId)
          .order("order_index"),
        supabase
          .from("grade_section_amounts")
          .select("grade_id, parent_section_id, amount_per_student")
          .eq("school_year_id", yearId),
      ]);

      // Build expense spent map per category
      const spentMap: Record<string, number> = {};
      for (const e of (expRes.data ?? [])) {
        if (e.budget_category_id)
          spentMap[e.budget_category_id] = (spentMap[e.budget_category_id] ?? 0) + Number(e.amount);
      }

      // Build category name lookup
      const catNameMap: Record<string, string> = {};
      for (const c of (catsRes.data ?? [])) catNameMap[c.id] = c.name;

      const categories: FullCategory[] = (catsRes.data ?? []).map((c) => {
        const planned = Number(c.planned_amount);
        const spent = spentMap[c.id] ?? 0;
        const remaining = planned - spent;
        return { id: c.id, name: c.name, source: c.source, planned_amount: planned, planned, spent, remaining, pct: planned > 0 ? Math.round((spent / planned) * 100) : 0 };
      });

      const allExpenses: FullExpense[] = (expRes.data ?? []).map((e) => ({
        ...e,
        amount: Number(e.amount),
        category_name: e.budget_category_id ? (catNameMap[e.budget_category_id] ?? null) : null,
      }));

      // Build income category name lookup (income may reference same categories)
      const allIncome: FullIncome[] = (incRes.data ?? []).map((i) => ({
        ...i,
        amount: Number(i.amount),
        category_name: i.budget_category_id ? (catNameMap[i.budget_category_id] ?? null) : null,
      }));

      const grades = (gradesRes.data ?? []) as FullGrade[];
      const sections = (sectionsRes.data ?? []) as SectionRow[];
      const gsaRows = (gsaRes.data ?? []) as GSARow[];
      const collections = (colRes.data ?? []) as CollectionRow[];

      // ─── Compute diagnostics ────────────────────────────────────────────────
      const diagnostics: Diagnostic[] = [];

      // Error: no active year (handled above)

      // Error: no budget categories at all
      if (categories.length === 0) {
        diagnostics.push({ level: "error", title: "אין קטגוריות תקציב", detail: "לא הוגדרו קטגוריות תקציב לשנה הפעילה — לא ניתן לסווג הוצאות." });
      }

      // Warning: uncategorized expenses
      const uncatExpenses = allExpenses.filter((e) => !e.budget_category_id);
      if (uncatExpenses.length > 0) {
        diagnostics.push({ level: "warning", title: `${uncatExpenses.length} הוצאות ללא קטגוריה`, detail: `הוצאות לא משויכות לא נכנסות לדוח התקציבי המפורט. הוצאה אחרונה: "${uncatExpenses[0].description ?? "ללא תיאור"}" (${fmt(uncatExpenses[0].amount)})` });
      }

      // Warning: categories with 0 planned
      const zeroPlan = categories.filter((c) => c.planned === 0);
      if (zeroPlan.length > 0) {
        diagnostics.push({ level: "warning", title: `${zeroPlan.length} קטגוריות ללא תקציב מתוכנן`, detail: `הקטגוריות הבאות תוכננו ב-₪0: ${zeroPlan.slice(0, 4).map((c) => c.name).join("، ")}` });
      }

      // Error: categories over budget
      const overBudget = categories.filter((c) => c.planned > 0 && c.pct > 100);
      overBudget.forEach((c) => {
        diagnostics.push({ level: "error", title: `חריגה מתקציב — ${c.name}`, detail: `תוכנן ${fmt(c.planned)}, הוצאה בפועל ${fmt(c.spent)} (${c.pct}%). חריגה של ${fmt(c.spent - c.planned)}.` });
      });

      // Warning: categories >80% utilized
      const nearBudget = categories.filter((c) => c.planned > 0 && c.pct >= 80 && c.pct <= 100);
      nearBudget.forEach((c) => {
        diagnostics.push({ level: "warning", title: `${c.name} — ${c.pct}% מהתקציב נוצל`, detail: `תוכנן ${fmt(c.planned)}, נוצל ${fmt(c.spent)}, נותר ${fmt(c.remaining)}.` });
      });

      // Error: no grades
      if (grades.length === 0) {
        diagnostics.push({ level: "error", title: "אין שכבות מוגדרות", detail: "לא ניתן להשתמש במודול גבייה מהורים ללא שכבות." });
      }

      // Warning: grades with no student count
      const zeroStudents = grades.filter((g) => g.student_count === 0);
      if (zeroStudents.length > 0) {
        diagnostics.push({ level: "warning", title: `${zeroStudents.length} שכבות עם 0 תלמידים`, detail: `שכבות: ${zeroStudents.map((g) => g.name).join("، ")}` });
      }

      // Warning: no sections defined
      if (sections.length === 0 && grades.length > 0) {
        diagnostics.push({ level: "warning", title: "אין סעיפי הורים מוגדרים", detail: "לא ניתן לחשב יעד גבייה ללא סעיפים (ה-wizard לא הושלם)." });
      }

      // Warning: grades with no section amounts set
      if (sections.length > 0) {
        const gradesWithNoAmounts = grades.filter((g) => {
          const hasAny = gsaRows.some((r) => r.grade_id === g.id && r.amount_per_student > 0);
          return !hasAny;
        });
        if (gradesWithNoAmounts.length > 0) {
          diagnostics.push({ level: "warning", title: `${gradesWithNoAmounts.length} שכבות ללא סכום גבייה`, detail: `שכבות ללא סכום מוגדר: ${gradesWithNoAmounts.map((g) => g.name).join("، ")}` });
        }
      }

      // Info: no income recorded
      if (allIncome.length === 0) {
        diagnostics.push({ level: "info", title: "אין הכנסות רשומות", detail: "לא נרשמו הכנסות לשנה הפעילה." });
      }

      // Info: no parent collections
      if (collections.length === 0 && sections.length > 0) {
        diagnostics.push({ level: "info", title: "אין גבייה מהורים רשומה", detail: "הסעיפים מוגדרים אך לא נרשמה אף גבייה." });
      }

      // Warning: very low collection rate
      if (sections.length > 0 && grades.length > 0) {
        const totalTarget = grades.reduce((s, g) => {
          return s + sections.reduce((ss, sec) => {
            const gsa = gsaRows.find((r) => r.grade_id === g.id && r.parent_section_id === sec.id);
            return ss + (gsa ? gsa.amount_per_student * g.student_count : 0);
          }, 0);
        }, 0);
        const totalCollected = collections.reduce((s, c) => s + Number(c.amount), 0);
        const collPct = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;
        if (totalTarget > 0 && collPct < 20) {
          diagnostics.push({ level: "info", title: `שיעור גבייה נמוך — ${collPct}%`, detail: `נגבה ${fmt(totalCollected)} מתוך יעד של ${fmt(totalTarget)}.` });
        }
      }

      // Info: no expenses at all
      if (allExpenses.length === 0) {
        diagnostics.push({ level: "info", title: "אין הוצאות רשומות", detail: "לא נרשמו הוצאות לשנה הפעילה." });
      }

      // No diagnostics → all good
      if (diagnostics.length === 0) {
        diagnostics.push({ level: "info", title: "הכל תקין ✓", detail: "לא נמצאו בעיות במערכת." });
      }

      return {
        activeYear,
        allYears: years,
        members: (membersRes.data ?? []) as unknown as MemberRow[],
        sources,
        categories,
        grades,
        sections,
        gsaRows,
        collections,
        allExpenses,
        allIncome,
        diagnostics,
      };
    },
    staleTime: 1000 * 60,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("admin_set_org_expiry", {
        p_org_id: orgId,
        p_expires_at: yesterday,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });
}

function useDeleteOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("admin_delete_org", { p_org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });
}

// ─── Style constants ──────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #E5EAE7",
  borderRadius: "14px", padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
};

const chip = (color: string, bg: string): React.CSSProperties => ({
  display: "inline-block", background: bg, color,
  borderRadius: "20px", padding: "2px 10px",
  fontSize: "11.5px", fontWeight: 600, whiteSpace: "nowrap" as const,
});

const FALLBACK_SOURCE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  gefen:  { color: "#166534", bg: "#F0FDF4", label: "גפן" },
  iriyah: { color: "#7C2D12", bg: "#FFF7ED", label: "עירייה" },
  horim:  { color: "#8B2F6E", bg: "#F4EBF2", label: "הורים" },
};

const DIAG_CFG = {
  error:   { icon: "🔴", color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5" },
  warning: { icon: "🟡", color: "#92400E", bg: "#FFFBEB", border: "#FCD34D" },
  info:    { icon: "🔵", color: "#1E40AF", bg: "#EFF6FF", border: "#93C5FD" },
};

// ─── Main page ─────────────────────────────────────────────────────────────────

type SortFilter = "all" | "active" | "trial" | "expired" | "free";

function getOrgCategory(org: OrgRow): SortFilter {
  if (!org.plan_expires_at) return "free";
  const diff = Math.ceil((new Date(org.plan_expires_at).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "expired";
  if (diff <= 30) return "trial";
  return "active";
}

function AdminPage() {
  const { data: orgs = [], isLoading } = useAllOrgs();
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [codeModalOrg, setCodeModalOrg] = useState<OrgRow | null>(null);
  const [deepDiveOrg, setDeepDiveOrg]   = useState<OrgRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrgRow | null>(null);
  const [searchTerm, setSearchTerm]     = useState("");
  const [sortFilter, setSortFilter]     = useState<SortFilter>("all");
  const [deleteErr, setDeleteErr]       = useState<string | null>(null);
  const pauseSub = usePauseSubscription();
  const deleteOrg = useDeleteOrg();
  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // Stats
  const stats: Record<string, number> = { active: 0, trial: 0, expired: 0, free: 0 };
  for (const o of orgs) { const cat = getOrgCategory(o); stats[cat] = (stats[cat] ?? 0) + 1; }

  // Duplicate detection — names that appear more than once
  const nameCounts: Record<string, number> = {};
  for (const o of orgs) {
    const key = o.name.trim().toLowerCase();
    nameCounts[key] = (nameCounts[key] ?? 0) + 1;
  }
  const duplicateNames = new Set(Object.keys(nameCounts).filter((k) => nameCounts[k] > 1));

  // Filter + search
  const filteredOrgs = orgs.filter((o) => {
    const matchSearch = !searchTerm ||
      o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.city ?? "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter = sortFilter === "all" || getOrgCategory(o) === sortFilter;
    return matchSearch && matchFilter;
  });

  const FILTER_TABS: { key: SortFilter; label: string; color: string; count: number }[] = [
    { key: "all",     label: "הכל",         color: "#374151", count: orgs.length },
    { key: "active",  label: "מנוי פעיל",   color: "#166534", count: stats.active  },
    { key: "trial",   label: "עומד לפוג",   color: "#92400E", count: stats.trial   },
    { key: "expired", label: "פג תוקף",     color: "#991B1B", count: stats.expired },
    { key: "free",    label: "חינמי",        color: "#1D4ED8", count: stats.free    },
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{ background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)", borderRadius: "20px", padding: "28px 32px", marginBottom: "20px", boxShadow: "0 8px 32px rgba(15,23,42,0.4)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: "4px" }}>SUPER ADMIN</div>
            <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, color: "#fff" }}>לוח בקרה — כל בתי הספר</h1>
            <div style={{ marginTop: "6px", fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>{orgs.length} ארגונים רשומים</div>
          </div>
          {/* Stat chips */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
            {[
              { label: "פעיל", val: stats.active,  bg: "#166534", fg: "#BBF7D0" },
              { label: "עומד לפוג", val: stats.trial,  bg: "#92400E", fg: "#FDE68A" },
              { label: "פג",   val: stats.expired, bg: "#991B1B", fg: "#FCA5A5" },
              { label: "חינמי",val: stats.free,    bg: "#1D4ED8", fg: "#BFDBFE" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: "10px", padding: "8px 14px", textAlign: "center" as const }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: s.fg }}>{s.val}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", marginTop: "1px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Search */}
        <input
          type="text"
          placeholder="🔍 חיפוש לפי שם בית ספר או עיר..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" as const, padding: "11px 16px", borderRadius: "10px", border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "14px", fontFamily: "Rubik, sans-serif", outline: "none", direction: "rtl" }}
        />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" as const }}>
        {FILTER_TABS.map(tab => (
          <button key={tab.key} onClick={() => setSortFilter(tab.key)}
            style={{ padding: "7px 14px", borderRadius: "20px", border: sortFilter === tab.key ? "none" : "1.5px solid #E5E7EB", background: sortFilter === tab.key ? tab.color : "#fff", color: sortFilter === tab.key ? "#fff" : tab.color, fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", display: "flex", alignItems: "center", gap: "5px" }}>
            {tab.label}
            <span style={{ background: sortFilter === tab.key ? "rgba(255,255,255,0.25)" : "#F3F4F6", color: sortFilter === tab.key ? "#fff" : "#6B7280", borderRadius: "10px", padding: "1px 7px", fontSize: "11px" }}>{tab.count}</span>
          </button>
        ))}
        {duplicateNames.size > 0 && (
          <div style={{ marginRight: "auto", padding: "7px 14px", borderRadius: "20px", background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E", fontSize: "12px", fontWeight: 600 }}>
            ⚠️ {duplicateNames.size} שמות כפולים זוהו
          </div>
        )}
      </div>

      {isLoading && <div style={{ color: "#888", padding: "24px" }}>טוען...</div>}

      {filteredOrgs.map((org) => (
        <OrgCard
          key={org.id}
          org={org}
          isDuplicate={duplicateNames.has(org.name.trim().toLowerCase())}
          expanded={expandedId === org.id}
          onToggle={() => toggle(org.id)}
          onGenerateCode={() => setCodeModalOrg(org)}
          onDeepDive={() => setDeepDiveOrg(org)}
          onPause={() => {
            if (window.confirm(`לעצור את המנוי של "${org.name}"?`)) pauseSub.mutate(org.id);
          }}
          onDelete={() => { setDeleteErr(null); setConfirmDelete(org); }}
        />
      ))}

      {!isLoading && filteredOrgs.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "#888", padding: "48px" }}>
          {searchTerm || sortFilter !== "all" ? "אין תוצאות לחיפוש" : "אין ארגונים רשומים עדיין"}
        </div>
      )}

      {codeModalOrg && <CodeModal org={codeModalOrg} onClose={() => setCodeModalOrg(null)} />}
      {deepDiveOrg && <DeepDiveModal org={deepDiveOrg} onClose={() => setDeepDiveOrg(null)} />}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setConfirmDelete(null); setDeleteErr(null); } }}>
          <div style={{ background: "#fff", borderRadius: "18px", padding: "32px 28px", maxWidth: "420px", width: "100%", fontFamily: "Rubik, sans-serif", direction: "rtl" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#111", marginBottom: "12px" }}>מחיקת ארגון</div>
            <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
              <div style={{ fontWeight: 600, color: "#991B1B", marginBottom: "4px" }}>⚠️ פעולה בלתי הפיכה</div>
              <div style={{ fontSize: "13px", color: "#7F1D1D", lineHeight: 1.6 }}>
                מחיקת <strong>{confirmDelete.name}</strong> תמחק גם את כל הנתונים שלהם — שנות לימודים, הוצאות, הכנסות, גבייה, וחברי צוות.
              </div>
            </div>
            {deleteErr && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#991B1B" }}>
                שגיאה: {deleteErr}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => { setConfirmDelete(null); setDeleteErr(null); }}
                style={{ flex: 1, padding: "11px", borderRadius: "9px", border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: "14px", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
                ביטול
              </button>
              <button type="button" disabled={deleteOrg.isPending}
                onClick={() => {
                  setDeleteErr(null);
                  deleteOrg.mutate(confirmDelete.id, {
                    onSuccess: () => { setConfirmDelete(null); setDeleteErr(null); },
                    onError: (e) => setDeleteErr(e instanceof Error ? e.message : String(e)),
                  });
                }}
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

function OrgCard({ org, expanded, isDuplicate, onToggle, onGenerateCode, onDeepDive, onPause, onDelete }: {
  org: OrgRow; expanded: boolean; isDuplicate?: boolean; onToggle: () => void;
  onGenerateCode: () => void; onDeepDive: () => void;
  onPause: () => void; onDelete: () => void;
}) {
  const { data: detail, isLoading } = useOrgDetail(expanded ? org.id : null);
  const expiry = expiryStatus(org.plan_expires_at);
  const isExpired = org.plan_expires_at && new Date(org.plan_expires_at) < new Date();
  const pendingMembers = detail?.members.filter((m) => m.status === "pending").length ?? 0;

  return (
    <div style={{ ...card, marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, cursor: "pointer" }} onClick={onToggle}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, background: "linear-gradient(135deg, #1E293B, #0F172A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 700, color: "#fff" }}>
            {org.name[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
              <span style={{ fontWeight: 700, fontSize: "15.5px", color: "#111" }}>{org.name}</span>
              {org.plan === "pro" && <span style={chip("#7C3AED", "#EDE9FE")}>PRO</span>}
              {isDuplicate && <span style={chip("#92400E", "#FEF3C7")}>⚠️ שם כפול</span>}
            </div>
            <div style={{ fontSize: "12.5px", color: "#6B7280", marginTop: "2px" }}>
              {org.city ?? "ללא עיר"}<span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
              נוצר {org.created_at ? new Date(org.created_at).toLocaleDateString("he-IL") : "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, flexWrap: "wrap" as const }}>
          {pendingMembers > 0 && <span style={chip("#B45309", "#FEF3C7")}>{pendingMembers} ממתינ{pendingMembers > 1 ? "ים" : ""}</span>}
          <span style={chip(expiry.color, expiry.bg)}>{expiry.label}</span>

          <button type="button" onClick={(e) => { e.stopPropagation(); onDeepDive(); }}
            style={{ background: "linear-gradient(135deg, #1E293B, #334155)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: "5px" }}>
            🔍 Deep Dive
          </button>

          <button type="button" onClick={(e) => { e.stopPropagation(); setViewAsOrg(org.id, org.name, org.city); window.open("/dashboard", "_blank"); }}
            style={{ background: "linear-gradient(135deg, #7C2D12, #B45309)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: "5px" }}>
            👁 צפה
          </button>

          <button type="button" onClick={(e) => { e.stopPropagation(); onGenerateCode(); }}
            style={{ background: "linear-gradient(135deg, #1A3D2B, #2D6644)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
            🔑 הנפק קוד
          </button>

          {!isExpired && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onPause(); }}
              style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
              ⏸ עצור מנוי
            </button>
          )}

          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "Rubik, sans-serif", whiteSpace: "nowrap" as const }}>
            🗑 מחק
          </button>

          <div onClick={onToggle} style={{ transform: `rotate(${expanded ? "180deg" : "0deg"})`, transition: "transform 0.2s", color: "#9CA3AF", cursor: "pointer" }}>▼</div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: "20px", borderTop: "1px solid #F1F5F9", paddingTop: "20px" }}>
          {isLoading ? (
            <div style={{ color: "#9CA3AF", fontSize: "13px" }}>טוען...</div>
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
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
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
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.05em", marginBottom: "10px" }}>שנות לימודים</div>
                {detail.years.map((y) => (
                  <div key={y.id} style={{ padding: "8px 12px", borderRadius: "8px", background: y.is_active ? "#F0FDF4" : "#F8FAFC", border: y.is_active ? "1px solid #BBF7D0" : "1px solid #F1F5F9", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: y.is_active ? 600 : 400, color: "#111" }}>{y.name}</div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>{y.start_date?.slice(0, 7)} – {y.end_date?.slice(0, 7)}</div>
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

// ─── Deep Dive Modal ──────────────────────────────────────────────────────────

type DeepTab = "diagnostics" | "overview" | "budget" | "horim" | "expenses" | "income" | "team";

function DeepDiveModal({ org, onClose }: { org: OrgRow; onClose: () => void }) {
  const { data, isLoading, error } = useOrgFullData(org.id);
  const [tab, setTab] = useState<DeepTab>("diagnostics");

  const tabs: { key: DeepTab; label: string; emoji: string; badge?: number }[] = [
    { key: "diagnostics", label: "אבחון", emoji: "🩺", badge: data?.diagnostics.filter((d) => d.level !== "info").length },
    { key: "overview",    label: "סקירה",  emoji: "📊" },
    { key: "budget",      label: "תקציב",  emoji: "💰" },
    { key: "horim",       label: "הורים",  emoji: "👨‍👩‍👧" },
    { key: "expenses",    label: "הוצאות", emoji: "🧾" },
    { key: "income",      label: "הכנסות", emoji: "📥" },
    { key: "team",        label: "צוות",   emoji: "👥" },
  ];

  const srcColor = (slug: string) => FALLBACK_SOURCE_COLORS[slug] ?? { color: "#374151", bg: "#F1F5F9", label: slug };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#F0F4F8", borderRadius: "22px", width: "100%", maxWidth: "900px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "Rubik, sans-serif", direction: "rtl", boxShadow: "0 32px 100px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0F172A, #1E3A5F)", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: "3px" }}>🔍 DEEP DIVE · SUPER ADMIN</div>
            <div style={{ fontSize: "19px", fontWeight: 700, color: "#fff" }}>{org.name}</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>
              {data?.activeYear ? `שנה פעילה: ${data.activeYear.name}` : "אין שנה פעילה"}
              {org.city && ` · ${org.city}`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={chip(expiryStatus(org.plan_expires_at).color, expiryStatus(org.plan_expires_at).bg)}>
              {expiryStatus(org.plan_expires_at).label}
            </span>
            <button type="button" onClick={onClose}
              style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "8px", color: "#fff", fontSize: "18px", cursor: "pointer", padding: "5px 12px", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "2px", padding: "10px 16px 0", background: "#fff", borderBottom: "2px solid #E8EDE9", flexShrink: 0, overflowX: "auto" }}>
          {tabs.map(({ key, label, emoji, badge }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              style={{ padding: "8px 14px", borderRadius: "8px 8px 0 0", border: "none", fontSize: "12.5px", fontWeight: tab === key ? 700 : 400, background: tab === key ? "#F0F4F8" : "transparent", color: tab === key ? "#0F172A" : "#6B7280", cursor: "pointer", fontFamily: "Rubik, sans-serif", borderBottom: tab === key ? "2px solid #1E3A5F" : "2px solid transparent", whiteSpace: "nowrap" as const, position: "relative" as const, display: "flex", alignItems: "center", gap: "5px" }}>
              <span>{emoji}</span>
              {label}
              {!!badge && badge > 0 && (
                <span style={{ background: "#EF4444", color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "10px", fontWeight: 700 }}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 22px", flex: 1 }}>
          {isLoading && <div style={{ color: "#9CA3AF", textAlign: "center", padding: "60px" }}>טוען נתוני ארגון...</div>}
          {error && <div style={{ color: "#DC2626", padding: "20px" }}>שגיאה בטעינת נתונים: {(error as Error).message}</div>}

          {/* ── DIAGNOSTICS ── */}
          {!isLoading && data && tab === "diagnostics" && (
            <div>
              <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "16px" }}>
                בדיקה אוטומטית של {data.diagnostics.length} ממצאים בשנה הפעילה.
              </div>
              {data.diagnostics.map((d, i) => {
                const cfg = DIAG_CFG[d.level];
                return (
                  <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "16px", flexShrink: 0 }}>{cfg.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13.5px", color: cfg.color, marginBottom: "4px" }}>{d.title}</div>
                      <div style={{ fontSize: "12.5px", color: "#374151", lineHeight: 1.55 }}>{d.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {!isLoading && data && tab === "overview" && (
            <div>
              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "18px" }}>
                {[
                  { label: "קטגוריות תקציב", value: data.categories.length + "", sub: "מוגדרות" },
                  { label: "הוצאות", value: data.allExpenses.length + "", sub: `${fmt(data.allExpenses.reduce((s, e) => s + e.amount, 0))} סה״כ` },
                  { label: "הכנסות", value: data.allIncome.length + "", sub: `${fmt(data.allIncome.reduce((s, i) => s + i.amount, 0))} סה״כ` },
                  { label: "שכבות", value: data.grades.length + "", sub: `${data.grades.reduce((s, g) => s + g.student_count, 0)} תלמידים` },
                ].map((k) => (
                  <div key={k.label} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", padding: "14px 16px" }}>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: "4px", letterSpacing: "0.04em" }}>{k.label}</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#0F172A" }}>{k.value}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Per-source */}
              {data.sources.map((src) => {
                const cats = data.categories.filter((c) => c.source === src.slug);
                const totalPlanned = cats.reduce((s, c) => s + c.planned, 0);
                const totalSpent = cats.reduce((s, c) => s + c.spent, 0);
                const totalIncome = data.allIncome.filter((i) => i.source === src.slug).reduce((s, i) => s + i.amount, 0);
                const pct = totalPlanned > 0 ? Math.min(Math.round((totalSpent / totalPlanned) * 100), 100) : 0;
                const sc = srcColor(src.slug);
                return (
                  <div key={src.slug} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", padding: "16px 18px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ ...chip(sc.color, sc.bg), fontSize: "13px" }}>{src.label}</span>
                      <div style={{ display: "flex", gap: "20px", fontSize: "12.5px", color: "#6B7280" }}>
                        <span>מתוכנן <strong style={{ color: "#111" }}>{fmt(totalPlanned)}</strong></span>
                        <span>הכנסות <strong style={{ color: "#166534" }}>{fmt(totalIncome)}</strong></span>
                        <span>הוצאות <strong style={{ color: "#991B1B" }}>{fmt(totalSpent)}</strong></span>
                        <span>נותר <strong style={{ color: totalPlanned - totalSpent >= 0 ? "#166534" : "#DC2626" }}>{fmt(totalPlanned - totalSpent)}</strong></span>
                      </div>
                    </div>
                    <div style={{ background: "#F1F5F9", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: totalSpent > totalPlanned ? "#DC2626" : sc.color, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>{pct}% מנוצל · {cats.length} קטגוריות</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── BUDGET ── */}
          {!isLoading && data && tab === "budget" && (
            <div>
              {data.categories.length === 0 && (
                <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px" }}>אין קטגוריות תקציב בשנה הפעילה</div>
              )}
              {data.sources.map((src) => {
                const cats = data.categories.filter((c) => c.source === src.slug);
                if (cats.length === 0) return null;
                const sc = srcColor(src.slug);
                return (
                  <div key={src.slug} style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", paddingRight: "4px" }}>
                      <span style={chip(sc.color, sc.bg)}>{src.label}</span>
                      <span style={{ fontSize: "12px", color: "#6B7280" }}>{cats.length} קטגוריות</span>
                    </div>
                    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead style={{ background: "#F8FAFC" }}>
                          <tr>
                            <th style={{ padding: "9px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>קטגוריה</th>
                            <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>תוכנן</th>
                            <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>הוצאות</th>
                            <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>נותר</th>
                            <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9", minWidth: "120px" }}>ניצול</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cats.map((c) => (
                            <tr key={c.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                              <td style={{ padding: "10px 14px", fontSize: "13px", fontWeight: 500, color: "#111" }}>{c.name}</td>
                              <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "left", color: "#374151" }}>{fmt(c.planned)}</td>
                              <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "left", color: "#991B1B", fontWeight: c.spent > 0 ? 600 : 400 }}>{fmt(c.spent)}</td>
                              <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "left", fontWeight: 700, color: c.remaining >= 0 ? "#166534" : "#DC2626" }}>{fmt(c.remaining)}</td>
                              <td style={{ padding: "10px 14px", textAlign: "left" }}>
                                <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "3px" }}>{c.pct}%</div>
                                <div style={{ background: "#E5E7EB", borderRadius: "4px", height: "5px", width: "100%" }}>
                                  <div style={{ width: `${Math.min(c.pct, 100)}%`, height: "100%", borderRadius: "4px", background: c.pct > 100 ? "#DC2626" : c.pct > 80 ? "#F59E0B" : sc.color }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── HORIM ── */}
          {!isLoading && data && tab === "horim" && (
            <div>
              {data.grades.length === 0 && <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px" }}>אין שכבות מוגדרות</div>}
              {data.sections.length === 0 && data.grades.length > 0 && <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#92400E" }}>⚠️ אין סעיפי הורים — יש להשלים את ה-wizard של הגדרת גבייה.</div>}

              {data.sections.length > 0 && (
                <>
                  {/* Grade × section grid */}
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", overflow: "auto", marginBottom: "18px" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #E8EDE9", fontWeight: 700, fontSize: "13px", color: "#111" }}>
                      מטריצת סכומי גבייה — ₪ לתלמיד
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead style={{ background: "#FAF5FF" }}>
                        <tr>
                          <th style={{ padding: "9px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#6B21A8", borderBottom: "1px solid #E8EDE9" }}>שכבה</th>
                          <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8EDE9" }}>תלמידים</th>
                          {data.sections.map((s) => (
                            <th key={s.id} style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6B21A8", borderBottom: "1px solid #E8EDE9" }}>{s.name}</th>
                          ))}
                          <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#166534", borderBottom: "1px solid #E8EDE9" }}>נגבה</th>
                          <th style={{ padding: "9px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8EDE9" }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.grades.map((g) => {
                          const target = data.sections.reduce((s, sec) => {
                            const gsa = data.gsaRows.find((r) => r.grade_id === g.id && r.parent_section_id === sec.id);
                            return s + (gsa ? gsa.amount_per_student * g.student_count : 0);
                          }, 0);
                          const collected = data.collections.filter((c) => c.grade_id === g.id).reduce((s, c) => s + Number(c.amount), 0);
                          const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
                          return (
                            <tr key={g.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                              <td style={{ padding: "10px 14px", fontSize: "13px", fontWeight: 600, color: "#111" }}>{g.name}</td>
                              <td style={{ padding: "10px 14px", fontSize: "12.5px", color: "#6B7280", textAlign: "left" }}>{g.student_count}</td>
                              {data.sections.map((sec) => {
                                const gsa = data.gsaRows.find((r) => r.grade_id === g.id && r.parent_section_id === sec.id);
                                const amt = gsa?.amount_per_student ?? 0;
                                return (
                                  <td key={sec.id} style={{ padding: "10px 14px", fontSize: "12.5px", textAlign: "left", color: amt > 0 ? "#111" : "#D1D5DB" }}>
                                    {amt > 0 ? fmt(amt) : "—"}
                                  </td>
                                );
                              })}
                              <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "left", fontWeight: 600, color: "#166534" }}>{fmt(collected)}</td>
                              <td style={{ padding: "10px 14px", fontSize: "12.5px", textAlign: "left", color: pct >= 85 ? "#166534" : pct >= 50 ? "#92400E" : "#991B1B", fontWeight: 600 }}>{target > 0 ? `${pct}%` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Recent collections */}
                  {data.collections.length > 0 && (
                    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E8EDE9", fontWeight: 700, fontSize: "13px", color: "#111" }}>
                        רשומות גבייה אחרונות ({data.collections.length})
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead style={{ background: "#F8FAFC" }}>
                          <tr>
                            {["תאריך", "שכבה", "סעיף", "סכום", "הערות"].map((h) => (
                              <th key={h} style={{ padding: "8px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.collections.slice(0, 30).map((c) => {
                            const grade = data.grades.find((g) => g.id === c.grade_id);
                            const sec = data.sections.find((s) => s.id === c.parent_section_id);
                            return (
                              <tr key={c.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
                                <td style={{ padding: "9px 14px", fontSize: "12px", color: "#6B7280" }}>{fmtDate(c.collection_date)}</td>
                                <td style={{ padding: "9px 14px", fontSize: "12.5px", color: "#111" }}>{grade?.name ?? "—"}</td>
                                <td style={{ padding: "9px 14px", fontSize: "12.5px", color: "#6B21A8" }}>{sec?.name ?? "—"}</td>
                                <td style={{ padding: "9px 14px", fontSize: "13px", fontWeight: 600, color: "#166534" }}>{fmt(Number(c.amount))}</td>
                                <td style={{ padding: "9px 14px", fontSize: "12px", color: "#9CA3AF" }}>{c.notes ?? "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── EXPENSES ── */}
          {!isLoading && data && tab === "expenses" && (
            <div>
              <div style={{ fontSize: "12.5px", color: "#6B7280", marginBottom: "12px" }}>
                {data.allExpenses.length} הוצאות · סה״כ {fmt(data.allExpenses.reduce((s, e) => s + e.amount, 0))}
                {data.allExpenses.filter((e) => !e.budget_category_id).length > 0 && (
                  <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: "6px", padding: "2px 8px", fontSize: "11.5px", fontWeight: 600, marginRight: "8px" }}>
                    {data.allExpenses.filter((e) => !e.budget_category_id).length} ללא קטגוריה
                  </span>
                )}
              </div>
              {data.allExpenses.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px" }}>אין הוצאות בשנה הפעילה</div>
              ) : (
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ background: "#F8FAFC" }}>
                      <tr>
                        {["תאריך", "תיאור", "ספק", "מקור", "קטגוריה", "סכום"].map((h) => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.allExpenses.map((e) => {
                        const sc = srcColor(e.source);
                        return (
                          <tr key={e.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
                            <td style={{ padding: "9px 14px", fontSize: "12px", color: "#6B7280", whiteSpace: "nowrap" as const }}>{fmtDate(e.expense_date)}</td>
                            <td style={{ padding: "9px 14px", fontSize: "12.5px", color: "#111", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.description ?? "—"}</td>
                            <td style={{ padding: "9px 14px", fontSize: "12px", color: "#6B7280" }}>{e.supplier ?? "—"}</td>
                            <td style={{ padding: "9px 14px" }}><span style={chip(sc.color, sc.bg)}>{sc.label}</span></td>
                            <td style={{ padding: "9px 14px", fontSize: "12px", color: e.category_name ? "#374151" : "#D1D5DB" }}>{e.category_name ?? "ללא קטגוריה"}</td>
                            <td style={{ padding: "9px 14px", fontSize: "13px", fontWeight: 600, color: "#991B1B", whiteSpace: "nowrap" as const }}>{fmt(e.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── INCOME ── */}
          {!isLoading && data && tab === "income" && (
            <div>
              <div style={{ fontSize: "12.5px", color: "#6B7280", marginBottom: "12px" }}>
                {data.allIncome.length} הכנסות · סה״כ {fmt(data.allIncome.reduce((s, i) => s + i.amount, 0))}
              </div>
              {data.allIncome.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px" }}>אין הכנסות בשנה הפעילה</div>
              ) : (
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ background: "#F8FAFC" }}>
                      <tr>
                        {["תאריך", "תיאור", "מקור", "קטגוריה", "סכום"].map((h) => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", borderBottom: "1px solid #E8EDE9" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.allIncome.map((i) => {
                        const sc = srcColor(i.source);
                        return (
                          <tr key={i.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
                            <td style={{ padding: "9px 14px", fontSize: "12px", color: "#6B7280", whiteSpace: "nowrap" as const }}>{fmtDate(i.income_date)}</td>
                            <td style={{ padding: "9px 14px", fontSize: "12.5px", color: "#111", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{i.description ?? "—"}</td>
                            <td style={{ padding: "9px 14px" }}><span style={chip(sc.color, sc.bg)}>{sc.label}</span></td>
                            <td style={{ padding: "9px 14px", fontSize: "12px", color: i.category_name ? "#374151" : "#D1D5DB" }}>{i.category_name ?? "—"}</td>
                            <td style={{ padding: "9px 14px", fontSize: "13px", fontWeight: 600, color: "#166534", whiteSpace: "nowrap" as const }}>{fmt(i.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TEAM ── */}
          {!isLoading && data && tab === "team" && (
            <div>
              {data.members.map((m) => {
                const statusCfg = {
                  active:   { color: "#166534", bg: "#F0FDF4", label: "פעיל/ה" },
                  pending:  { color: "#92400E", bg: "#FEF3C7", label: "ממתין/ת" },
                  rejected: { color: "#991B1B", bg: "#FEF2F2", label: "נדחה/ת" },
                };
                const sc = statusCfg[m.status as keyof typeof statusCfg] ?? statusCfg.pending;
                return (
                  <div key={m.id} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E8EDE9", padding: "14px 18px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#1A3D2B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {(m.profiles?.full_name ?? m.profiles?.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#111" }}>{m.profiles?.full_name ?? "—"}</div>
                      <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "1px" }}>{m.profiles?.email}</div>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span style={chip("#374151", "#F1F5F9")}>
                        {m.role === "owner" ? "מנהל/ת ראשי/ת" : m.role === "admin" ? "מנהל/ת" : "צופה"}
                      </span>
                      <span style={chip(sc.color, sc.bg)}>{sc.label}</span>
                    </div>
                    {m.joined_at && (
                      <div style={{ fontSize: "11.5px", color: "#9CA3AF", whiteSpace: "nowrap" as const }}>הצטרף/ה {fmtDate(m.joined_at)}</div>
                    )}
                  </div>
                );
              })}
              {data.members.length === 0 && (
                <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px" }}>אין חברי צוות</div>
              )}
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
        <div style={{ background: "#F8FAFC", borderRadius: "10px", padding: "10px 14px", marginBottom: "20px", fontSize: "13.5px", color: "#374151", fontWeight: 500 }}>🏫 {org.name}</div>
        {!generatedCode ? (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>תוקף הרישיון עד</label>
              <input type="date" value={expiresAt} min={new Date().toISOString().split("T")[0]} onChange={(e) => setExpiresAt(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1.5px solid #D1D5DB", borderRadius: "9px", outline: "none", fontFamily: "Rubik, sans-serif", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: "9px", border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: "14px", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>ביטול</button>
              <button type="button" onClick={handleGenerate} disabled={isPending}
                style={{ flex: 2, padding: "10px", borderRadius: "9px", background: "linear-gradient(135deg, #1A3D2B, #2D6644)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.7 : 1, fontFamily: "Rubik, sans-serif" }}>
                {isPending ? "מייצר…" : "🔑 צור קוד"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "14px", textAlign: "right" }}>✅ הקוד נוצר. שלח ל{org.name}.</div>
            <div style={{ background: "#F0FDF4", border: "2px solid #86EFAC", borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
              <span style={{ fontSize: "26px", fontFamily: "monospace", fontWeight: 700, color: "#166534", letterSpacing: "0.15em" }}>{generatedCode}</span>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={handleCopy}
                style={{ flex: 1, padding: "10px", borderRadius: "9px", background: copied ? "#166534" : "linear-gradient(135deg, #1A3D2B, #2D6644)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
                {copied ? "✓ הועתק!" : "העתק קוד"}
              </button>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: "10px", borderRadius: "9px", border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: "14px", cursor: "pointer", fontFamily: "Rubik, sans-serif" }}>
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
