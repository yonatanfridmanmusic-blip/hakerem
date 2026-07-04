import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrganization, useAllOrganizations, useRequestJoinOrg } from "@/hooks/use-organization";
import { seedDefaultSourcesForOrg, FALLBACK_SOURCES } from "@/hooks/use-budget-sources";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { redirect } = await import("@tanstack/react-router");
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: mem } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", data.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (mem) throw redirect({ to: "/dashboard" });
  },
  component: OnboardingPage,
});

type Step = "choose" | "create-org" | "sources" | "join-org" | "pending";

const f = "Rubik, sans-serif";

// ─── Shared tokens ────────────────────────────────────────────────────────────

const INK   = "#1A1A1A";
const INK2  = "#6B6560";
const INK3  = "#AAA099";
const GREEN = "#2D6644";
const DARK  = "#1A3D2B";
const BORDER = "#E8E2D9";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  border: `1.5px solid ${BORDER}`, borderRadius: "9px",
  fontSize: "14px", background: "#fff", color: INK,
  outline: "none", fontFamily: f, boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const btnPrimary: React.CSSProperties = {
  width: "100%", padding: "12px 0",
  background: `linear-gradient(135deg, ${GREEN}, ${DARK})`,
  color: "#fff", border: "none", borderRadius: "10px",
  fontSize: "15px", fontWeight: "500",
  fontFamily: f, cursor: "pointer",
  boxShadow: "0 4px 16px rgba(26,61,43,0.3)",
  transition: "opacity 0.15s",
};

// ─── Logo mark ────────────────────────────────────────────────────────────────

