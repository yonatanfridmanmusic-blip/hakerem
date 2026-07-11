import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditAction = "insert" | "update" | "delete";

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: AuditAction;
  table_name: string;
  record_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  is_undone: boolean;
}

// ─── Human-readable description ───────────────────────────────────────────────

export function describeAuditEntry(entry: AuditLogEntry): string {
  const data = entry.action === "delete" ? entry.old_data : entry.new_data;
  const fmt = (n: unknown) =>
    typeof n === "number"
      ? `₪${Number(n).toLocaleString("he-IL", { maximumFractionDigits: 0 })}`
      : String(n ?? "");

  switch (entry.table_name) {
    case "expenses": {
      const amount = fmt(data?.amount);
      const label = data?.description || data?.supplier || data?.activity_name || "";
      if (entry.action === "insert") return `הוצאה חדשה: ${amount}${label ? ` — ${label}` : ""}`;
      if (entry.action === "update") return `עדכון הוצאה: ${amount}${label ? ` — ${label}` : ""}`;
      return `מחיקת הוצאה: ${amount}${label ? ` — ${label}` : ""}`;
    }
    case "income": {
      const amount = fmt(data?.amount);
      const label = data?.description || data?.payer || "";
      if (entry.action === "insert") return `הכנסה חדשה: ${amount}${label ? ` — ${label}` : ""}`;
      if (entry.action === "update") return `עדכון הכנסה: ${amount}${label ? ` — ${label}` : ""}`;
      return `מחיקת הכנסה: ${amount}${label ? ` — ${label}` : ""}`;
    }
    case "parent_collections": {
      const amount = fmt(data?.amount);
      if (entry.action === "insert") return `גבייה חדשה: ${amount}`;
      if (entry.action === "update") return `עדכון גבייה: ${amount}`;
      return `מחיקת גבייה: ${amount}`;
    }
    case "budget_categories": {
      const name = String(data?.name ?? "");
      if (entry.action === "insert") return `קטגוריה חדשה: "${name}"`;
      if (entry.action === "update") return `עדכון קטגוריה: "${name}"`;
      return `מחיקת קטגוריה: "${name}"`;
    }
    case "grade_section_amounts": {
      const amount = fmt(data?.amount_per_student);
      if (entry.action === "insert") return `סכום גבייה חדש: ${amount} לתלמיד`;
      if (entry.action === "update") return `עדכון סכום גבייה: ${amount} לתלמיד`;
      return `מחיקת סכום גבייה`;
    }
    case "parent_sections": {
      const name = String(data?.name ?? "");
      if (entry.action === "insert") return `סעיף הורים חדש: "${name}"`;
      if (entry.action === "update") return `עדכון סעיף הורים: "${name}"`;
      return `מחיקת סעיף הורים: "${name}"`;
    }
    default:
      return `${entry.action} — ${entry.table_name}`;
  }
}

export function tableLabel(tableName: string): string {
  const map: Record<string, string> = {
    expenses:             "הוצאות",
    income:               "הכנסות",
    parent_collections:   "גבייה",
    budget_categories:    "קטגוריות",
    grade_section_amounts:"סכומי גבייה",
    parent_sections:      "סעיפים",
  };
  return map[tableName] ?? tableName;
}

export function actionLabel(action: AuditAction): string {
  return action === "insert" ? "הוספה" : action === "update" ? "עדכון" : "מחיקה";
}

export function actionColor(action: AuditAction): string {
  return action === "insert"
    ? "#15803d"
    : action === "update"
    ? "#b45309"
    : "#dc2626";
}

// ─── useAuditLog ─────────────────────────────────────────────────────────────

export function useAuditLog(limit = 50) {
  return useQuery<AuditLogEntry[]>({
    queryKey: ["audit-log", limit],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_audit_log", { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── useUndoAuditEntry ───────────────────────────────────────────────────────

export function useUndoAuditEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("undo_audit_entry", { p_entry_id: entryId });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? "שגיאה בביטול הפעולה");
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-log"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["income"] });
      qc.invalidateQueries({ queryKey: ["horim"] });
      qc.invalidateQueries({ queryKey: ["parent-collections"] });
      qc.invalidateQueries({ queryKey: ["budget-plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => {
      toast.error(`לא ניתן לבטל: ${err.message}`);
    },
  });
}

// ─── showDeleteUndoToast ─────────────────────────────────────────────────────
// Call this after any delete to give user a 5-second undo window.
// We query audit_log for the most recent entry of the deleted record.

export async function showDeleteUndoToast(
  recordId: string,
  label: string,
  onUndo: (entryId: string) => void,
) {
  // Brief delay so trigger fires before we query
  await new Promise((r) => setTimeout(r, 300));

  const { data } = await supabase
    .from("audit_log" as never)
    .select("id")
    .eq("record_id", recordId)
    .eq("action", "delete")
    .eq("is_undone", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const entryId = (data as { id: string } | null)?.id;

  toast(label, {
    description: entryId ? "לחץ לביטול הפעולה" : undefined,
    action: entryId
      ? {
          label: "↩ בטל",
          onClick: () => onUndo(entryId),
        }
      : undefined,
    duration: 5000,
  });
}
