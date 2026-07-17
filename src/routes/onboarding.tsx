import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
      .select("id, organizations(setup_completed_at)")
      .eq("user_id", data.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (mem) {
      const org = mem.organizations as { setup_completed_at: string | null } | null;
      // Only redirect to dashboard if setup is fully complete
      if (org?.setup_completed_at) throw redirect({ to: "/dashboard" });
      // else: fall through — page will show resume screen
    }
  },
  component: OnboardingPage,
});

type Step = "choose" | "create-org" | "sources" | "join-org" | "pending" | "transfer-pending" | "resume-setup";

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
  const [customSources, setCustomSources] = useState<{ id: string; label: string; color: string; bg_color: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Load existing custom sources on mount (handles resume case)
  useEffect(() => {
    supabase
      .from("org_budget_sources")
      .select("id, label, color, bg_color")
      .eq("org_id", orgId)
      .eq("is_default", false)
      .order("order_index")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCustomSources(
            data.map(s => ({ id: s.id, label: s.label, color: s.color, bg_color: s.bg_color }))
          );
        }
      });
  }, [orgId]);

  // Auto-save to DB immediately on add
  const handleAddCustom = async () => {
    const trimmed = customLabel.trim();
    if (!trimmed) return;
    const preset = PRESET_COLORS[colorIdx % PRESET_COLORS.length];
    const slug = trimmed.toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_א-ת]/g, "");
    const { data: existing } = await supabase
      .from("org_budget_sources")
      .select("order_index")
      .eq("org_id", orgId)
      .order("order_index", { ascending: false })
      .limit(1);
    const maxOrder = (existing?.[0] as { order_index: number } | undefined)?.order_index ?? 3;
    const { data: newSrc } = await supabase
      .from("org_budget_sources")
      .insert({
        org_id: orgId, slug, label: trimmed,
        color: preset.color, bg_color: preset.bg_color,
        is_default: false, order_index: maxOrder + 1,
      })
      .select("id")
      .single();
    if (newSrc) {
      setCustomSources(prev => [...prev, { id: newSrc.id, label: trimmed, color: preset.color, bg_color: preset.bg_color }]);
    }
    setCustomLabel("");
    setAdding(false);
    setColorIdx(prev => prev + 1);
  };

  // Delete from DB on remove
  const handleRemoveCustom = async (idx: number) => {
    const src = customSources[idx];
    setCustomSources(prev => prev.filter((_, i) => i !== idx));
    if (src.id) {
      await supabase.from("org_budget_sources").delete().eq("id", src.id);
    }
  };

  // Mark setup complete and navigate
  const handleDone = async () => {
    setSaving(true);
    await supabase
      .from("organizations")
      .update({ setup_completed_at: new Date().toISOString() })
      .eq("id", orgId);
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

// ─── Step: Resume Setup ───────────────────────────────────────────────────────

function ResumeSetupStep({ orgName, orgId, onContinue, onSkip }: {
  orgName: string;
  orgId: string;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [skipping, setSkipping] = useState(false);

  const handleSkip = async () => {
    setSkipping(true);
    await supabase
      .from("organizations")
      .update({ setup_completed_at: new Date().toISOString() })
      .eq("id", orgId);
    setSkipping(false);
    onSkip();
  };

  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{
        width: "64px", height: "64px", borderRadius: "50%",
        background: "#EDFBF3", border: "1.5px solid #B6E8C4",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px",
      }}>
        <IconSchool color={GREEN} />
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 6px" }}>
        בית הספר שלך קיים!
      </h2>
      <p style={{ fontSize: "15px", fontWeight: "500", color: GREEN, margin: "0 0 10px" }}>
        {orgName}
      </p>
      <p style={{ fontSize: "13px", color: INK2, margin: "0 0 28px", lineHeight: 1.7 }}>
        נותר רק להגדיר מקורות תקציב.
        כל מה שהגדרת כבר נשמר במערכת.
      </p>

      <button onClick={onContinue} style={{ ...btnPrimary, marginBottom: "10px" }}>
        המשך להגדרת מקורות →
      </button>

      <button
        onClick={handleSkip}
        disabled={skipping}
        style={{
          width: "100%", padding: "10px 0",
          background: "none", border: `1.5px solid ${BORDER}`,
          borderRadius: "10px", fontSize: "13px", color: INK2,
          fontFamily: f, cursor: skipping ? "not-allowed" : "pointer",
          opacity: skipping ? 0.7 : 1,
        }}
      >
        {skipping ? "כניסה..." : "דלג, כנס למערכת"}
      </button>
    </div>
  );
}

