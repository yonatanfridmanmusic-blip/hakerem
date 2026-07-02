import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrganization, useAllOrganizations, useRequestJoinOrg } from "@/hooks/use-organization";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { redirect } = await import("@tanstack/react-router");
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });

    // If user already has an active org, skip onboarding
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "choose" | "create-org" | "join-org" | "pending";

// ─── Logo ─────────────────────────────────────────────────────────────────────

const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px", justifyContent: "center" }}>
    <div style={{
      width: "44px", height: "44px",
      background: "linear-gradient(145deg, #2D6644, #1A3D2B)",
      borderRadius: "12px",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 12px rgba(26,61,43,0.3)",
    }}>
      <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
        <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(122,170,142,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/><circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
        <circle cx="24" cy="14" r="5.5" fill="#5AA674"/><circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
        <circle cx="18" cy="23" r="5.5" fill="#4A8C62"/><circle cx="16.2" cy="21.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
      </svg>
    </div>
    <span style={{ fontSize: "22px", fontWeight: "700", color: "#1A3D2B", letterSpacing: "-0.4px" }}>הכרם</span>
  </div>
);

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  border: "1.5px solid #D4DDD6", borderRadius: "9px",
  fontSize: "14px", background: "#fff", color: "#1A1A1A",
  outline: "none", fontFamily: "Rubik, sans-serif",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  width: "100%", padding: "12px 0",
  background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
  color: "#fff", border: "none", borderRadius: "9px",
  fontSize: "15px", fontWeight: "600",
  fontFamily: "Rubik, sans-serif", cursor: "pointer",
  boxShadow: "0 3px 12px rgba(26,61,43,0.3)",
};

// ─── Step: Choose ─────────────────────────────────────────────────────────────

function ChooseStep({ onChoose }: { onChoose: (step: Step) => void }) {
  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 8px", textAlign: "center" }}>
        ברוכים הבאים להכרם!
      </h2>
      <p style={{ fontSize: "14px", color: "#6B6560", margin: "0 0 32px", textAlign: "center", lineHeight: 1.6 }}>
        כיצד תרצה להתחיל?
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <ChoiceCard
          emoji="🏫"
          title="אני מנהל/ת בית ספר"
          subtitle="אצור חשבון חדש לבית הספר שלי"
          onClick={() => onChoose("create-org")}
        />
        <ChoiceCard
          emoji="👥"
          title="אני חבר/ת צוות"
          subtitle="אצטרף לבית ספר קיים במערכת"
          onClick={() => onChoose("join-org")}
        />
      </div>
    </div>
  );
}

function ChoiceCard({ emoji, title, subtitle, onClick }: {
  emoji: string; title: string; subtitle: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: "16px",
        padding: "18px 20px", background: hover ? "#F0F7F3" : "#fff",
        border: hover ? "1.5px solid #2D6644" : "1.5px solid #E2EAE5",
        borderRadius: "12px", cursor: "pointer",
        fontFamily: "Rubik, sans-serif", textAlign: "right",
        transition: "all 0.15s",
        width: "100%",
      }}
    >
      <span style={{ fontSize: "28px", flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "15px", fontWeight: "600", color: "#1A1A1A", marginBottom: "3px" }}>{title}</div>
        <div style={{ fontSize: "12.5px", color: "#6B6560" }}>{subtitle}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(180deg)", flexShrink: 0 }}>
        <path d="M10 12L6 8l4-4" stroke="#AAA099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

// ─── Step: Create Org ─────────────────────────────────────────────────────────

