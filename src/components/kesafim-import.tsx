// ─── ייבוא דוח "סטטוס גביה לשיכבה" (0637) מתוכנת כספים 2000 ──────────────────
// שלב 3: זרימת דוח ראשון. שלב 4: דוח עדכון (דלתא), יומן ייבואים + ביטול,
// מיזוג שורות כפולות, batching של הכתיבה, ובחירת יעד (שלי/לפי הדוח).
// כל כתיבה await מפורש, בלי catch שקט. שגיאה עוצרת ומוצגת.

import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, FileUp, AlertTriangle, Check, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organization";
import { getActiveYearId } from "@/lib/active-year";
import type { Grade, ParentSection } from "@/hooks/use-horim";

// ─── טיפוסי תוצאת הפענוח (מראה של פלט ה-edge function) ───────────────────────

interface ParsedRow { name_raw: string; charged: number; paid: number; balance: number; pct: number | null; valid: boolean }
interface ParsedGrade { grade_label: string; rows: ParsedRow[]; total: ParsedRow | null; totals_valid: boolean }
interface ParsedReport {
  report: { school_name: string | null; school_id: string | null; report_date: string | null; fiscal_year: string | null; report_number: string | null };
  grades: ParsedGrade[];
  validation: { attempts: number; all_valid: boolean };
}

// שורת תצוגה — אחרי מיזוג שורות שמנורמלות לאותו סעיף באותה שכבה
interface ViewRow { names: string[]; norm: string; charged: number; paid: number; valid: boolean }
interface ViewGrade { label: string; rows: ViewRow[]; invalid: ParsedRow[]; total: ParsedRow | null; totals_valid: boolean }

// ─── נרמול שמות ───────────────────────────────────────────────────────────────

/**
 * שם סעיף מהדוח → שם מנורמל.
 * מסיר: קידומת "הכנסות הורים", קידומת "**", קידומת "הכ" (כמילה שלמה בלבד —
 * "הכנסות" לא נפגעת), אות שכבה סופית בודדת, ורווחים.
 */
