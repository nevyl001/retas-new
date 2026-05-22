-- Orden, ronda y cancha en partidos Torneo Express (ejecutar en Supabase SQL Editor)
ALTER TABLE torneo_express_partidos
  ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;

ALTER TABLE torneo_express_partidos
  ADD COLUMN IF NOT EXISTS ronda INTEGER DEFAULT 0;

COMMENT ON COLUMN torneo_express_partidos.orden IS
  'Orden de juego dentro del grupo (1 = primero).';

COMMENT ON COLUMN torneo_express_partidos.ronda IS
  'Número de ronda round-robin (partidos con la misma ronda suelen jugarse juntos).';

ALTER TABLE torneo_express_partidos
  ADD COLUMN IF NOT EXISTS cancha TEXT DEFAULT '1';

COMMENT ON COLUMN torneo_express_partidos.cancha IS
  'Cancha donde se juega el partido (el horario se comunica aparte a los jugadores).';

UPDATE torneo_express_partidos
SET cancha = '1'
WHERE cancha IS NULL OR TRIM(cancha) = '';

ALTER TABLE torneo_express_partidos
  ADD COLUMN IF NOT EXISTS programado_en TIMESTAMPTZ;

COMMENT ON COLUMN torneo_express_partidos.programado_en IS
  'Día y hora programados del partido (editable).';

UPDATE torneo_express_partidos
SET programado_en = created_at
WHERE programado_en IS NULL;

-- Rellenar orden en partidos ya existentes (por fecha de creación dentro de cada grupo)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY grupo_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM torneo_express_partidos
  WHERE orden IS NULL OR orden = 0
)
UPDATE torneo_express_partidos AS p
SET orden = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

-- Recargar caché de PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
