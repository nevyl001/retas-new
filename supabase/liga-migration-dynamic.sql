-- Complemento: políticas y columna para suma de puntos en jornadas
-- Ejecutar en Supabase si ya corriste liga-migration.sql

ALTER TABLE liga_jornadas
  ADD COLUMN IF NOT EXISTS puntos_aplicados boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'liga_inscripciones' AND policyname = 'liga_inscripciones_update'
  ) THEN
    CREATE POLICY liga_inscripciones_update ON liga_inscripciones
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM ligas l
          WHERE l.id = liga_id AND l.organizador_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'liga_jugadores' AND policyname = 'liga_jugadores_delete'
  ) THEN
    CREATE POLICY liga_jugadores_delete ON liga_jugadores
      FOR DELETE USING (organizador_id = auth.uid());
  END IF;
END $$;
