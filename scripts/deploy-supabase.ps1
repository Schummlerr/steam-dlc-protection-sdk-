# Supabase Edge Function Deployment
#
# Prerequisites:
#   npm install -g supabase
#   supabase login
#
# Steps:
#   1. Create project at https://supabase.com (Free Tier)
#   2. Run supabase/migrations/001_schema.sql in SQL Editor
#   3. Set secrets and deploy:

param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef,

    [Parameter(Mandatory = $true)]
    [string]$SteamWebApiKey
)

$ErrorActionPreference = "Stop"

Write-Host "Linking Supabase project $ProjectRef..."
supabase link --project-ref $ProjectRef

Write-Host "Setting STEAM_WEB_API_KEY secret..."
supabase secrets set "STEAM_WEB_API_KEY=$SteamWebApiKey"

Write-Host "Deploying verify-dlc edge function..."
supabase functions deploy verify-dlc --no-verify-jwt

Write-Host ""
Write-Host "Deployment complete."
Write-Host "Unity endpoint: https://$ProjectRef.supabase.co/functions/v1/verify-dlc"
