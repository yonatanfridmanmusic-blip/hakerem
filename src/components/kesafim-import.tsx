// ─── ייבוא דוח "סטטוס גביה לשיכבה" (0637) מתוכנת כספים 2000 ──────────────────
// שלב 3 של הפרויקט: זרימת דוח ראשון בלבד.
// זרימה: בחירת PDF → העלאה ל-kesafim-reports → רשומת kesafim_imports (pending)
// → parse-kesafim-report → מסך אישור (התאמת שכבות/סעיפים) → כתיבה מפורשת (await
// על הכל, בלי catch שקט) → committed. דוח עדכון = שלב 4 (חסום כאן).

import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, FileUp, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organization";
import { getActiveYearId } from "@/lib/active-year";
import { syncHorimBudgetCategory, type Grade, type ParentSection } from "@/hooks/use-horim";

// ─── טיפוסי תוצאת הפענוח (מראה של פלט ה-edge function) ───────────────────────

interface ParsedRow { name_raw: string; charged: number; paid: number; balance: number; pct: number | null; valid: boolean }
interface ParsedGrade { grade_label: string; rows: ParsedRow[]; total: ParsedRow | null; totals_valid: boolean }
interface ParsedReport {
  report: { school_name: string | null; school_id: string | null; report_date: string | null; fiscal_year: string | null; report_number: string | null };
  grades: ParsedGrade[];
  validation: { attempts: number; all_valid: boolean };
}

// ─── נרמול שמות ───────────────────────────────────────────────────────────────

/** שם סעיף מהדוח → שם מנורמל: הסרת קידומת "הכ", הסרת אות שכבה סופית, trim. */
export function normalizeReportName(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("הכ ")) s = s.slice(3).trim();
  const m = s.match(/^(.*\S)\s+[אבגדהוזחטי]$/); // אות שכבה בודדת בסוף
  if (m) s = m[1];
  return s.trim();
}

/** "שכבה א" → "א" */
function reportGradeLetter(label: string): string {
  return label.replace("שכבה", "").trim();
}

