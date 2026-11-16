import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getActiveYearId } from "@/lib/active-year";
import {
  cleanComponents, parseComponents, gradeFieldsOf, activityTotalAg, fromAg,
  type PlannedActivity, type PlanComponent, type GradeLite,
} from "@/lib/horim-planning";

/**
 * 2.9.0 — תכנון פעילויות במסך ההורים.
 * פעילות מתוכננת היא שורת `budget_activities` תחת קטגוריית ההורים של הסעיף, עם
 * `planned_amount` ו/או `components`. אותה טבלה משמשת לתת-קטגוריות (2.8.0), ולכן
 * הפעילות מופיעה מעצמה בשדה תת-הקטגוריה בטופס ההוצאה — שם שירן מקשרת חשבונית לפעילות.
 */
export interface HorimPlanningData {
  categories: { id: string; name: string }[];
  activities: PlannedActivity[];
}

const KEY = ["planned-activities"] as const;
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

export function useHorimPlanning(enabled = true) {
  return useQuery<HorimPlanningData>({
    queryKey: KEY,
    enabled,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return { categories: [], activities: [] };
      const [catR, actR] = await Promise.all([
        supabase.from("budget_categories").select("id, name").eq("school_year_id", yearId).eq("source", "horim"),
        supabase.from("budget_activities")
          .select("id, name, budget_category_id, planned_amount, grade_id, target_grade_ids, notes, components")
          .eq("school_year_id", yearId).eq("source", "horim").order("order_index").order("name"),
      ]);
      if (catR.error) throw catR.error;
      if (actR.error) throw actR.error;
      return {
        categories: catR.data ?? [],
        activities: (actR.data ?? []).map((a) => ({
          id: a.id, name: a.name, budget_category_id: a.budget_category_id,
          planned_amount: Number(a.planned_amount) || 0,
          grade_id: a.grade_id, target_grade_ids: a.target_grade_ids ?? [],
          notes: a.notes, components: parseComponents(a.components),
        })),
      };
    },
  });
}

export interface SaveActivityInput {
  /** עריכה: מזהה הפעילות. יצירה: undefined */
  id?: string;
  budgetCategoryId: string;
  name: string;
  /** השכבות שנבחרו */
  gradeIds: string[];
  grades: GradeLite[];
  /** סכום אחד (כשאין רכיבים) */
  amount: number;
  components: PlanComponent[];
  notes: string;
}

export function useSavePlannedActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveActivityInput) => {
      const name = clean(input.name);
      if (!name) throw new Error("יש לתת שם לפעילות");
      const components = cleanComponents(input.components);
      const gradeFields = gradeFieldsOf(input.gradeIds, input.grades.map((g) => g.id));
      // planned_amount נשמר תמיד כסכום הכולל, גם כשיש רכיבים — כדי שכל קורא אחר יראה מספר אחד.
      const totalAg = activityTotalAg(
        { planned_amount: input.amount, components, ...gradeFields }, input.grades,
      );
      if (totalAg <= 0) throw new Error("יש להזין עלות לפעילות");
      const fields = {
        name, ...gradeFields,
        planned_amount: fromAg(totalAg),
        components: components as unknown as Json,
        notes: clean(input.notes) || null,
      };

      if (input.id) {
        const { error } = await supabase.from("budget_activities").update(fields).eq("id", input.id);
        if (error) throw error;
        return { id: input.id };
      }

      const { data: cat, error: catErr } = await supabase
        .from("budget_categories").select("school_year_id, source").eq("id", input.budgetCategoryId).single();
      if (catErr || !cat) throw catErr ?? new Error("הסעיף לא נמצא");
      const { data: existing, error: exErr } = await supabase
        .from("budget_activities").select("id, name, planned_amount, components").eq("budget_category_id", input.budgetCategoryId);
      if (exErr) throw exErr;

      // אותו שם כבר קיים בסעיף: תת-קטגוריה בלי תכנון מקבלת את התכנון (לא נוצרת כפילות);
      // פעילות מתוכננת באותו שם — עוצרים, כדי לא לדרוס תכנון קיים בלי כוונה.
      const twin = (existing ?? []).find((a) => clean(a.name) === name);
      if (twin) {
        const twinPlanned = Number(twin.planned_amount) > 0 || parseComponents(twin.components).length > 0;
        if (twinPlanned) throw new Error("כבר קיימת בסעיף הזה פעילות בשם הזה");
        const { error } = await supabase.from("budget_activities").update(fields).eq("id", twin.id);
        if (error) throw error;
        return { id: twin.id };
      }

      const { data, error } = await supabase.from("budget_activities").insert({
        school_year_id: cat.school_year_id, source: cat.source, budget_category_id: input.budgetCategoryId,
        order_index: existing?.length ?? 0, ...fields,
      }).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: ["sub-categories"] }),
    ]),
  });
}

/** מה שהוסר — מספיק כדי להחזיר בדיוק את אותו מצב ("ביטול"). */
export interface RemovedPlan {
  mode: "deleted" | "unplanned";
  row: {
    id: string; school_year_id: string; source: string; budget_category_id: string; name: string;
    planned_amount: number; grade_id: string | null; target_grade_ids: string[]; notes: string | null;
    components: Json; order_index: number;
  };
}

export function useRemovePlannedActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<RemovedPlan> => {
      const { data: row, error } = await supabase.from("budget_activities")
        .select("id, school_year_id, source, budget_category_id, name, planned_amount, grade_id, target_grade_ids, notes, components, order_index")
        .eq("id", id).single();
      if (error || !row) throw error ?? new Error("הפעילות לא נמצאה");
      const { count, error: cntErr } = await supabase.from("expenses")
        .select("id", { count: "exact", head: true }).eq("budget_activity_id", id);
      if (cntErr) throw cntErr;
      const snapshot: RemovedPlan["row"] = { ...row, planned_amount: Number(row.planned_amount) || 0, target_grade_ids: row.target_grade_ids ?? [] };

      // יש הוצאות שמקושרות לפעילות: מסירים רק את התכנון. השורה נשארת כתת-קטגוריה,
      // כדי שההוצאות לא יאבדו את השיוך שלהן (מחיקה הייתה מנתקת אותן).
      if ((count ?? 0) > 0) {
        const { error: updErr } = await supabase.from("budget_activities")
          .update({ planned_amount: 0, components: [] as unknown as Json }).eq("id", id);
        if (updErr) throw updErr;
        return { mode: "unplanned", row: snapshot };
      }
      const { error: delErr } = await supabase.from("budget_activities").delete().eq("id", id);
      if (delErr) throw delErr;
      return { mode: "deleted", row: snapshot };
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: ["sub-categories"] }),
    ]),
  });
}

export function useRestorePlannedActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (removed: RemovedPlan) => {
      const r = removed.row;
      if (removed.mode === "unplanned") {
        const { error } = await supabase.from("budget_activities")
          .update({ planned_amount: r.planned_amount, components: r.components }).eq("id", r.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("budget_activities").insert(r);
      if (error) throw error;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: ["sub-categories"] }),
    ]),
  });
}
