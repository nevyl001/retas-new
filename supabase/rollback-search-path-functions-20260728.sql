-- =============================================================================
-- ROLLBACK -- restaura las 14 funciones a su definición ORIGINAL (sin
-- SET search_path), exactamente como estaban antes de
-- fix-search-path-functions-20260728.sql. Cuerpo idéntico al capturado en
-- backup-search-path-functions-20260728.sql.
-- NO EJECUTAR salvo que el fix ya se haya aplicado y se decida revertir.
-- =============================================================================

BEGIN;

-- ── _ensure_unique_jugador_slug ──
CREATE OR REPLACE FUNCTION public._ensure_unique_jugador_slug(p_organizador_id uuid, p_base_slug text, p_genero text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_slug text := coalesce(nullif(trim(p_base_slug), ''), 'jugador');
  v_try text := v_slug;
  v_suffix int := 0;
BEGIN
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.organizador_id = p_organizador_id
        AND rj.slug = v_try
        AND (
          (p_genero = 'F' AND rj.genero = 'F')
          OR (coalesce(p_genero, 'M') <> 'F' AND (rj.genero IS NULL OR rj.genero = 'M'))
        )
    ) THEN
      RETURN v_try;
    END IF;
    v_suffix := v_suffix + 1;
    v_try := v_slug || '-' || v_suffix::text;
  END LOOP;
END;
$function$;

-- ── _map_liga_nivel_to_riviera ──
CREATE OR REPLACE FUNCTION public._map_liga_nivel_to_riviera(p_nivel integer)
 RETURNS riviera_jugador_nivel
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_nivel IS NULL THEN 'intermedio'::public.riviera_jugador_nivel
    WHEN p_nivel <= 2 THEN 'iniciación'::public.riviera_jugador_nivel
    WHEN p_nivel <= 4 THEN 'intermedio'::public.riviera_jugador_nivel
    WHEN p_nivel = 5 THEN 'avanzado'::public.riviera_jugador_nivel
    ELSE 'élite'::public.riviera_jugador_nivel
  END;
$function$;

-- ── _normalize_riviera_id_exact ──
CREATE OR REPLACE FUNCTION public._normalize_riviera_id_exact(p_input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := trim(coalesce(p_input, ''));
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  IF v_trimmed !~ '^RIV-[0-9]{8}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_trimmed;
END;
$function$;

-- ── _normalize_riviera_id_loose ──
CREATE OR REPLACE FUNCTION public._normalize_riviera_id_loose(p_input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE v text;
BEGIN
  v := upper(trim(coalesce(p_input, '')));
  v := regexp_replace(v, '[[:space:]]+', '', 'g');
  IF v ~ '^RIV[0-9]{8}$' THEN v := 'RIV-' || substr(v, 4);
  ELSIF v ~ '^[0-9]{8}$' THEN v := 'RIV-' || v;
  END IF;
  IF v !~ '^RIV-[0-9]{8}$' THEN RETURN NULL; END IF;
  RETURN v;
END;
$function$;

-- ── _resolve_organizador_for_player ──
CREATE OR REPLACE FUNCTION public._resolve_organizador_for_player(p_player_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT org_id FROM (
    SELECT t.user_id AS org_id
    FROM public.pairs pr
    JOIN public.tournaments t ON t.id = pr.tournament_id
    WHERE (pr.player1_id = p_player_id OR pr.player2_id = p_player_id)
      AND t.user_id IS NOT NULL
    UNION ALL
    SELECT te.organizador_id AS org_id
    FROM public.pairs pr
    JOIN public.torneo_express_grupo_parejas gp ON gp.pareja_id = pr.id
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    JOIN public.torneo_express te ON te.id = g.torneo_id
    WHERE (pr.player1_id = p_player_id OR pr.player2_id = p_player_id)
      AND te.organizador_id IS NOT NULL
  ) sub
  WHERE org_id IS NOT NULL
  LIMIT 1;
$function$;

-- ── _riviera_historical_event_name_whitelist_hit ──
CREATE OR REPLACE FUNCTION public._riviera_historical_event_name_whitelist_hit(p_nombre text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public._riviera_normalize_evento_nombre(p_nombre) IN (
    'hack padel',
    'remontada final',
    'hack padel 5ta fuerza',
    'hackpadel 5ta fuerza'
  );
$function$;

-- ── _riviera_jugador_nombre_key ──
CREATE OR REPLACE FUNCTION public._riviera_jugador_nombre_key(p_nombre text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
$function$;

-- ── _riviera_normalize_evento_nombre ──
CREATE OR REPLACE FUNCTION public._riviera_normalize_evento_nombre(p_nombre text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g')));
$function$;

-- ── _riviera_normalize_player_name ──
CREATE OR REPLACE FUNCTION public._riviera_normalize_player_name(p_nombre text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g')));
$function$;

-- ── _riviera_participacion_parent_lookup_table ──
CREATE OR REPLACE FUNCTION public._riviera_participacion_parent_lookup_table(p_tipo_evento text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_tipo_evento
    WHEN 'reta' THEN 'tournaments'
    WHEN 'americano' THEN 'tournaments'
    WHEN 'duelo_2v2' THEN 'duelos_2v2'
    WHEN 'torneo_express' THEN 'torneo_express'
    WHEN 'liga' THEN 'liga_jornadas|ligas'
    ELSE NULL
  END;
$function$;

-- ── _slugify_jugador_nombre ──
CREATE OR REPLACE FUNCTION public._slugify_jugador_nombre(p_nombre text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(both '-' FROM regexp_replace(
    lower(coalesce(p_nombre, 'jugador')),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$function$;

-- ── auth_uid ──
CREATE OR REPLACE FUNCTION public.auth_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT auth.uid() $function$;

-- ── riviera_jugadores_set_updated_at ──
CREATE OR REPLACE FUNCTION public.riviera_jugadores_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ── update_updated_at_column ──
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

COMMIT;
