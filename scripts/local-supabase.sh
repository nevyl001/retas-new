#!/usr/bin/env bash
# Arranca la base local de AppRiviera. No tiene enlace al proyecto remoto
# y no ejecuta supabase db push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/local-supabase"
PROD_REF="giswxhmjgjepoobdoljb"

if [[ -f "$LOCAL/supabase/.temp/project-ref" ]]; then
  ref="$(tr -d '[:space:]' < "$LOCAL/supabase/.temp/project-ref")"
  if [[ "$ref" == "$PROD_REF" ]]; then
    echo "local-supabase quedó enlazado a producción. No continúo." >&2
    exit 1
  fi
fi

if [[ "${1:-}" == "push" || "${1:-}" == "db" && "${2:-}" == "push" ]]; then
  echo "Este script no publica migraciones." >&2
  exit 1
fi

ln -sfn ../../../supabase/baseline/public-schema.sql \
  "$LOCAL/supabase/migrations/00000000000000_baseline.sql"

cd "$LOCAL"
if [[ "${1:-}" == "reset" ]]; then
  npx supabase db reset --workdir "$LOCAL" --yes
else
  npx supabase start --workdir "$LOCAL"
fi

status="$(npx supabase status --workdir "$LOCAL" -o env)"
api="$(printf '%s\n' "$status" | sed -n 's/^API_URL=//p' | tr -d '"')"
anon="$(printf '%s\n' "$status" | sed -n 's/^ANON_KEY=//p' | tr -d '"')"

if [[ "$api" != http://127.0.0.1:* ]] || [[ "$api" == *"$PROD_REF"* ]]; then
  echo "La API local no apunta a 127.0.0.1. No escribo .env.local." >&2
  exit 1
fi

umask 077
cat > "$ROOT/.env.local" <<EOF
REACT_APP_SUPABASE_URL=$api
REACT_APP_SUPABASE_ANON_KEY=$anon
EOF

echo "Supabase local listo en $api"
echo ".env.local apunta solo a esa URL. .env de producción no se modificó."
