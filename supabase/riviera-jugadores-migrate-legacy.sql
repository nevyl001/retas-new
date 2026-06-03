-- Migración de datos legacy → riviera_jugadores
-- ⚠️ OBLIGATORIO: ejecutar ANTES supabase/riviera-jugadores-migration.sql (completo, sin error).
-- No elimina players ni liga_jugadores.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'riviera_jugador_nivel'
  ) THEN
    RAISE EXCEPTION
      'Falta el esquema base. Ejecuta primero riviera-jugadores-migration.sql en otra pestaña del SQL Editor.';
  END IF;
END $$;

-- Mapeo nivel numérico Liga (1–6) → enum
CREATE OR REPLACE FUNCTION public._map_liga_nivel_to_riviera(p_nivel int)
RETURNS public.riviera_jugador_nivel
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_nivel IS NULL THEN 'intermedio'::public.riviera_jugador_nivel
    WHEN p_nivel <= 2 THEN 'iniciación'::public.riviera_jugador_nivel
    WHEN p_nivel <= 4 THEN 'intermedio'::public.riviera_jugador_nivel
    WHEN p_nivel = 5 THEN 'avanzado'::public.riviera_jugador_nivel
    ELSE 'élite'::public.riviera_jugador_nivel
  END;
$$;

CREATE OR REPLACE FUNCTION public._slugify_jugador_nombre(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(translate(coalesce(p_nombre, 'jugador'), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

-- Resuelve organizador de un player legacy (sin depender de players.user_id)
CREATE OR REPLACE FUNCTION public._resolve_organizador_for_player(p_player_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
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
$$;

-- 1) Desde public.players
DO $$
DECLARE
  has_user_id boolean;
  has_whatsapp boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'user_id'
  ) INTO has_user_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'whatsapp_phone'
  ) INTO has_whatsapp;

  IF has_user_id THEN
    IF has_whatsapp THEN
      EXECUTE $sql$
        INSERT INTO public.riviera_jugadores (
          nombre, slug, email, telefono, whatsapp, nivel, genero,
          organizador_id, estado, legacy_player_id
        )
        SELECT DISTINCT ON (p.user_id, lower(trim(p.name)))
          trim(p.name),
          public._slugify_jugador_nombre(trim(p.name)),
          CASE WHEN p.email IS NOT NULL AND p.email NOT ILIKE '%@padel.local'
            THEN lower(trim(p.email)) ELSE NULL END,
          NULL::text,
          p.whatsapp_phone,
          'intermedio'::public.riviera_jugador_nivel,
          NULL::text,
          p.user_id,
          'activo'::public.riviera_jugador_estado,
          p.id
        FROM public.players p
        WHERE trim(coalesce(p.name, '')) <> ''
          AND p.user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.riviera_jugadores r WHERE r.legacy_player_id = p.id
          )
        ORDER BY p.user_id, lower(trim(p.name))
        ON CONFLICT (organizador_id, slug) DO NOTHING
      $sql$;
    ELSE
      EXECUTE $sql$
        INSERT INTO public.riviera_jugadores (
          nombre, slug, email, telefono, whatsapp, nivel, genero,
          organizador_id, estado, legacy_player_id
        )
        SELECT DISTINCT ON (p.user_id, lower(trim(p.name)))
          trim(p.name),
          public._slugify_jugador_nombre(trim(p.name)),
          CASE WHEN p.email IS NOT NULL AND p.email NOT ILIKE '%@padel.local'
            THEN lower(trim(p.email)) ELSE NULL END,
          NULL::text,
          NULL::text,
          'intermedio'::public.riviera_jugador_nivel,
          NULL::text,
          p.user_id,
          'activo'::public.riviera_jugador_estado,
          p.id
        FROM public.players p
        WHERE trim(coalesce(p.name, '')) <> ''
          AND p.user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.riviera_jugadores r WHERE r.legacy_player_id = p.id
          )
        ORDER BY p.user_id, lower(trim(p.name))
        ON CONFLICT (organizador_id, slug) DO NOTHING
      $sql$;
    END IF;
  ELSE
    -- Esquema legacy: organizador vía parejas/torneos/torneo express
    EXECUTE $sql$
      INSERT INTO public.riviera_jugadores (
        nombre, slug, email, telefono, whatsapp, nivel, genero,
        organizador_id, estado, legacy_player_id
      )
      SELECT DISTINCT ON (src.organizador_id, lower(trim(src.nombre)))
        src.nombre,
        public._slugify_jugador_nombre(src.nombre),
        src.email,
        NULL::text,
        src.whatsapp,
        'intermedio'::public.riviera_jugador_nivel,
        NULL::text,
        src.organizador_id,
        'activo'::public.riviera_jugador_estado,
        src.legacy_player_id
      FROM (
        SELECT
          p.id AS legacy_player_id,
          trim(p.name) AS nombre,
          CASE WHEN p.email IS NOT NULL AND p.email NOT ILIKE '%@padel.local'
            THEN lower(trim(p.email)) ELSE NULL END AS email,
          NULL::text AS whatsapp,
          COALESCE(
            public._resolve_organizador_for_player(p.id),
            (SELECT t.user_id FROM public.tournaments t
             WHERE t.user_id IS NOT NULL ORDER BY t.created_at DESC LIMIT 1),
            (SELECT te.organizador_id FROM public.torneo_express te
             WHERE te.organizador_id IS NOT NULL ORDER BY te.created_at DESC LIMIT 1)
          ) AS organizador_id
        FROM public.players p
        WHERE trim(coalesce(p.name, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM public.riviera_jugadores r WHERE r.legacy_player_id = p.id
          )
      ) src
      WHERE src.organizador_id IS NOT NULL
      ON CONFLICT (organizador_id, slug) DO NOTHING
    $sql$;
  END IF;
END $$;

-- 2) Desde liga_jugadores (si existe la tabla)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'liga_jugadores'
  ) THEN
    INSERT INTO public.riviera_jugadores (
      nombre,
      slug,
      email,
      telefono,
      whatsapp,
      nivel,
      genero,
      organizador_id,
      estado,
      legacy_liga_jugador_id,
      legacy_player_id
    )
    SELECT
      trim(lj.nombre),
      public._slugify_jugador_nombre(trim(lj.nombre)),
      NULLIF(lower(trim(lj.email)), ''),
      NULLIF(trim(lj.telefono), ''),
      NULL,
      public._map_liga_nivel_to_riviera(lj.nivel),
      lj.genero,
      lj.organizador_id,
      CASE lj.estado WHEN 'inactivo' THEN 'archivado'::public.riviera_jugador_estado ELSE 'activo'::public.riviera_jugador_estado END,
      lj.id,
      NULL
    FROM public.liga_jugadores lj
    WHERE trim(coalesce(lj.nombre, '')) <> ''
      AND lj.organizador_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.riviera_jugadores r
        WHERE r.legacy_liga_jugador_id = lj.id
      )
    ON CONFLICT (organizador_id, slug) DO NOTHING;
  END IF;
END $$;

-- 3) Inicializar filas de stats
INSERT INTO public.jugador_stats (jugador_id)
SELECT id FROM public.riviera_jugadores
ON CONFLICT (jugador_id) DO NOTHING;

SELECT public.refresh_jugador_stats(NULL);
