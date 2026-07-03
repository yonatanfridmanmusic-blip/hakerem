import {
  useState,
  useRef,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { X, Plus, Trash2, Check, XCircle, SendHorizonal } from "lucide-react";
import { useAiAgent } from "./AiAgentContext";
import {
  useAiConversations,
  useAiMessages,
  useSendAiMessage,
  useConfirmAiAction,
  useDeleteAiConversation,
  type AiMessage,
  type ActionDraft,
} from "@/hooks/use-ai-agent";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL").format(n);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Confirm Card ──────────────────────────────────────────────────────────────

function ConfirmCard({
  draft,
  convId,
  onDone,
}: {
  draft: ActionDraft;
  convId: string;
  onDone: () => void;
}) {
  const confirm = useConfirmAiAction();
  const p = draft.preview;
  const isExpense = p.type === "add_expense";

  const handle = (approved: boolean) => {
    confirm.mutate(
      { actionDraftId: draft.id, conversationId: convId, approved },
      { onSuccess: onDone },
    );
  };

  return (
    <div style={{
      marginTop: "12px",
      borderRadius: "16px",
      overflow: "hidden",
      border: isExpense
        ? "1px solid rgba(239,68,68,0.25)"
        : "1px solid rgba(45,102,68,0.35)",
      background: isExpense
        ? "linear-gradient(145deg, rgba(30,12,12,0.9) 0%, rgba(20,8,8,0.9) 100%)"
        : "linear-gradient(145deg, rgba(12,30,20,0.9) 0%, rgba(8,20,14,0.9) 100%)",
      backdropFilter: "blur(16px)",
      boxShadow: isExpense
        ? "0 4px 24px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.04)"
        : "0 4px 24px rgba(45,102,68,0.15), inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      {/* Color bar */}
      <div style={{
        height: "4px",
        background: isExpense
          ? "linear-gradient(90deg, #ef4444 0%, #f97316 100%)"
          : "linear-gradient(90deg, #2D6644 0%, #4ade80 100%)",
      }} />

      <div style={{ padding: "16px 18px 18px" }}>
        {/* Label row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <div style={{
              width: "26px",
              height: "26px",
              borderRadius: "8px",
              background: isExpense ? "rgba(239,68,68,0.15)" : "rgba(45,102,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
            }}>
              {isExpense ? "📤" : "📥"}
            </div>
            <span style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: isExpense ? "#f87171" : "#4ade80",
            }}>
              {isExpense ? "אישור הוצאה" : "אישור הכנסה"}
            </span>
          </div>
          <span style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.05)",
            padding: "3px 9px",
            borderRadius: "20px",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            {p.source_label}
          </span>
        </div>

        {/* Amount + description */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            fontSize: "28px",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
            marginBottom: "5px",
          }}>
            ₪{fmt(p.amount)}
          </div>
          <div style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.82)",
            fontWeight: 500,
            lineHeight: 1.4,
          }}>
            {p.description}
          </div>
          <div style={{
            display: "flex",
            gap: "12px",
            marginTop: "6px",
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
              📅 {p.date}
            </span>
            {p.category_name && (
              <span style={{ fontSize: "12px", color: isExpense ? "rgba(249,115,22,0.75)" : "rgba(74,222,128,0.75)", fontWeight: 500 }}>
                📂 {p.category_name}
              </span>
            )}
            {p.supplier && (
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                🏢 {p.supplier}
              </span>
            )}
            {p.payer && (
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                👤 {p.payer}
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{
          height: "1px",
          background: "rgba(255,255,255,0.06)",
          marginBottom: "14px",
        }} />

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => handle(true)}
            disabled={confirm.isPending}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: "12px",
              background: confirm.isPending
                ? "rgba(45,102,68,0.4)"
                : "linear-gradient(135deg, #2D6644 0%, #1e4d32 100%)",
              border: "none",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: confirm.isPending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              transition: "all 0.18s ease",
              fontFamily: "Rubik, sans-serif",
              boxShadow: confirm.isPending ? "none" : "0 2px 12px rgba(45,102,68,0.35)",
            }}
            onMouseEnter={e => {
              if (!confirm.isPending) {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(45,102,68,0.5)";
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = confirm.isPending ? "none" : "0 2px 12px rgba(45,102,68,0.35)";
            }}
          >
            {confirm.isPending ? (
              <span style={{
                width: "14px", height: "14px", borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite",
                display: "inline-block",
              }} />
            ) : (
              <Check size={15} strokeWidth={2.5} />
            )}
            {confirm.isPending ? "מבצע..." : "אישור"}
          </button>
          <button
            type="button"
            onClick={() => handle(false)}
            disabled={confirm.isPending}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.55)",
              fontSize: "14px",
              cursor: confirm.isPending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              fontFamily: "Rubik, sans-serif",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              if (!confirm.isPending) {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)";
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
            }}
          >
            <XCircle size={15} />
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  convId,
  pendingDraft,
  onDraftDone,
  isOptimistic,
}: {
  msg: AiMessage | { id: string; role: "user"; content: string; metadata: null; created_at: string };
  convId: string | null;
  pendingDraft: ActionDraft | null;
  onDraftDone: () => void;
  isOptimistic?: boolean;
}) {
  const isUser = msg.role === "user";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-start" : "flex-end",
      marginBottom: "16px",
      opacity: isOptimistic ? 0.75 : 1,
      transition: "opacity 0.2s ease",
    }}>
      {/* Agent label */}
      {!isUser && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "6px",
          paddingInlineEnd: "4px",
        }}>
          <div style={{
            width: "20px",
            height: "20px",
            borderRadius: "6px",
            background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 1px 4px rgba(45,102,68,0.4)",
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.95)" />
            </svg>
          </div>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: 500, letterSpacing: "0.02em" }}>
            סוכן הכרם
          </span>
        </div>
      )}

      {/* Bubble */}
      <div style={{
        maxWidth: "85%",
        padding: isUser ? "10px 14px" : "12px 16px",
        borderRadius: isUser ? "20px 5px 20px 20px" : "5px 20px 20px 20px",
        background: isUser
          ? "linear-gradient(145deg, rgba(60,80,70,0.55) 0%, rgba(40,60,50,0.55) 100%)"
          : "linear-gradient(145deg, rgba(22,48,34,0.85) 0%, rgba(14,32,22,0.85) 100%)",
        border: isUser
          ? "1px solid rgba(255,255,255,0.1)"
          : "1px solid rgba(45,102,68,0.22)",
        backdropFilter: "blur(12px)",
        fontSize: "13.5px",
        lineHeight: 1.7,
        color: isUser ? "rgba(255,255,255,0.9)" : "#fff",
        direction: "rtl",
        textAlign: "right",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        boxShadow: isUser
          ? "0 1px 8px rgba(0,0,0,0.2)"
          : "0 2px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        {msg.content}
      </div>

      {/* Confirm card */}
      {!isUser && msg.metadata?.action_draft_id && pendingDraft && convId && (
        <div style={{ maxWidth: "96%", width: "100%" }}>
          <ConfirmCard draft={pendingDraft} convId={convId} onDone={onDraftDone} />
        </div>
      )}

      {/* Time */}
      {!isOptimistic && (
        <span style={{
          fontSize: "10px",
          color: "rgba(255,255,255,0.2)",
          marginTop: "4px",
          paddingInline: "5px",
          letterSpacing: "0.02em",
        }}>
          {formatTime(msg.created_at)}
        </span>
      )}
    </div>
  );
}

