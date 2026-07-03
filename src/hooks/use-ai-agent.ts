import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: {
    action_draft_id?: string;
  } | null;
  created_at: string;
}

export interface ActionDraftPreview {
  type: "add_expense" | "add_income";
  description: string;
  amount: number;
  source_slug: string;
  source_label: string;
  date: string;
  budget_category_id?: string | null;
  category_name?: string | null;
  supplier?: string | null;
  payer?: string | null;
}

export interface ActionDraft {
  id: string;
  action_type: string;
  preview: ActionDraftPreview;
}

export interface SendMessageResult {
  conversation_id: string;
  message_id: string;
  reply: string;
  action_draft: ActionDraft | null;
}

export interface OrgAiSettings {
  org_id: string;
  claude_api_key: string | null;
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function useAiConversations() {
  return useQuery<AiConversation[]>({
    queryKey: ["ai-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AiConversation[];
    },
    staleTime: 1000 * 30,
  });
}

export function useDeleteAiConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useAiMessages(conversationId: string | null) {
  return useQuery<AiMessage[]>({
    queryKey: ["ai-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, conversation_id, role, content, metadata, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AiMessage[];
    },
    enabled: !!conversationId,
    staleTime: 1000 * 10,
  });
}

// ─── Send Message ─────────────────────────────────────────────────────────────

export function useSendAiMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      message,
      conversationId,
    }: {
      message: string;
      conversationId: string | null;
    }): Promise<SendMessageResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            type: "chat",
            message,
            conversation_id: conversationId ?? undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה בשליחה");
      return json as SendMessageResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-messages", data.conversation_id] });
    },
  });
}

// ─── Confirm / Cancel Action ──────────────────────────────────────────────────

export function useConfirmAiAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      actionDraftId,
      conversationId,
      approved,
    }: {
      actionDraftId: string;
      conversationId: string;
      approved: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            type: "confirm",
            action_draft_id: actionDraftId,
            conversation_id: conversationId,
            approved,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה בביצוע");
      return json as { reply: string; executed: boolean };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ai-messages", vars.conversationId] });
      // Also refresh financial data so numbers update in real-time
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["income"] });
    },
  });
}

// ─── AI Settings ─────────────────────────────────────────────────────────────

export function useOrgAiSettings() {
  return useQuery<OrgAiSettings | null>({
    queryKey: ["org-ai-settings"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!mem?.organization_id) return null;
      const { data, error } = await supabase
        .from("org_ai_settings")
        .select("org_id, claude_api_key")
        .eq("org_id", mem.organization_id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as OrgAiSettings | null;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpsertOrgAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      claudeApiKey,
    }: {
      orgId: string;
      claudeApiKey: string;
    }) => {
      const { error } = await supabase
        .from("org_ai_settings")
        .upsert({ org_id: orgId, claude_api_key: claudeApiKey, updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-ai-settings"] });
    },
  });
}
