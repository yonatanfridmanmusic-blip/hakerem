// ─── Shared budget types ──────────────────────────────────────────────────────
// Single source of truth for BudgetSource + BankAccount.
// Import from here — do not redeclare in hooks.

// BudgetSource is now a free-text slug — "gefen"|"iriyah"|"horim" or any custom value
export type BudgetSource = string;
export type BankAccount  = "school" | "parents";

// Well-known default source slugs (for display helpers / fallback)
export const DEFAULT_SOURCE_SLUGS = ["gefen", "iriyah", "horim"] as const;
export type DefaultSourceSlug = (typeof DEFAULT_SOURCE_SLUGS)[number];
