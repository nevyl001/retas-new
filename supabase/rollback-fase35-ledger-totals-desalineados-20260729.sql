-- =============================================================================
-- ROLLBACK -- restaura los 4 valores EXACTOS de points_total previos a
-- fix-fase35-ledger-totals-desalineados-20260729.sql (ver backup para el
-- razonamiento). NO EJECUTAR salvo que el fix ya se haya aplicado y se
-- decida revertir -- esto reintroduce la desalineación conocida.
-- =============================================================================

BEGIN;

UPDATE riviera_official_player_totals
SET points_total = 40, updated_at = '2026-06-30 16:45:23.22168+00'
WHERE official_player_key = 'de07b9b3-0e86-4fea-859a-7fed5196c06d';

UPDATE riviera_official_player_totals
SET points_total = 70, updated_at = '2026-06-30 23:58:23.273765+00'
WHERE official_player_key = 'ee340f5b-eb86-4f72-b130-1730f9432aa7';

UPDATE riviera_official_player_totals
SET points_total = 450, updated_at = '2026-07-13 02:25:12.449984+00'
WHERE official_player_key = '39bb743a-a0c2-43c0-abd8-9db5d2d55536';

UPDATE riviera_official_player_totals
SET points_total = 910, updated_at = '2026-07-13 16:47:26.897579+00'
WHERE official_player_key = 'af641bf7-702e-4427-b018-5f04b8a88d2c';

COMMIT;
