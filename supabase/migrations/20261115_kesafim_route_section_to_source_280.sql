-- 2.8.0: ייבוא כספים 2000 — שיוך סעיף מהדוח למקור תקציב אחר (למשל "חוגים" → בית התלמיד).
-- אדיטיבי בלבד: שתי עמודות חדשות (nullable) + הקלה של NOT NULL אחד.
-- הוחל על dev ב-15.11.2026. על prod — רק בנוהל המיזוג המדורג.

-- הכנסה שנוצרה מייבוא: מאפשר דלתא בין דוחות וביטול ייבוא מלא.
alter table public.income
  add column if not exists import_id uuid references public.kesafim_imports(id) on delete set null;
create index if not exists income_import_id_idx on public.income(import_id) where import_id is not null;

-- זיכרון מיפויים: סעיף מהדוח ממופה לסעיף הורים (parent_section_id)
-- או למקור תקציב אחר (target_source = slug) — בדיוק אחד מהשניים.
alter table public.kesafim_section_map
  add column if not exists target_source text;
alter table public.kesafim_section_map
  alter column parent_section_id drop not null;
alter table public.kesafim_section_map
  drop constraint if exists kesafim_section_map_one_target;
alter table public.kesafim_section_map
  add constraint kesafim_section_map_one_target check (num_nonnulls(parent_section_id, target_source) = 1);