function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`,
      background: `linear-gradient(145deg, ${GREEN}, ${DARK})`,
      borderRadius: `${Math.round(size * 0.27)}px`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 14px rgba(26,61,43,0.28)", flexShrink: 0,
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 36 36" fill="none">
        <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(122,170,142,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/>
        <circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
        <circle cx="24" cy="14" r="5.5" fill="#5AA674"/>
        <circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
        <circle cx="18" cy="23" r="5.5" fill="#4A8C62"/>
        <circle cx="16.2" cy="21.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
      </svg>
    </div>
  );
}

function LogoRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "36px", justifyContent: "center" }}>
      <LogoMark size={40} />
      <span style={{ fontSize: "20px", fontWeight: "500", color: INK, letterSpacing: "-0.3px" }}>הכרם</span>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSchool({ color = "#2D6644" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 10l9-7 9 7M5 21V10M19 21V10M9 21v-6h6v6"/>
    </svg>
  );
}

function IconTeam({ color = "#2D6644" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3"/><circle cx="16" cy="8" r="2.5"/>
      <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6"/>
      <path d="M18 14c1.657 0 3 1.343 3 3v3"/>
    </svg>
  );
}

function IconMail({ color = "#2D6644" }: { color?: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3"/>
      <path d="M2 7l10 7 10-7"/>
    </svg>
  );
}

function IconCheck({ color = "#2D6644" }: { color?: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M7 12.5l3.5 3.5 6.5-7"/>
    </svg>
  );
}

function IconMapPin({ color = "#AAA099" }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.686 2 6 4.686 6 8c0 5 6 13 6 13s6-8 6-13c0-3.314-2.686-6-6-6z"/><circle cx="12" cy="8" r="2"/>
    </svg>
  );
}

function IconArrow({ color = INK3 }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 12l4-4-4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Step: Choose ─────────────────────────────────────────────────────────────

function ChooseStep({ onChoose }: { onChoose: (step: Step) => void }) {
  return (
    <div>
      <h2 style={{ fontSize: "19px", fontWeight: "500", color: INK, margin: "0 0 6px", textAlign: "center" }}>
        ברוכים הבאים להכרם
      </h2>
      <p style={{ fontSize: "13.5px", color: INK2, margin: "0 0 28px", textAlign: "center", lineHeight: 1.65 }}>
        כיצד תרצה/י להתחיל?
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <ChoiceCard
          icon={<IconSchool />}
          title="אני מנהל/ת בית ספר"
          subtitle="אצור חשבון חדש לבית הספר שלי"
          onClick={() => onChoose("create-org")}
        />
        <ChoiceCard
          icon={<IconTeam />}
          title="אני חבר/ת צוות"
          subtitle="אצטרף לבית ספר קיים במערכת"
          onClick={() => onChoose("join-org")}
        />
      </div>
    </div>
  );
}

function ChoiceCard({ icon, title, subtitle, onClick }: {
  icon: React.ReactNode; title: string; subtitle: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        padding: "16px 18px",
        background: hover ? "#F4FAF6" : "#fff",
        border: `1.5px solid ${hover ? GREEN : BORDER}`,
        borderRadius: "12px", cursor: "pointer",
        fontFamily: f, textAlign: "right",
        transition: "all 0.15s", width: "100%",
      }}
    >
      <div style={{
        width: "42px", height: "42px", borderRadius: "10px", flexShrink: 0,
        background: hover ? "#EDFBF3" : "#F5F5F2",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14.5px", fontWeight: "500", color: INK, marginBottom: "2px" }}>{title}</div>
        <div style={{ fontSize: "12.5px", color: INK2 }}>{subtitle}</div>
      </div>
      <IconArrow color={hover ? GREEN : INK3} />
    </button>
  );
}

// ─── Step: Create Org ─────────────────────────────────────────────────────────

function CreateOrgStep({ onBack, onCreated }: { onBack: () => void; onCreated: (orgId: string) => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const createOrg = useCreateOrganization();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("נא להזין שם בית הספר"); return; }
    try {
      const result = await createOrg.mutateAsync({ name: name.trim(), city: city.trim() || undefined });
      const org = result as { id: string; name: string };
      // Ensure default sources exist (trigger handles it, this is a safety net)
      await seedDefaultSourcesForOrg(org.id);
      onCreated(org.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הארגון");
    }
  };

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 6px" }}>
        הגדרת בית הספר
      </h2>
      <p style={{ fontSize: "13px", color: INK2, margin: "0 0 24px", lineHeight: 1.65 }}>
        פרטים אלו יופיעו בכל הדוחות והמסמכים שלך.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <Field label="שם בית הספר">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
            placeholder="לדוגמה: בית ספר כרמים" required />
        </Field>
        <Field label="עיר (אופציונלי)">
          <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)}
            placeholder="לדוגמה: תל אביב" />
        </Field>

        <div style={{
          background: "#EDFBF3", border: "1px solid #C6E8D4",
          borderRadius: "9px", padding: "12px 16px",
          fontSize: "12.5px", color: "#166534", lineHeight: 1.65,
          display: "flex", gap: "10px", alignItems: "flex-start",
        }}>
          <div style={{ marginTop: "1px", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#2D6644" strokeWidth="1.4"/>
              <path d="M8 7v4" stroke="#2D6644" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="5.5" r="0.7" fill="#2D6644"/>
            </svg>
          </div>
          לאחר יצירת בית הספר תוכל/י להזמין את שאר הצוות מתוך ההגדרות.
        </div>

        <button type="submit" disabled={createOrg.isPending} style={{
          ...btnPrimary, opacity: createOrg.isPending ? 0.7 : 1,
          cursor: createOrg.isPending ? "not-allowed" : "pointer",
        }}>
          {createOrg.isPending ? "יוצר..." : "המשך →"}
        </button>
      </form>
    </div>
  );
}

// ─── Step: Sources ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { color: "#0E7490", bg_color: "#ECFEFF", label: "כחול-טורקיז" },
  { color: "#B45309", bg_color: "#FFFBEB", label: "כתום-חום" },
  { color: "#0F766E", bg_color: "#F0FDFA", label: "ירוק-טיל" },
  { color: "#7C3AED", bg_color: "#F5F3FF", label: "סגול" },
  { color: "#B91C1C", bg_color: "#FEF2F2", label: "אדום" },
  { color: "#0369A1", bg_color: "#F0F9FF", label: "כחול" },
];

function SourcesStep({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [customLabel, setCustomLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [colorIdx, setColorIdx] = useState(0);
  const [customSources, setCustomSources] = useState<{ label: string; color: string; bg_color: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const handleAddCustom = () => {
    const trimmed = customLabel.trim();
    if (!trimmed) return;
    const preset = PRESET_COLORS[colorIdx % PRESET_COLORS.length];
    setCustomSources(prev => [...prev, { label: trimmed, color: preset.color, bg_color: preset.bg_color }]);
    setCustomLabel("");
    setAdding(false);
    setColorIdx(prev => prev + 1);
  };

  const handleRemoveCustom = (idx: number) => {
    setCustomSources(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDone = async () => {
    setSaving(true);
    // Persist custom sources directly with the orgId prop (context may not be ready yet)
    for (const src of customSources) {
      try {
        const slug = src.label.trim().toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_א-ת]/g, "");
        const { data: existing } = await supabase
          .from("org_budget_sources")
          .select("order_index")
          .eq("org_id", orgId)
          .order("order_index", { ascending: false })
          .limit(1);
        const maxOrder = (existing?.[0] as { order_index: number } | undefined)?.order_index ?? 3;
        await supabase.from("org_budget_sources").insert({
          org_id: orgId, slug, label: src.label.trim(),
          color: src.color, bg_color: src.bg_color,
          is_default: false, order_index: maxOrder + 1,
        });
      } catch { /* ignore — user can add from settings later */ }
    }
    setSaving(false);
    onDone();
  };

  return (
    <div>
      {/* Progress indicator */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
        {["בית הספר", "מקורות תקציב", "מוכן!"].map((label, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              height: "3px", borderRadius: "99px", marginBottom: "5px",
              background: i === 1 ? GREEN : i < 1 ? "#B6E8C4" : BORDER,
            }} />
            <div style={{ fontSize: "10px", color: i === 1 ? GREEN : INK3, fontWeight: i === 1 ? "500" : "400" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 6px" }}>
        מקורות תקציב
      </h2>
      <p style={{ fontSize: "13px", color: INK2, margin: "0 0 20px", lineHeight: 1.65 }}>
        אלו מקורות התקציב של בית הספר שלך. כבר הוספנו את הנפוצים — הוסף/י עוד לפי הצורך.
      </p>

      {/* Default sources — read-only display */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        {FALLBACK_SOURCES.map(s => (
          <div key={s.slug} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", borderRadius: "10px",
            border: `1.5px solid ${BORDER}`, background: "#fff",
          }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: s.color, flexShrink: 0,
            }} />
            <span style={{ fontSize: "14px", color: INK, flex: 1 }}>{s.label}</span>
            <span style={{
              fontSize: "11px", color: "#166534", background: "#EDFBF3",
              padding: "2px 8px", borderRadius: "99px", fontWeight: "500",
            }}>ברירת מחדל</span>
          </div>
        ))}

        {/* Custom sources the user added */}
        {customSources.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", borderRadius: "10px",
            border: `1.5px solid ${GREEN}`, background: "#F4FAF6",
          }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: s.color, flexShrink: 0,
            }} />
            <span style={{ fontSize: "14px", color: INK, flex: 1 }}>{s.label}</span>
            <button onClick={() => handleRemoveCustom(i)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: INK3, fontSize: "16px", padding: "0 2px", lineHeight: 1,
            }}>×</button>
          </div>
        ))}
      </div>

      {/* Add custom source */}
      {adding ? (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input
            autoFocus
            style={{ ...inputStyle, flex: 1 }}
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCustom(); } if (e.key === "Escape") setAdding(false); }}
            placeholder="לדוגמה: צהרון, תרומות..."
          />
          <button onClick={handleAddCustom} disabled={!customLabel.trim()} style={{
            padding: "10px 16px", borderRadius: "9px", border: "none",
            background: customLabel.trim() ? GREEN : BORDER,
            color: "#fff", fontSize: "14px", cursor: customLabel.trim() ? "pointer" : "not-allowed",
            fontFamily: f, whiteSpace: "nowrap",
          }}>הוסף/י</button>
          <button onClick={() => setAdding(false)} style={{
            padding: "10px 12px", borderRadius: "9px", border: `1px solid ${BORDER}`,
            background: "#fff", color: INK2, fontSize: "13px", cursor: "pointer", fontFamily: f,
          }}>ביטול</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          display: "flex", alignItems: "center", gap: "7px",
          background: "none", border: `1.5px dashed ${BORDER}`,
          borderRadius: "10px", padding: "10px 14px",
          width: "100%", cursor: "pointer", fontFamily: f,
          color: INK2, fontSize: "13.5px", marginBottom: "16px",
          transition: "border-color 0.15s",
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = GREEN)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          הוסף/י מקור מותאם אישית (כגון: צהרון, תרומות...)
        </button>
      )}

      <button onClick={handleDone} disabled={saving} style={{
        ...btnPrimary,
        opacity: saving ? 0.7 : 1,
        cursor: saving ? "not-allowed" : "pointer",
      }}>
        {saving ? "שומר..." : "סיום וכניסה למערכת →"}
      </button>

      <p style={{ textAlign: "center", fontSize: "12px", color: INK3, margin: "10px 0 0" }}>
        ניתן לערוך ולהוסיף מקורות בכל עת מדף ההגדרות
      </p>
    </div>
  );
}

// ─── Step: Join Org ───────────────────────────────────────────────────────────

function JoinOrgStep({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const [selected, setSelected] = useState<string | null>(null);
  const requestJoin = useRequestJoinOrg();

  const handleSubmit = async () => {
    if (!selected) { toast.error("נא לבחור בית ספר"); return; }
    try {
      await requestJoin.mutateAsync(selected);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "שגיאה";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.info("כבר שלחת בקשה לבית ספר זה");
        onSuccess();
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 6px" }}>
        הצטרפות לבית ספר
      </h2>
      <p style={{ fontSize: "13px", color: INK2, margin: "0 0 18px", lineHeight: 1.65 }}>
        בחר/י את בית הספר שלך — מנהל/ת בית הספר תאשר את הבקשה.
      </p>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "32px", color: INK3, fontSize: "14px" }}>טוען...</div>
      ) : orgs.length === 0 ? (
        <div style={{
          background: "#FFFBEB", border: "1px solid #E9D67A",
          borderRadius: "10px", padding: "14px 16px",
          fontSize: "13px", color: "#78600A", lineHeight: 1.65,
        }}>
          לא נמצאו בתי ספר רשומים. בקש/י ממנהל/ת בית הספר שלך להירשם תחילה.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px", maxHeight: "260px", overflowY: "auto" }}>
          {orgs.map(org => {
            const active = selected === org.id;
            return (
              <button
                key={org.id}
                onClick={() => setSelected(org.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "13px 14px", textAlign: "right", width: "100%",
                  background: active ? "#F4FAF6" : "#fff",
                  border: `1.5px solid ${active ? GREEN : BORDER}`,
                  borderRadius: "10px", cursor: "pointer",
                  fontFamily: f, transition: "all 0.12s",
                }}
              >
                <div style={{
                  width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0,
                  background: active ? "#EDFBF3" : "#F5F5F2",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.12s",
                }}>
                  <IconSchool color={active ? GREEN : INK3} />
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: "14px", fontWeight: "500", color: INK }}>{org.name}</div>
                  {org.city && (
                    <div style={{ fontSize: "12px", color: INK3, marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>
                      <IconMapPin /> {org.city}
                    </div>
                  )}
                </div>
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${active ? GREEN : BORDER}`,
                  background: active ? GREEN : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.12s",
                }}>
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5 3.5-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {orgs.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={!selected || requestJoin.isPending}
          style={{
            ...btnPrimary,
            opacity: !selected ? 0.45 : 1,
            cursor: !selected ? "not-allowed" : "pointer",
          }}
        >
          {requestJoin.isPending ? "שולח..." : "שליחת בקשת הצטרפות"}
        </button>
      )}
    </div>
  );
}

