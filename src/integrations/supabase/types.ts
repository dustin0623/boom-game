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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      player_inventory: {
        Row: {
          created_at: string
          id: string
          item_id: string
          player_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          player_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          player_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_inventory_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          coins: number
          created_at: string
          deposited_balance: number
          destroyed_nodes: string[]
          display_name: string | null
          email: string | null
          heroes: Json
          id: string
          is_test: boolean
          last_login_at: string | null
          last_sync_at: string
          password_hash: string | null
          seed: number
          stage: number
          token_hash: string
          updated_at: string
          username: string | null
          wallet_address: string | null
        }
        Insert: {
          coins?: number
          created_at?: string
          deposited_balance?: number
          destroyed_nodes?: string[]
          display_name?: string | null
          email?: string | null
          heroes?: Json
          id?: string
          is_test?: boolean
          last_login_at?: string | null
          last_sync_at?: string
          password_hash?: string | null
          seed: number
          stage?: number
          token_hash: string
          updated_at?: string
          username?: string | null
          wallet_address?: string | null
        }
        Update: {
          coins?: number
          created_at?: string
          deposited_balance?: number
          destroyed_nodes?: string[]
          display_name?: string | null
          email?: string | null
          heroes?: Json
          id?: string
          is_test?: boolean
          last_login_at?: string | null
          last_sync_at?: string
          password_hash?: string | null
          seed?: number
          stage?: number
          token_hash?: string
          updated_at?: string
          username?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      transactions_pending: {
        Row: {
          action: string
          attempts: number
          created_at: string
          id: string
          locked_at: string | null
          payload: Json
          player_id: string
          status: string
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          id?: string
          locked_at?: string | null
          payload?: Json
          player_id: string
          status?: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          id?: string
          locked_at?: string | null
          payload?: Json
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_pending_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions_processed: {
        Row: {
          action: string
          created_at: string
          id: string
          pending_id: string | null
          player_id: string
          result: Json
          status: string
          tx_hash: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          pending_id?: string | null
          player_id: string
          result?: Json
          status: string
          tx_hash?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          pending_id?: string | null
          player_id?: string
          result?: Json
          status?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_processed_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buy_chest: {
        Args: { p_item_id: string; p_player_id: string; p_price: number }
        Returns: Json
      }
      claim_pending_transactions: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          attempts: number
          created_at: string
          id: string
          locked_at: string | null
          payload: Json
          player_id: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions_pending"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      open_chest: {
        Args: { p_hero: Json; p_item_id: string; p_player_id: string }
        Returns: Json
      }
      request_withdrawal: {
        Args: { p_address: string; p_amount: number; p_player_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
