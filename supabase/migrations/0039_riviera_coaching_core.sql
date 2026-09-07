-- =============================================================================
-- 0039_riviera_coaching_core.sql
-- Riviera Coaching — Fase A (Core)
-- Dominio nuevo coach_* — NO reutilizar clases/profiles legacy.
-- Coaching NUNCA escribe en jugador_participaciones ni ledger ROMC.
--
-- Decisiones congeladas:
--   • Tenant ancla organizador_id = auth.users(id) (igual que organizador_game_modes).
--   • Soft-delete (deleted_at) en las 3 tablas de contenido; autor puede restaurar.
--   • Audit payload versiona body en INSERT / UPDATE / DELETE.
--   • PAUSED y ENDED limpian is_primary; reanudar ACTIVE puede re-promover.
-- =============================================================================

-- ── 0) Flag de activación (mismo patrón que premium_branding_enabled) ─────────
ALTER TABLE public.organizador_game_modes
  ADD COLUMN IF NOT EXISTS coaching_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizador_game_modes.coaching_enabled IS
  'Riviera Coaching: si true, el club puede gestionar coaches/agenda. Solo Admin Maestro muta (RLS ogm_mutate_admin).';

-- ── 1) Secuencia + formato Coach ID (RIV-C-#####) ────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.riviera_coach_code_serial_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1
  OWNED BY NONE;

CREATE OR REPLACE FUNCTION public._format_riviera_coach_code(p_serial bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'RIV-C-' || lpad(p_serial::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION public._allocate_riviera_coach_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial bigint;
BEGIN
  v_serial := nextval('public.riviera_coach_code_serial_seq');
  RETURN public._format_riviera_coach_code(v_serial);
END;
$$;

REVOKE ALL ON FUNCTION public._format_riviera_coach_code(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._allocate_riviera_coach_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._format_riviera_coach_code(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public._allocate_riviera_coach_code() TO service_role;

-- ── 2) riviera_coaches ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.riviera_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_code text NOT NULL UNIQUE,
  coach_code_serial bigint NOT NULL UNIQUE,
  nombre text NOT NULL,
  foto_url text NULL,
  bio text NULL,
  filosofia text NULL,
  especialidades text[] NOT NULL DEFAULT '{}',
  fuerzas text[] NOT NULL DEFAULT '{}',
  profile_extended_enabled boolean NOT NULL DEFAULT false,
  experiencia text NULL,
  trayectoria text NULL,
  certificaciones text NULL,
  logros text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riviera_coaches_coach_code_format
    CHECK (coach_code ~ '^RIV-C-[0-9]{5}$')
);

CREATE OR REPLACE FUNCTION public.riviera_coaches_set_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial bigint;
BEGIN
  IF NEW.coach_code IS NULL OR btrim(NEW.coach_code) = '' THEN
    v_serial := nextval('public.riviera_coach_code_serial_seq');
    NEW.coach_code_serial := v_serial;
    NEW.coach_code := public._format_riviera_coach_code(v_serial);
  ELSIF NEW.coach_code_serial IS NULL THEN
    RAISE EXCEPTION 'coach_code_serial requerido si coach_code viene prefijado';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_riviera_coaches_set_code ON public.riviera_coaches;
CREATE TRIGGER trg_riviera_coaches_set_code
  BEFORE INSERT ON public.riviera_coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.riviera_coaches_set_code();

CREATE OR REPLACE FUNCTION public.riviera_coaches_touch_updated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_riviera_coaches_updated ON public.riviera_coaches;
CREATE TRIGGER trg_riviera_coaches_updated
  BEFORE UPDATE ON public.riviera_coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.riviera_coaches_touch_updated();

-- ── 3) coach_club_memberships
-- Tenant ancla = auth.users(id), igual que organizador_game_modes.
CREATE TABLE IF NOT EXISTS public.coach_club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, organizador_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_club_memberships_org
  ON public.coach_club_memberships (organizador_id, status);

CREATE INDEX IF NOT EXISTS idx_coach_club_memberships_coach
  ON public.coach_club_memberships (coach_id, status);

-- ── 4) coach_player_relationships ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_player_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  -- Tenant ancla = auth.users(id), igual que organizador_game_modes.
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
  is_primary boolean NOT NULL DEFAULT false,
  public_coaching_enabled boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, jugador_id, organizador_id)
);