function CreateOrgStep({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const createOrg = useCreateOrganization();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("נא להזין שם בית הספר"); return; }
    try {
      await createOrg.mutateAsync({ name: name.trim(), city: city.trim() || undefined });
      toast.success(`בית הספר "${name}" נוצר בהצלחה!`);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הארגון");
    }
  };

  return (
    <div>
      <BackBtn onClick={onBack} />
      <h2 style={{ fontSize: "19px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 6px" }}>
        הגדרת בית הספר
      </h2>
      <p style={{ fontSize: "13px", color: "#6B6560", margin: "0 0 28px", lineHeight: 1.6 }}>
        פרטים אלו יופיעו בכל הדוחות והמסמכים שלך.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Field label="שם בית הספר *">
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder='לדוגמה: בית ספר כרמים'
            required
          />
        </Field>
        <Field label="עיר">
          <input
            style={inputStyle}
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder='לדוגמה: תל אביב'
          />
        </Field>

        <div style={{
          background: "#EDFBF3", border: "1px solid #B6DFC4",
          borderRadius: "9px", padding: "12px 16px",
          fontSize: "13px", color: "#166534", lineHeight: 1.6,
        }}>
          לאחר יצירת בית הספר תוכלי להזמין את המזכירה ושאר הצוות מתוך ההגדרות.
        </div>

        <button type="submit" disabled={createOrg.isPending} style={btnPrimary}>
          {createOrg.isPending ? "יוצר..." : "יצירת בית הספר וכניסה"}
        </button>
      </form>
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
      // If already requested
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
      <h2 style={{ fontSize: "19px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 6px" }}>
        הצטרפות לבית ספר
      </h2>
      <p style={{ fontSize: "13px", color: "#6B6560", margin: "0 0 20px" }}>
        בחר את בית הספר שלך. מנהל/ת בית הספר תאשר את הצטרפותך.
      </p>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "24px", color: "#AAA099", fontSize: "14px" }}>טוען...</div>
      ) : orgs.length === 0 ? (
        <div style={{
          background: "#FFF8E1", border: "1px solid #F5D87A",
          borderRadius: "9px", padding: "16px", fontSize: "13.5px", color: "#78600A",
        }}>
          לא נמצאו בתי ספר רשומים במערכת. בקש ממנהלת בית הספר שלך להירשם תחילה.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {orgs.map(org => (
            <button
              key={org.id}
              onClick={() => setSelected(org.id)}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "14px 16px", textAlign: "right", width: "100%",
                background: selected === org.id ? "#EDFBF3" : "#fff",
                border: selected === org.id ? "1.5px solid #2D6644" : "1.5px solid #E2EAE5",
                borderRadius: "10px", cursor: "pointer",
                fontFamily: "Rubik, sans-serif", transition: "all 0.12s",
              }}
            >
              <div style={{
                width: "34px", height: "34px", borderRadius: "8px",
                background: selected === org.id ? "#2D6644" : "#E8F0EA",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px", flexShrink: 0,
              }}>
                🏫
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#1A1A1A" }}>{org.name}</div>
                {org.city && <div style={{ fontSize: "12px", color: "#6B6560", marginTop: "2px" }}>{org.city}</div>}
              </div>
              {selected === org.id && (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="9" fill="#2D6644"/>
                  <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {orgs.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={!selected || requestJoin.isPending}
          style={{
            ...btnPrimary,
            opacity: !selected ? 0.5 : 1,
            cursor: !selected ? "not-allowed" : "pointer",
          }}
        >
          {requestJoin.isPending ? "שולח בקשה..." : "שליחת בקשת הצטרפות"}
        </button>
      )}
    </div>
  );
}

// ─── Step: Pending ────────────────────────────────────────────────────────────

function PendingStep() {
  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      <div style={{ fontSize: "52px", marginBottom: "16px" }}>✉️</div>
      <h2 style={{ fontSize: "19px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 12px" }}>
        הבקשה נשלחה!
      </h2>
      <p style={{ fontSize: "14px", color: "#6B6560", lineHeight: 1.7, margin: "0 0 24px" }}>
        הבקשה נשלחה למנהל/ת בית הספר לאישור.
        ברגע שתאושר — תוכל/י להיכנס ולהתחיל לעבוד.
      </p>
      <div style={{
        background: "#EDFBF3", border: "1px solid #B6DFC4",
        borderRadius: "10px", padding: "14px 18px",
        fontSize: "13.5px", color: "#166534", lineHeight: 1.6,
      }}>
        ניתן לסגור את הדפדפן ולחזור מאוחר יותר.
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function OnboardingPage() {
  const [step, setStep] = useState<Step>("choose");

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #F0F7F3 0%, #F7F4EF 100%)",
      fontFamily: "Rubik, sans-serif", padding: "24px",
    }}>
      <div style={{
        background: "#fff", border: "1px solid #E2EAE5",
        borderRadius: "18px", padding: "40px 36px",
        width: "100%", maxWidth: "420px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
      }}>
        <Logo />

        {step === "choose"     && <ChooseStep onChoose={setStep} />}
        {step === "create-org" && <CreateOrgStep onBack={() => setStep("choose")} />}
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
      <label style={{ fontSize: "12px", fontWeight: "500", color: "#4A6656", display: "block", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "6px",
      background: "none", border: "none", cursor: "pointer",
      fontSize: "13px", color: "#6B6560", padding: "0 0 20px",
      fontFamily: "Rubik, sans-serif",
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6 12l4-4-4-4" stroke="#6B6560" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      חזרה
    </button>
  );
}