export function normalizeReportName(raw: string): string {
  // אחידות גרשיים: המודל מפיק לפעמים " ולפעמים ״ (גרשיים עבריים) לאותו שם
  // (נצפה בפועל: תל"ן מול תל״ן) — מנרמלים לגרשיים עבריים כדי שהזיכרון יתפוס.
  let s = raw.trim().replace(/["”“]/g, "״").replace(/['’‘`´]/g, "׳");
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of ["הכנסות הורים ", "** ", "**"]) {
      if (s.startsWith(prefix)) { s = s.slice(prefix.length).trim(); changed = true; }
    }
    if (s.startsWith("הכ ")) { s = s.slice(3).trim(); changed = true; }
  }
  const m = s.match(/^(.*\S)\s+[אבגדהוזחטי]$/); // אות שכבה בודדת בסוף
  if (m) s = m[1].trim();
  return s;
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

type Phase = "pick" | "processing" | "review" | "committing" | "done" | "log";
type ImportMode = "first" | "update";

interface GsaRow { id: string; grade_id: string; parent_section_id: string; amount_per_student: number }
interface LogRow {
  id: string; report_date: string | null; created_at: string | null; committed_at: string | null;
  status: string; created_by: string | null; approver: string; total: number; rows: number;
}

// ─── סגנונות משותפים ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid #E8E2D9", borderRadius: "8px",
  fontSize: "13px", fontFamily: "var(--font-sans)", background: "#fff", color: "#1A1A1A",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "3px 9px", borderRadius: "99px", fontSize: "11px", cursor: "pointer",
  border: active ? "1.5px solid #8B2F6E" : "1px solid #E8E2D9",
  background: active ? "#F7EDF4" : "#fff", color: active ? "#8B2F6E" : "#888079",
  fontFamily: "var(--font-sans)", whiteSpace: "nowrap",
});

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
  const [mode, setMode] = useState<ImportMode>("first");
  const [processingMsg, setProcessingMsg] = useState("");
  const [parsed, setParsed] = useState<ParsedReport | null>(null);
  const [viewGrades, setViewGrades] = useState<ViewGrade[]>([]);
  const [importId, setImportId] = useState<string | null>(null);
  const [memoryMap, setMemoryMap] = useState<Record<string, string>>({});
  const [manualBySection, setManualBySection] = useState<Record<string, number>>({});
  const [cellSums, setCellSums] = useState<Record<string, number>>({}); // `${gradeId}:${sectionId}` → סך גביות בתא
  const [existingGsa, setExistingGsa] = useState<GsaRow[]>([]);
  const [gradeMatch, setGradeMatch] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [perStudentOverride, setPerStudentOverride] = useState<Record<string, string>>({});
  const [rowSkip, setRowSkip] = useState<Record<string, boolean>>({});
  const [targetChoice, setTargetChoice] = useState<Record<string, "keep" | "update">>({});
  const [doneSummary, setDoneSummary] = useState<{ rows: number; total: number; newSections: number; seconds: number } | null>(null);
  const [logRows, setLogRows] = useState<LogRow[] | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── טעינת הקשר: מצב (ראשון/עדכון), זיכרון מיפויים, סכומי תאים, יעדים ──────
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const yearId = await getActiveYearId();
      if (!yearId) return;
      const [memR, colR, gsaR] = await Promise.all([
        supabase.from("kesafim_section_map")
          .select("report_name_normalized, parent_section_id").eq("organization_id", orgId),
        supabase.from("parent_collections")
          .select("grade_id, parent_section_id, amount, import_id").eq("school_year_id", yearId),
        supabase.from("grade_section_amounts")
          .select("id, grade_id, parent_section_id, amount_per_student").eq("school_year_id", yearId),
      ]);
      if (memR.error || colR.error || gsaR.error) { toast.error("שגיאה בטעינת נתוני הייבוא"); return; }
      setMemoryMap(Object.fromEntries((memR.data ?? []).map((r) => [r.report_name_normalized, r.parent_section_id])));
      setExistingGsa((gsaR.data ?? []) as GsaRow[]);
      const hasImported = (colR.data ?? []).some((c) => c.import_id !== null);
      setMode(hasImported ? "update" : "first");
      const cells: Record<string, number> = {};
      const manual: Record<string, number> = {};
      (colR.data ?? []).forEach((c) => {
        if (!c.parent_section_id) return; // "לא משויך" — אין לו ייצוג בדוח, לא נוגעים
        cells[`${c.grade_id}:${c.parent_section_id}`] = (cells[`${c.grade_id}:${c.parent_section_id}`] ?? 0) + Number(c.amount);
        if (c.import_id === null) manual[c.parent_section_id] = (manual[c.parent_section_id] ?? 0) + Number(c.amount);
      });
      setCellSums(cells);
      setManualBySection(manual);
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
    // התאמת שכבות לפי אות
    const gm: Record<string, string> = {};
    result.grades.forEach((g) => {
      const letter = reportGradeLetter(g.grade_label);
      const match = grades.find((yg) => yearGradeLetter(yg.name) === letter);
      gm[g.grade_label] = match?.id ?? "";
    });
    setGradeMatch(gm);

    // מיזוג שורות תקינות שמנורמלות לאותו סעיף בתוך שכבה (ממצא 2 משלב 3)
    const vgs: ViewGrade[] = result.grades.map((g) => {
      const byNorm = new Map<string, ViewRow>();
      const invalid: ParsedRow[] = [];
      g.rows.forEach((r) => {
        if (!r.valid) { invalid.push(r); return; }
        const norm = normalizeReportName(r.name_raw);
        const ex = byNorm.get(norm);
        if (ex) { ex.names.push(r.name_raw); ex.charged += r.charged; ex.paid += r.paid; }
        else byNorm.set(norm, { names: [r.name_raw], norm, charged: r.charged, paid: r.paid, valid: true });
      });
      return { label: g.grade_label, rows: [...byNorm.values()], invalid, total: g.total, totals_valid: g.totals_valid };
    });
    setViewGrades(vgs);

    // מיפוי סעיפים: זיכרון → התאמת שם → יצירה
    const maps: Record<string, Mapping> = {};
    const choices: Record<string, "keep" | "update"> = {};
    vgs.forEach((g) => g.rows.forEach((r) => {
      if (maps[r.norm]) return;
      const remembered = memoryMap[r.norm];
      if (remembered && sections.some((s) => s.id === remembered)) {
        maps[r.norm] = { mode: "map", sectionId: remembered, newName: r.norm, fromMemory: true };
        // סעיף מנוהל-ייבוא (יש לו זיכרון) — ברירת מחדל: עדכן יעד לפי הדוח
        choices[r.norm] = "update";
      } else {
        const byName = sections.find((s) => s.name.trim() === r.norm);
        if (byName) {
          maps[r.norm] = { mode: "map", sectionId: byName.id, newName: r.norm, fromMemory: false };
          // סעיף שנוצר ידנית — ברירת מחדל: השאר את היעד שלי
          choices[r.norm] = "keep";
        } else {
          maps[r.norm] = { mode: "create", sectionId: "", newName: r.norm, fromMemory: false };
          choices[r.norm] = "update";
        }
      }
    }));
    setMappings(maps);
    setTargetChoice(choices);
    setRowSkip({});
    setPerStudentOverride({});
  }

  // ─── נגזרות ─────────────────────────────────────────────────────────────────
  const studentCount = useMemo(() => Object.fromEntries(grades.map((g) => [g.id, g.student_count])), [grades]);

  function defaultPerStudent(row: ViewRow, gradeLabel: string): string {
    const gid = gradeMatch[gradeLabel];
    const count = gid ? studentCount[gid] : 0;
    if (row.charged <= 0 || !count) return "";
    return (row.charged / count).toFixed(2);
  }

  /** ה-gsa הקיים לתא, אם השורה ממופה לסעיף קיים. */
  function existingGsaFor(row: ViewRow, gradeLabel: string): GsaRow | undefined {
    const m = mappings[row.norm];
    const gid = gradeMatch[gradeLabel];
    if (!m || m.mode !== "map" || !gid) return undefined;
    return existingGsa.find((g) => g.grade_id === gid && g.parent_section_id === m.sectionId);
  }

  /** האם יש קונפליקט יעד (קיים ≠ לפי הדוח) לתא. */
  function targetConflict(row: ViewRow, gradeLabel: string): { existing: number; fromReport: number } | null {
    if (row.charged <= 0) return null;
    const ex = existingGsaFor(row, gradeLabel);
    if (!ex) return null;
    const fromReport = Number(defaultPerStudent(row, gradeLabel));
    if (!isFinite(fromReport)) return null;
    return Math.abs(Number(ex.amount_per_student) - fromReport) > 0.005
      ? { existing: Number(ex.amount_per_student), fromReport } : null;
  }

  const rowKey = (gi: number, ri: number) => `${gi}-${ri}`;
  const rowIsWritten = (gi: number, ri: number, g: ViewGrade, r: ViewRow) =>
    !rowSkip[rowKey(gi, ri)] && !!gradeMatch[g.label] && mappings[r.norm]?.mode !== "skip";

  /** דלתא במצב עדכון לתא (סעיף ממופה בלבד; סעיף חדש — הקיים 0). */
  function cellDelta(row: ViewRow, gradeLabel: string): { existing: number; target: number; delta: number } {
    const m = mappings[row.norm];
    const gid = gradeMatch[gradeLabel];
    const existing = (m?.mode === "map" && gid) ? (cellSums[`${gid}:${m.sectionId}`] ?? 0) : 0;
    const delta = row.paid - existing;
    return { existing, target: row.paid, delta: Math.abs(delta) < 0.005 ? 0 : delta };
  }

  const plan = useMemo(() => {
    const newSections = new Set<string>();
    const mappedIds = new Set<string>();
    let rows = 0, total = 0, unchanged = 0;
    viewGrades.forEach((g, gi) => g.rows.forEach((r, ri) => {
      if (!rowIsWritten(gi, ri, g, r)) return;
      const m = mappings[r.norm];
      if (m?.mode === "create") newSections.add(m.newName.trim());
      if (m?.mode === "map" && m.sectionId) mappedIds.add(m.sectionId);
      if (mode === "update") {
        const { delta } = cellDelta(r, g.label);
        if (delta === 0) { unchanged++; return; }
        rows++; total += delta;
      } else {
        rows++; total += r.paid;
      }
    }));
    return { rows, total, unchanged, newSections: [...newSections], mappedSectionIds: [...mappedIds] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewGrades, mappings, rowSkip, gradeMatch, mode, cellSums]);

  const manualOverlap = mode === "first"
    ? plan.mappedSectionIds.reduce((s, id) => s + (manualBySection[id] ?? 0), 0) : 0;
  const unmatchedGrades = viewGrades.filter((g) => !gradeMatch[g.label]);
  const canCommit = parsed !== null && unmatchedGrades.length === 0 && phase === "review" &&
    (mode === "update" ? true : plan.rows > 0);

  // ─── כתיבה באישור — batched, הכל await מפורש ───────────────────────────────
  async function commit() {
    if (!parsed || !importId || !orgId) return;
    setPhase("committing");
    const t0 = performance.now();
    try {
      const yearId = await getActiveYearId();
      if (!yearId) throw new Error("אין שנת לימודים פעילה");
      const { data: { user } } = await supabase.auth.getUser();

      // שורות לכתיבה
      const written: { gradeId: string; gradeLabel: string; row: ViewRow; per: number | null }[] = [];
      viewGrades.forEach((g, gi) => g.rows.forEach((r, ri) => {
        if (!rowIsWritten(gi, ri, g, r)) return;
        const perStr = perStudentOverride[rowKey(gi, ri)] ?? defaultPerStudent(r, g.label);
        const per = r.charged > 0 ? Number(perStr) : null;
        if (r.charged > 0 && (!isFinite(per!) || per! < 0)) throw new Error(`יעד לתלמיד לא תקין בסעיף "${r.norm}"`);
        written.push({ gradeId: gradeMatch[g.label], gradeLabel: g.label, row: r, per });
      }));

      // 1. סעיפים חדשים — insert אחד
      const usedNorms = [...new Set(written.map((w) => w.row.norm))];
      const sectionIdByNorm: Record<string, string> = {};
      const createNorms: string[] = [];
      const nameToNorms = new Map<string, string[]>();
      for (const norm of usedNorms) {
        const m = mappings[norm];
        if (m.mode === "map") { sectionIdByNorm[norm] = m.sectionId; continue; }
        const name = m.newName.trim();
        if (!name) throw new Error(`שם סעיף ריק (מקור: "${norm}")`);
        const existing = sections.find((s) => s.name.trim() === name);
        if (existing) { sectionIdByNorm[norm] = existing.id; continue; }
        if (!nameToNorms.has(name)) { nameToNorms.set(name, []); createNorms.push(norm); }
        nameToNorms.get(name)!.push(norm);
      }
      if (nameToNorms.size > 0) {
        const { data: maxOrd, error: ordErr } = await supabase.from("parent_sections")
          .select("order_index").eq("school_year_id", yearId)
          .order("order_index", { ascending: false }).limit(1).maybeSingle();
        if (ordErr) throw new Error(`קריאת סעיפים נכשלה: ${ordErr.message}`);
        let nextOrder = (maxOrd?.order_index ?? -1) + 1;
        const names = [...nameToNorms.keys()];
        const { data: created, error } = await supabase.from("parent_sections")
          .insert(names.map((name) => ({ school_year_id: yearId, name, order_index: nextOrder++, is_active: true })))
          .select("id, name");
        if (error) throw new Error(`יצירת סעיפים נכשלה: ${error.message}`);
        (created ?? []).forEach((c) => nameToNorms.get(c.name.trim())?.forEach((n) => { sectionIdByNorm[n] = c.id; }));
      }
      const sectionName = (id: string) =>
        sections.find((s) => s.id === id)?.name ?? mappings[usedNorms.find((n) => sectionIdByNorm[n] === id) ?? ""]?.newName ?? "";

      // 2. זיכרון מיפויים — upsert אחד
      const { error: mapErr } = await supabase.from("kesafim_section_map").upsert(
        usedNorms.map((norm) => ({ organization_id: orgId, report_name_normalized: norm, parent_section_id: sectionIdByNorm[norm] })),
        { onConflict: "organization_id,report_name_normalized" },
      );
      if (mapErr) throw new Error(`שמירת מיפויים נכשלה: ${mapErr.message}`);

      // 3. יעדים — upsert אחד על UNIQUE(grade_id, parent_section_id).
      //    בחירת "השאר את היעד שלי" מדלגת; ערך זהה לקיים מדולג.
      const gsaRows: { school_year_id: string; grade_id: string; parent_section_id: string; amount_per_student: number }[] = [];
      for (const w of written) {
        if (w.per === null) continue;
        const secId = sectionIdByNorm[w.row.norm];
        const ex = existingGsa.find((g) => g.grade_id === w.gradeId && g.parent_section_id === secId);
        if (ex) {
          if (targetChoice[w.row.norm] === "keep") continue;
          if (Math.abs(Number(ex.amount_per_student) - w.per) <= 0.005) continue;
        }
        gsaRows.push({ school_year_id: yearId, grade_id: w.gradeId, parent_section_id: secId, amount_per_student: w.per });
      }
      if (gsaRows.length > 0) {
        const { error } = await supabase.from("grade_section_amounts")
          .upsert(gsaRows, { onConflict: "grade_id,parent_section_id" });
        if (error) throw new Error(`כתיבת יעדים נכשלה: ${error.message}`);
      }

      // 4. סנכרון תכנון תקציב — batched: 3 קריאות + upsert אחד
      //    (אותה סמנטיקה כמו syncHorimBudgetCategory, בלי לגעת בקוד הקיים)
      const involvedSecIds = [...new Set(usedNorms.map((n) => sectionIdByNorm[n]))];
      if (involvedSecIds.length > 0) {
        const [allGsaR, catR] = await Promise.all([
          supabase.from("grade_section_amounts")
            .select("grade_id, parent_section_id, amount_per_student").eq("school_year_id", yearId),
          supabase.from("budget_categories")
            .select("name, order_index").eq("school_year_id", yearId).eq("source", "horim"),
        ]);
        if (allGsaR.error) throw new Error(`קריאת יעדים לסנכרון נכשלה: ${allGsaR.error.message}`);
        if (catR.error) throw new Error(`קריאת קטגוריות נכשלה: ${catR.error.message}`);
        const gradeStudents: Record<string, number> = Object.fromEntries(grades.map((g) => [g.id, Number(g.student_count)]));
        let nextCatOrder = Math.max(0, ...(catR.data ?? []).map((c) => c.order_index)) + 1;
        const catRows = involvedSecIds.map((secId) => {
          const planned = (allGsaR.data ?? [])
            .filter((g) => g.parent_section_id === secId)
            .reduce((s, g) => s + Number(g.amount_per_student) * (gradeStudents[g.grade_id] ?? 0), 0);
          return {
            school_year_id: yearId, name: sectionName(secId), source: "horim",
            planned_amount: planned, order_index: nextCatOrder++,
          };
        });
        const { error } = await supabase.from("budget_categories")
          .upsert(catRows, { onConflict: "school_year_id,source,name", ignoreDuplicates: false });
        if (error) throw new Error(`סנכרון התקציב נכשל: ${error.message}`);
      }

      // 5. רישום הגבייה — insert אחד
      const dateHe = formatDateHe(parsed.report.report_date);
      const notes = mode === "update"
        ? `עדכון מדוח כספים 2000 מ-${dateHe}`
        : `ייבוא מדוח כספים 2000 (${parsed.report.report_number ?? "0637"}) מ-${dateHe}`;
      const collectionRows: { school_year_id: string; grade_id: string; parent_section_id: string; amount: number; collection_date: string; notes: string; import_id: string; created_by?: string }[] = [];
      for (const w of written) {
        const secId = sectionIdByNorm[w.row.norm];
        const amount = mode === "update" ? cellDelta(w.row, w.gradeLabel).delta : w.row.paid;
        if (mode === "update" && amount === 0) continue;
        collectionRows.push({
          school_year_id: yearId, grade_id: w.gradeId, parent_section_id: secId,
          amount, collection_date: parsed.report.report_date ?? new Date().toISOString().slice(0, 10),
          notes, import_id: importId, created_by: user?.id,
        });
      }
      if (collectionRows.length > 0) {
        const { error } = await supabase.from("parent_collections").insert(collectionRows);
        if (error) throw new Error(`רישום הגבייה נכשל: ${error.message}`);
      }

      // 6. סגירת הייבוא
      const { error: cmtErr } = await supabase.from("kesafim_imports")
        .update({ status: "committed", committed_at: new Date().toISOString() }).eq("id", importId);
      if (cmtErr) throw new Error(`סימון הייבוא כהושלם נכשל: ${cmtErr.message}`);

      ["parent-collections", "grade-section-amounts", "budget-categories", "budget-plan",
        "dashboard", "source-breakdown", "parent-sections", "parent-sections-all",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

      setDoneSummary({
        rows: collectionRows.length,
        total: collectionRows.reduce((s, r) => s + r.amount, 0),
        newSections: plan.newSections.length,
        seconds: Math.round((performance.now() - t0) / 100) / 10,
      });
      setPhase("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setPhase("review");
    }
  }

  // ─── יומן ייבואים + ביטול ──────────────────────────────────────────────────
  async function loadLog() {
    setPhase("log");
    setLogRows(null);
    const yearId = await getActiveYearId();
    if (!yearId) return;
    const [impR, colR] = await Promise.all([
      supabase.from("kesafim_imports")
        .select("id, report_date, created_at, committed_at, status, created_by")
        .eq("school_year_id", yearId).order("created_at", { ascending: false }),
      supabase.from("parent_collections")
        .select("import_id, amount").eq("school_year_id", yearId).not("import_id", "is", null),
    ]);
    if (impR.error || colR.error) { toast.error("שגיאה בטעינת היומן"); return; }
    const byImport: Record<string, { total: number; rows: number }> = {};
    (colR.data ?? []).forEach((c) => {
      const k = c.import_id as string;
      byImport[k] = { total: (byImport[k]?.total ?? 0) + Number(c.amount), rows: (byImport[k]?.rows ?? 0) + 1 };
    });
    const userIds = [...new Set((impR.data ?? []).map((i) => i.created_by).filter(Boolean))] as string[];
    let names: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs, error } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      if (error) { toast.error("שגיאה בטעינת שמות"); return; }
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setLogRows((impR.data ?? []).map((i) => ({
      id: i.id, report_date: i.report_date, created_at: i.created_at, committed_at: i.committed_at,
      status: i.status, created_by: i.created_by, approver: i.created_by ? (names[i.created_by] ?? "—") : "—",
      total: byImport[i.id]?.total ?? 0, rows: byImport[i.id]?.rows ?? 0,
    })));
  }

  async function cancelImport(id: string) {
    setCancelling(true);
    try {
      const { error: delErr } = await supabase.from("parent_collections").delete().eq("import_id", id);
      if (delErr) throw new Error(`מחיקת שורות הייבוא נכשלה: ${delErr.message}`);
      const { error: updErr } = await supabase.from("kesafim_imports").update({ status: "cancelled" }).eq("id", id);
      if (updErr) throw new Error(`סימון הביטול נכשל: ${updErr.message}`);
      ["parent-collections", "dashboard", "source-breakdown", "budget-plan"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("הייבוא בוטל ושורותיו הוסרו");
      setCancelConfirm(null);
      await loadLog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelling(false);
    }
  }

  // ─── רנדור ──────────────────────────────────────────────────────────────────
  const wide = phase === "review" || phase === "log";
  const statusLabel: Record<string, { text: string; color: string; bg: string }> = {
    committed: { text: "הושלם", color: "#3E7C46", bg: "#EAF3EB" },
    pending: { text: "לא הושלם", color: "#8B5E0B", bg: "#FDF6E3" },
    cancelled: { text: "בוטל", color: "#888079", bg: "#F3F0EB" },
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && phase !== "committing" && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "18px", width: "100%", maxWidth: wide ? "860px" : "440px",
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden", direction: "rtl",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: "10px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {phase === "log" ? "יומן ייבואים" : "ייבוא מכספים 2000"}
              {phase === "review" && mode === "update" && (
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#fff", background: "#B8860B", borderRadius: "99px", padding: "3px 10px", letterSpacing: "0.04em" }}>
                  דוח עדכון
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>
              {phase === "review" && parsed
                ? `${parsed.report.school_name ?? ""} · דוח ${parsed.report.report_number ?? ""} · ${formatDateHe(parsed.report.report_date)}`
                : "דוח סטטוס גביה לשיכבה (0637)"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {phase === "pick" && (
              <button onClick={() => void loadLog()} style={{
                display: "flex", alignItems: "center", gap: "5px", background: "none",
                border: "1px solid #E8E2D9", borderRadius: "8px", padding: "6px 10px",
                cursor: "pointer", color: "#6B6560", fontSize: "12px", fontFamily: "var(--font-sans)",
              }}>
                <History size={13} />
                יומן ייבואים
              </button>
            )}
            {phase !== "committing" && (
              <button onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#AAA099", display: "flex" }}>
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "20px 24px" }}>

          {phase === "pick" && (
            <div>
              <div style={{ fontSize: "13.5px", color: "#4A453F", lineHeight: 1.7, marginBottom: "16px" }}>
                העלו את דוח <b>"סטטוס גביה לשיכבה" (0637)</b> מתוכנת כספים 2000 — והמערכת
                {mode === "update"
                  ? " תשווה מול הנתונים הקיימים ותציג בדיוק מה ישתנה, עם מסך אישור לפני כל כתיבה."
                  : " תקים את סעיפי הגבייה, היעדים והגבייה שנרשמה, עם מסך אישור לפני כל כתיבה."}
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
                <span style={{ fontSize: "12px", color: "#AAA099" }}>
                  {mode === "update" ? "דוח קודם כבר יובא — ההעלאה תפעל כדוח עדכון" : "הדוח כפי שיוצא מכספים 2000, ללא עריכה"}
                </span>
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

          {phase === "review" && parsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {manualOverlap > 0 && (
                <div style={{ background: "#FDF6E3", border: "1.5px solid #E8CF9C", borderRadius: "12px", padding: "10px 14px", fontSize: "13px", color: "#8B5E0B", lineHeight: 1.6 }}>
                  <b>שימו לב:</b> בסעיפים שמופו כבר רשומות גביות ידניות בסך <b className="num">{fmt(manualOverlap)} ₪</b>.
                  הייבוא <b>יתווסף</b> עליהן ולא יחליף אותן.
                </div>
              )}

              {unmatchedGrades.length > 0 && (
                <div style={{ background: "#FDEBEA", border: "1.5px solid #E5B5B0", borderRadius: "12px", padding: "10px 14px", fontSize: "13px", color: "#A93226", lineHeight: 1.6 }}>
                  <b>לא ניתן לאשר:</b> לשכבות {unmatchedGrades.map((g) => `"${g.label}"`).join(", ")} אין התאמה בכרם.
                  יצירת שכבות (עם מספרי תלמידים) נעשית בוויזארד ההגדרות — לאחר מכן חזרו לכאן.
                </div>
              )}

              {viewGrades.map((g, gi) => {
                const gid = gradeMatch[g.label];
                const zeroCells = mode === "update"
                  ? g.rows.filter((r, ri) => rowIsWritten(gi, ri, g, r) && cellDelta(r, g.label).delta === 0).length
                  : 0;
                const visibleRows = g.rows
                  .map((r, ri) => ({ r, ri }))
                  .filter(({ r, ri }) => mode === "first" || !rowIsWritten(gi, ri, g, r) || cellDelta(r, g.label).delta !== 0);
                return (
                  <div key={gi} style={{ border: "1px solid #EAE5DE", borderRadius: "14px", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "10px 14px", background: "#FAF8F5", borderBottom: "1px solid #EAE5DE" }}>
                      <span style={{ fontSize: "14px", fontWeight: "600", color: "#1A1A1A" }}>{g.label} בדוח</span>
                      <span style={{ color: "#AAA099", fontSize: "13px" }}>←</span>
                      <select value={gid} onChange={(e) => setGradeMatch({ ...gradeMatch, [g.label]: e.target.value })}
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
                          {mode === "update" ? (
                            <>
                              <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: "500" }}>קיים בכרם</th>
                              <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: "500" }}>בדוח</th>
                              <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: "500" }}>דלתא — מה ייכתב</th>
                            </>
                          ) : (
                            <>
                              <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: "500" }}>חובה</th>
                              <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: "500" }}>זכות</th>
                              <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: "500" }}>יעד לתלמיד</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map(({ r, ri }) => {
                          const key = rowKey(gi, ri);
                          const m = mappings[r.norm];
                          const skipped = rowSkip[key] || m?.mode === "skip";
                          const perDefault = defaultPerStudent(r, g.label);
                          const conflict = !skipped && mode === "first" ? targetConflict(r, g.label) : null;
                          const dc = mode === "update" ? cellDelta(r, g.label) : null;
                          return (
                            <tr key={ri} style={{
                              borderTop: "1px solid #F3EFE9",
                              background: skipped ? "#FAFAF8" : "transparent",
                              opacity: skipped ? 0.55 : 1,
                            }}>
                              <td style={{ padding: "8px 14px", color: "#1A1A1A" }}>
                                {r.norm}
                                {r.names.length > 1 && (
                                  <div style={{ fontSize: "10.5px", color: "#7A6FA0", marginTop: "2px" }}>
                                    ⇄ מוזג מ-{r.names.length} שורות: {r.names.join(" · ")}
                                  </div>
                                )}
                                {r.charged <= 0 && (
                                  <div style={{ fontSize: "11px", color: "#AAA099", marginTop: "2px" }}>רישום גבייה בלבד (ללא יעד)</div>
                                )}
                              </td>
                              <td style={{ padding: "8px 6px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <select
                                    value={m?.mode === "create" ? "__create" : m?.mode === "skip" ? "__skip" : m?.sectionId ?? "__create"}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setMappings({
                                        ...mappings,
                                        [r.norm]: v === "__create"
                                          ? { mode: "create", sectionId: "", newName: m?.newName || r.norm, fromMemory: false }
                                          : v === "__skip"
                                            ? { ...m, mode: "skip", fromMemory: false }
                                            : { mode: "map", sectionId: v, newName: m?.newName || r.norm, fromMemory: false },
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
                                      onChange={(e) => setMappings({ ...mappings, [r.norm]: { ...m, newName: e.target.value } })}
                                      style={{ ...inputStyle, fontSize: "12.5px" }} placeholder="שם הסעיף החדש" />
                                  )}
                                  {m?.fromMemory && (
                                    <span style={{ fontSize: "10.5px", color: "#7A9E7E" }}>✓ מיפוי זכור מייבוא קודם</span>
                                  )}
                                </div>
                              </td>
                              {mode === "update" && dc ? (
                                <>
                                  <td className="num" style={{ padding: "8px 6px", textAlign: "left", whiteSpace: "nowrap", color: "#1A1A1A" }}>{fmt(dc.existing)}</td>
                                  <td className="num" style={{ padding: "8px 6px", textAlign: "left", whiteSpace: "nowrap", color: "#1A1A1A" }}>{fmt(dc.target)}</td>
                                  <td style={{ padding: "8px 14px", textAlign: "left", whiteSpace: "nowrap" }}>
                                    {skipped ? <span style={{ color: "#AAA099" }}>—</span> : (
                                      <span className="num" style={{ fontWeight: "600", color: dc.delta < 0 ? "#A93226" : "#3E7C46" }}>
                                        {dc.delta > 0 ? "+" : ""}{fmt(dc.delta)} ₪
                                      </span>
                                    )}
                                  </td>
                                </>
                              ) : mode === "update" ? null : (
                                <>
                                  <td className="num" style={{ padding: "8px 6px", textAlign: "left", color: r.charged < 0 ? "#A93226" : "#1A1A1A", whiteSpace: "nowrap" }}>{fmt(r.charged)}</td>
                                  <td className="num" style={{ padding: "8px 6px", textAlign: "left", color: r.paid < 0 ? "#A93226" : "#1A1A1A", whiteSpace: "nowrap" }}>{fmt(r.paid)}</td>
                                  <td style={{ padding: "8px 14px", textAlign: "left" }}>
                                    {!skipped && r.charged > 0 && gid ? (
                                      conflict ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                                          <div style={{ display: "flex", gap: "5px" }}>
                                            <button type="button" onClick={() => setTargetChoice({ ...targetChoice, [r.norm]: "keep" })}
                                              style={chipStyle(targetChoice[r.norm] === "keep")} className="num">
                                              השאר שלי ({fmt(conflict.existing)})
                                            </button>
                                            <button type="button" onClick={() => setTargetChoice({ ...targetChoice, [r.norm]: "update" })}
                                              style={chipStyle(targetChoice[r.norm] === "update")} className="num">
                                              לפי הדוח ({fmt(conflict.fromReport)})
                                            </button>
                                          </div>
                                          <span style={{ fontSize: "10px", color: "#AAA099" }}>הבחירה חלה על כל שכבות הסעיף</span>
                                        </div>
                                      ) : (
                                        <input
                                          className="num"
                                          value={perStudentOverride[key] ?? perDefault}
                                          onChange={(e) => setPerStudentOverride({ ...perStudentOverride, [key]: e.target.value })}
                                          style={{ ...inputStyle, width: "84px", textAlign: "left", direction: "ltr" }}
                                        />
                                      )
                                    ) : <span style={{ color: "#AAA099" }}>—</span>}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                        {g.invalid.map((r, ii) => (
                          <tr key={`inv-${ii}`} style={{ borderTop: "1px solid #F3EFE9", background: "#FDEBEA" }}>
                            <td style={{ padding: "8px 14px", color: "#1A1A1A" }} colSpan={2}>
                              {r.name_raw}
                              <div style={{ fontSize: "11px", color: "#A93226", marginTop: "2px" }}>נתונים לא תקינים — לא ייובא</div>
                            </td>
                            <td className="num" style={{ padding: "8px 6px", textAlign: "left" }}>{fmt(r.charged)}</td>
                            <td className="num" style={{ padding: "8px 6px", textAlign: "left" }}>{fmt(r.paid)}</td>
                            <td style={{ padding: "8px 14px", textAlign: "left", color: "#AAA099" }}>—</td>
                          </tr>
                        ))}
                        {mode === "update" && zeroCells > 0 && (
                          <tr style={{ borderTop: "1px solid #F3EFE9", background: "#FAFAF8" }}>
                            <td colSpan={5} style={{ padding: "8px 14px", fontSize: "12px", color: "#888079" }}>
                              ✓ {zeroCells} תאים ללא שינוי — לא ייכתב דבר
                            </td>
                          </tr>
                        )}
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
              <div style={{ fontSize: "16px", fontWeight: "500", color: "#1A1A1A", marginBottom: "8px" }}>
                {mode === "update" ? "העדכון הושלם" : "הייבוא הושלם"}
              </div>
              <div style={{ fontSize: "13.5px", color: "#4A453F", lineHeight: 1.8 }}>
                {doneSummary.rows === 0 ? (
                  <>הדוח תואם את הנתונים הקיימים — לא נדרש שינוי.</>
                ) : (
                  <>נרשמו <b className="num">{doneSummary.rows}</b> שורות בסך <b className="num">{fmt(doneSummary.total)} ₪</b>
                    {doneSummary.newSections > 0 && <> · נוצרו <b className="num">{doneSummary.newSections}</b> סעיפים חדשים</>}
                    <br />היעדים והתכנון התקציבי עודכנו בהתאם.</>
                )}
                <div style={{ fontSize: "11px", color: "#AAA099", marginTop: "6px" }} className="num">({doneSummary.seconds} שניות)</div>
              </div>
              <button onClick={onClose} style={{
                marginTop: "18px", padding: "10px 28px", border: "none", borderRadius: "10px",
                background: "linear-gradient(135deg, #B04A90, #8B2F6E)", color: "#fff",
                fontSize: "14px", fontWeight: "500", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}>סגירה</button>
            </div>
          )}

          {phase === "log" && (
            <div>
              {logRows === null ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#AAA099", fontSize: "13px" }}>טוען...</div>
              ) : logRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#888079", fontSize: "13.5px" }}>
                  עדיין לא בוצעו ייבואים לשנה זו.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ color: "#AAA099", fontSize: "11.5px" }}>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: "500" }}>תאריך הדוח</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: "500" }}>הועלה</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: "500" }}>סטטוס</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: "500" }}>נכתב</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: "500" }}>אושר ע"י</th>
                      <th style={{ padding: "8px 10px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map((l) => {
                      const st = statusLabel[l.status] ?? statusLabel.pending;
                      return (
                        <tr key={l.id} style={{ borderTop: "1px solid #F3EFE9" }}>
                          <td className="num" style={{ padding: "9px 10px", color: "#1A1A1A" }}>{formatDateHe(l.report_date)}</td>
                          <td className="num" style={{ padding: "9px 10px", color: "#6B6560" }}>{formatDateHe(l.created_at?.slice(0, 10) ?? null)}</td>
                          <td style={{ padding: "9px 10px" }}>
                            <span style={{ fontSize: "11px", fontWeight: "600", color: st.color, background: st.bg, borderRadius: "99px", padding: "3px 10px" }}>
                              {st.text}
                            </span>
                          </td>
                          <td className="num" style={{ padding: "9px 10px", textAlign: "left", whiteSpace: "nowrap", color: "#1A1A1A" }}>
                            {l.rows > 0 ? `${fmt(l.total)} ₪ (${l.rows})` : "—"}
                          </td>
                          <td style={{ padding: "9px 10px", color: "#6B6560" }}>{l.approver}</td>
                          <td style={{ padding: "9px 10px", textAlign: "left" }}>
                            {l.status !== "cancelled" && (
                              cancelConfirm === l.id ? (
                                <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                                  <span style={{ fontSize: "11.5px", color: "#A93226" }}>למחוק {l.rows} שורות?</span>
                                  <button onClick={() => void cancelImport(l.id)} disabled={cancelling} style={{
                                    padding: "4px 10px", border: "none", borderRadius: "7px", background: "#C0392B",
                                    color: "#fff", fontSize: "11.5px", cursor: "pointer", fontFamily: "var(--font-sans)",
                                  }}>{cancelling ? "מבטל..." : "כן, בטל"}</button>
                                  <button onClick={() => setCancelConfirm(null)} style={{
                                    padding: "4px 8px", border: "1px solid #E8E2D9", borderRadius: "7px", background: "#fff",
                                    color: "#6B6560", fontSize: "11.5px", cursor: "pointer", fontFamily: "var(--font-sans)",
                                  }}>לא</button>
                                </span>
                              ) : (
                                <button onClick={() => setCancelConfirm(l.id)} style={{
                                  padding: "4px 12px", border: "1px solid #E5B5B0", borderRadius: "7px", background: "#fff",
                                  color: "#C0392B", fontSize: "11.5px", cursor: "pointer", fontFamily: "var(--font-sans)",
                                }}>בטל ייבוא</button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <button onClick={() => setPhase("pick")} style={{
                marginTop: "16px", padding: "9px 16px", border: "1px solid #E8E2D9", borderRadius: "9px",
                background: "#fff", color: "#6B6560", fontSize: "13px", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}>→ חזרה לייבוא</button>
            </div>
          )}
        </div>

        {/* Footer — רק במסך האישור */}
        {phase === "review" && parsed && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid #EAE5DE", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ fontSize: "12.5px", color: "#6B6560" }} className="num">
              {mode === "update"
                ? <>ייכתבו {plan.rows} שורות עדכון · {plan.total > 0 ? "+" : ""}{fmt(plan.total)} ₪ · {plan.unchanged} תאים ללא שינוי</>
                : <>ייכתבו {plan.rows} שורות גבייה · {fmt(plan.total)} ₪{plan.newSections.length > 0 && ` · ${plan.newSections.length} סעיפים חדשים`}</>}
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
                {mode === "update" ? "אשר ועדכן" : "אשר וייבא"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
