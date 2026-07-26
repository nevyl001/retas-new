-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE SEGURIDAD — rate-limit para preview/join de Riviera ID
--
-- Vulnerabilidad (confirmada, auditoría 2026-07-26): el Riviera ID público
-- (RIV-00000001, RIV-00000002, ...) es una secuencia entera, no un token
-- opaco. preview_riviera_id_for_open_registration y join_tournament_open_
-- registration son SECURITY DEFINER con EXECUTE otorgado a anon, y no tienen
-- ningún límite de intentos. Un script sin autenticar puede recorrer la
-- secuencia y (a) extraer nombre/foto/rating de cualquier jugador de la
-- plataforma, y (b) inscribir a cualquier jugador real en cualquier reta
-- ajena sin su consentimiento.
--
-- Verificación de vigencia (obligatoria antes de este fix, ya hecha):
--   Se comparó pg_get_functiondef() de producción contra las 3 copias del
--   repo. supabase/convocatoria-riviera-rpcs.sql es BYTE-A-BYTE idéntica a
--   producción para ambas funciones (única diferencia: formato de cabecera
--   que pg_get_functiondef reescribe siempre igual, sin efecto funcional).
--   supabase/sql/patch-duelo-preferred-side.sql tiene el mismo cuerpo de
--   join_tournament_open_registration (copia redundante, no conflictiva).
--   supabase/reta-abierta-open-registration.sql está DESACTUALIZADA: le
--   falta p_preferred_side, el soporte multi-modo (_open_reg_organizer_id,
--   sync de americano/duelo) y el estado 'draft' — no se usó como base.
--   Los cuerpos de ambas funciones abajo son copia exacta de la versión
--   vigente (producción = convocatoria-riviera-rpcs.sql); NO se modificó
--   ninguna línea de la lógica de p_preferred_side / duelo 2v2 / multi-modo.
--
-- Fix mínimo: rate-limit por IP (client_key resuelto del header que
-- PostgREST expone; ver nota de confiabilidad más abajo, junto a
-- _riviera_id_lookup_client_key), sin OTP, sin pedir ningún dato nuevo al
-- jugador. Umbral: 30 intentos de preview / 20 de join, por client_key, cada
-- 10 min — generoso frente al 1 uso real de un jugador, pero sigue haciendo
-- impracticable recorrer miles de Riviera ID secuenciales; calibrado para no
-- bloquear a un grupo real inscribiéndose desde la misma IP/WiFi (ver
-- comentarios junto a cada umbral). Ambas funciones devuelven
-- {ok:false, error:'rate_limited'} al excederse, reutilizando exactamente
-- el mismo contrato de respuesta {ok, error} que ya usan para
-- 'riviera_id_not_found', 'already_registered', etc. — no cambia la firma
-- ni el shape de la respuesta.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION /
-- REVOKE / ENABLE ROW LEVEL SECURITY son repetibles sin error.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tabla de intentos (nueva, aditiva) ──
CREATE TABLE IF NOT EXISTS public._riviera_id_lookup_throttle (
  id bigserial PRIMARY KEY,
  client_key text NOT NULL,
  action text NOT NULL,          -- 'preview' | 'join'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riviera_id_throttle_key_action_time
  ON public._riviera_id_lookup_throttle (client_key, action, created_at DESC);

-- Defensa en profundidad: aunque Supabase otorga privilegios de tabla a
-- anon/authenticated por defecto, esta tabla no debe ser alcanzable desde
-- la API directamente (solo vía las funciones SECURITY DEFINER de abajo,
-- que corren como postgres). RLS sin políticas = nadie entra por REST.
ALTER TABLE public._riviera_id_lookup_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._riviera_id_lookup_throttle FROM PUBLIC, anon, authenticated;

-- ── Resuelve un identificador del caller a partir del header de PostgREST ──
-- IMPORTANTE: x-forwarded-for es una mitigación de ABUSO, no una identidad
-- confiable. No usar este valor (ni el resultado de esta función) para
-- decisiones de autorización — solo sirve para agrupar intentos y frenar
-- scripts automatizados. Un atacante puede rotar de IP; el propósito aquí es
-- encarecer la enumeración masiva, no impedirla con certeza matemática.
CREATE OR REPLACE FUNCTION public._riviera_id_lookup_client_key()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), ''),
    auth.uid()::text,
    'unknown'
  );
$$;

