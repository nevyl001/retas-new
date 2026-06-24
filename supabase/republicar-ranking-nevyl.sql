-- Republicar todos los jugadores de la cuenta Nevyl en el ranking del sitio oficial.
-- Ejecutar en Supabase SQL Editor (requiere permisos de escritura).
--
-- Nevyl organizador_id: 2770b522-9064-4c7b-a729-4a0ea7e3f6e8
-- URL ranking club: https://appriviera.rivieraopen.com/ranking/o/2770b522-9064-4c7b-a729-4a0ea7e3f6e8
--
-- rivieraopen.com debe filtrar por este organizador_id (no mezclar clubs).

DO $$
DECLARE
  v_org_id uuid := '2770b522-9064-4c7b-a729-4a0ea7e3f6e8';
  v_jugadores integer;
BEGIN
  INSERT INTO public.organizador_game_modes (organizador_id, visible_ranking_oficial)
  VALUES (v_org_id, true)
  ON CONFLICT (organizador_id) DO UPDATE
    SET visible_ranking_oficial = true,
        updated_at = now();

  UPDATE public.riviera_jugadores
  SET
    estado = CASE WHEN estado = 'archivado' THEN estado ELSE 'activo' END,
    suma_ranking = true,
    updated_at = now()
  WHERE organizador_id = v_org_id
    AND estado <> 'archivado';

  GET DIAGNOSTICS v_jugadores = ROW_COUNT;
  RAISE NOTICE 'Nevyl: % jugador(es) con Ranking + Público activos', v_jugadores;
END $$;

-- Verificación rápida por categoría (varonil)
SELECT categoria, count(*) AS jugadores
FROM public.riviera_jugadores
WHERE organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
  AND estado = 'activo'
  AND visible_publico IS TRUE
  AND COALESCE(suma_ranking, true) = true
GROUP BY categoria
ORDER BY categoria;
