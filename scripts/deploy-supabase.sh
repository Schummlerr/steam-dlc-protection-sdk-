#!/usr/bin/env bash
# Supabase Edge Function Deployment (macOS / Linux)
#
# Usage:
#   ./scripts/deploy-supabase.sh YOUR_PROJECT_REF YOUR_STEAM_WEB_API_KEY

set -euo pipefail

PROJECT_REF="${1:?Usage: $0 PROJECT_REF STEAM_WEB_API_KEY}"
STEAM_KEY="${2:?Usage: $0 PROJECT_REF STEAM_WEB_API_KEY}"

supabase link --project-ref "$PROJECT_REF"
supabase secrets set "STEAM_WEB_API_KEY=$STEAM_KEY"
supabase functions deploy verify-dlc --no-verify-jwt

echo ""
echo "Deployment complete."
echo "Unity endpoint: https://${PROJECT_REF}.supabase.co/functions/v1/verify-dlc"
