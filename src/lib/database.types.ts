/**
 * Tipos parciales de Supabase. Regenerar el esquema completo con:
 *   npm run gen:types
 * (requiere `supabase login` o SUPABASE_ACCESS_TOKEN)
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      duelos_2v2: {
        Row: {
          id: string;
          organizador_id: string;
          nombre: string;
          descripcion: string | null;
          estado: "configuracion" | "en_juego" | "finalizado";
          pareja_a_j1_id: string | null;
          pareja_a_j2_id: string | null;
          pareja_a_j1_nombre: string;
          pareja_a_j2_nombre: string;
          pareja_b_j1_id: string | null;
          pareja_b_j2_id: string | null;
          pareja_b_j1_nombre: string;
          pareja_b_j2_nombre: string;
          sets_pareja_a: number;
          sets_pareja_b: number;
          detalle_sets: Json;
          ganador: "a" | "b" | null;
          created_at: string;
          updated_at: string;
          finalizado_at: string | null;
        };
        Insert: {
          id?: string;
          organizador_id: string;
          nombre: string;
          descripcion?: string | null;
          estado?: "configuracion" | "en_juego" | "finalizado";
          pareja_a_j1_id?: string | null;
          pareja_a_j2_id?: string | null;
          pareja_a_j1_nombre: string;
          pareja_a_j2_nombre: string;
          pareja_b_j1_id?: string | null;
          pareja_b_j2_id?: string | null;
          pareja_b_j1_nombre: string;
          pareja_b_j2_nombre: string;
          sets_pareja_a?: number;
          sets_pareja_b?: number;
          detalle_sets?: Json;
          ganador?: "a" | "b" | null;
          created_at?: string;
          updated_at?: string;
          finalizado_at?: string | null;
        };
        Update: {
          id?: string;
          organizador_id?: string;
          nombre?: string;
          descripcion?: string | null;
          estado?: "configuracion" | "en_juego" | "finalizado";
          pareja_a_j1_id?: string | null;
          pareja_a_j2_id?: string | null;
          pareja_a_j1_nombre?: string;
          pareja_a_j2_nombre?: string;
          pareja_b_j1_id?: string | null;
          pareja_b_j2_id?: string | null;
          pareja_b_j1_nombre?: string;
          pareja_b_j2_nombre?: string;
          sets_pareja_a?: number;
          sets_pareja_b?: number;
          detalle_sets?: Json;
          ganador?: "a" | "b" | null;
          created_at?: string;
          updated_at?: string;
          finalizado_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
