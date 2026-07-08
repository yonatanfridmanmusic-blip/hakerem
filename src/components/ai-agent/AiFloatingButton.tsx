import { useIsMobile } from "@/hooks/use-is-mobile";
import { useAiAgent } from "./AiAgentContext";

export function AiFloatingButton() {
  const { isOpen, open } = useAiAgent();
  const isMobile = useIsMobile();

  if (isOpen) return null;

  // On mobile: sit above the bottom tab bar (60px) + extra spacing
  const bottomOffset = isMobile
    ? "calc(68px + env(safe-area-inset-bottom, 0px))"
    : "28px";

  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="פתח סוכן AI"
      style={{
        position: "fixed",
        bottom: bottomOffset,
        left: isMobile ? "16px" : "28px",
        zIndex: 1000,
        width: isMobile ? "46px" : "52px",
        height: isMobile ? "46px" : "52px",
        borderRadius: "50%",
        background: "linear-gradient(145deg, #2D6644 0%, #1A3D2B 100%)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 20px rgba(29, 61, 43, 0.45), 0 1px 0 rgba(255,255,255,0.12) inset",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(29, 61, 43, 0.55), 0 1px 0 rgba(255,255,255,0.12) inset";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(29, 61, 43, 0.45), 0 1px 0 rgba(255,255,255,0.12) inset";
      }}
    >
      {/* Sparkle / AI icon */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.9)" />
        <path d="M19 15L19.8 17.2L22 18L19.8 18.8L19 21L18.2 18.8L16 18L18.2 17.2L19 15Z" fill="rgba(255,255,255,0.6)" />
        <path d="M5 4L5.5 5.5L7 6L5.5 6.5L5 8L4.5 6.5L3 6L4.5 5.5L5 4Z" fill="rgba(255,255,255,0.5)" />
      </svg>
    </button>
  );
}
