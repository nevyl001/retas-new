#!/usr/bin/env bash
# Aplica el fixture PCS local (idempotente) sobre el Postgres de Supabase local.
# NO toca producción. Password Auth: solo PcsLocal2026! (dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="$ROOT/supabase/seeds/pcs-organizador.sql"
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_retas-new-main}"

if [[ ! -f "$SEED" ]]; then
  echo "Missing seed: $SEED" >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Local Supabase DB container not running: $CONTAINER" >&2
  echo "Start with: npx supabase start" >&2
  exit 1
fi

docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$SEED"
echo "PCS local seed applied."
docker exec "$CONTAINER" psql -U postgres -d postgres -c \
  "SELECT mini_torneo, round_robin, duelo_2v2, premium_branding_enabled, branding_key
   FROM public.organizador_game_modes
   WHERE organizador_id = '35e31ab8-2a2f-4526-9e84-e130c85f8ca9';"
