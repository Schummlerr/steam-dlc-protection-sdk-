#!/usr/bin/env bash
# ============================================================================
# DLC Protect — Production Deployment Script
# ============================================================================
# Deploys everything to Supabase:
#   1. Push database migrations
#   2. Set environment secrets
#   3. Deploy Edge Function with dashboard
#   4. Generate admin API key
#
# Usage:
#   bash scripts/deploy-production.sh YOUR_PROJECT_REF
#
# Prerequisites:
#   npm install -g supabase
#   supabase login
# ============================================================================

set -euo pipefail

PROJECT_REF="${1:?Usage: $0 PROJECT_REF [STEAM_WEB_API_KEY]}"
STEAM_KEY="${2:-}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"

echo ""
echo "🚀 DLC Protect — Production Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project: $PROJECT_REF"
echo ""

# ── Step 1: Link ──
echo "🔗 1/5: Linking Supabase project..."
supabase link --project-ref "$PROJECT_REF"
echo ""

# ── Step 2: Migrations ──
echo "🗄️ 2/5: Pushing database migrations..."
supabase db push
echo ""

# ── Step 3: Seed Data ──
echo "🌱 3/5: Running seeds..."
supabase db execute --file supabase/migrations/003_saas_schema.sql 2>/dev/null || true

# Generate admin API key
ADMIN_API_KEY="sk_dlc_$(openssl rand -hex 24)"
API_KEY_HASH=$(echo -n "$ADMIN_API_KEY" | sha256sum | cut -d' ' -f1)

supabase db execute "
  INSERT INTO public.developers (id, email, name, plan)
  VALUES (gen_random_uuid(), 'admin@dlcprotect.com', 'Admin', 'enterprise')
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO public.api_keys (developer_id, key_hash, label)
  SELECT id, '$API_KEY_HASH', 'production'
  FROM public.developers WHERE email = 'admin@dlcprotect.com'
  ON CONFLICT (key_hash) DO NOTHING;
" 2>/dev/null || true
echo ""

# ── Step 4: Secrets ──
echo "🔐 4/5: Setting environment secrets..."
if [ -n "$STEAM_KEY" ]; then
  supabase secrets set STEAM_WEB_API_KEY="$STEAM_KEY"
fi
supabase secrets set JWT_SECRET="$JWT_SECRET"
supabase secrets set MOCK_STEAM="false"

echo ""

# ── Step 5: Deploy ──
echo "⚡ 5/5: Deploying Edge Function..."
supabase functions deploy verify-dlc --no-verify-jwt
echo ""

# ── Done ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Dashboard:  https://${PROJECT_REF}.supabase.co/functions/v1/verify-dlc/"
echo "  API:        https://${PROJECT_REF}.supabase.co/functions/v1/verify-dlc"
echo "  Admin Key:  $ADMIN_API_KEY"
echo ""
echo "  ⚠️  Save the Admin API Key — it will not be shown again!"
echo "  ℹ️  Add more developers via the Supabase SQL Editor."
echo ""