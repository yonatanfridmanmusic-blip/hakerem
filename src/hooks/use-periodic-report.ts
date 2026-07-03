import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";
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

      const yearId = await getActiveYearId();
      if (!yearId) return null;

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

      // Resolve org sources dynamically (same pattern as useDashboardSummary)
      const { data: { session: sess2 } } = await supabase.auth.getSession();
      const { data: mem2 } = sess2
        ? await supabase.from("organization_members").select("organization_id")
            .eq("user_id", sess2.user.id).eq("status", "active").maybeSingle()
        : { data: null };
      const { data: orgSrcRows } = mem2?.organization_id
        ? await supabase.from("org_budget_sources").select("slug, label")
            .eq("org_id", mem2.organization_id).order("order_index")
        : { data: null };
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