// ─── Typing indicator ──────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      marginBottom: "16px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "6px",
        paddingInlineEnd: "4px",
      }}>
        <div style={{
          width: "20px", height: "20px", borderRadius: "6px",
          background: "linear-gradient(135deg, #2D6644, #1A3D2B)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(45,102,68,0.4)",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.95)" />
          </svg>
        </div>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
          סוכן הכרם
        </span>
      </div>
      <div style={{
        padding: "12px 16px",
        borderRadius: "5px 20px 20px 20px",
        background: "linear-gradient(145deg, rgba(22,48,34,0.85) 0%, rgba(14,32,22,0.85) 100%)",
        border: "1px solid rgba(45,102,68,0.22)",
        backdropFilter: "blur(12px)",
        display: "flex",
        gap: "6px",
        alignItems: "center",
        boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "rgba(45,102,68,0.9)",
            animation: `dot-bounce 1.2s ${i * 0.16}s ease-in-out infinite`,
            display: "block",
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Conversation List ─────────────────────────────────────────────────────────

function ConvList({
  currentId,
  onSelect,
  onNew,
}: {
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const { data: convs = [] } = useAiConversations();
  const del = useDeleteAiConversation();

  return (
    <div style={{
      width: "200px",
      flexShrink: 0,
      borderInlineEnd: "1px solid rgba(255,255,255,0.055)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "rgba(0,0,0,0.18)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 14px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.045)",
      }}>
        <div style={{
          fontSize: "9.5px",
          fontWeight: 700,
          color: "rgba(255,255,255,0.25)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}>
          שיחות שמורות
        </div>
      </div>

      {/* New button */}
      <div style={{ padding: "10px 10px 6px" }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "9px",
            background: "rgba(45,102,68,0.15)",
            border: "1px dashed rgba(45,102,68,0.4)",
            color: "rgba(255,255,255,0.55)",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            direction: "rtl",
            fontFamily: "Rubik, sans-serif",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "rgba(45,102,68,0.28)";
            el.style.borderColor = "rgba(45,102,68,0.6)";
            el.style.color = "rgba(255,255,255,0.85)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "rgba(45,102,68,0.15)";
            el.style.borderColor = "rgba(45,102,68,0.4)";
            el.style.color = "rgba(255,255,255,0.55)";
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          שיחה חדשה
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
        {convs.length === 0 && (
          <div style={{
            padding: "20px 10px",
            color: "rgba(255,255,255,0.18)",
            fontSize: "12px",
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            עוד אין שיחות
          </div>
        )}
        {convs.map(c => (
          <div
            key={c.id}
            className="conv-row"
            style={{ position: "relative", marginBottom: "2px" }}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              style={{
                width: "100%",
                textAlign: "right",
                padding: "8px 30px 8px 10px",
                borderRadius: "8px",
                background: c.id === currentId ? "rgba(45,102,68,0.22)" : "transparent",
                border: c.id === currentId ? "1px solid rgba(45,102,68,0.32)" : "1px solid transparent",
                color: c.id === currentId ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)",
                fontSize: "12px",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                direction: "rtl",
                fontFamily: "Rubik, sans-serif",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                if (c.id !== currentId) {
                  el.style.background = "rgba(255,255,255,0.045)";
                  el.style.color = "rgba(255,255,255,0.7)";
                }
                const btn = el.parentElement?.querySelector(".del-btn") as HTMLElement | null;
                if (btn) btn.style.opacity = "1";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                if (c.id !== currentId) {
                  el.style.background = "transparent";
                  el.style.color = "rgba(255,255,255,0.45)";
                }
                const btn = el.parentElement?.querySelector(".del-btn") as HTMLElement | null;
                if (btn) btn.style.opacity = "0";
              }}
            >
              {c.title}
            </button>
            <button
              type="button"
              className="del-btn"
              onClick={e => { e.stopPropagation(); del.mutate(c.id); }}
              style={{
                position: "absolute",
                left: "5px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "rgba(255,100,100,0.5)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                opacity: 0,
                transition: "opacity 0.15s",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick suggestions ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "כמה נשאר בתקציב גפן?",
  "מה הוצאנו החודש?",
  "סיכום כל המקורות",
  "תכניס הוצאה חדשה",
];

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "22px",
      padding: "0 28px 48px",
    }}>
      {/* Icon */}
      <div style={{
        width: "64px",
        height: "64px",
        borderRadius: "20px",
        background: "linear-gradient(145deg, rgba(45,102,68,0.3) 0%, rgba(26,61,43,0.3) 100%)",
        border: "1px solid rgba(45,102,68,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 48px rgba(45,102,68,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
        position: "relative",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.8)" />
          <path d="M19 15L19.8 17.2L22 18L19.8 18.8L19 21L18.2 18.8L16 18L18.2 17.2L19 15Z" fill="rgba(255,255,255,0.35)" />
          <path d="M5 4L5.5 5.5L7 6L5.5 6.5L5 8L4.5 6.5L3 6L4.5 5.5L5 4Z" fill="rgba(255,255,255,0.25)" />
        </svg>
      </div>

      {/* Text */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "17px", fontWeight: 600, color: "#fff", marginBottom: "7px", letterSpacing: "-0.2px" }}>
          שאל אותי כל שאלה
        </div>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", lineHeight: 1.7 }}>
          אני יכול לענות על שאלות פיננסיות,<br />
          לרשום הוצאות והכנסות, ולסכם נתונים.
        </div>
      </div>

      {/* Chips */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        justifyContent: "center",
        maxWidth: "340px",
      }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggest(s)}
            style={{
              padding: "8px 14px",
              borderRadius: "22px",
              background: "rgba(45,102,68,0.14)",
              border: "1px solid rgba(45,102,68,0.3)",
              color: "rgba(255,255,255,0.6)",
              fontSize: "12.5px",
              cursor: "pointer",
              fontFamily: "Rubik, sans-serif",
              direction: "rtl",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "rgba(45,102,68,0.28)";
              el.style.borderColor = "rgba(45,102,68,0.55)";
              el.style.color = "rgba(255,255,255,0.9)";
              el.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "rgba(45,102,68,0.14)";
              el.style.borderColor = "rgba(45,102,68,0.3)";
              el.style.color = "rgba(255,255,255,0.6)";
              el.style.transform = "translateY(0)";
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

export function AiChatPanel() {
  const { isOpen, close, currentConvId, setCurrentConvId } = useAiAgent();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, ActionDraft>>({});
  const [mounted, setMounted] = useState(false);
  const [optimisticMsg, setOptimisticMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [] } = useAiMessages(currentConvId);
  const send = useSendAiMessage();

  // Mount animation
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  // Clear optimistic message once the real message arrives in DB
  useEffect(() => {
    if (optimisticMsg && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
      if (lastUserMsg?.content === optimisticMsg) {
        setOptimisticMsg(null);
      }
    }
  }, [messages, optimisticMsg]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending, optimisticMsg]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const handleSend = (text?: string, e?: FormEvent) => {
    e?.preventDefault();
    const msg = (text ?? input).trim();
    if (!msg || send.isPending) return;
    setInput("");
    // Reset textarea height and keep focus
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
    // Show message immediately (optimistic)
    setOptimisticMsg(msg);
    send.mutate(
      { message: msg, conversationId: currentConvId },
      {
        onSuccess: (data) => {
          if (!currentConvId) setCurrentConvId(data.conversation_id);
          if (data.action_draft) {
            setPendingDrafts(prev => ({ ...prev, [data.conversation_id]: data.action_draft! }));
          }
        },
        onError: () => setOptimisticMsg(null),
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConv = () => {
    setCurrentConvId(null);
    setPendingDrafts({});
    setInput("");
    setOptimisticMsg(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (!isOpen) return null;

  const activeDraft = currentConvId ? pendingDrafts[currentConvId] ?? null : null;

  // Fake optimistic message object for rendering
  const optimisticMsgObj = optimisticMsg ? {
    id: "__optimistic__",
    role: "user" as const,
    content: optimisticMsg,
    metadata: null,
    created_at: new Date().toISOString(),
  } : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1099,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.25s ease",
          backdropFilter: mounted ? "blur(2px)" : "none",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 1100,
          width: sidebarOpen ? "720px" : "500px",
          maxWidth: "calc(100vw - 40px)",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(168deg, #142619 0%, #0c1c11 50%, #080f0b 100%)",
          boxShadow: "8px 0 64px rgba(0,0,0,0.75), 1px 0 0 rgba(255,255,255,0.04)",
          transform: mounted ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.32,0,0.08,1), width 0.22s cubic-bezier(0.4,0,0.2,1)",
          direction: "rtl",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "0 16px",
          height: "56px",
          borderBottom: "1px solid rgba(255,255,255,0.055)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
          background: "rgba(0,0,0,0.15)",
          backdropFilter: "blur(8px)",
        }}>
          {/* Sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? "הסתר שיחות" : "הצג שיחות"}
            style={{
              width: "30px", height: "30px",
              borderRadius: "8px",
              background: sidebarOpen ? "rgba(255,255,255,0.07)" : "transparent",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = sidebarOpen ? "rgba(255,255,255,0.07)" : "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
            }}
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <rect x="0" y="0" width="14" height="2" rx="1" fill="currentColor" />
              <rect x="0" y="4" width="9" height="2" rx="1" fill="currentColor" />
              <rect x="0" y="8" width="14" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>

          {/* Logo */}
          <div style={{
            width: "32px", height: "32px",
            borderRadius: "9px",
            background: "linear-gradient(145deg, #2D6644 0%, #1A3D2B 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 10px rgba(45,102,68,0.45)",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.95)" />
            </svg>
          </div>

          <div style={{ lineHeight: 1 }}>
            <div style={{
              fontSize: "14px", fontWeight: 600, color: "#fff",
              marginBottom: "3px", letterSpacing: "-0.1px",
            }}>
              סוכן הכרם
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <div style={{
                width: "5px", height: "5px", borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 5px rgba(74,222,128,0.6)",
                animation: "pulse-green 2.5s ease-in-out infinite",
              }} />
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)" }}>
                ניהול פיננסי בשפה טבעית
              </span>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* New conversation */}
          <button
            type="button"
            onClick={handleNewConv}
            title="שיחה חדשה"
            style={{
              width: "30px", height: "30px",
              borderRadius: "8px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.35)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(45,102,68,0.2)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(45,102,68,0.4)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)";
            }}
          >
            <Plus size={15} strokeWidth={2} />
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={close}
            title="סגור"
            style={{
              width: "30px", height: "30px",
              borderRadius: "8px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.35)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,60,60,0.12)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,100,100,0.8)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,60,60,0.2)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)";
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          {sidebarOpen && (
            <ConvList
              currentId={currentConvId}
              onSelect={id => { setCurrentConvId(id); setPendingDrafts({}); setOptimisticMsg(null); }}
              onNew={handleNewConv}
            />
          )}

          {/* Chat area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 22px 16px",
              display: "flex",
              flexDirection: "column",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.08) transparent",
            }}>
              {messages.length === 0 && !send.isPending && !optimisticMsg && (
                <EmptyState onSuggest={t => handleSend(t)} />
              )}

              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  convId={currentConvId}
                  pendingDraft={
                    msg.metadata?.action_draft_id && activeDraft?.id === msg.metadata.action_draft_id
                      ? activeDraft
                      : null
                  }
                  onDraftDone={() => {
                    if (currentConvId) {
                      setPendingDrafts(prev => {
                        const next = { ...prev };
                        delete next[currentConvId];
                        return next;
                      });
                    }
                  }}
                />
              ))}

              {/* Optimistic user message — shown immediately after sending */}
              {optimisticMsgObj && (
                <MessageBubble
                  key="__optimistic__"
                  msg={optimisticMsgObj}
                  convId={currentConvId}
                  pendingDraft={null}
                  onDraftDone={() => {}}
                  isOptimistic
                />
              )}

              {send.isPending && <TypingDots />}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input ── */}
            <div style={{
              padding: "10px 16px 16px",
              borderTop: "1px solid rgba(255,255,255,0.055)",
              flexShrink: 0,
              background: "rgba(0,0,0,0.12)",
            }}>
              <form
                onSubmit={e => { e.preventDefault(); handleSend(); }}
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-end",
                  background: "rgba(255,255,255,0.045)",
                  border: "1.5px solid rgba(255,255,255,0.085)",
                  borderRadius: "14px",
                  padding: "4px 4px 4px 8px",
                  transition: "border-color 0.18s ease, box-shadow 0.18s ease",
                }}
                onFocusCapture={e => {
                  (e.currentTarget as HTMLFormElement).style.borderColor = "rgba(45,102,68,0.6)";
                  (e.currentTarget as HTMLFormElement).style.boxShadow = "0 0 0 3px rgba(45,102,68,0.12)";
                }}
                onBlurCapture={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    (e.currentTarget as HTMLFormElement).style.borderColor = "rgba(255,255,255,0.085)";
                    (e.currentTarget as HTMLFormElement).style.boxShadow = "none";
                  }
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="שאל שאלה או בקש פעולה..."
                  disabled={send.isPending}
                  rows={1}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    padding: "9px 4px 9px 0",
                    color: "#fff",
                    fontSize: "14px",
                    resize: "none",
                    outline: "none",
                    fontFamily: "Rubik, sans-serif",
                    direction: "rtl",
                    minHeight: "38px",
                    maxHeight: "120px",
                    lineHeight: 1.55,
                    opacity: send.isPending ? 0.5 : 1,
                  }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || send.isPending}
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "10px",
                    background: input.trim() && !send.isPending
                      ? "linear-gradient(135deg, #2D6644 0%, #1e5234 100%)"
                      : "rgba(255,255,255,0.04)",
                    border: "none",
                    cursor: input.trim() && !send.isPending ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.18s ease",
                    alignSelf: "flex-end",
                    marginBottom: "1px",
                    boxShadow: input.trim() && !send.isPending
                      ? "0 2px 8px rgba(45,102,68,0.4)"
                      : "none",
                  }}
                  onMouseEnter={e => {
                    if (input.trim() && !send.isPending) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 3px 12px rgba(45,102,68,0.55)";
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = input.trim() && !send.isPending ? "0 2px 8px rgba(45,102,68,0.4)" : "none";
                  }}
                >
                  <SendHorizonal
                    size={16}
                    strokeWidth={2}
                    color={input.trim() && !send.isPending ? "#fff" : "rgba(255,255,255,0.18)"}
                    style={{ transform: "scaleX(-1)" }}
                  />
                </button>
              </form>
              <div style={{
                marginTop: "8px",
                fontSize: "10.5px",
                color: "rgba(255,255,255,0.16)",
                textAlign: "center",
                letterSpacing: "0.01em",
              }}>
                Enter לשליחה · Shift+Enter לשורה חדשה · תמיד שואל אישור לפני ביצוע
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes dot-bounce {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0) scale(0.85); }
          30% { opacity: 1; transform: translateY(-5px) scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-green {
          0%, 100% { opacity: 1; box-shadow: 0 0 5px rgba(74,222,128,0.6); }
          50% { opacity: 0.5; box-shadow: 0 0 3px rgba(74,222,128,0.3); }
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </>
  );
}
