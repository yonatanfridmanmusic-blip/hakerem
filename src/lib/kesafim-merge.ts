/**
 * 2.8.0 — ייבוא כספים 2000: כמה סעיפים מהדוח → סעיף אחד בכרם.
 *
 * Background (כרמים, 15.11.2026): the fuzzy matcher suggested three different
 * report sections into ONE existing section; the commit then sent three target
 * rows for the same (grade × section) cell in a single upsert and Postgres
 * rejected it ("ON CONFLICT DO UPDATE command cannot affect row a second time"),
 * leaving a half-written import.
 *
 * Two pure helpers, no I/O:
 *  - mergeCells: rows that land on the same cell become one cell (targets and
 *    collections are summed), so a many-to-one mapping is legal and exact.
 *  - resolveSuggestions: a fuzzy suggestion is offered only when it is
 *    unambiguous — never the same existing section for two report sections.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface WrittenLike {
  gradeId: string;
  /** resolved parent_section id (or any stable key of the target section) */
  targetKey: string;
  norm: string;
  /** target per student from the report; null when nothing was charged */
  per: number | null;
  paid: number;
}

export interface MergedCell {
  gradeId: string;
  targetKey: string;
  norms: string[];
  per: number | null;
  paid: number;
  /** what each report section contributed to this cell (for the collection note) */
  parts: { norm: string; paid: number }[];
}

export function mergeCells(rows: WrittenLike[]): MergedCell[] {
  const cells = new Map<string, MergedCell>();
  for (const w of rows) {
    const key = `${w.gradeId}:${w.targetKey}`;
    const c = cells.get(key);
    if (!c) {
      cells.set(key, { gradeId: w.gradeId, targetKey: w.targetKey, norms: [w.norm], per: w.per === null ? null : r2(w.per), paid: r2(w.paid), parts: [{ norm: w.norm, paid: r2(w.paid) }] });
      continue;
    }
    if (!c.norms.includes(w.norm)) c.norms.push(w.norm);
    c.parts.push({ norm: w.norm, paid: r2(w.paid) });
    c.per = c.per === null && w.per === null ? null : r2((c.per ?? 0) + (w.per ?? 0));
    c.paid = r2(c.paid + w.paid);
  }
  return [...cells.values()];
}

/** Targets that receive more than one report section (for the review-screen warning). */
export function findMergedTargets(pairs: { norm: string; targetKey: string }[]): { targetKey: string; norms: string[] }[] {
  const byTarget = new Map<string, string[]>();
  for (const p of pairs) {
    const list = byTarget.get(p.targetKey);
    if (!list) byTarget.set(p.targetKey, [p.norm]);
    else if (!list.includes(p.norm)) list.push(p.norm);
  }
  return [...byTarget.entries()].filter(([, norms]) => norms.length > 1).map(([targetKey, norms]) => ({ targetKey, norms }));
}

/**
 * Fuzzy suggestions without guessing.
 * Each report name points at its best free section (score ≥ threshold). A section
 * is then suggested to a name only if that name is its single strict best match;
 * when two names tie for the same section nobody gets it — the user decides.
 * Returns norm → section id for the unambiguous suggestions only.
 */
export function resolveSuggestions(
  norms: string[],
  freeSections: { id: string; normName: string }[],
  similarity: (a: string, b: string) => number,
  threshold: number,
): Record<string, string> {
  const wants = new Map<string, { norm: string; score: number }[]>(); // section id → candidates
  for (const norm of norms) {
    let best: { id: string; score: number } | null = null;
    for (const s of freeSections) {
      const score = similarity(s.normName, norm);
      if (score >= threshold && (!best || score > best.score)) best = { id: s.id, score };
    }
    if (!best) continue;
    const list = wants.get(best.id);
    if (list) list.push({ norm, score: best.score }); else wants.set(best.id, [{ norm, score: best.score }]);
  }
  const out: Record<string, string> = {};
  for (const [sectionId, cands] of wants) {
    const top = Math.max(...cands.map((c) => c.score));
    const winners = cands.filter((c) => c.score === top);
    if (winners.length === 1) out[winners[0].norm] = sectionId;
  }
  return out;
}
