-- Módulo Liga (jugadores y datos propios del módulo)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS liga_jugadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text,
  telefono text,
  genero text CHECK (genero IN ('M', 'F')),
  nivel int CHECK (nivel BETWEEN 1 AND 6),
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  organizador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ligas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'upcoming' CHECK (estado IN ('upcoming', 'in_progress', 'completed')),
  organizador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  canchas_disponibles int NOT NULL DEFAULT 3 CHECK (canchas_disponibles >= 1),
  fecha_inicio date,
  fecha_fin date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS liga_inscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES liga_jugadores(id) ON DELETE CASCADE,
  puntos int NOT NULL DEFAULT 0,
  UNIQUE (liga_id, jugador_id)
);

CREATE TABLE IF NOT EXISTS liga_jornadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  numero int NOT NULL,
  estado text NOT NULL DEFAULT 'upcoming' CHECK (estado IN ('upcoming', 'in_progress', 'completed')),
  fecha date,
  puntos_aplicados boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (liga_id, numero)
);

CREATE TABLE IF NOT EXISTS liga_jornada_parejas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id uuid NOT NULL REFERENCES liga_jornadas(id) ON DELETE CASCADE,
  jugador1_id uuid NOT NULL REFERENCES liga_jugadores(id),
  jugador2_id uuid NOT NULL REFERENCES liga_jugadores(id),
  CHECK (jugador1_id <> jugador2_id)
);

CREATE TABLE IF NOT EXISTS liga_partidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id uuid NOT NULL REFERENCES liga_jornadas(id) ON DELETE CASCADE,
  pareja1_id uuid NOT NULL REFERENCES liga_jornada_parejas(id),
  pareja2_id uuid NOT NULL REFERENCES liga_jornada_parejas(id),
  score_pareja1 int,
  score_pareja2 int,
  cancha int,
  ronda int NOT NULL DEFAULT 1,
  estado text NOT NULL DEFAULT 'upcoming' CHECK (estado IN ('upcoming', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liga_jugadores_org ON liga_jugadores(organizador_id);
CREATE INDEX IF NOT EXISTS idx_ligas_org ON ligas(organizador_id);
CREATE INDEX IF NOT EXISTS idx_liga_inscripciones_liga ON liga_inscripciones(liga_id);
CREATE INDEX IF NOT EXISTS idx_liga_jornadas_liga ON liga_jornadas(liga_id);
CREATE INDEX IF NOT EXISTS idx_liga_jornada_parejas_jornada ON liga_jornada_parejas(jornada_id);
CREATE INDEX IF NOT EXISTS idx_liga_partidos_jornada ON liga_partidos(jornada_id);

ALTER TABLE liga_jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ligas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_inscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_jornada_parejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liga_partidos ENABLE ROW LEVEL SECURITY;

-- Lectura pública
CREATE POLICY liga_jugadores_select ON liga_jugadores FOR SELECT USING (true);
CREATE POLICY ligas_select ON ligas FOR SELECT USING (true);
CREATE POLICY liga_inscripciones_select ON liga_inscripciones FOR SELECT USING (true);
CREATE POLICY liga_jornadas_select ON liga_jornadas FOR SELECT USING (true);
CREATE POLICY liga_jornada_parejas_select ON liga_jornada_parejas FOR SELECT USING (true);
CREATE POLICY liga_partidos_select ON liga_partidos FOR SELECT USING (true);

-- Escritura: organizador de la liga o del jugador
CREATE POLICY liga_jugadores_insert ON liga_jugadores
  FOR INSERT WITH CHECK (organizador_id = auth.uid());

CREATE POLICY liga_jugadores_update ON liga_jugadores
  FOR UPDATE USING (organizador_id = auth.uid());

CREATE POLICY ligas_insert ON ligas
  FOR INSERT WITH CHECK (organizador_id = auth.uid());

CREATE POLICY ligas_update ON ligas
  FOR UPDATE USING (organizador_id = auth.uid());

CREATE POLICY ligas_delete ON ligas
  FOR DELETE USING (organizador_id = auth.uid());

CREATE POLICY liga_inscripciones_insert ON liga_inscripciones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_inscripciones_delete ON liga_inscripciones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_inscripciones_update ON liga_inscripciones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_jugadores_delete ON liga_jugadores
  FOR DELETE USING (organizador_id = auth.uid());

CREATE POLICY liga_jornadas_write ON liga_jornadas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_jornada_parejas_write ON liga_jornada_parejas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM liga_jornadas j
      JOIN ligas l ON l.id = j.liga_id
      WHERE j.id = jornada_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_partidos_write ON liga_partidos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM liga_jornadas j
      JOIN ligas l ON l.id = j.liga_id
      WHERE j.id = jornada_id AND l.organizador_id = auth.uid()
    )
  );
