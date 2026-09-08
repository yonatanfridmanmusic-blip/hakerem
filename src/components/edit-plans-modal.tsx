// ─── EditPlansModal — עריכת צפי ההכנסות השנתי בחלונית (2.3.0, נושא 4) ─────────
//
// נפתחת מהדשבורד (לחיצה על "צפי הכנסות שנתי" בהירו, או מהקישור "הגדירו כמה
// צפוי להיכנס" בכרטיס מקור). שורה לכל מקור; הורים read-only — הצפי שלו נגזר
// מיעדי הגבייה. שמירה: אותו upsert בדיוק כמו commitSourcePlans בוויזארד
// (onConflict school_year_id,source) + אינוולידציות. לא נוגעת בטיוטת הוויזארד.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActiveYearId } from "@/lib/active-year";
import { useSourceBudgetPlans } from "@/hooks/use-source-budget-plans";
import { useOrgBudgetSources, FALLBACK_SOURCES } from "@/hooks/use-budget-sources";

const fmtNum = (n: number) => new Intl.NumberFormat("he-IL").format(n);

export function EditPlansModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: plans } = useSourceBudgetPlans();
  const { data: orgSources } = useOrgBudgetSources();
  const sources = orgSources?.length ? orgSources : FALLBACK_SOURCES;
  const editableSources = sources.filter((s) => s.slug !== "horim");
  const horimSource = sources.find((s) => s.slug === "horim");

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // זריעה מהערכים הקיימים ב-DB (פעם אחת, כשה-plans נטענים)
  useEffect(() => {
    if (!plans) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const src of editableSources) {
        if (next[src.slug] === undefined) {
          const n = plans[src.slug];
          next[src.slug] = n != null && n > 0 ? String(n) : "";
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const yearId = await getActiveYearId();
      if (!yearId) { toast.error("אין שנת לימודים פעילה"); return; }
      // אותו upsert בדיוק כמו commitSourcePlans בוויזארד
      const rows = Object.entries(values)
        .filter(([src, val]) => src !== "horim" && val !== "" && !isNaN(Number(val)) && Number(val) >= 0)
        .map(([src, val]) => ({ school_year_id: yearId, source: src, planned_income: Number(val) }));
      if (rows.length > 0) {
        const { error } = await supabase
          .from("source_budget_plans")
          .upsert(rows, { onConflict: "school_year_id,source" });
        if (error) { toast.error("שגיאה בשמירת הצפי — נסו/י שוב"); return; }
      }
      qc.invalidateQueries({ queryKey: ["source-budget-plans"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["income"] });
      qc.invalidateQueries({ queryKey: ["source-breakdown"] });
      toast.success("צפי ההכנסות עודכן");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "150px", padding: "8px 12px",
    border: "1px solid #E8E2D9", borderRadius: "8px",
    fontSize: "14px", background: "#fff", color: "#1A1A1A",
    outline: "none", fontFamily: "var(--font-sans)",
    direction: "ltr", textAlign: "right",
  };

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "420px",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.22)", overflow: "hidden", direction: "rtl",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 500, color: "#1A1A1A" }}>צפי הכנסות שנתי</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>כמה צפוי להיכנס מכל מקור השנה</div>
          </div>
          <button onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#AAA099", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Rows */}
        <div style={{ padding: "16px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          {editableSources.map((src) => (
            <div key={src.slug} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#1A1A1A" }}>{src.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="number" min="0" step="1" placeholder="0"
                  value={values[src.slug] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [src.slug]: e.target.value }))}
                  style={inputStyle}
                />
                <span style={{ fontSize: "13px", color: "#AAA099" }}>₪</span>
              </div>
            </div>
          ))}
          {horimSource && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
              padding: "10px 12px", background: "#F7F4EF", borderRadius: "10px",
            }}>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#6B6560" }}>{horimSource.label}</div>
              <div style={{ fontSize: "12px", color: "#AAA099" }}>
                נגזר מיעדי הגבייה — נקבע במסך ההורים
              </div>
            </div>
          )}
          <div style={{ fontSize: "11.5px", color: "#AAA099", lineHeight: 1.5, marginTop: "2px" }}>
            השמירה מעדכנת את לוח הבקרה, מסך ההכנסות ומצב תקציבי מיד.
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #EAE5DE", display: "flex", gap: "10px", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: "10px 0", border: "1px solid #E8E2D9", borderRadius: "8px",
            background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>ביטול</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} style={{
            flex: 2, padding: "10px 0", border: "none", borderRadius: "8px",
            background: saving ? "#888" : "#1A3D2B", color: "#fff",
            fontSize: "14px", fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
          }}>
            {saving ? "שומר..." : "שמור צפי"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

void fmtNum; // עוגן פורמט לשימוש עתידי
