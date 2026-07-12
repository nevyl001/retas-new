-- =============================================================================
-- Torneo Express — Storage bucket para flyers de Evento
-- =============================================================================
-- Propósito:
--   Bucket público `evento-flyers` para imágenes/flyers del Evento
--   (branding público estilo banner). Path: {organizadorId}/{eventoId}.ext
--   Solo el dueño (auth.uid() = carpeta) puede subir/actualizar/borrar.
--   Lectura pública (anon) para la vista pública del evento.
--
-- Naturaleza: ADITIVO / idempotente (ON CONFLICT / DROP POLICY IF EXISTS).
-- NO reutiliza el bucket de avatares (`jugadores-avatars`).
--
-- Prerrequisitos:
--   - Supabase Storage habilitado
--   - Preferible: torneo-express-evento-fase1.sql ya aplicado (tabla evento)
--
-- Orden (docs/SQL-ORDEN.md): tras torneo-express-evento-fase1.sql
-- Ejecutar en: Supabase → SQL Editor (staging primero). NO ejecutar desde la app.
-- =============================================================================

-- ── 1) Bucket público ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evento-flyers',
  'evento-flyers',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2) Políticas storage.objects (idempotentes) ──
DROP POLICY IF EXISTS evento_flyers_public_select ON storage.objects;
DROP POLICY IF EXISTS evento_flyers_owner_insert ON storage.objects;
DROP POLICY IF EXISTS evento_flyers_owner_update ON storage.objects;
DROP POLICY IF EXISTS evento_flyers_owner_delete ON storage.objects;

-- Lectura pública (vista pública del evento / CDN)
CREATE POLICY evento_flyers_public_select
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'evento-flyers');

-- Escritura solo authenticated, carpeta = auth.uid()
CREATE POLICY evento_flyers_owner_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'evento-flyers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY evento_flyers_owner_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'evento-flyers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'evento-flyers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY evento_flyers_owner_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'evento-flyers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- ROLLBACK (comentado — solo staging / revertir)
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS evento_flyers_public_select ON storage.objects;
-- DROP POLICY IF EXISTS evento_flyers_owner_insert ON storage.objects;
-- DROP POLICY IF EXISTS evento_flyers_owner_update ON storage.objects;
-- DROP POLICY IF EXISTS evento_flyers_owner_delete ON storage.objects;
-- DELETE FROM storage.objects WHERE bucket_id = 'evento-flyers';
-- DELETE FROM storage.buckets WHERE id = 'evento-flyers';
-- COMMIT;
