import {
  useState,
  useRef,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { X, Plus, Trash2, ChevronLeft, ChevronRight, Check } from "lucide-react";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL").format(n);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

// ─── Confirmation Card ────────────────────────────────────────────────────────

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
  const label = isExpense ? "הוצאה" : "הכנסה";
  const color = isExpense ? "#B91C1C" : "#2D6644";

  const handle = (approved: boolean) => {
    confirm.mutate(
      { actionDraftId: draft.id, conversationId: convId, approved },
      { onSuccess: onDone },
    );
  };

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "14px 16px",
        borderRadius: "12px",
        background: "rgba(255,255,255,0.06)",
        border: `1px solid rgba(255,255,255,0.12)`,
        direction: "rtl",
      }}
    >
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontWeight: 500 }}>
        ✋ ממתין לאישורך
      </div>
      <div style={{ fontSize: "13.5px", color: "#fff", marginBottom: "10px", lineHeight: 1.5 }}>
        <span style={{ color, fontWeight: 600 }}>{label}</span>
        {" "}&nbsp;
        <span style={{ fontWeight: 700, fontSize: "15px" }}>₪{fmt(p.amount)}</span>
        {" · "}{p.description}
        {" · "}<span style={{ color: "rgba(255,255,255,0.65)" }}>{p.source_label}</span>
        {" · "}<span style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>{p.date}</span>
        {p.supplier ? <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>{" · "}{p.supplier}</span> : null}
        {p.payer ? <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>{" · "}{p.payer}</span> : null}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => handle(true)}
          disabled={confirm.isPending}
          style={{
            flex: 1,
            padding: "7px 0",
            borderRadius: "8px",
            background: "#2D6644",
            border: "none",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: confirm.isPending ? "not-allowed" : "pointer",
            opacity: confirm.isPending ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
          }}
        >
          <Check size={13} />
          אשר
        </button>
        <button
          type="button"
          onClick={() => handle(false)}
          disabled={confirm.isPending}
          style={{
            flex: 1,
            padding: "7px 0",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.7)",
            fontSize: "13px",
            cursor: confirm.isPending ? "not-allowed" : "pointer",
            opacity: confirm.isPending ? 0.7 : 1,
          }}
        >
          בטל
        </button>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  convId,
  pendingDraft,
  onDraftDone,
}: {
  msg: AiMessage;
  convId: string;
  pendingDraft: ActionDraft | null;
  onDraftDone: () => void;
}) {
  const isUser = msg.role === "user";
  const hasDraft = !isUser && msg.metadata?.action_draft_id && pendingDraft;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-start" : "flex-end",
        marginBottom: "10px",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "10px 13px",
          borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          background: isUser
            ? "rgba(255,255,255,0.08)"
            : "linear-gradient(135deg, rgba(45,102,68,0.4) 0%, rgba(26,61,43,0.4) 100%)",
          border: isUser
            ? "1px solid rgba(255,255,255,0.1)"
            : "1px solid rgba(45,102,68,0.3)",
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: "#fff",
          direction: "rtl",
          textAlign: "right",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>

      {/* Confirmation card appears right after the assistant message that requested it */}
      {hasDraft && pendingDraft && (
        <div style={{ maxWidth: "95%", width: "100%", marginTop: "6px" }}>
          <ConfirmCard draft={pendingDraft} convId={convId} onDone={onDraftDone} />
        </div>
      )}

      <span
        style={{
          fontSize: "10px",
          color: "rgba(255,255,255,0.28)",
          marginTop: "3px",
          paddingInline: "4px",
        }}
      >
        {formatTime(msg.created_at)}
      </span>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        marginBottom: "10px",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderRadius: "4px 16px 16px 16px",
          background: "linear-gradient(135deg, rgba(45,102,68,0.35) 0%, rgba(26,61,43,0.35) 100%)",
          border: "1px solid rgba(45,102,68,0.25)",
          display: "flex",
          gap: "4px",
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.5)",
              animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Conversation List ────────────────────────────────────────────────────────

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
    <div
      style={{
        width: "200px",
        flexShrink: 0,
        borderInlineEnd: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          שיחות
        </div>
      </div>

      {/* New conversation */}
      <button
        type="button"
        onClick={onNew}
        style={{
          margin: "10px 10px 6px",
          padding: "8px 10px",
          borderRadius: "8px",
          background: "rgba(45,102,68,0.25)",
          border: "1px dashed rgba(45,102,68,0.5)",
          color: "rgba(255,255,255,0.7)",
          fontSize: "12.5px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          direction: "rtl",
        }}
      >
        <Plus size={13} />
        שיחה חדשה
      </button>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px" }}>
        {convs.map(c => (
          <div
            key={c.id}
            style={{ position: "relative", marginBottom: "2px" }}
            onMouseEnter={e => {
              const btn = e.currentTarget.querySelector(".del-btn") as HTMLElement | null;
              if (btn) btn.style.opacity = "1";
            }}
            onMouseLeave={e => {
              const btn = e.currentTarget.querySelector(".del-btn") as HTMLElement | null;
              if (btn) btn.style.opacity = "0";
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              style={{
                width: "100%",
                textAlign: "right",
                padding: "8px 28px 8px 10px",
                borderRadius: "7px",
                background: c.id === currentId ? "rgba(255,255,255,0.1)" : "transparent",
                border: c.id === currentId ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                color: c.id === currentId ? "#fff" : "rgba(255,255,255,0.55)",
                fontSize: "12.5px",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                direction: "rtl",
              }}
            >
              {c.title}
            </button>
            <button
              type="button"
              className="del-btn"
              onClick={e => {
                e.stopPropagation();
                del.mutate(c.id);
              }}
              style={{
                position: "absolute",
                left: "4px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.3)",
                cursor: "pointer",
                padding: "3px",
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
        {convs.length === 0 && (
          <div style={{ padding: "16px 10px", color: "rgba(255,255,255,0.25)", fontSize: "12px", textAlign: "center" }}>
            אין שיחות עדיין
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Chat Panel ──────────────────────────────────────────────────────────

export function AiChatPanel() {
  const { isOpen, close, currentConvId, setCurrentConvId } = useAiAgent();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, ActionDraft>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [] } = useAiMessages(currentConvId);
  const send = useSendAiMessage();

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput("");

    send.mutate(
      { message: text, conversationId: currentConvId },
      {
        onSuccess: (data) => {
          if (!currentConvId) setCurrentConvId(data.conversation_id);
          if (data.action_draft) {
            setPendingDrafts(prev => ({ ...prev, [data.conversation_id]: data.action_draft! }));
          }
        },
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleNewConv = () => {
    setCurrentConvId(null);
    setPendingDrafts({});
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (!isOpen) return null;

  const activeDraft = currentConvId ? pendingDrafts[currentConvId] ?? null : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 1099,
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
          width: sidebarOpen ? "720px" : "520px",
          maxWidth: "calc(100vw - 80px)",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(160deg, #1A2E22 0%, #0F1E16 60%, #0A1610 100%)",
          boxShadow: "8px 0 60px rgba(0,0,0,0.6)",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
          direction: "rtl",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          {/* Sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
            }}
          >
            {sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Logo + title */}
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              background: "linear-gradient(145deg, #2D6644 0%, #1A3D2B 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.9)" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>סוכן AI — הכרם</div>
            <div style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.35)" }}>ניהול פיננסי בשפה טבעית</div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Close */}
          <button
            type="button"
            onClick={close}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Conversation sidebar */}
          {sidebarOpen && (
            <ConvList
              currentId={currentConvId}
              onSelect={id => { setCurrentConvId(id); setPendingDrafts({}); }}
              onNew={handleNewConv}
            />
          )}

          {/* Chat area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 18px 10px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Empty state */}
              {messages.length === 0 && !send.isPending && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    paddingBottom: "40px",
                  }}
                >
                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "50%",
                      background: "linear-gradient(145deg, rgba(45,102,68,0.4) 0%, rgba(26,61,43,0.4) 100%)",
                      border: "1px solid rgba(45,102,68,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="rgba(255,255,255,0.7)" />
                      <path d="M19 15L19.8 17.2L22 18L19.8 18.8L19 21L18.2 18.8L16 18L18.2 17.2L19 15Z" fill="rgba(255,255,255,0.4)" />
                    </svg>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>
                      שאל אותי כל שאלה
                    </div>
                    <div style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
                      &quot;כמה נשאר בתקציב גפן?&quot;<br />
                      &quot;תכניס הוצאה 2,000 ₪ על טיול כיתה ד׳&quot;<br />
                      &quot;מה הוצאנו על ספרים החודש?&quot;
                    </div>
                  </div>
                </div>
              )}

              {/* Messages list */}
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  convId={currentConvId!}
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

              {/* Typing indicator */}
              {send.isPending && <TypingDots />}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input ── */}
            <div
              style={{
                padding: "12px 14px 16px",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                flexShrink: 0,
              }}
            >
              <form onSubmit={handleSend} style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="כתבי הודעה... (Enter לשליחה, Shift+Enter לשורה חדשה)"
                  disabled={send.isPending}
                  rows={1}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    color: "#fff",
                    fontSize: "13.5px",
                    resize: "none",
                    outline: "none",
                    fontFamily: "Rubik, sans-serif",
                    direction: "rtl",
                    minHeight: "42px",
                    maxHeight: "120px",
                    lineHeight: 1.5,
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
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: input.trim() && !send.isPending
                      ? "linear-gradient(135deg, #2D6644 0%, #1A3D2B 100%)"
                      : "rgba(255,255,255,0.06)",
                    border: "none",
                    cursor: input.trim() && !send.isPending ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                      stroke={input.trim() && !send.isPending ? "#fff" : "rgba(255,255,255,0.25)"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </form>
              <div style={{ marginTop: "6px", fontSize: "10.5px", color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
                הסוכן פועל עם Claude AI · תמיד שואל אישור לפני ביצוע
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </>
  );
}
