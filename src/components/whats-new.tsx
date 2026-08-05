// ─── "מה חדש" — one-time modal after a version bump ───────────────────────────
//
// Remembered per-user in profiles.last_seen_version (works across devices).
// New users (last_seen_version = null) are silently marked as seen — no popup.
// The version label in the sidebar footer re-opens the full changelog on demand.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { APP_VERSION, CHANGELOG, entriesSince, type ChangelogEntry } from "@/lib/version";

// ─── Modal (shared by auto-popup and manual open) ─────────────────────────────

export function WhatsNewModal({ entries, onClose }: { entries: ChangelogEntry[]; onClose: () => void }) {
  if (entries.length === 0) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "18px", width: "100%", maxWidth: "440px",
        maxHeight: "80vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden", direction: "rtl",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAE5DE", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "34px", height: "34px", borderRadius: "10px",
              background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles size={17} color="#B08D57" />
            </div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: "500", color: "#1A1A1A" }}>
                מה חדש בגרסה {entries[0].version}
              </div>
              <div style={{ fontSize: "12px", color: "#AAA099", marginTop: "2px" }}>{entries[0].date}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "#AAA099", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Entries */}
        <div style={{ padding: "18px 24px 22px", overflowY: "auto" }}>
          {entries.map((entry, i) => (
            <div key={entry.version} style={{ marginTop: i > 0 ? "22px" : 0 }}>
              {i > 0 && (
                <div style={{ fontSize: "12px", color: "#AAA099", marginBottom: "10px", paddingTop: "18px", borderTop: "1px solid #F0EBE3" }}>
                  גרסה {entry.version} · {entry.date}
                </div>
              )}
              <div style={{ fontSize: "14.5px", fontWeight: "600", color: "#1A1A1A", marginBottom: "12px" }}>
                {entry.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {entry.items.map((item, j) => (
                  <div key={j} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ color: "#B08D57", fontSize: "12px", lineHeight: "21px", flexShrink: 0 }}>✦</span>
                    <span style={{ fontSize: "13.5px", color: "#4A453F", lineHeight: "21px" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Auto-popup gate — mount once in the authenticated layout ─────────────────

export function WhatsNewGate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const { data: lastSeen } = useQuery({
    queryKey: ["last-seen-version", user?.id],
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("last_seen_version")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data.last_seen_version; // string | null
    },
  });

  const markSeen = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ last_seen_version: APP_VERSION }).eq("id", user.id);
    qc.setQueryData(["last-seen-version", user.id], APP_VERSION);
  };

  // New user (null): silently mark current version as seen — no popup.
  useEffect(() => {
    if (lastSeen === null && user) void markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeen, user?.id]);

  if (dismissed || lastSeen === undefined || lastSeen === null) return null;
  const entries = entriesSince(lastSeen);
  if (entries.length === 0) return null;

  const close = () => {
    setDismissed(true);
    void markSeen();
  };

  return <WhatsNewModal entries={entries} onClose={close} />;
}

// ─── Discreet footer version label — opens full changelog on click ────────────

export function VersionFooter() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "6px 4px 2px", width: "100%", textAlign: "center",
          fontSize: "10.5px", letterSpacing: "0.04em",
          color: "rgba(255,255,255,0.28)", fontFamily: "var(--font-sans)",
          WebkitTapHighlightColor: "transparent",
        }}
        title="מה חדש"
      >
        גרסה {APP_VERSION}
      </button>
      {open && <WhatsNewModal entries={CHANGELOG} onClose={() => setOpen(false)} />}
    </>
  );
}

// Mobile variant — dark text on light menu background.
export function VersionFooterLight() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "8px 14px", width: "100%", textAlign: "right",
          fontSize: "11px", color: "#C4BBB2", fontFamily: "var(--font-sans)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        גרסה {APP_VERSION}
      </button>
      {open && <WhatsNewModal entries={CHANGELOG} onClose={() => setOpen(false)} />}
    </>
  );
}
