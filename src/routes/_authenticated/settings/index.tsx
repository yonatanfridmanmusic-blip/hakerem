import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: () => (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--hk-ink-3)", fontSize: "14px" }}>
      settings — בפיתוח
    </div>
  ),
});
