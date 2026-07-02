export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_action_drafts: {
        Row: {
          action_type: string
          approved_at: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          payload: Json
          preview: Json
          project_id: string | null
          school_year_id: string | null
          status: Database["public"]["Enums"]["ai_action_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload: Json
          preview: Json
          project_id?: string | null
          school_year_id?: string | null
          status?: Database["public"]["Enums"]["ai_action_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json
          preview?: Json
          project_id?: string | null
          school_year_id?: string | null
          status?: Database["public"]["Enums"]["ai_action_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ai_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_drafts_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_activity_log: {
        Row: {
          action_draft_id: string | null
          action_type: string
          after: Json | null
          before: Json | null
          conversation_id: string | null
          created_at: string
          id: string
          target_id: string | null
          target_table: string
          user_id: string
        }
        Insert: {
          action_draft_id?: string | null
          action_type: string
          after?: Json | null
          before?: Json | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_table: string
          user_id: string
        }
        Update: {
          action_draft_id?: string | null
          action_type?: string
          after?: Json | null
          before?: Json | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_table?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_activity_log_action_draft_id_fkey"
            columns: ["action_draft_id"]
            isOneToOne: false
            referencedRelation: "ai_action_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_activity_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          pending_action: Json | null
          pending_queue: Json | null
          project_id: string | null
          school_year_id: string | null
          source_page: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pending_action?: Json | null
          pending_queue?: Json | null
          project_id?: string | null
          school_year_id?: string | null
          source_page?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pending_action?: Json | null
          pending_queue?: Json | null
          project_id?: string | null
          school_year_id?: string | null
          source_page?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ai_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          school_year_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_year_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_year_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_projects_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_activities: {
        Row: {
          budget_category_id: string
          created_at: string
          grade_id: string | null
          id: string
          name: string
          notes: string | null
          order_index: number
          planned_amount: number
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          target_grade_ids: string[]
          updated_at: string
        }
        Insert: {
          budget_category_id: string
          created_at?: string
          grade_id?: string | null
          id?: string
          name: string
          notes?: string | null
          order_index?: number
          planned_amount?: number
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          target_grade_ids?: string[]
          updated_at?: string
        }
        Update: {
          budget_category_id?: string
          created_at?: string
          grade_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          order_index?: number
          planned_amount?: number
          school_year_id?: string
          source?: Database["public"]["Enums"]["budget_source"]
          target_grade_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_activities_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_activities_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_activities_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          order_index: number
          planned_amount: number
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          target_grade_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          order_index?: number
          planned_amount?: number
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          target_grade_ids?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          order_index?: number
          planned_amount?: number
          school_year_id?: string
          source?: Database["public"]["Enums"]["budget_source"]
          target_grade_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          activity_name: string | null
          amount: number
          bank_account: Database["public"]["Enums"]["bank_account"]
          budget_activity_id: string | null
          budget_category_id: string | null
          bus_amount: number | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          grade_id: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          parent_section_id: string | null
          payment_method: string | null
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          supplier: string | null
          target_grade_ids: string[]
          updated_at: string
        }
        Insert: {
          activity_name?: string | null
          amount: number
          bank_account: Database["public"]["Enums"]["bank_account"]
          budget_activity_id?: string | null
          budget_category_id?: string | null
          bus_amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date: string
          grade_id?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          parent_section_id?: string | null
          payment_method?: string | null
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          supplier?: string | null
          target_grade_ids?: string[]
          updated_at?: string
        }
        Update: {
          activity_name?: string | null
          amount?: number
          bank_account?: Database["public"]["Enums"]["bank_account"]
          budget_activity_id?: string | null
          budget_category_id?: string | null
          bus_amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          grade_id?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          parent_section_id?: string | null
          payment_method?: string | null
          school_year_id?: string
          source?: Database["public"]["Enums"]["budget_source"]
          supplier?: string | null
          target_grade_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_budget_activity_id_fkey"
            columns: ["budget_activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "parent_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_section_amounts: {
        Row: {
          actual_collected: number | null
          amount_per_student: number
          created_at: string
          custom_working_budget: number | null
          grade_id: string
          id: string
          notes: string | null
          parent_section_id: string
          school_year_id: string
          updated_at: string
          working_budget_basis: Database["public"]["Enums"]["working_budget_basis"]
        }
        Insert: {
          actual_collected?: number | null
          amount_per_student?: number
          created_at?: string
          custom_working_budget?: number | null
          grade_id: string
          id?: string
          notes?: string | null
          parent_section_id: string
          school_year_id: string
          updated_at?: string
          working_budget_basis?: Database["public"]["Enums"]["working_budget_basis"]
        }
        Update: {
          actual_collected?: number | null
          amount_per_student?: number
          created_at?: string
          custom_working_budget?: number | null
          grade_id?: string
          id?: string
          notes?: string | null
          parent_section_id?: string
          school_year_id?: string
          updated_at?: string
          working_budget_basis?: Database["public"]["Enums"]["working_budget_basis"]
        }
        Relationships: [
          {
            foreignKeyName: "grade_section_amounts_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_section_amounts_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "parent_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_section_amounts_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          school_year_id: string
          student_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          school_year_id: string
          student_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          school_year_id?: string
          student_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      income: {
        Row: {
          amount: number
          bank_account: Database["public"]["Enums"]["bank_account"]
          budget_category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          income_date: string
          notes: string | null
          payer: string | null
          payment_method: string | null
          reference_number: string | null
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account: Database["public"]["Enums"]["bank_account"]
          budget_category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          income_date: string
          notes?: string | null
          payer?: string | null
          payment_method?: string | null
          reference_number?: string | null
          school_year_id: string
          source: Database["public"]["Enums"]["budget_source"]
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account?: Database["public"]["Enums"]["bank_account"]
          budget_category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          payer?: string | null
          payment_method?: string | null
          reference_number?: string | null
          school_year_id?: string
          source?: Database["public"]["Enums"]["budget_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          plan: string
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          plan?: string
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          plan?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      parent_collections: {
        Row: {
          amount: number
          collection_date: string
          created_at: string
          created_by: string | null
          grade_id: string
          id: string
          notes: string | null
          parent_section_id: string
          school_year_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          collection_date?: string
          created_at?: string
          created_by?: string | null
          grade_id: string
          id?: string
          notes?: string | null
          parent_section_id: string
          school_year_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          collection_date?: string
          created_at?: string
          created_by?: string | null
          grade_id?: string
          id?: string
          notes?: string | null
          parent_section_id?: string
          school_year_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_collections_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_collections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "parent_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_collections_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_sections: {
        Row: {
          created_at: string
          grade_id: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          school_year_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          school_year_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          school_year_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_sections_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_sections_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          system_role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          system_role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          system_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_years: {
        Row: {
          collection_percentage: number
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          collection_percentage?: number
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          collection_percentage?: number
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_years_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_is_super_admin: { Args: never; Returns: boolean }
      auth_org_role_for_year: {
        Args: { p_roles: string[]; p_year_id: string }
        Returns: boolean
      }
      auth_user_org_ids: { Args: never; Returns: string[] }
      list_public_organizations: {
        Args: never
        Returns: {
          city: string
          id: string
          name: string
        }[]
      }
    }
    Enums: {
      ai_action_status: "draft" | "executed" | "cancelled" | "failed"
      app_role: "admin" | "secretary"
      bank_account: "school" | "parents"
      budget_source: "gefen" | "iriyah" | "horim"
      working_budget_basis: "p85" | "p100" | "actual" | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_action_status: ["draft", "executed", "cancelled", "failed"],
      app_role: ["admin", "secretary"],
      bank_account: ["school", "parents"],
      budget_source: ["gefen", "iriyah", "horim"],
      working_budget_basis: ["p85", "p100", "actual", "custom"],
    },
  },
} as const