-- Un solo primary ACTIVE por jugador
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_player_one_primary_active
  ON public.coach_player_relationships (jugador_id)
  WHERE (is_primary = true AND status = 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_cpr_coach_status
  ON public.coach_player_relationships (coach_id, status);
CREATE INDEX IF NOT EXISTS idx_cpr_jugador_status
  ON public.coach_player_relationships (jugador_id, status);
CREATE INDEX IF NOT EXISTS idx_cpr_org
  ON public.coach_player_relationships (organizador_id);

CREATE OR REPLACE FUNCTION public.coach_player_relationships_set_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  -- PAUSED y ENDED nunca son primary (Performance Fase B lee primary ACTIVE).
  IF NEW.status IN ('ENDED', 'PAUSED') THEN
    NEW.is_primary := false;
    IF NEW.status = 'ENDED' AND NEW.ended_at IS NULL THEN
      NEW.ended_at := now();
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'ACTIVE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_player_relationships r
      WHERE r.jugador_id = NEW.jugador_id
        AND r.status = 'ACTIVE'
        AND r.is_primary = true
        AND r.id IS DISTINCT FROM NEW.id
    ) THEN
      NEW.is_primary := true;
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.status = 'ACTIVE'
    AND OLD.status IS DISTINCT FROM 'ACTIVE' THEN
    -- Reanudar desde PAUSED/ENDED: re-promover si no hay otro primary ACTIVE.
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_player_relationships r
      WHERE r.jugador_id = NEW.jugador_id
        AND r.status = 'ACTIVE'
        AND r.is_primary = true
        AND r.id IS DISTINCT FROM NEW.id
    ) THEN
      NEW.is_primary := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpr_set_primary ON public.coach_player_relationships;
CREATE TRIGGER trg_cpr_set_primary
  BEFORE INSERT OR UPDATE ON public.coach_player_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.coach_player_relationships_set_primary();

