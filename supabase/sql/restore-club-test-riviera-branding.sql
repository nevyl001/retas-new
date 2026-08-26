-- Restaura Club Test a branding Riviera (sin upgrade premium).
-- El patch temprano de Padelito Warehouse se aplicó por error a este UUID.

UPDATE public.organizador_game_modes
SET
  premium_branding_enabled = false,
  branding_key = NULL,
  updated_at = now()
WHERE organizador_id = 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d';

SELECT
  organizador_id,
  premium_branding_enabled,
  branding_key
FROM public.organizador_game_modes
WHERE organizador_id = 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d';

SELECT *
FROM public.get_organizador_branding_public(
  'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d'::uuid
);
