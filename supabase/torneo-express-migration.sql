-- Torneo Express por Grupos (tablas nuevas; no modifica retas existentes)
-- Ejecutar en Supabase SQL Editor en tu proyecto local/staging antes de probar la app.

CREATE TABLE IF NOT EXISTS torneo_express (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT,
  organizador_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'finalizado')),
  source_tournament_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN torneo_express.source_tournament_id IS
  'Reta de origen (solo referencia) para cargar parejas; no FK para no acoplar esquemas.';

CREATE TABLE IF NOT EXISTS torneo_express_grupos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  torneo_id UUID REFERENCES torneo_express(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS torneo_express_grupo_parejas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID REFERENCES torneo_express_grupos(id) ON DELETE CASCADE,
  pareja_id UUID NOT NULL,
  pareja_display TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (grupo_id, pareja_id)
);

CREATE TABLE IF NOT EXISTS torneo_express_partidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID REFERENCES torneo_express_grupos(id) ON DELETE CASCADE,
  pareja_local_id UUID NOT NULL,
  pareja_visitante_id UUID NOT NULL,
  puntos_local INTEGER DEFAULT NULL,
  puntos_visitante INTEGER DEFAULT NULL,
  ganador_id UUID DEFAULT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'jugado')),
  orden INTEGER DEFAULT 0,
  ronda INTEGER DEFAULT 0,
  cancha TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE torneo_express ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneo_express_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneo_express_grupo_parejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneo_express_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lectura_publica_torneo" ON torneo_express;
CREATE POLICY "lectura_publica_torneo" ON torneo_express FOR SELECT USING (true);

DROP POLICY IF EXISTS "lectura_publica_grupos" ON torneo_express_grupos;
CREATE POLICY "lectura_publica_grupos" ON torneo_express_grupos FOR SELECT USING (true);

DROP POLICY IF EXISTS "lectura_publica_grupo_parejas" ON torneo_express_grupo_parejas;
CREATE POLICY "lectura_publica_grupo_parejas" ON torneo_express_grupo_parejas FOR SELECT USING (true);

DROP POLICY IF EXISTS "lectura_publica_partidos" ON torneo_express_partidos;
CREATE POLICY "lectura_publica_partidos" ON torneo_express_partidos FOR SELECT USING (true);

DROP POLICY IF EXISTS "escritura_organizador_torneo" ON torneo_express;
CREATE POLICY "escritura_organizador_torneo" ON torneo_express
  FOR ALL USING (auth.uid() = organizador_id)
  WITH CHECK (auth.uid() = organizador_id);

DROP POLICY IF EXISTS "escritura_organizador_grupos" ON torneo_express_grupos;
CREATE POLICY "escritura_organizador_grupos" ON torneo_express_grupos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM torneo_express t
      WHERE t.id = torneo_express_grupos.torneo_id
      AND t.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM torneo_express t
      WHERE t.id = torneo_express_grupos.torneo_id
      AND t.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "escritura_organizador_grupo_parejas" ON torneo_express_grupo_parejas;
CREATE POLICY "escritura_organizador_grupo_parejas" ON torneo_express_grupo_parejas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM torneo_express_grupos g
      JOIN torneo_express t ON t.id = g.torneo_id
      WHERE g.id = torneo_express_grupo_parejas.grupo_id
      AND t.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM torneo_express_grupos g
      JOIN torneo_express t ON t.id = g.torneo_id
      WHERE g.id = torneo_express_grupo_parejas.grupo_id
      AND t.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "escritura_organizador_partidos" ON torneo_express_partidos;
CREATE POLICY "escritura_organizador_partidos" ON torneo_express_partidos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM torneo_express_grupos g
      JOIN torneo_express t ON t.id = g.torneo_id
      WHERE g.id = torneo_express_partidos.grupo_id
      AND t.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM torneo_express_grupos g
      JOIN torneo_express t ON t.id = g.torneo_id
      WHERE g.id = torneo_express_partidos.grupo_id
      AND t.organizador_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_torneo_express_organizador ON torneo_express(organizador_id);
CREATE INDEX IF NOT EXISTS idx_torneo_express_grupos_torneo ON torneo_express_grupos(torneo_id);
CREATE INDEX IF NOT EXISTS idx_torneo_express_grupo_parejas_grupo ON torneo_express_grupo_parejas(grupo_id);
CREATE INDEX IF NOT EXISTS idx_torneo_express_partidos_grupo ON torneo_express_partidos(grupo_id);