-- ── 5) Contenido: 3 objetos + soft-delete (autor puede restaurar) ────────────
CREATE TABLE IF NOT EXISTS public.coach_private_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  body text NOT NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_player_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  body text NOT NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_public_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  body text NOT NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpr_notes_rel
  ON public.coach_private_notes (relationship_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpr_msgs_rel
  ON public.coach_player_messages (relationship_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpr_recs_rel
  ON public.coach_public_recommendations (relationship_id)
  WHERE deleted_at IS NULL;

-- ── 6) Agenda / sesiones / objetivos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_agenda_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  -- Tenant ancla = auth.users(id), igual que organizador_game_modes.
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_agenda_blocks_range CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.coach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  relationship_id uuid NULL REFERENCES public.coach_player_relationships(id) ON DELETE SET NULL,
  -- Tenant ancla = auth.users(id), igual que organizador_game_modes.
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes int NULL,
  focus text NULL,
  worked_on text[] NOT NULL DEFAULT '{}',
  notes_summary text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_sessions_range CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.coach_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  title text NOT NULL,
  area text NULL,
  baseline_score numeric(5,2) NULL,
  current_score numeric(5,2) NULL,
  target_score numeric(5,2) NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'DROPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_sessions_coach_time
  ON public.coach_sessions (coach_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_objectives_rel
  ON public.coach_objectives (relationship_id, status);

-- ── 7) Audit log (body versionado) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_coach_id uuid NULL REFERENCES public.riviera_coaches(id) ON DELETE SET NULL,
  actor_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_audit_created
  ON public.coach_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_audit_entity
  ON public.coach_audit_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.coach_audit_write(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
BEGIN
  SELECT c.id INTO v_coach_id
  FROM public.riviera_coaches c
  WHERE c.auth_user_id = auth.uid();

  INSERT INTO public.coach_audit_log (
    actor_coach_id, actor_auth_user_id, action, entity_type, entity_id, payload
  ) VALUES (
    v_coach_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coach_audit_write(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_audit_write(text, text, uuid, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.coach_content_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.coach_audit_write(
      'insert',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object(
        'coach_id', NEW.coach_id,
        'relationship_id', NEW.relationship_id,
        'body', NEW.body
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.coach_audit_write(
      'update',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object(
        'coach_id', NEW.coach_id,
        'relationship_id', NEW.relationship_id,
        'old_body', OLD.body,
        'new_body', NEW.body,
        'deleted_at', NEW.deleted_at
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.coach_audit_write(
      'delete',
      TG_TABLE_NAME,
      OLD.id,
      jsonb_build_object(
        'coach_id', OLD.coach_id,
        'relationship_id', OLD.relationship_id,
        'body', OLD.body
      )
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_private_notes ON public.coach_private_notes;
CREATE TRIGGER trg_audit_private_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.coach_content_audit();

DROP TRIGGER IF EXISTS trg_audit_player_messages ON public.coach_player_messages;
CREATE TRIGGER trg_audit_player_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_player_messages
  FOR EACH ROW EXECUTE FUNCTION public.coach_content_audit();

DROP TRIGGER IF EXISTS trg_audit_public_recs ON public.coach_public_recommendations;
CREATE TRIGGER trg_audit_public_recs
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_public_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.coach_content_audit();

-- ── 8) Fase B schema only (sin UI) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_rubric_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label text NOT NULL UNIQUE,
  formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  rubric_version_id uuid NOT NULL REFERENCES public.coach_rubric_versions(id),
  criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance_score numeric(5,2) NULL,
  fuerza_snapshot text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_evaluations_rel
  ON public.coach_evaluations (relationship_id, created_at DESC);

-- ── 9) Helpers de identidad coach (sesión) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_riviera_coach_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.riviera_coaches c WHERE c.auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_coach_of_org(p_organizador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_coaches c
    JOIN public.coach_club_memberships m ON m.coach_id = c.id
    WHERE c.auth_user_id = auth.uid()
      AND m.organizador_id = p_organizador_id
      AND m.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.coach_owns_relationship(p_relationship_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_player_relationships r
    JOIN public.riviera_coaches c ON c.id = r.coach_id
    WHERE r.id = p_relationship_id
      AND c.auth_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_riviera_coach_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_coach_of_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_owns_relationship(uuid) TO authenticated;

-- ── 10) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.riviera_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_player_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_private_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_player_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_public_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_agenda_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_rubric_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_evaluations ENABLE ROW LEVEL SECURITY;

-- riviera_coaches
DROP POLICY IF EXISTS riviera_coaches_select_self ON public.riviera_coaches;
CREATE POLICY riviera_coaches_select_self ON public.riviera_coaches
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS riviera_coaches_select_org ON public.riviera_coaches;
CREATE POLICY riviera_coaches_select_org ON public.riviera_coaches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_club_memberships m
      WHERE m.coach_id = riviera_coaches.id
        AND m.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS riviera_coaches_select_public ON public.riviera_coaches;
CREATE POLICY riviera_coaches_select_public ON public.riviera_coaches
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_player_relationships r
      WHERE r.coach_id = riviera_coaches.id
        AND r.public_coaching_enabled = true
        AND r.status IN ('ACTIVE', 'ENDED')
    )
  );

DROP POLICY IF EXISTS riviera_coaches_update_self ON public.riviera_coaches;
CREATE POLICY riviera_coaches_update_self ON public.riviera_coaches
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- memberships
DROP POLICY IF EXISTS ccm_select_parties ON public.coach_club_memberships;
CREATE POLICY ccm_select_parties ON public.coach_club_memberships
  FOR SELECT TO authenticated
  USING (
    organizador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
    OR public.is_master_admin()
  );

DROP POLICY IF EXISTS ccm_mutate_org ON public.coach_club_memberships;
CREATE POLICY ccm_mutate_org ON public.coach_club_memberships
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin())
  WITH CHECK (organizador_id = auth.uid() OR public.is_master_admin());

-- relationships
DROP POLICY IF EXISTS cpr_select_parties ON public.coach_player_relationships;
CREATE POLICY cpr_select_parties ON public.coach_player_relationships
  FOR SELECT TO authenticated
  USING (
    organizador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
    OR public.is_master_admin()
  );

DROP POLICY IF EXISTS cpr_select_public ON public.coach_player_relationships;
CREATE POLICY cpr_select_public ON public.coach_player_relationships
  FOR SELECT TO anon, authenticated
  USING (public_coaching_enabled = true AND status IN ('ACTIVE', 'ENDED'));

-- INSERT: no usar coach_owns_relationship(id) — la fila aún no existe.
DROP POLICY IF EXISTS cpr_insert_coach ON public.coach_player_relationships;
CREATE POLICY cpr_insert_coach ON public.coach_player_relationships
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cpr_update_coach_or_org ON public.coach_player_relationships;
CREATE POLICY cpr_update_coach_or_org ON public.coach_player_relationships
  FOR UPDATE TO authenticated
  USING (
    organizador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    organizador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

-- private notes: autor ve TODO lo suyo (incl. soft-deleted) para poder restaurar.
-- anon NUNCA.
DROP POLICY IF EXISTS cpn_all_author ON public.coach_private_notes;
CREATE POLICY cpn_all_author ON public.coach_private_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

-- player messages: igual; anon NUNCA.
DROP POLICY IF EXISTS cpm_all_author ON public.coach_player_messages;
CREATE POLICY cpm_all_author ON public.coach_player_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

-- public recommendations: autor CRUD sin filtro deleted_at (puede restaurar).
DROP POLICY IF EXISTS cprec_all_author ON public.coach_public_recommendations;
CREATE POLICY cprec_all_author ON public.coach_public_recommendations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

-- Lectura pública/anon: solo no borradas + relación ACTIVE|ENDED + flag.
DROP POLICY IF EXISTS cprec_select_public ON public.coach_public_recommendations;
CREATE POLICY cprec_select_public ON public.coach_public_recommendations
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.coach_player_relationships r
      WHERE r.id = relationship_id
        AND r.public_coaching_enabled = true
        AND r.status IN ('ACTIVE', 'ENDED')
    )
  );

-- sessions / agenda / objectives
DROP POLICY IF EXISTS csess_all_coach ON public.coach_sessions;
CREATE POLICY csess_all_coach ON public.coach_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
    OR organizador_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cagenda_all_coach ON public.coach_agenda_blocks;
CREATE POLICY cagenda_all_coach ON public.coach_agenda_blocks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
    OR organizador_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cobj_all_coach ON public.coach_objectives;
CREATE POLICY cobj_all_coach ON public.coach_objectives
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cobj_select_public ON public.coach_objectives;
CREATE POLICY cobj_select_public ON public.coach_objectives
  FOR SELECT TO anon, authenticated
  USING (
    status = 'ACTIVE'
    AND EXISTS (
      SELECT 1 FROM public.coach_player_relationships r
      WHERE r.id = relationship_id
        AND r.public_coaching_enabled = true
        AND r.status IN ('ACTIVE', 'ENDED')
    )
  );

-- audit: coach ve lo suyo; master admin todo; sin anon
DROP POLICY IF EXISTS caudit_select ON public.coach_audit_log;
CREATE POLICY caudit_select ON public.coach_audit_log
  FOR SELECT TO authenticated
  USING (
    actor_auth_user_id = auth.uid()
    OR actor_coach_id = public.current_riviera_coach_id()
    OR public.is_master_admin()
  );

-- rubric/evaluations: coaches dueños + master (Fase B UI)
DROP POLICY IF EXISTS crubric_select_auth ON public.coach_rubric_versions;
CREATE POLICY crubric_select_auth ON public.coach_rubric_versions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ceval_all_coach ON public.coach_evaluations;
CREATE POLICY ceval_all_coach ON public.coach_evaluations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
    OR public.is_master_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.riviera_coaches c
      WHERE c.id = coach_id AND c.auth_user_id = auth.uid()
    )
  );

-- ── 11) Grants base ──────────────────────────────────────────────────────────
GRANT SELECT ON public.riviera_coaches TO anon, authenticated;
GRANT SELECT, UPDATE ON public.riviera_coaches TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_club_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_player_relationships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_private_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_player_messages TO authenticated;
GRANT SELECT ON public.coach_public_recommendations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.coach_public_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_agenda_blocks TO authenticated;
GRANT SELECT ON public.coach_objectives TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.coach_objectives TO authenticated;
GRANT SELECT ON public.coach_audit_log TO authenticated;
GRANT SELECT ON public.coach_rubric_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_evaluations TO authenticated;
