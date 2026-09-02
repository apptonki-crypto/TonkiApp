#!/usr/bin/env bash
# Baseline an existing Hostinger/production DB that was created before Prisma Migrate
# tracked history (P3005). Marks prior migrations as applied, then deploys pending ones.
set -euo pipefail

cd "$(dirname "$0")/.."

BASELINE=(
  20260504170000_initial_schema
  20260504190000_add_post_view_count
  20260504203000_post_author_feed_index
  20260504210000_post_content_edited_at
  20260611120000_add_post_share_count
  20260625120000_add_auth_identity_smart_wallet_passkey
  20260705153000_airdrop_end_date_and_campaign_archive
  20260712210000_airdrop_config_asset
  20260714230000_user_profile_fields
  20260714233000_establishment_avatar
  20260714240000_establishment_reward_catalog
  20260714243000_establishment_reward_image
)

echo "→ Marking ${#BASELINE[@]} existing migrations as already applied (baseline)…"
for name in "${BASELINE[@]}"; do
  echo "  resolve --applied $name"
  npx prisma migrate resolve --applied "$name"
done

echo "→ Deploying pending migration(s)…"
npx prisma migrate deploy

echo "✓ Done. Check status:"
npx prisma migrate status