-- ── Chequea + registra un intento; retorna true si se debe bloquear ──
CREATE OR REPLACE FUNCTION public._riviera_id_lookup_rate_limited(
  p_action text, p_max_attempts int, p_window interval
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public._riviera_id_lookup_client_key();
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public._riviera_id_lookup_throttle
  WHERE client_key = v_key AND action = p_action
    AND created_at > now() - p_window;

  INSERT INTO public._riviera_id_lookup_throttle (client_key, action) VALUES (v_key, p_action);

  RETURN v_count >= p_max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public._riviera_id_lookup_rate_limited(text, int, interval) FROM PUBLIC, anon, authenticated;

-- ── preview_riviera_id_for_open_registration ── (cuerpo idéntico a producción,
-- solo se agrega el chequeo de throttle como primera línea del BEGIN)
--
-- CORRECCIÓN (revisión posterior al commit 5baa427d): la función original de
-- producción es STABLE (correcto entonces: no escribía nada). Al agregarle
-- una llamada a _riviera_id_lookup_rate_limited(), que hace un INSERT, este
-- cuerpo YA NO es STABLE — declararla STABLE con un efecto secundario viola
-- el contrato de esa categoría de volatilidad (el planner puede asumir que
-- no hay escritura y cachear/reordenar la llamada, haciendo que el conteo de
-- intentos sea poco confiable). Se cambia a VOLATILE (quitando STABLE). Esto
-- no es un cambio de firma ni de comportamiento observable — solo corrige el
-- metadato de planificación para que coincida con lo que la función
-- realmente hace ahora.
--
-- Umbral ajustado de 10 a 30 intentos/10min: el original era demasiado bajo
-- para un escenario realista de varios jugadores en el WiFi/IP compartida de
-- un club intentando ver su Riviera ID casi al mismo tiempo tras compartirse
-- un link — 30 sigue haciendo la enumeración masiva (miles de IDs
-- secuenciales) impracticable, sin bloquear a un grupo real.
CREATE OR REPLACE FUNCTION public.preview_riviera_id_for_open_registration(
  p_slug text,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_norm text;
  v_identity record;
  v_rj public.riviera_jugadores%ROWTYPE;
BEGIN
  IF public._riviera_id_lookup_rate_limited('preview', 30, interval '10 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT * INTO v_cfg FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, '')) AND enabled = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_norm := public._normalize_riviera_id_loose(p_riviera_id);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
  END IF;

  SELECT * INTO v_identity FROM public._resolve_identity_by_riviera_id(v_norm);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'riviera_id_not_found', 'riviera_id', v_norm);
  END IF;

  SELECT * INTO v_rj FROM public.riviera_jugadores WHERE id = v_identity.canonical_riviera_jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'riviera_id', v_identity.riviera_id,
    'jugador_id', v_identity.canonical_riviera_jugador_id,
    'nombre', v_identity.display_name,
    'foto_url', CASE WHEN v_cfg.display_photo THEN v_rj.foto_url ELSE NULL END,
    'rating', CASE WHEN v_cfg.display_rating THEN v_rj.rating ELSE NULL END,
    'categoria', v_rj.categoria,
    'club_origen_id', v_identity.registration_organizer_id
  );
END;
$$;

-- ── join_tournament_open_registration ── (cuerpo idéntico a producción,
-- incluida íntegra la lógica de p_preferred_side / duelo 2v2 / multi-modo;
-- solo se agrega el chequeo de throttle como primera línea del BEGIN)
CREATE OR REPLACE FUNCTION public.join_tournament_open_registration(
  p_slug text,
  p_riviera_id text,
  p_preferred_side text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_norm text;
  v_identity record;
  v_confirmed int;
  v_status text;
  v_token text;
  v_token_hash text;
  v_entry_id uuid;
  v_existing public.tournament_open_registration_entries%ROWTYPE;
  v_host uuid;
  v_owner uuid;
  v_access_id uuid;
  v_local_id uuid;
  v_finished boolean := false;
  v_side text;
BEGIN
  -- Umbral ajustado de 5 a 20 intentos/10min: mismo motivo que preview — un
  -- grupo real inscribiéndose desde la misma IP/WiFi (ej. varios jugadores
  -- del mismo club) puede generar varios "join" en pocos minutos sin ser
  -- abuso.
  IF public._riviera_id_lookup_rate_limited('join', 20, interval '10 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
  FOR UPDATE;

  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_cfg.status IN ('closed', 'cancelled', 'paused', 'draft') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_' || v_cfg.status);
  END IF;

  IF v_cfg.registration_deadline IS NOT NULL AND now() > v_cfg.registration_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'deadline_passed');
  END IF;

  v_host := public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id);
  IF v_host IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tournament_unavailable');
  END IF;

  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT estado IN ('en_juego', 'finalizado') INTO v_finished
    FROM public.duelos_2v2 WHERE id = v_cfg.entity_id;
  ELSE
    SELECT coalesce(is_started, false) OR coalesce(is_finished, false)
      INTO v_finished
    FROM public.tournaments WHERE id = v_cfg.entity_id;
  END IF;
  IF coalesce(v_finished, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  v_norm := public._normalize_riviera_id_loose(p_riviera_id);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
  END IF;

  SELECT * INTO v_identity FROM public._resolve_identity_by_riviera_id(v_norm);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'riviera_id_not_found', 'riviera_id', v_norm);
  END IF;

  v_side := upper(nullif(trim(p_preferred_side), ''));
  IF v_side IS NOT NULL AND v_side NOT IN ('A', 'B') THEN
    v_side := NULL;
  END IF;
  IF v_cfg.mode_type <> 'duelo_2v2' THEN
    v_side := NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    250715,
    hashtext(v_cfg.id::text || ':' || v_identity.canonical_riviera_jugador_id::text)
  );

  SELECT * INTO v_existing
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id
    AND e.riviera_jugador_id = v_identity.canonical_riviera_jugador_id
    AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'already_registered',
      'status', v_existing.status, 'entry_id', v_existing.id
    );
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'confirmed';

  IF v_cfg.approval_required THEN
    v_status := 'pending_approval';
  ELSIF v_confirmed < v_cfg.capacity THEN
    v_status := 'confirmed';
  ELSIF v_cfg.waitlist_enabled THEN
    v_status := 'waitlist';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  v_owner := v_identity.registration_organizer_id;
  IF v_owner IS NOT NULL AND v_owner <> v_host THEN
    PERFORM pg_advisory_xact_lock(
      212012,
      hashtext(v_host::text || ':' || v_identity.canonical_riviera_jugador_id::text)
    );

    INSERT INTO public.organizer_player_access (
      jugador_id, owner_organizador_id, grantee_organizer_id, access_type,
      granted_by_admin_id, is_active, is_public_ranking, joined_at, joined_via
    ) VALUES (
      v_identity.canonical_riviera_jugador_id, v_owner, v_host, 'granted_by_admin',
      NULL, true, false, now(), 'registration'
    )
    ON CONFLICT (grantee_organizer_id, jugador_id) DO UPDATE SET
      is_active = true,
      left_at = NULL,
      joined_at = coalesce(public.organizer_player_access.joined_at, now()),
      joined_via = coalesce(public.organizer_player_access.joined_via, 'registration'),
      updated_at = now()
    RETURNING id INTO v_access_id;

    v_local_id := public._ensure_granted_player_local_as(
      v_identity.canonical_riviera_jugador_id, v_host
    );
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.tournament_open_registration_entries (
    registration_id, tournament_id, riviera_jugador_id, official_player_key,
    riviera_id, status, source, cancellation_token_hash, display_name_snapshot,
    confirmed_at, preferred_side
  ) VALUES (
    v_cfg.id,
    v_cfg.tournament_id,
    v_identity.canonical_riviera_jugador_id,
    v_identity.official_player_key,
    v_identity.riviera_id,
    v_status,
    'public_riviera_id',
    v_token_hash,
    v_identity.display_name,
    CASE WHEN v_status = 'confirmed' THEN now() ELSE NULL END,
    v_side
  ) RETURNING id INTO v_entry_id;

  IF v_status = 'confirmed' THEN
    IF v_cfg.mode_type = 'americano' THEN
      PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
    ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
      PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'status', v_status,
    'riviera_id', v_identity.riviera_id,
    'nombre', v_identity.display_name,
    'cancellation_token', v_token,
    'preferred_side', v_side,
    'message', CASE v_status
      WHEN 'confirmed' THEN 'Asistencia confirmada. Ya estás dentro.'
      WHEN 'waitlist' THEN 'Cupo lleno. Quedaste en lista de espera.'
      WHEN 'pending_approval' THEN 'Solicitud enviada. El club debe aprobarte.'
      ELSE 'Registrado.'
    END
  );
END;
$$;
