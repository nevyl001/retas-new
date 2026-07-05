-- Sprint 2.0.2 — Escenarios de prueba (SOLO STAGING)
-- Ejecutar autenticado como organizador dueño o Admin Maestro.
-- Reemplazar placeholders antes de ejecutar.
--
-- NOTA: Cada bloque usa BEGIN…ROLLBACK para no persistir datos de prueba.
-- Para prueba persistente, quitar ROLLBACK y usar jugadores de prueba dedicados.

-- ══════════════════════════════════════════════════════════════════════════════
-- T1 — Idempotencia: doble ensure mismo jugador → mismo Riviera ID
-- ══════════════════════════════════════════════════════════════════════════════
--
-- SELECT public.ensure_riviera_identity('<jugador_id>'::uuid);
-- SELECT public.ensure_riviera_identity('<jugador_id>'::uuid);
-- Esperado: mismo riviera_id, segunda llamada identity_created=false

-- ══════════════════════════════════════════════════════════════════════════════
-- T2 — Formato Riviera ID
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Tras T1 persistente:
-- SELECT riviera_id, riviera_id_serial
-- FROM riviera_official_player_identity i
-- JOIN riviera_official_player_profile_link l ON l.official_player_key = i.official_player_key
-- WHERE l.riviera_jugador_id = '<jugador_id>';
-- Esperado: riviera_id ~ '^RIV-[0-9]{8}$' y coherente con serial

-- ══════════════════════════════════════════════════════════════════════════════
-- T3 — Debut Riviera inmutable
-- ══════════════════════════════════════════════════════════════════════════════
--
-- SELECT debut_organizer_id, debut_at FROM riviera_official_player_identity ...;
-- Ejecutar ensure de nuevo.
-- SELECT debut_organizer_id, debut_at ...;
-- Esperado: valores idénticos

-- ══════════════════════════════════════════════════════════════════════════════
-- T4 — Jugador cedido reutiliza identidad origen (grant-aware)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 1. ensure('<origin_jugador_id>')
-- 2. ensure('<local_granted_jugador_id>')
-- Esperado: mismo official_player_key y riviera_id; link_source granted_local en local

-- ══════════════════════════════════════════════════════════════════════════════
-- T5 — ROMC legacy sin riviera_id: ensure asigna sin duplicar identidad
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Si existe identidad ROMC admin previa a 2.0.2 sin riviera_id:
-- SELECT public.ensure_riviera_identity('<jugador_con_link_romc>'::uuid);
-- Esperado: riviera_id_assigned=true, identity_created=false

-- ══════════════════════════════════════════════════════════════════════════════
-- T6 — Permiso: organizador ajeno debe fallar
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Login como organizador B, ejecutar ensure sobre jugador de organizador A.
-- Esperado: ERROR 'Sin permiso para asegurar identidad de este jugador'

-- ══════════════════════════════════════════════════════════════════════════════
-- T7 — Smoke app post-motor (manual)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Sin invocar ensure desde la app:
-- - Crear jugador, reta, rating, torneo — sin regresión

-- ══════════════════════════════════════════════════════════════════════════════
-- T8 — Validación formato helper (SQL Editor / superuser)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF public._format_riviera_id(1) <> 'RIV-00000001' THEN
    RAISE EXCEPTION 'T8 FAIL: formato 1';
  END IF;
  IF public._format_riviera_id(1283) <> 'RIV-00001283' THEN
    RAISE EXCEPTION 'T8 FAIL: formato 1283';
  END IF;
  IF public._format_riviera_id(15234) <> 'RIV-00015234' THEN
    RAISE EXCEPTION 'T8 FAIL: formato 15234';
  END IF;
  RAISE NOTICE 'T8 PASS: formato Riviera ID congelado OK';
END $$;
