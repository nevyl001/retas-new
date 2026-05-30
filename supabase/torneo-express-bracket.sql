-- Fase eliminatoria (bracket) — Torneo Express
-- Ejecutar en Supabase SQL Editor después de torneo-express-migration.sql

ALTER TABLE torneo_express
  ADD COLUMN IF NOT EXISTS fase_torneo TEXT DEFAULT 'grupos'
    CHECK (fase_torneo IN ('grupos', 'eliminatoria', 'cerrado'));

ALTER TABLE torneo_express
  ADD COLUMN IF NOT EXISTS fase_eliminacion TEXT
    CHECK (
      fase_eliminacion IS NULL
      OR fase_eliminacion IN ('semifinal', 'cuartos', 'octavos')
    );

ALTER TABLE torneo_express
  ADD COLUMN IF NOT EXISTS bracket_slots JSONB;

ALTER TABLE torneo_express
  ADD COLUMN IF NOT EXISTS fase_grupos_finalizada_at TIMESTAMPTZ;

COMMENT ON COLUMN torneo_express.fase_torneo IS
  'grupos | eliminatoria | cerrado';

COMMENT ON COLUMN torneo_express.bracket_slots IS
  'Snapshot del cuadro confirmado (slots con parejas/BYE)';

CREATE TABLE IF NOT EXISTS torneo_express_eliminatoria_partidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  torneo_id UUID NOT NULL REFERENCES torneo_express(id) ON DELETE CASCADE,
  ronda INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 1,
  cruce_index INTEGER NOT NULL DEFAULT 0,
  pareja_local_id UUID,
  pareja_visitante_id UUID,
  puntos_local INTEGER,
  puntos_visitante INTEGER,
  ganador_id UUID,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'jugado')),
  es_bye BOOLEAN DEFAULT FALSE,
  cancha TEXT,
  programado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_eliminatoria_torneo
  ON torneo_express_eliminatoria_partidos(torneo_id);

ALTER TABLE torneo_express_eliminatoria_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lectura_publica_eliminatoria" ON torneo_express_eliminatoria_partidos;
CREATE POLICY "lectura_publica_eliminatoria" ON torneo_express_eliminatoria_partidos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "escritura_organizador_eliminatoria" ON torneo_express_eliminatoria_partidos;
CREATE POLICY "escritura_organizador_eliminatoria" ON torneo_express_eliminatoria_partidos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM torneo_express t
      WHERE t.id = torneo_express_eliminatoria_partidos.torneo_id
      AND t.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM torneo_express t
      WHERE t.id = torneo_express_eliminatoria_partidos.torneo_id
      AND t.organizador_id = auth.uid()
    )
  );