// ─── Step: Join Org ───────────────────────────────────────────────────────────

function JoinOrgStep({ onBack, onSuccess, onTransfer }: {
  onBack: () => void;
  onSuccess: () => void;
  onTransfer: () => void;
}) {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const [selected, setSelected] = useState<string | null>(null);
  const [joinType, setJoinType] = useState<"staff" | "transfer">("staff");
  const [jobTitle, setJobTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requestJoin = useRequestJoinOrg();

  const selectedOrg = orgs.find(o => o.id === selected);

  const handleSubmit = async () => {
    if (!selected) { toast.error("נא לבחור בית ספר"); return; }
    setSubmitting(true);
    try {
      if (joinType === "staff") {
        await requestJoin.mutateAsync({ orgId: selected, jobTitle: jobTitle.trim() || undefined });
        onSuccess();
      } else {
        // Ownership transfer: find current owner and create a transfer request
        const { data: ownerMem } = await supabase
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", selected)
          .eq("role", "owner")
          .eq("status", "active")
          .maybeSingle();

        if (!ownerMem) {
          toast.error("לא נמצא בעלים לבית הספר הזה. פנה/י לתמיכה.");
          setSubmitting(false);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setSubmitting(false); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        const { error } = await supabase
          .from("ownership_transfer_requests")
          .insert({
            org_id: selected,
            requested_by_user_id: user.id,
            requested_by_name: profile?.full_name ?? user.email ?? "משתמש",
            current_owner_user_id: ownerMem.user_id,
          });

        if (error) {
          if (error.message.includes("duplicate") || error.message.includes("unique")) {
            toast.info("כבר שלחת בקשת העברה לבית ספר זה");
            onTransfer();
          } else {
            toast.error("שגיאה בשליחת הבקשה: " + error.message);
          }
        } else {
          onTransfer();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "שגיאה";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.info("כבר שלחת בקשה לבית ספר זה");
        onSuccess();
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 6px" }}>
        הצטרפות לבית ספר
      </h2>
      <p style={{ fontSize: "13px", color: INK2, margin: "0 0 14px", lineHeight: 1.65 }}>
        בחר/י את בית הספר שלך ואת סוג הכניסה.
      </p>

      {/* Join type selection */}
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "16px" }}>
        {(["staff", "transfer"] as const).map(type => {
          const active = joinType === type;
          return (
            <button
              key={type}
              onClick={() => setJoinType(type)}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "11px 14px", textAlign: "right", width: "100%",
                background: active ? "#F4FAF6" : "#fff",
                border: `1.5px solid ${active ? GREEN : BORDER}`,
                borderRadius: "10px", cursor: "pointer", fontFamily: f, transition: "all 0.12s",
              }}
            >
              <div style={{
                width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? GREEN : BORDER}`,
                background: active ? GREEN : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
              }}>
                {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="2.5" fill="#fff"/></svg>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13.5px", fontWeight: "500", color: INK }}>
                  {type === "staff" ? "הצטרפות כאיש/ת צוות" : "אני מחליפ/ה את המנהל/ת"}
                </div>
                <div style={{ fontSize: "11.5px", color: INK2, marginTop: "1px" }}>
                  {type === "staff" ? "גישה לצפייה ועריכה" : "העברת בעלות מלאה על החשבון"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Warning for ownership transfer */}
      {joinType === "transfer" && (
        <div style={{
          background: "#FFFBEB", border: "1px solid #F59E0B",
          borderRadius: "10px", padding: "12px 14px",
          fontSize: "12.5px", color: "#78350F", lineHeight: 1.65,
          display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "14px",
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M8 2L14.5 13H1.5L8 2z" stroke="#F59E0B" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M8 6v3" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.7" fill="#F59E0B"/>
          </svg>
          <span>המנהל/ת הנוכחי/ת יקבל/תקבל התראה ויצטרך/תצטרך לאשר. לאחר האישור גישתו/ה תיחסם לחלוטין.</span>
        </div>
      )}

      {/* School list */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "24px", color: INK3, fontSize: "14px" }}>טוען...</div>
      ) : orgs.length === 0 ? (
        <div style={{ background: "#FFFBEB", border: "1px solid #E9D67A", borderRadius: "10px", padding: "14px 16px", fontSize: "13px", color: "#78600A", lineHeight: 1.65 }}>
          לא נמצאו בתי ספר רשומים. בקש/י ממנהל/ת בית הספר שלך להירשם תחילה.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px", maxHeight: "200px", overflowY: "auto" }}>
          {orgs.map(org => {
            const active = selected === org.id;
            return (
              <button
                key={org.id}
                onClick={() => setSelected(org.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "11px 13px", textAlign: "right", width: "100%",
                  background: active ? "#F4FAF6" : "#fff",
                  border: `1.5px solid ${active ? GREEN : BORDER}`,
                  borderRadius: "10px", cursor: "pointer", fontFamily: f, transition: "all 0.12s",
                }}
              >
                <div style={{
                  width: "34px", height: "34px", borderRadius: "9px", flexShrink: 0,
                  background: active ? "#EDFBF3" : "#F5F5F2",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <IconSchool color={active ? GREEN : INK3} />
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: "500", color: INK }}>{org.name}</div>
                  {org.city && (
                    <div style={{ fontSize: "11.5px", color: INK3, marginTop: "1px", display: "flex", alignItems: "center", gap: "3px" }}>
                      <IconMapPin /> {org.city}
                    </div>
                  )}
                </div>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${active ? GREEN : BORDER}`,
                  background: active ? GREEN : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="2.5" fill="#fff"/></svg>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Job title — only for staff */}
      {joinType === "staff" && orgs.length > 0 && (
        <Field label="תפקיד (טקסט חופשי — אופציונלי)">
          <input
            style={inputStyle}
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            placeholder="לדוגמה: מזכירה, סגן מנהל, רכזת שכבה..."
          />
        </Field>
      )}

      {/* School name reminder */}
      {selected && selectedOrg && (
        <div style={{
          background: "#F4FAF6", border: "1px solid #B6E8C4",
          borderRadius: "9px", padding: "9px 13px",
          fontSize: "12px", color: "#166534", marginTop: "10px",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <IconCheck color="#16A34A" />
          <span>
            {joinType === "staff"
              ? `בקשת הצטרפות תישלח לבית ספר ${selectedOrg.name}`
              : `בקשת העברת בעלות תישלח למנהל/ת הנוכחי/ת של ${selectedOrg.name}`}
          </span>
        </div>
      )}

      {orgs.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={!selected || submitting}
          style={{
            ...btnPrimary, marginTop: "14px",
            opacity: !selected || submitting ? 0.5 : 1,
            cursor: !selected || submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "שולח..." : joinType === "staff" ? "שליחת בקשת הצטרפות" : "שליחת בקשת העברה"}
        </button>
      )}
    </div>
  );
}

// ─── Step: Transfer Pending ───────────────────────────────────────────────────

function TransferPendingStep() {
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{
        width: "64px", height: "64px", borderRadius: "50%",
        background: "#EDE9FE", border: "1.5px solid #C4B5FD",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px",
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5B21B6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 16l-4-4 4-4M17 8l4 4-4 4M14 4l-4 16"/>
        </svg>
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 10px" }}>
        בקשת העברה נשלחה
      </h2>
      <p style={{ fontSize: "13.5px", color: INK2, lineHeight: 1.7, margin: "0 0 22px" }}>
        המנהל/ת הנוכחי/ת של בית הספר יקבל/תקבל התראה ויצטרך/תצטרך לאשר.<br/>
        לאחר אישור — תוכל/י להיכנס כבעלים החדשים.
      </p>

      <div style={{
        background: "#FFFBEB", border: "1px solid #FCD34D",
        borderRadius: "10px", padding: "13px 16px",
        fontSize: "13px", color: "#78350F", lineHeight: 1.65,
        display: "flex", gap: "10px", alignItems: "flex-start",
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "2px" }}>
          <path d="M8 2L14.5 13H1.5L8 2z" stroke="#F59E0B" strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="M8 6v3" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="0.7" fill="#F59E0B"/>
        </svg>
        <span>ניתן לסגור את הדפדפן. תקבל/י הודעה כשהבקשה תאושר.</span>
      </div>
    </div>
  );
}

// ─── Step: Pending ────────────────────────────────────────────────────────────

function PendingStep() {
  const [approved, setApproved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tick, setTick] = useState(0);

  const checkStatus = useCallback(async (manual = false) => {
    if (manual) setChecking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { if (manual) setChecking(false); return; }
    const { data: mem } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (manual) setChecking(false);
    if (mem) {
      setApproved(true);
      setTimeout(() => { window.location.href = "/dashboard"; }, 1200);
    } else {
      if (!manual) setTick(t => t + 1); // bump tick to show "still waiting"
    }
  }, []);

  // Auto-poll every 6 seconds
  useEffect(() => {
    checkStatus(); // immediate first check
    const id = setInterval(() => checkStatus(), 6000);
    return () => clearInterval(id);
  }, [checkStatus]);

  if (approved) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: "#EDFBF3", border: "2px solid #4A8C62",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D6644" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#166534", margin: "0 0 8px" }}>
          אושרת! 🎉
        </h2>
        <p style={{ fontSize: "13.5px", color: INK2, margin: 0 }}>נכנס/ת למערכת...</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      {/* Animated waiting icon */}
      <div style={{
        width: "64px", height: "64px", borderRadius: "50%",
        background: "#EDFBF3", border: `1.5px solid #B6E8C4`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px", position: "relative",
      }}>
        <IconMail color={GREEN} />
        {/* Pulse ring */}
        <div style={{
          position: "absolute", inset: "-6px",
          borderRadius: "50%",
          border: "2px solid rgba(45,102,68,0.2)",
          animation: "pulse-ring 2s ease-in-out infinite",
        }} />
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(0.92); opacity: 0.8; }
          50%  { transform: scale(1.06); opacity: 0.2; }
          100% { transform: scale(0.92); opacity: 0.8; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <h2 style={{ fontSize: "18px", fontWeight: "500", color: INK, margin: "0 0 10px" }}>
        הבקשה נשלחה!
      </h2>
      <p style={{ fontSize: "13.5px", color: INK2, lineHeight: 1.7, margin: "0 0 20px" }}>
        הבקשה הועברה למנהל/ת בית הספר לאישור.<br/>
        תקבל/י עדכון אוטומטי ברגע שיאשרו.
      </p>

      {/* Auto-check status indicator */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        background: "#F8F5F0", borderRadius: "10px", padding: "10px 16px",
        marginBottom: "18px", fontSize: "12.5px", color: INK3,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={INK3} strokeWidth="2" strokeLinecap="round" style={{ animation: "spin-slow 3s linear infinite", flexShrink: 0 }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        בודק אוטומטית כל 6 שניות
        {tick > 0 && <span style={{ color: INK3, fontSize: "11px" }}>({tick})</span>}
      </div>

      <button
        type="button"
        onClick={() => checkStatus(true)}
        disabled={checking}
        style={{
          ...btnPrimary,
          marginBottom: "12px",
          opacity: checking ? 0.7 : 1,
          cursor: checking ? "not-allowed" : "pointer",
        }}
      >
        {checking ? "בודק..." : "בדוק עכשיו"}
      </button>

      {false && (
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
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("choose");
  const [newOrgId, setNewOrgId] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string>("");

  // On mount: detect pending OR active-but-incomplete-setup membership
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("organization_members")
        .select("status, organization_id, role, organizations(id, name, setup_completed_at)")
        .eq("user_id", data.user.id)
        .in("status", ["pending", "active"])
        .maybeSingle()
        .then(({ data: mem }) => {
          if (!mem) return;
          if (mem.status === "pending") {
            setStep("pending");
          } else if (mem.status === "active") {
            const org = mem.organizations as { id: string; name: string; setup_completed_at: string | null } | null;
            if (org && !org.setup_completed_at && mem.role === "owner") {
              setNewOrgId(org.id);
              setResumeName(org.name);
              setStep("resume-setup");
            }
          }
        });
    });
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(150deg, #F3EEE8 0%, #FAFAF7 60%, #EEF4F0 100%)",
      fontFamily: f, padding: "24px",
    }}>
      <div style={{
        background: "#fff", border: `1px solid ${BORDER}`,
        borderRadius: isMobile ? "16px" : "20px", padding: isMobile ? "24px 20px" : "40px 36px",
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
        {step === "join-org"   && <JoinOrgStep onBack={() => setStep("choose")} onSuccess={() => setStep("pending")} onTransfer={() => setStep("transfer-pending")} />}
        {step === "pending"    && <PendingStep />}
        {step === "transfer-pending" && <TransferPendingStep />}
        {step === "resume-setup" && newOrgId && (
          <ResumeSetupStep
            orgName={resumeName}
            orgId={newOrgId}
            onContinue={() => setStep("sources")}
            onSkip={() => navigate({ to: "/dashboard", replace: true })}
          />
        )}
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
