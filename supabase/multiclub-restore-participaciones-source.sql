-- Restaura participaciones movidas al clon → perfil origen (canonical).
-- Ejecutar si corriste la versión anterior que hacía UPDATE jugador_id al clone.
-- NO borra filas: devuelve jugador_id al origen conservando metadata.organizador_id.

-- 1) Diagnóstico (solo lectura)
SELECT
  i.riviera_id,
  rj.nombre,
  rj.organizador_id AS club_organizador_id,
  jp.id AS participacion_id,
  jp.evento_nombre,
  jp.tipo_evento,
  jp.puntos_obtenidos,
  jp.metadata->>'organizador_id' AS metadata_org,
  jp.jugador_id AS perfil_actual_id,
  i.canonical_riviera_jugador_id AS perfil_origen_canonical
FROM public.jugador_participaciones jp
JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
LEFT JOIN public.riviera_official_player_profile_link pl
  ON pl.riviera_jugador_id = rj.id
LEFT JOIN public.riviera_official_player_identity i
  ON i.official_player_key = pl.official_player_key
WHERE i.riviera_id = 'RIV-00000085'
ORDER BY jp.fecha DESC;

-- 2) Restaurar vía organizer_player_access (grants activos)
UPDATE public.jugador_participaciones jp
SET jugador_id = opa.jugador_id
FROM public.organizer_player_access opa
WHERE jp.jugador_id = opa.local_jugador_id
  AND opa.is_active = true
  AND opa.jugador_id IS NOT NULL
  AND opa.local_jugador_id IS NOT NULL
  AND opa.jugador_id <> opa.local_jugador_id
  AND jp.metadata->>'organizador_id' = opa.grantee_organizer_id::text;

-- 3) Restaurar clone → perfil canonical (misma Carrera / official_player_key)
UPDATE public.jugador_participaciones jp
SET jugador_id = i.canonical_riviera_jugador_id
FROM public.riviera_jugadores clone
JOIN public.riviera_official_player_profile_link pl
  ON pl.riviera_jugador_id = clone.id
JOIN public.riviera_official_player_identity i
  ON i.official_player_key = pl.official_player_key
WHERE jp.jugador_id = clone.id
  AND i.canonical_riviera_jugador_id IS NOT NULL
  AND jp.jugador_id <> i.canonical_riviera_jugador_id
  AND jp.metadata->>'organizador_id' = clone.organizador_id::text;

DO $$
DECLARE
  v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT DISTINCT rj.id
    FROM public.riviera_jugadores rj
    WHERE rj.estado = 'activo'
  LOOP
    BEGIN
      PERFORM public.refresh_jugador_stats(v_jid);
    EXCEPTION
      WHEN undefined_function THEN
        EXIT;
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
