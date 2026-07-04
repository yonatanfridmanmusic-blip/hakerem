import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetSource } from "@/types/budget";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchoolYearMeta {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface PeriodicSource {
  source: BudgetSource;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface PeriodicSummary {
  from: string;
  to: string;
  sources: PeriodicSource[];
  totals: {
    income: number;
    parentCollections: number;
    totalIncome: number;
    expenses: number;
    net: number;
  };
}

// ─── Active year meta (for date range UI) ────────────────────────────────────

export function useActiveSchoolYearMeta() {
  return useQuery<SchoolYearMeta | null>({
    queryKey: ["active-school-year-meta"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!mem?.organization_id) return null;

      const { data, error } = await supabase
        .from("school_years")
        .select("id, name, start_date, end_date")
        .eq("organization_id", mem.organization_id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 1000 * 60 * 10,
  });
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function usePeriodicReport(from: string | null, to: string | null) {
  return useQuery<PeriodicSummary | null>({
    queryKey: ["periodic-report", from, to],
    queryFn: async () => {
      if (!from || !to) return null;

      // Single auth round-trip — orgId and yearId both derived here, reused below
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!mem?.organization_id) return null;
      const orgId = mem.organization_id;

      const { data: yearRow } = await supabase
        .from("school_years")
        .select("id")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .maybeSingle();
      if (!yearRow?.id) return null;
      const yearId = yearRow.id;

      const [expRes, incRes, colRes] = await Promise.all([
        supabase
          .from("expenses")
          .select("source, amount")
          .eq("school_year_id", yearId)
          .gte("expense_date", from)
          .lte("expense_date", to),
        supabase
          .from("income")
          .select("source, amount")
          .eq("school_year_id", yearId)
          .gte("income_date", from)
          .lte("income_date", to),
        supabase
          .from("parent_collections")
          .select("amount")
          .eq("school_year_id", yearId)
          .gte("collection_date", from)
          .lte("collection_date", to),
      ]);

      if (expRes.error) throw expRes.error;
      if (incRes.error) throw incRes.error;

      const expenses    = expRes.data ?? [];
      const income      = incRes.data ?? [];
      const collections = colRes.data ?? [];

      const parentCollTotal = collections.reduce((s, c) => s + Number(c.amount), 0);

      // Resolve org sources — reuse orgId, no second auth call needed
      const { data: orgSrcRows } = await supabase
        .from("org_budget_sources")
        .select("slug, label")
        .eq("org_id", orgId)
        .order("order_index");
      const allOrgSources: { slug: string; label: string }[] = orgSrcRows?.length
        ? orgSrcRows
        : [{ slug: "gefen", label: "גפן" }, { slug: "iriyah", label: "עירייה" }, { slug: "horim", label: "הורים" }];

      // Also include any slugs from actual data not in org sources list
      const seenSlugs = new Set<string>(allOrgSources.map(s => s.slug));
      [...expenses, ...income].forEach(r => {
        if (r.source && !seenSlugs.has(r.source)) {
          seenSlugs.add(r.source);
          allOrgSources.push({ slug: r.source, label: r.source });
        }
      });

      const sources: PeriodicSource[] = allOrgSources.map(({ slug: source, label }) => {
        const srcIncome  = income.filter((r) => r.source === source).reduce((s, r) => s + Number(r.amount), 0);
        const horimExtra = source === "horim" ? parentCollTotal : 0;
        const totalInc   = srcIncome + horimExtra;
        const totalExp   = expenses.filter((r) => r.source === source).reduce((s, r) => s + Number(r.amount), 0);
        return { source, label, income: totalInc, expenses: totalExp, net: totalInc - totalExp };
      });

      const totalIncome   = income.reduce((s, r) => s + Number(r.amount), 0);
      const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);

      return {
        from,
        to,
        sources,
        totals: {
          income: totalIncome,
          parentCollections: parentCollTotal,
          totalIncome: totalIncome + parentCollTotal,
          expenses: totalExpenses,
          net: totalIncome + parentCollTotal - totalExpenses,
        },
      };
    },
    enabled: !!from && !!to,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Per-category periodic report ────────────────────────────────────────────

export interface PeriodicCategory {
  id: string;
  name: string;
  source: string;
  source_label: string;
  planned_annual: number;   // annual budget
  spent_in_period: number;  // spent within [from, to]
  spent_ytd: number;        // spent from year start to `to`
  remaining_annual: number; // planned - spent_ytd
}

export function usePeriodicCategoryReport(from: string | null, to: string | null) {
  return useQuery<PeriodicCategory[]>({
    queryKey: ["periodic-category-report", from, to],
    queryFn: async () => {
      if (!from || !to) return [];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!mem?.organization_id) return [];
      const orgId = mem.organization_id;

      const [yearRes, orgSrcRes] = await Promise.all([
        supabase.from("school_years").select("id,start_date").eq("organization_id", orgId).eq("is_active", true).maybeSingle(),
        supabase.from("org_budget_sources").select("slug,label").eq("org_id", orgId).order("order_index"),
      ]);
      if (!yearRes.data?.id) return [];
      const yearId = yearRes.data.id;
      const yearStart = yearRes.data.start_date ?? from;

      const FALLBACK: Record<string, string> = { gefen: "גפן", iriyah: "עירייה", horim: "הורים" };
      const srcLabels: Record<string, string> = {};
      (orgSrcRes.data ?? []).forEach((s) => { srcLabels[s.slug] = s.label; });
      const getLabel = (slug: string) => srcLabels[slug] ?? FALLBACK[slug] ?? slug;

      const [catRes, periodRes, ytdRes] = await Promise.all([
        supabase.from("budget_categories").select("id,name,source,planned_amount,order_index").eq("school_year_id", yearId).order("source").order("order_index"),
        supabase.from("expenses").select("budget_category_id,amount").eq("school_year_id", yearId).gte("expense_date", from).lte("expense_date", to),
        supabase.from("expenses").select("budget_category_id,amount").eq("school_year_id", yearId).gte("expense_date", yearStart).lte("expense_date", to),
      ]);

      const periodMap: Record<string, number> = {};
      for (const e of (periodRes.data ?? [])) {
        if (e.budget_category_id) periodMap[e.budget_category_id] = (periodMap[e.budget_category_id] ?? 0) + Number(e.amount);
      }
      const ytdMap: Record<string, number> = {};
      for (const e of (ytdRes.data ?? [])) {
        if (e.budget_category_id) ytdMap[e.budget_category_id] = (ytdMap[e.budget_category_id] ?? 0) + Number(e.amount);
      }

      return (catRes.data ?? [])
        .map((c) => ({
          id: c.id,
          name: c.name,
          source: c.source,
          source_label: getLabel(c.source),
          planned_annual: Number(c.planned_amount),
          spent_in_period: periodMap[c.id] ?? 0,
          spent_ytd: ytdMap[c.id] ?? 0,
          remaining_annual: Number(c.planned_amount) - (ytdMap[c.id] ?? 0),
        }))
        .filter((c) => c.planned_annual > 0 || c.spent_in_period > 0);
    },
    enabled: !!from && !!to,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Date range helpers ───────────────────────────────────────────────────────

export interface DateRange { from: string; to: string; label: string }

/** Returns an array of {from, to, label} for every month in the school year. */
export function getMonthRanges(startDate: string, endDate: string): DateRange[] {
  const ranges: DateRange[] = [];
  const end = new Date(endDate);
  let cur = new Date(startDate);
  cur.setDate(1);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const label = cur.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    ranges.push({ from, to, label });
    cur = new Date(y, m + 1, 1);
  }

  return ranges;
}

/**
 * Returns the 4 academic-year quarters based on the school year's start year.
 * Academic year starts in September, so:
 *   Q1: Sep–Nov, Q2: Dec–Feb, Q3: Mar–May, Q4: Jun–Aug
 */
export function getQuarterRanges(startDate: string): DateRange[] {
  const sy = new Date(startDate).getFullYear(); // school year start year (e.g. 2024)
  const ey = sy + 1;                            // end year (e.g. 2025)
  return [
    { from: `${sy}-09-01`, to: `${sy}-11-30`,  label: "רבעון א׳  ·  ספטמבר–נובמבר" },
    { from: `${sy}-12-01`, to: `${ey}-02-28`,  label: "רבעון ב׳  ·  דצמבר–פברואר"  },
    { from: `${ey}-03-01`, to: `${ey}-05-31`,  label: "רבעון ג׳  ·  מרץ–מאי"        },
    { from: `${ey}-06-01`, to: `${ey}-08-31`,  label: "רבעון ד׳  ·  יוני–אוגוסט"   },
  ];
}
