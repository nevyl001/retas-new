-- Sitio oficial (rivieraopen.com): solo jugadores con visible_publico = true explícito.
-- El admin maestro activa «Sitio oficial» por jugador; por defecto NO se publican.

ALTER TABLE public.riviera_jugadores
  ALTER COLUMN visible_publico SET DEFAULT false;

-- Tratar null como no publicado (opt-in estricto)
UPDATE public.riviera_jugadores
SET visible_publico = false, updated_at = now()
WHERE visible_publico IS NULL;

COMMENT ON COLUMN public.riviera_jugadores.visible_publico IS
  'true solo si el admin maestro publicó al jugador en rivieraopen.com. Por defecto false.';
