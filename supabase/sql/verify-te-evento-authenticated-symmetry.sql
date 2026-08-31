-- =============================================================================
-- VERIFY — simetría authenticated torneo_express_evento
--
-- Ejecutar en Supabase SQL Editor (prod o staging) ANTES y DESPUÉS de
-- fix-te-evento-authenticated-public-symmetry.sql.
--
-- IDs prod de referencia (2026-08-30 — reemplazar si cambian):
--   evento publicado: 9ce78d29-466b-4b63-86e1-545f84e7f663  (slug: summer-open)
--   org dueño:          cbc93677-0450-4622-a2fa-2f40947e385b
--   org ajeno (lector): cd45cea7-a8ac-4596-b0ee-24959b4cbb5d  (Club Test)
--   evento draft:       5ff508fb-26c3-4ff5-9426-e651a3440f25
--   org dueño draft:    35e31ab8-2a2f-4526-9e84-e130c85f8ca9
--
-- Resultado esperado ANTES del fix:
--   auth_select_policy_count = 1
--   B cross_club_published = 0 filas  ← confirma el bug
--   C cross_club_draft     = 0 filas
--   D anon_published       = 1 fila
--   E owner_draft          = 1 fila
--
-- Resultado esperado DESPUÉS del fix:
--   auth_select_policy_count = 2
--   B cross_club_published = 1 fila   ← fix OK
--   C cross_club_draft     = 0 filas  (sin regresión)
--   D anon_published       = 1 fila   (sin cambio)
--   E owner_draft          = 1 fila
-- =============================================================================

-- ── A) Inventario policies (solo lectura, fuera de transacción simulada) ─────
SELECT
  policyname,
  cmd,
  roles::text,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'torneo_express_evento'
  AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;

SELECT count(*) AS auth_select_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'torneo_express_evento'
  AND cmd = 'SELECT'
  AND roles::text LIKE '%authenticated%';
-- ANTES: 1 | DESPUÉS: 2

-- ── B–E) Simulación RLS — transacción con ROLLBACK (no persiste datos) ───────
BEGIN;

CREATE TEMP TABLE te_evento_symmetry_verify (
  caso text PRIMARY KEY,
  esperado_antes text,
  esperado_despues text,
  obtenido text,
  filas int
);

-- Guard: UUIDs de prueba siguen siendo válidos
DO $$
BEGIN
  IF NOT public.is_torneo_express_evento_public('9ce78d29-466b-4b63-86e1-545f84e7f663'::uuid) THEN
    RAISE EXCEPTION 'evento publicado de prueba ya no pasa is_torneo_express_evento_public — actualiza UUID';
  END IF;
  IF public.is_torneo_express_evento_public('5ff508fb-26c3-4ff5-9426-e651a3440f25'::uuid) THEN
    RAISE EXCEPTION 'evento draft de prueba ya no es draft/no-público — actualiza UUID';
  END IF;
END $$;

-- B) Organizador ajeno lee evento publicado de otro club (simula /eventos/{slug})
SET LOCAL request.jwt.claims = json_build_object(
  'sub', 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d',
  'role', 'authenticated'
)::text;
SET LOCAL role authenticated;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.torneo_express_evento
  WHERE id = '9ce78d29-466b-4b63-86e1-545f84e7f663'::uuid;

  INSERT INTO te_evento_symmetry_verify VALUES (
    'B. Auth ajeno → evento publicado otro club',
    '0 filas (bug activo)',
    '1 fila (fix OK)',
    v_count::text || ' fila(s)',
    v_count
  );
END $$;

RESET role;

-- C) Organizador ajeno NO debe leer draft ajeno
SET LOCAL request.jwt.claims = json_build_object(
  'sub', 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d',
  'role', 'authenticated'
)::text;
SET LOCAL role authenticated;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.torneo_express_evento
  WHERE id = '5ff508fb-26c3-4ff5-9426-e651a3440f25'::uuid;

  INSERT INTO te_evento_symmetry_verify VALUES (
    'C. Auth ajeno → evento draft otro club',
    '0 filas',
    '0 filas',
    v_count::text || ' fila(s)',
    v_count
  );
END $$;

RESET role;

-- D) anon sigue leyendo evento publicado
SET LOCAL request.jwt.claims = '{"role":"anon"}';
SET LOCAL role anon;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.torneo_express_evento
  WHERE id = '9ce78d29-466b-4b63-86e1-545f84e7f663'::uuid;

  INSERT INTO te_evento_symmetry_verify VALUES (
    'D. anon → evento publicado',
    '1 fila',
    '1 fila',
    v_count::text || ' fila(s)',
    v_count
  );
END $$;

RESET role;

-- E) Dueño lee su propio draft
SET LOCAL request.jwt.claims = json_build_object(
  'sub', '35e31ab8-2a2f-4526-9e84-e130c85f8ca9',
  'role', 'authenticated'
)::text;
SET LOCAL role authenticated;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.torneo_express_evento
  WHERE id = '5ff508fb-26c3-4ff5-9426-e651a3440f25'::uuid;

  INSERT INTO te_evento_symmetry_verify VALUES (
    'E. Dueño → su evento draft',
    '1 fila',
    '1 fila',
    v_count::text || ' fila(s)',
    v_count
  );
END $$;

RESET role;

SELECT * FROM te_evento_symmetry_verify ORDER BY caso;

DO $$
DECLARE
  v_has_public_policy boolean;
  v_cross_club int;
  v_draft_cross int;
  v_anon_pub int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'torneo_express_evento'
      AND policyname = 'te_evento_select_public_authenticated'
  ) INTO v_has_public_policy;

  SELECT filas INTO v_cross_club
  FROM te_evento_symmetry_verify WHERE caso LIKE 'B.%';

  SELECT filas INTO v_draft_cross
  FROM te_evento_symmetry_verify WHERE caso LIKE 'C.%';

  SELECT filas INTO v_anon_pub
  FROM te_evento_symmetry_verify WHERE caso LIKE 'D.%';

  IF NOT v_has_public_policy THEN
    IF v_cross_club = 0 AND v_draft_cross = 0 AND v_anon_pub = 1 THEN
      RAISE NOTICE 'Estado ANTES del fix coherente (cross_club=0, draft bloqueado, anon=1).';
    ELSE
      RAISE WARNING
        'Estado ANTES inconsistente: cross_club=% draft=% anon=% — revisar UUIDs',
        v_cross_club, v_draft_cross, v_anon_pub;
    END IF;
  ELSE
    IF v_cross_club = 1 AND v_draft_cross = 0 AND v_anon_pub = 1 THEN
      RAISE NOTICE 'Estado DESPUÉS del fix OK (cross_club=1, draft=0, anon=1).';
    ELSE
      RAISE WARNING
        'Estado DESPUÉS inconsistente: cross_club=% draft=% anon=%',
        v_cross_club, v_draft_cross, v_anon_pub;
    END IF;
  END IF;
END $$;

ROLLBACK;
