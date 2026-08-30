-- Fixture SOLO staging / entorno de prueba — NO ejecutar en producción.
--
-- Producción (giswxhmjgjepoobdoljb): no sembrar aquí. Crear una liga real de prueba
-- con es_publica=false vía SQL Editor y documentar su UUID en AUDIT_LIGA_PRIVATE_ID.
-- scripts/audit-rls-public-isolation.mjs (anon no debe poder leerla).
--
-- Tras ejecutar, configurar en CI o .env:
--   AUDIT_LIGA_PRIVATE_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
--
-- Sustituir el organizador_id de prueba antes de ejecutar en staging.
INSERT INTO public.ligas (
  id,
  nombre,
  organizador_id,
  es_publica,
  estado
)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'AUDIT FIXTURE — liga privada (no borrar en staging)',
  '00000000-0000-0000-0000-000000000001'::uuid,  -- ← reemplazar por org de prueba
  false,
  'activa'
)
ON CONFLICT (id) DO UPDATE
SET es_publica = false,
    nombre = EXCLUDED.nombre;

-- Verificación (service role): la fila existe
SELECT id, nombre, es_publica, public.is_liga_public(id) AS is_public
FROM public.ligas
WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
