-- Lugar opcional en Duelo 2v2 (sedes distintas al nombre del club).
-- NO ejecutar automáticamente: aplicar en Supabase SQL Editor.
-- mostrar_lugar=false: no aparece "Lugar:" en WhatsApp (clubes con sede fija).

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS lugar text NULL;

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS mostrar_lugar boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.duelos_2v2.lugar IS
  'Sede / club donde se juega (ej. Hack Pádel). Independiente del nombre del organizador.';

COMMENT ON COLUMN public.duelos_2v2.mostrar_lugar IS
  'Si true, la convocatoria WhatsApp incluye la línea Lugar. Si false, se omite.';

NOTIFY pgrst, 'reload schema';
