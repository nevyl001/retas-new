-- Tabla para que la vista pública (sin login) pueda leer format y team_config.
-- Ejecutar en Supabase SQL Editor para que la clasificación por equipos funcione en la vista pública.

CREATE TABLE IF NOT EXISTS tournament_public_config (
  tournament_id UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  format TEXT,
  team_config JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cualquiera puede leer (vista pública anónima)
ALTER TABLE tournament_public_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read" ON tournament_public_config;
CREATE POLICY "Allow public read" ON tournament_public_config
  FOR SELECT USING (true);

-- Solo usuarios autenticados pueden insertar/actualizar
DROP POLICY IF EXISTS "Allow authenticated upsert" ON tournament_public_config;
CREATE POLICY "Allow authenticated upsert" ON tournament_public_config
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Índice para búsqueda por tournament_id
CREATE INDEX IF NOT EXISTS idx_tournament_public_config_tournament_id
  ON tournament_public_config(tournament_id);

COMMENT ON TABLE tournament_public_config IS 'Config pública (format, team_config) para mostrar tabla por equipos en vista pública sin login';
