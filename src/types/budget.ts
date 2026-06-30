// ─── Shared budget types ──────────────────────────────────────────────────────
// Single source of truth for BudgetSource + BankAccount.
// Import from here — do not redeclare in hooks.

export type BudgetSource = "gefen" | "iriyah" | "horim";
export type BankAccount  = "school" | "parents";
