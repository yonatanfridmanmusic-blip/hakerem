import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface AiAgentContextValue {
  isOpen: boolean;
  currentConvId: string | null;
  open: (convId?: string) => void;
  close: () => void;
  setCurrentConvId: (id: string | null) => void;
}

const AiAgentContext = createContext<AiAgentContextValue | null>(null);

export function AiAgentProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);

  const open = useCallback((convId?: string) => {
    if (convId) setCurrentConvId(convId);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <AiAgentContext.Provider value={{ isOpen, currentConvId, open, close, setCurrentConvId }}>
      {children}
    </AiAgentContext.Provider>
  );
}

export function useAiAgent() {
  const ctx = useContext(AiAgentContext);
  if (!ctx) throw new Error("useAiAgent must be used inside AiAgentProvider");
  return ctx;
}