// ─── Step: Pending ────────────────────────────────────────────────────────────

function PendingStep() {
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  const handleTryEnter = async () => {
    setChecking(true);
    setNotYet(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }
    const { data: mem } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    setChecking(false);
    if (mem) {
      window.location.href = "/dashboard";
    } else {
      setNotYet(true);
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{
        width: "64px", height: "64px", borderRadius: "50%",
        background: "#EDFBF3", border: `1.5px solid #B6E8C4`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px",
      }}>
        <IconMail color={GREEN} />
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 10px" }}>
        הבקשה נשלחה!
      </h2>
      <p style={{ fontSize: "13.5px", color: INK2, lineHeight: 1.7, margin: "0 0 22px" }}>
        הבקשה הועברה למנהל/ת בית הספר לאישור.<br/>
        ברגע שתאושר — לחץ/י על הכפתור למטה להיכנס.
      </p>

      <button
        type="button"
        onClick={handleTryEnter}
        disabled={checking}
        style={{
          ...btnPrimary,
          marginBottom: "12px",
          opacity: checking ? 0.7 : 1,
          cursor: checking ? "not-allowed" : "pointer",
        }}
      >
        {checking ? "בודק..." : "אושרתי — כניסה למערכת"}
      </button>

      {notYet && (
        <p style={{ fontSize: "13px", color: "#B5472A", margin: "0 0 12px" }}>
          הבקשה עדיין ממתינה לאישור. נסה/י שוב מאוחר יותר.
        </p>
      )}

      <div style={{
        background: "#F8F5F0", border: `1px solid ${BORDER}`,
        borderRadius: "10px", padding: "13px 16px",
        fontSize: "13px", color: INK2, lineHeight: 1.65,
        display: "flex", gap: "10px", alignItems: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="7" stroke={INK3} strokeWidth="1.4"/>
          <path d="M8 7v4" stroke={INK3} strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="5.5" r="0.7" fill={INK3}/>
        </svg>
        <span>ניתן לסגור את הדפדפן ולחזור מאוחר יותר.</span>
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("choose");
  const [newOrgId, setNewOrgId] = useState<string | null>(null);

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(150deg, #F3EEE8 0%, #FAFAF7 60%, #EEF4F0 100%)",
      fontFamily: f, padding: "24px",
    }}>
      <div style={{
        background: "#fff", border: `1px solid ${BORDER}`,
        borderRadius: "20px", padding: "40px 36px",
        width: "100%", maxWidth: "420px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
      }}>
        <LogoRow />

        {step === "choose"     && <ChooseStep onChoose={setStep} />}
        {step === "create-org" && (
          <CreateOrgStep
            onBack={() => setStep("choose")}
            onCreated={(id) => { setNewOrgId(id); setStep("sources"); }}
          />
        )}
        {step === "sources" && newOrgId && (
          <SourcesStep
            orgId={newOrgId}
            onDone={() => navigate({ to: "/dashboard", replace: true })}
          />
        )}
        {step === "join-org"   && <JoinOrgStep onBack={() => setStep("choose")} onSuccess={() => setStep("pending")} />}
        {step === "pending"    && <PendingStep />}
      </div>
    </div>
  );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: "500", color: INK2, display: "block", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "5px",
      background: "none", border: "none", cursor: "pointer",
      fontSize: "13px", color: INK3, padding: "0 0 18px",
      fontFamily: f, transition: "color 0.12s",
    }}
      onMouseEnter={e => (e.currentTarget.style.color = INK2)}
      onMouseLeave={e => (e.currentTarget.style.color = INK3)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M5 11l4-4-4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      חזרה
    </button>
  );
}