/** שם שכבה בכרם → אות: מסיר גרשיים/geresh/"שכבה" ורווחים. */
function yearGradeLetter(name: string): string {
  return name.replace(/["'׳´`]/g, "").replace("שכבה", "").trim();
}

const fmt = (n: number) => n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function formatDateHe(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ─── סטייט המיפוי ─────────────────────────────────────────────────────────────

type MappingMode = "map" | "create" | "skip";
interface Mapping { mode: MappingMode; sectionId: string; newName: string; fromMemory: boolean }

type Phase = "pick" | "processing" | "review" | "committing" | "done" | "blocked";

// ─── סגנונות משותפים ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid #E8E2D9", borderRadius: "8px",
  fontSize: "13px", fontFamily: "var(--font-sans)", background: "#fff", color: "#1A1A1A",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

// ─── הקומפוננטה ───────────────────────────────────────────────────────────────

export function KesafimImportModal({
  onClose, grades, sections,
}: {
  onClose: () => void;
  grades: Grade[];
  sections: ParentSection[];
}) {
  const qc = useQueryClient();
  const { data: membership } = useOrganization();
  const orgId = membership?.organization?.id;

  const [phase, setPhase] = useState<Phase>("pick");
  const [processingMsg, setProcessingMsg] = useState("");
  const [parsed, setParsed] = useState<ParsedReport | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [memoryMap, setMemoryMap] = useState<Record<string, string>>({});
  const [manualBySection, setManualBySection] = useState<Record<string, number>>({});
  const [gradeMatch, setGradeMatch] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [perStudentOverride, setPerStudentOverride] = useState<Record<string, string>>({});
  const [rowSkip, setRowSkip] = useState<Record<string, boolean>>({});
  const [doneSummary, setDoneSummary] = useState<{ rows: number; total: number; newSections: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── בדיקת חסימה + טעינת זיכרון מיפויים וגביות ידניות ─────────────────────
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return;
      const { data: imported, error: impErr } = await supabase
        .from("parent_collections").select("id").eq("school_year_id", yearId)
        .not("import_id", "is", null).limit(1);
      if (impErr) { toast.error("שגיאה בבדיקת ייבואים קודמים"); return; }
      if ((imported ?? []).length > 0) { setPhase("blocked"); return; }
      const [memR, manR] = await Promise.all([
        supabase.from("kesafim_section_map")
          .select("report_name_normalized, parent_section_id").eq("organization_id", orgId),
        supabase.from("parent_collections")
          .select("parent_section_id, amount").eq("school_year_id", yearId).is("import_id", null),
      ]);
      if (memR.error) { toast.error("שגיאה בטעינת מיפויים שמורים"); return; }
      if (manR.error) { toast.error("שגיאה בטעינת גביות קיימות"); return; }
      setMemoryMap(Object.fromEntries((memR.data ?? []).map((r) => [r.report_name_normalized, r.parent_section_id])));
      const agg: Record<string, number> = {};
      (manR.data ?? []).forEach((c) => {
        if (c.parent_section_id) agg[c.parent_section_id] = (agg[c.parent_section_id] ?? 0) + Number(c.amount);
      });
      setManualBySection(agg);
    })();
  }, [orgId]);

  // ─── העלאה + פענוח ──────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (file.type !== "application/pdf") { toast.error("יש לבחור קובץ PDF"); return; }
    if (!orgId) { toast.error("לא נמצא ארגון"); return; }
    setPhase("processing");
    let recId: string | null = null;
    try {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();

      setProcessingMsg("מעלה את הקובץ...");
      const path = `${orgId}/${yearId}/${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("kesafim-reports").upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw new Error(`העלאת הקובץ נכשלה: ${upErr.message}`);

      const { data: rec, error: recErr } = await supabase.from("kesafim_imports")
        .insert({ school_year_id: yearId, file_path: path, status: "pending", created_by: user?.id })
        .select("id").single();
      if (recErr) throw new Error(`יצירת רשומת ייבוא נכשלה: ${recErr.message}`);
      recId = rec.id;

      setProcessingMsg("מפענח את הדוח... (עד דקה)");
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = () => rej(new Error("קריאת הקובץ נכשלה"));
        r.readAsDataURL(file);
      });
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("parse-kesafim-report", {
        body: { file_base64: b64, file_media_type: "application/pdf" },
      });
      if (fnErr) throw new Error(`הפענוח נכשל: ${fnErr.message}`);
      if (!fnData?.success || !fnData?.data) throw new Error(`הפענוח נכשל: ${fnData?.error ?? "תשובה לא צפויה"}`);
      const result = fnData.data as ParsedReport;
      if ((result.grades ?? []).length === 0) throw new Error("לא זוהו שכבות בדוח — ודאו שזה דוח 0637");

      const { error: updErr } = await supabase.from("kesafim_imports").update({
        parsed_payload: result as never,
        report_date: result.report.report_date,
        report_school_id: result.report.school_id,
      }).eq("id", rec.id);
      if (updErr) throw new Error(`שמירת הפענוח נכשלה: ${updErr.message}`);

      initReview(result);
      setImportId(rec.id);
      setParsed(result);
      setPhase("review");
    } catch (e) {
      if (recId) {
        const { error } = await supabase.from("kesafim_imports").update({ status: "cancelled" }).eq("id", recId);
        if (error) console.error("cancel import record:", error.message);
      }
      toast.error(e instanceof Error ? e.message : String(e));
      setPhase("pick");
    }
  }

  // ─── אתחול מסך האישור ───────────────────────────────────────────────────────
  function initReview(result: ParsedReport) {
    const gm: Record<string, string> = {};
    result.grades.forEach((g) => {
      const letter = reportGradeLetter(g.grade_label);
      const match = grades.find((yg) => yearGradeLetter(yg.name) === letter);
      gm[g.grade_label] = match?.id ?? "";
    });
    setGradeMatch(gm);

    const maps: Record<string, Mapping> = {};
    const skips: Record<string, boolean> = {};
    result.grades.forEach((g, gi) => {
      g.rows.forEach((r, ri) => {
        skips[`${gi}-${ri}`] = !r.valid;
        const norm = normalizeReportName(r.name_raw);
        if (maps[norm]) return;
        const remembered = memoryMap[norm];
        if (remembered && sections.some((s) => s.id === remembered)) {
          maps[norm] = { mode: "map", sectionId: remembered, newName: norm, fromMemory: true };
        } else {
          const byName = sections.find((s) => s.name.trim() === norm);
          maps[norm] = byName
            ? { mode: "map", sectionId: byName.id, newName: norm, fromMemory: false }
            : { mode: "create", sectionId: "", newName: norm, fromMemory: false };
        }
      });
    });
    setMappings(maps);
    setRowSkip(skips);
    setPerStudentOverride({});
  }

  // ─── נגזרות למסך האישור ─────────────────────────────────────────────────────
  const studentCount = useMemo(() => Object.fromEntries(grades.map((g) => [g.id, g.student_count])), [grades]);

  function defaultPerStudent(row: ParsedRow, gradeLabel: string): string {
    const gid = gradeMatch[gradeLabel];
    const count = gid ? studentCount[gid] : 0;
    if (row.charged <= 0 || !count) return "";
    return (row.charged / count).toFixed(2);
  }

  const rowIsWritten = (gi: number, ri: number, g: ParsedGrade, r: ParsedRow) =>
    !rowSkip[`${gi}-${ri}`] && !!gradeMatch[g.grade_label] &&
    mappings[normalizeReportName(r.name_raw)]?.mode !== "skip";

  const plan = useMemo(() => {
    if (!parsed) return { rows: 0, total: 0, newSections: [] as string[], mappedSectionIds: [] as string[] };
    const newSections = new Set<string>();
    const mappedIds = new Set<string>();
    let rows = 0, total = 0;
    parsed.grades.forEach((g, gi) => g.rows.forEach((r, ri) => {
      if (!rowIsWritten(gi, ri, g, r)) return;
      rows++; total += r.paid;
      const m = mappings[normalizeReportName(r.name_raw)];
      if (m?.mode === "create") newSections.add(m.newName.trim());
      if (m?.mode === "map" && m.sectionId) mappedIds.add(m.sectionId);
    }));
    return { rows, total, newSections: [...newSections], mappedSectionIds: [...mappedIds] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mappings, rowSkip, gradeMatch]);

  const manualOverlap = plan.mappedSectionIds.reduce((s, id) => s + (manualBySection[id] ?? 0), 0);
  const unmatchedGrades = parsed ? parsed.grades.filter((g) => !gradeMatch[g.grade_label]) : [];
  const canCommit = parsed !== null && unmatchedGrades.length === 0 && plan.rows > 0 && phase === "review";

  // ─── כתיבה באישור — הכל await מפורש, כשל עוצר הכל ──────────────────────────
  async function commit() {
    if (!parsed || !importId || !orgId) return;
    setPhase("committing");
    try {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();

      // שורות לכתיבה
      const written: { gradeId: string; norm: string; row: ParsedRow; per: number | null }[] = [];
      parsed.grades.forEach((g, gi) => g.rows.forEach((r, ri) => {
        if (!rowIsWritten(gi, ri, g, r)) return;
        const key = `${gi}-${ri}`;
        const perStr = perStudentOverride[key] ?? defaultPerStudent(r, g.grade_label);
        const per = r.charged > 0 ? Number(perStr) : null;
        if (r.charged > 0 && (!isFinite(per!) || per! < 0)) throw new Error(`יעד לתלמיד לא תקין בסעיף "${r.name_raw}"`);
        written.push({ gradeId: gradeMatch[g.grade_label], norm: normalizeReportName(r.name_raw), row: r, per });
      }));
      if (written.length === 0) throw new Error("אין שורות לייבוא");

      // 1. סעיפים חדשים
      const usedNorms = [...new Set(written.map((w) => w.norm))];
      const sectionIdByNorm: Record<string, string> = {};
      const sectionNameById: Record<string, string> = {};
      const { data: maxOrd, error: ordErr } = await supabase.from("parent_sections")
        .select("order_index").eq("school_year_id", yearId)
        .order("order_index", { ascending: false }).limit(1).maybeSingle();
      if (ordErr) throw new Error(`קריאת סעיפים נכשלה: ${ordErr.message}`);
      let nextOrder = (maxOrd?.order_index ?? -1) + 1;
      for (const norm of usedNorms) {
        const m = mappings[norm];
        if (m.mode === "map") {
          sectionIdByNorm[norm] = m.sectionId;
          sectionNameById[m.sectionId] = sections.find((s) => s.id === m.sectionId)?.name ?? norm;
        } else {
          const name = m.newName.trim();
          if (!name) throw new Error(`שם סעיף ריק (מקור: "${norm}")`);
          const existing = sections.find((s) => s.name.trim() === name)
            ?? Object.entries(sectionNameById).find(([, n]) => n === name)?.[0];
          if (typeof existing === "string") { sectionIdByNorm[norm] = existing; continue; }
          if (existing) { sectionIdByNorm[norm] = existing.id; sectionNameById[existing.id] = name; continue; }
          const { data: ins, error } = await supabase.from("parent_sections")
            .insert({ school_year_id: yearId, name, order_index: nextOrder++, is_active: true })
            .select("id").single();
          if (error) throw new Error(`יצירת הסעיף "${name}" נכשלה: ${error.message}`);
          sectionIdByNorm[norm] = ins.id;
          sectionNameById[ins.id] = name;
        }
      }

      // 2. זיכרון מיפויים
      for (const norm of usedNorms) {
        const { error } = await supabase.from("kesafim_section_map").upsert(
          { organization_id: orgId, report_name_normalized: norm, parent_section_id: sectionIdByNorm[norm] },
          { onConflict: "organization_id,report_name_normalized" },
        );
        if (error) throw new Error(`שמירת מיפוי "${norm}" נכשלה: ${error.message}`);
      }

      // 3. יעדים (gsa) לשורות עם חובה חיובית
      const { data: existingGsa, error: gsaErr } = await supabase.from("grade_section_amounts")
        .select("id, grade_id, parent_section_id").eq("school_year_id", yearId);
      if (gsaErr) throw new Error(`קריאת יעדים קיימים נכשלה: ${gsaErr.message}`);
      for (const w of written) {
        if (w.per === null) continue;
        const secId = sectionIdByNorm[w.norm];
        const ex = (existingGsa ?? []).find((g) => g.grade_id === w.gradeId && g.parent_section_id === secId);
        if (ex) {
          const { error } = await supabase.from("grade_section_amounts")
            .update({ amount_per_student: w.per }).eq("id", ex.id);
          if (error) throw new Error(`עדכון יעד נכשל: ${error.message}`);
        } else {
          const { error } = await supabase.from("grade_section_amounts").insert({
            school_year_id: yearId, grade_id: w.gradeId, parent_section_id: secId,
            amount_per_student: w.per, working_budget_basis: "p85",
          });
          if (error) throw new Error(`כתיבת יעד נכשלה: ${error.message}`);
        }
      }

      // 4. סנכרון תכנון תקציב לכל סעיף מעורב
      const involvedSecIds = [...new Set(usedNorms.map((n) => sectionIdByNorm[n]))];
      for (const secId of involvedSecIds) {
        await syncHorimBudgetCategory(yearId, secId, sectionNameById[secId]
          ?? sections.find((s) => s.id === secId)?.name ?? "");
      }

      // 5. רישום הגבייה
      const notes = `ייבוא מדוח כספים 2000 (${parsed.report.report_number ?? "0637"}) מ-${formatDateHe(parsed.report.report_date)}`;
      const collectionRows = written.map((w) => ({
        school_year_id: yearId,
        grade_id: w.gradeId,
        parent_section_id: sectionIdByNorm[w.norm],
        amount: w.row.paid,
        collection_date: parsed.report.report_date ?? new Date().toISOString().slice(0, 10),
        notes,
        import_id: importId,
        created_by: user?.id,
      }));
      const { error: colErr } = await supabase.from("parent_collections").insert(collectionRows);
      if (colErr) throw new Error(`רישום הגבייה נכשל: ${colErr.message}`);

      // 6. סגירת הייבוא
      const { error: cmtErr } = await supabase.from("kesafim_imports")
        .update({ status: "committed", committed_at: new Date().toISOString() }).eq("id", importId);
      if (cmtErr) throw new Error(`סימון הייבוא כהושלם נכשל: ${cmtErr.message}`);

      ["parent-collections", "grade-section-amounts", "budget-categories", "budget-plan",
        "dashboard", "source-breakdown", "parent-sections", "parent-sections-all",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

      setDoneSummary({ rows: written.length, total: written.reduce((s, w) => s + w.row.paid, 0), newSections: plan.newSections.length });
      setPhase("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setPhase("review");
    }
  }

  // ─── רנדור ──────────────────────────────────────────────────────────────────
  const wide = phase === "review" || phase === "committing";
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && phase !== "committing" && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "18px", width: "100%", maxWidth: wide ? "840px" : "440px",
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden", direction: "rtl",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>ייבוא מכספים 2000</div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>
              {phase === "review" && parsed
                ? `${parsed.report.school_name ?? ""} · דוח ${parsed.report.report_number ?? ""} · ${formatDateHe(parsed.report.report_date)}`
                : "דוח סטטוס גביה לשיכבה (0637)"}
            </div>
          </div>
          {phase !== "committing" && (
            <button onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#AAA099", display: "flex" }}>
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ overflowY: "auto", padding: "20px 24px" }}>

          {phase === "blocked" && (
            <div style={{ textAlign: "center", padding: "24px 10px" }}>
              <AlertTriangle size={28} color="#B8860B" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: "15px", color: "#1A1A1A", fontWeight: "500", marginBottom: "6px" }}>כבר בוצע ייבוא לשנה זו</div>
              <div style={{ fontSize: "13px", color: "#6B6560", lineHeight: 1.6 }}>
                עדכון נתונים מדוח חדש (דוח עדכון) ייתמך בקרוב.
              </div>
            </div>
          )}

          {phase === "pick" && (
            <div>
              <div style={{ fontSize: "13.5px", color: "#4A453F", lineHeight: 1.7, marginBottom: "16px" }}>
                העלו את דוח <b>"סטטוס גביה לשיכבה" (0637)</b> מתוכנת כספים 2000 — והמערכת
                תקים את סעיפי הגבייה, היעדים והגבייה שנרשמה, עם מסך אישור לפני כל כתיבה.
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} style={{
                width: "100%", padding: "26px 10px", border: "1.5px dashed #C9C0B4", borderRadius: "14px",
                background: "#FAF8F5", cursor: "pointer", fontFamily: "var(--font-sans)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
              }}>
                <FileUp size={22} color="#8B2F6E" />
                <span style={{ fontSize: "14px", color: "#1A1A1A", fontWeight: "500" }}>בחירת קובץ PDF</span>
                <span style={{ fontSize: "12px", color: "#AAA099" }}>הדוח כפי שיוצא מכספים 2000, ללא עריכה</span>
              </button>
            </div>
          )}

          {(phase === "processing" || phase === "committing") && (
            <div style={{ textAlign: "center", padding: "34px 10px" }}>
              <div style={{
                width: "26px", height: "26px", border: "3px solid #EAE5DE", borderTopColor: "#8B2F6E",
                borderRadius: "50%", margin: "0 auto 14px", animation: "spin 0.9s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: "14px", color: "#4A453F" }}>
                {phase === "committing" ? "מייבא את הנתונים..." : processingMsg}
              </div>
            </div>
          )}

          {(phase === "review" || phase === "committing") && parsed && phase !== "committing" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {manualOverlap > 0 && (
                <div style={{ background: "#FDF6E3", border: "1.5px solid #E8CF9C", borderRadius: "12px", padding: "10px 14px", fontSize: "13px", color: "#8B5E0B", lineHeight: 1.6 }}>
                  <b>שימו לב:</b> בסעיפים שמופו כבר רשומות גביות ידניות בסך <b className="num">{fmt(manualOverlap)} ₪</b>.
                  הייבוא <b>יתווסף</b> עליהן ולא יחליף אותן.
                </div>
              )}

              {unmatchedGrades.length > 0 && (
                <div style={{ background: "#FDEBEA", border: "1.5px solid #E5B5B0", borderRadius: "12px", padding: "10px 14px", fontSize: "13px", color: "#A93226", lineHeight: 1.6 }}>
                  <b>לא ניתן לאשר:</b> לשכבות {unmatchedGrades.map((g) => `"${g.grade_label}"`).join(", ")} אין התאמה בכרם.
                  יצירת שכבות (עם מספרי תלמידים) נעשית בוויזארד ההגדרות — לאחר מכן חזרו לכאן.
                </div>
              )}

              {parsed.grades.map((g, gi) => {
                const gid = gradeMatch[g.grade_label];
                return (
                  <div key={gi} style={{ border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "10px 14px", background: "#FAF8F5", borderBottom: "1px solid #EAE5DE" }}>
                      <span style={{ fontSize: "14px", fontWeight: "600", color: "#1A1A1A" }}>{g.grade_label} בדוח</span>
                      <span style={{ color: "#AAA099", fontSize: "13px" }}>←</span>
                      <select value={gid} onChange={(e) => setGradeMatch({ ...gradeMatch, [g.grade_label]: e.target.value })}
                        style={{ ...selectStyle, borderColor: gid ? "#E8E2D9" : "#E5B5B0" }}>
                        <option value="">בחרו שכבה...</option>
                        {grades.map((yg) => (
                          <option key={yg.id} value={yg.id}>{yg.name} ({yg.student_count} תלמידים)</option>
                        ))}
                      </select>
                      <span style={{ marginRight: "auto", fontSize: "12.5px", color: "#6B6560" }} className="num">
                        חובה {fmt(g.total?.charged ?? 0)} · זכות {fmt(g.total?.paid ?? 0)}
                      </span>
                    </div>
                    {!g.totals_valid && (
                      <div style={{ padding: "8px 14px", background: "#FDEBEA", fontSize: "12.5px", color: "#A93226", borderBottom: "1px solid #F2D3CF" }}>
                        <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginLeft: "5px" }} />
                        סכומי השורות בעמוד זה אינם תואמים את שורת הסה"כ בדוח — בדקו את השורות בקפידה.
                      </div>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ color: "#AAA099", fontSize: "11.5px" }}>
                          <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: "500" }}>סעיף בדוח</th>
                          <th style={{ textAlign: "right", padding: "8px 6px", fontWeight: "500" }}>שיוך בכרם</th>
                          <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: "500" }}>חובה</th>
                          <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: "500" }}>זכות</th>
                          <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: "500" }}>יעד לתלמיד</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, ri) => {
                          const key = `${gi}-${ri}`;
                          const norm = normalizeReportName(r.name_raw);
                          const m = mappings[norm];
                          const skipped = rowSkip[key] || m?.mode === "skip";
                          const perDefault = defaultPerStudent(r, g.grade_label);
                          return (
                            <tr key={ri} style={{
                              borderTop: "1px solid #F3EFE9",
                              background: !r.valid ? "#FDEBEA" : skipped ? "#FAFAF8" : "transparent",
                              opacity: skipped && r.valid ? 0.55 : 1,
                            }}>
                              <td style={{ padding: "8px 14px", color: "#1A1A1A", whiteSpace: "nowrap" }}>
                                {r.name_raw}
                                {!r.valid && (
                                  <div style={{ fontSize: "11px", color: "#A93226", marginTop: "2px" }}>
                                    נתונים לא תקינים — לא ייובא
                                  </div>
                                )}
                                {r.charged <= 0 && r.valid && (
                                  <div style={{ fontSize: "11px", color: "#AAA099", marginTop: "2px" }}>רישום גבייה בלבד (ללא יעד)</div>
                                )}
                              </td>
                              <td style={{ padding: "8px 6px" }}>
                                {r.valid ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <select
                                      value={m?.mode === "create" ? "__create" : m?.mode === "skip" ? "__skip" : m?.sectionId ?? "__create"}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setMappings({
                                          ...mappings,
                                          [norm]: v === "__create"
                                            ? { mode: "create", sectionId: "", newName: m?.newName || norm, fromMemory: false }
                                            : v === "__skip"
                                              ? { ...m, mode: "skip", fromMemory: false }
                                              : { mode: "map", sectionId: v, newName: m?.newName || norm, fromMemory: false },
                                        });
                                      }}
                                      style={selectStyle}
                                    >
                                      <option value="__create">➕ צור סעיף חדש</option>
                                      {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      <option value="__skip">דלג — לא לייבא</option>
                                    </select>
                                    {m?.mode === "create" && (
                                      <input value={m.newName}
                                        onChange={(e) => setMappings({ ...mappings, [norm]: { ...m, newName: e.target.value } })}
                                        style={{ ...inputStyle, fontSize: "12.5px" }} placeholder="שם הסעיף החדש" />
                                    )}
                                    {m?.fromMemory && (
                                      <span style={{ fontSize: "10.5px", color: "#7A9E7E" }}>✓ מיפוי זכור מייבוא קודם</span>
                                    )}
                                  </div>
                                ) : <span style={{ color: "#AAA099" }}>—</span>}
                              </td>
                              <td className="num" style={{ padding: "8px 6px", textAlign: "left", color: r.charged < 0 ? "#A93226" : "#1A1A1A", whiteSpace: "nowrap" }}>{fmt(r.charged)}</td>
                              <td className="num" style={{ padding: "8px 6px", textAlign: "left", color: r.paid < 0 ? "#A93226" : "#1A1A1A", whiteSpace: "nowrap" }}>{fmt(r.paid)}</td>
                              <td style={{ padding: "8px 14px", textAlign: "left" }}>
                                {r.valid && !skipped && r.charged > 0 && gid ? (
                                  <input
                                    className="num"
                                    value={perStudentOverride[key] ?? perDefault}
                                    onChange={(e) => setPerStudentOverride({ ...perStudentOverride, [key]: e.target.value })}
                                    style={{ ...inputStyle, width: "84px", textAlign: "left", direction: "ltr" }}
                                  />
                                ) : <span style={{ color: "#AAA099" }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {phase === "done" && doneSummary && (
            <div style={{ textAlign: "center", padding: "22px 10px" }}>
              <div style={{
                width: "44px", height: "44px", borderRadius: "50%", background: "#EAF3EB",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
              }}>
                <Check size={22} color="#3E7C46" />
              </div>
              <div style={{ fontSize: "16px", fontWeight: "500", color: "#1A1A1A", marginBottom: "8px" }}>הייבוא הושלם</div>
              <div style={{ fontSize: "13.5px", color: "#4A453F", lineHeight: 1.8 }}>
                נרשמו <b className="num">{doneSummary.rows}</b> שורות גבייה בסך <b className="num">{fmt(doneSummary.total)} ₪</b>
                {doneSummary.newSections > 0 && <> · נוצרו <b className="num">{doneSummary.newSections}</b> סעיפים חדשים</>}
                <br />היעדים והתכנון התקציבי עודכנו בהתאם.
              </div>
              <button onClick={onClose} style={{
                marginTop: "18px", padding: "10px 28px", border: "none", borderRadius: "10px",
                background: "linear-gradient(135deg, #B04A90, #8B2F6E)", color: "#fff",
                fontSize: "14px", fontWeight: "500", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}>סגירה</button>
            </div>
          )}
        </div>

        {/* Footer — רק במסך האישור */}
        {phase === "review" && parsed && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid #EAE5DE", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ fontSize: "12.5px", color: "#6B6560" }} className="num">
              ייכתבו {plan.rows} שורות גבייה · {fmt(plan.total)} ₪
              {plan.newSections.length > 0 && ` · ${plan.newSections.length} סעיפים חדשים`}
            </span>
            <div style={{ marginRight: "auto", display: "flex", gap: "10px" }}>
              <button onClick={onClose} style={{ padding: "10px 18px", border: "1px solid #E8E2D9", borderRadius: "10px", background: "#fff", color: "#6B6560", fontSize: "14px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                ביטול
              </button>
              <button onClick={() => void commit()} disabled={!canCommit} style={{
                padding: "10px 24px", border: "none", borderRadius: "10px",
                background: canCommit ? "linear-gradient(135deg, #B04A90, #8B2F6E)" : "#C9C0B4",
                color: "#fff", fontSize: "14px", fontWeight: "500",
                cursor: canCommit ? "pointer" : "not-allowed", fontFamily: "var(--font-sans)",
                boxShadow: canCommit ? "0 4px 12px rgba(139,47,110,0.3)" : "none",
              }}>
                אשר וייבא
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
