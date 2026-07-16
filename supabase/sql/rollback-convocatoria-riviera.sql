-- Rollback parcial Convocatoria Riviera (servicio global)
-- NO borra datos de inscripción ni slugs públicos.
--
-- ADVERTENCIA: no ejecutar si ya hay filas mode_type=duelo_2v2
-- si quieres volver a un esquema solo-tournament.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tournament_open_registration WHERE mode_type = 'duelo_2v2'
  ) THEN
    RAISE EXCEPTION 'Rollback bloqueado: existen convocatorias duelo_2v2';
  END IF;
END $$;

-- Quitar helpers nuevos del servicio global (opcional; links públicos siguen vivos)
DROP FUNCTION IF EXISTS public.close_open_game_registration(text, uuid);
DROP FUNCTION IF EXISTS public._assert_convocatoria_mode_allowed(text);

-- Conservar tablas y RPCs públicos (slug sigue funcionando).
-- 1) No drop de tournament_open_registration / entries
-- 2) No drop de get/join/cancel (rompe links públicos)
-- 3) Para revertir UI: desplegar código anterior
-- 4) Opcional: UPDATE mode_type='reta' WHERE mode_type='americano'

COMMENT ON TABLE public.tournament_open_registration IS
  'Convocatoria Riviera — rollback no destructivo; conservar datos y slugs.';
