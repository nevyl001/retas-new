export type OpenGameModeType = "reta" | "americano" | "duelo_2v2";

export type OpenRegistrationStatus =
  | "draft"
  | "open"
  | "paused"
  | "closed"
  | "cancelled";

export type OpenRegistrationEntryStatus =
  | "confirmed"
  | "waitlist"
  | "cancelled"
  | "removed"
  | "pending_approval";

export interface OpenRegistrationPublicEntry {
  id: string;
  status: OpenRegistrationEntryStatus;
  riviera_id: string;
  nombre: string;
  foto_url: string | null;
  rating: number | null;
  categoria: string | null;
  /** Duelo 2vs2: lado preferido al inscribirse. */
  preferred_side?: "A" | "B" | null;
}

export interface OpenRegistrationPublicDto {
  ok: true;
  slug: string;
  mode_type: OpenGameModeType;
  entity_id: string;
  registration_id?: string;
  tournament_id: string | null;
  organizador_id: string;
  name: string;
  description: string | null;
  status: OpenRegistrationStatus;
  capacity: number;
  confirmed_count: number;
  waitlist_count: number;
  spots_left: number;
  waitlist_enabled: boolean;
  approval_required: boolean;
  registration_deadline: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  category_label: string | null;
  rama_label: string | null;
  location_label: string | null;
  display_rating: boolean;
  display_photo: boolean;
  entries: OpenRegistrationPublicEntry[];
  is_finished: boolean;
  is_started: boolean;
}

export interface OpenRegistrationConfigRow {
  id?: string;
  tournament_id: string | null;
  mode_type: OpenGameModeType;
  entity_id: string;
  public_slug: string;
  enabled: boolean;
  status: OpenRegistrationStatus;
  capacity: number;
  waitlist_enabled: boolean;
  approval_required: boolean;
  registration_deadline: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  category_label: string | null;
  rama_label: string | null;
  location_label: string | null;
  title_public: string | null;
  display_rating: boolean;
  display_photo: boolean;
  display_full_name: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OpenRegistrationPreview {
  ok: true;
  riviera_id: string;
  jugador_id: string;
  nombre: string;
  foto_url: string | null;
  rating: number | null;
  categoria: string | null;
  club_origen_id: string | null;
}

export interface OpenRegistrationJoinResult {
  ok: true;
  entry_id: string;
  status: OpenRegistrationEntryStatus;
  riviera_id: string;
  nombre: string;
  cancellation_token: string;
  message: string;
  preferred_side?: "A" | "B" | null;
}

export interface OpenRegistrationOrganizerEntry {
  id: string;
  status: OpenRegistrationEntryStatus;
  riviera_id: string;
  riviera_jugador_id: string;
  nombre: string;
  foto_url: string | null;
  categoria: string | null;
  rating: number | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
}

export interface ConvocatoriaAdapterContext {
  mode: OpenGameModeType;
  /** Puede ir vacío hasta que ensureDraftEntity cree el borrador. */
  entityId: string;
  defaultTitle: string;
  defaultCapacity: number;
  /** Lugar / sede (no la cancha). Se guarda en location_label. */
  defaultLocation?: string;
  /**
   * Si false, el mensaje WhatsApp omite la línea de lugar
   * (clubes con sede fija / comunidad = sede). Default true.
   */
  includeLugar?: boolean;
  /** Número o etiqueta de cancha (separado del lugar). */
  defaultCancha?: string;
  defaultCategory?: string;
  defaultDurationMinutes?: number;
  defaultScheduledAt?: string | null;
  /** Nombre del club para el mensaje (fallback de lugar). */
  clubName?: string;
  /** Fija cupo (ej. duelo = 4). */
  lockCapacity?: boolean;
  /**
   * Headline de producto para WhatsApp (ej. REMONTADA FINAL / ROUND ROBIN).
   * No cambia mode_type; solo el mensaje compartido.
   */
  productHeadline?: string;
}
