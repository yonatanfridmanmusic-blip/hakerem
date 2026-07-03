import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SourceSummary {
  source: string;
  label: string;
  // Budget planning (from budget_categories)
  planned: number;
  used: number;
  balance: number;   // planned - used
  pct: number;       // used / planned %
  // Cash flow (actual income received)
  income: number;        // income table + parent_collections for horim
  cashBalance: number;   // income - used  (for horim) OR planned - used (gefen/iriyah if no income)
  cashPct: number;       // used / income %
  isIncomeBased: boolean; // true if cash figures come from actual collections, false if from budget
}

export interface DashboardSummary {
  schoolYear: { id: string; name: string } | null;
  sources: SourceSummary[];
  totals: { planned: number; used: number; balance: number; pct: number };
  incomeTotals: { fromIncome: number; fromParentCollections: number; grand: number };
}

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const empty: DashboardSummary = {
        schoolYear: null,
        sources: [],
        totals: { planned: 0, used: 0, balance: 0, pct: 0 },
        incomeTotals: { fromIncome: 0, fromParentCollections: 0, grand: 0 },
      };

      // 0. Resolve current user's org (explicit filter — super_admin sees all orgs otherwise)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return empty;
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!mem?.organization_id) return empty;

      const orgId = mem.organization_id;

      // 1. Active school year (filtered to this org)
      const { data: yearData, error: yearError } = await supabase
        .from("school_years")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .maybeSingle();

      if (yearError) throw yearError;
      if (!yearData) return empty;

      const yearId = yearData.id;

      // 2. Org budget sources (dynamic — includes custom sources)
      const { data: orgSources } = await supabase
        .from("org_budget_sources")
        .select("slug, label")
        .eq("org_id", orgId)
        .order("order_index");

      const allSources: { slug: string; label: string }[] =
        orgSources?.length
          ? orgSources
          : [
              { slug: "gefen",  label: "גפן" },
              { slug: "iriyah", label: "עירייה" },
              { slug: "horim",  label: "הורים" },
            ];

      // 3. Budget categories (planned amounts)
      const { data: categories, error: catError } = await supabase
        .from("budget_categories")
        .select("source, planned_amount")
        .eq("school_year_id", yearId);
      if (catError) throw catError;

      // 4. Expenses
      const { data: expenses, error: expError } = await supabase
        .from("expenses")
        .select("source, amount")
        .eq("school_year_id", yearId);
      if (expError) throw expError;

      // 5. Income table (per source)
      const { data: incomeRows } = await supabase
        .from("income")
        .select("source, amount")
        .eq("school_year_id", yearId);

      // 6. Parent collections (always go to "horim" source)
      const { data: parentCollRows } = await supabase
        .from("parent_collections")
        .select("amount")
        .eq("school_year_id", yearId);

      const parentCollTotal = (parentCollRows ?? []).reduce((s, r) => s + Number(r.amount), 0);

      // Aggregate income by source
      const incomeBySource: Record<string, number> = {};
      allSources.forEach(s => { incomeBySource[s.slug] = 0; });
      (incomeRows ?? []).forEach((r) => {
        if (r.source in incomeBySource) incomeBySource[r.source] += Number(r.amount);
        else incomeBySource[r.source] = Number(r.amount);
      });

      // Add parent collections to horim income
      if ("horim" in incomeBySource) {
        incomeBySource["horim"] += parentCollTotal;
      } else {
        incomeBySource["horim"] = parentCollTotal;
      }

      const fromIncome = Object.values(incomeBySource).reduce((a, b) => a + b, 0) - parentCollTotal;

      // 7. Per-source summaries
      const sources: SourceSummary[] = allSources.map(({ slug: source, label }) => {
        const planned = (categories ?? [])
          .filter((c) => c.source === source)
          .reduce((sum, c) => sum + Number(c.planned_amount), 0);

        const used = (expenses ?? [])
          .filter((e) => e.source === source)
          .reduce((sum, e) => sum + Number(e.amount), 0);

        const balance = planned - used;
        const pct = planned > 0 ? Math.round((used / planned) * 100) : 0;

        // Cash / income side
        const income = incomeBySource[source] ?? 0;
        const isIncomeBased = income > 0;
        const cashBalance = isIncomeBased ? income - used : balance;
        const cashPct = income > 0 ? Math.round((used / income) * 100) : pct;

        return {
          source, label,
          planned, used, balance, pct,
          income, cashBalance, cashPct, isIncomeBased,
        };
      });

      // 8. Totals (budget-side for hero)
      const totalPlanned = sources.reduce((s, x) => s + x.planned, 0);
      const totalUsed    = sources.reduce((s, x) => s + x.used, 0);
      const totalBalance = totalPlanned - totalUsed;
      const totalPct     = totalPlanned > 0 ? Math.round((totalUsed / totalPlanned) * 100) : 0;

      return {
        schoolYear: yearData,
        sources,
        totals: { planned: totalPlanned, used: totalUsed, balance: totalBalance, pct: totalPct },
        incomeTotals: {
          fromIncome,
          fromParentCollections: parentCollTotal,
          grand: fromIncome + parentCollTotal,
        },
      };
    },
    staleTime: 1000 * 60 * 2,
  });
}
