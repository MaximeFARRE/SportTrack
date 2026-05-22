#!/usr/bin/env bash
# ============================================================
# Push toutes les variables de .env.production.local vers Vercel.
#
# Pré-requis :
#   npm install -g vercel
#   vercel login
#   vercel link   (dans ce répertoire — lie le repo au projet Vercel)
#
# Usage :
#   bash scripts/push_env_to_vercel.sh
# ============================================================
set -euo pipefail

ENV_FILE=".env.production.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  $ENV_FILE introuvable."
  echo "   Copie .env.production.local.example → .env.production.local et remplis les valeurs."
  exit 1
fi

# Variables à pousser en Production + Preview + Development
TARGETS=("production" "preview" "development")

echo "📦  Lecture de $ENV_FILE …"

while IFS='=' read -r key value || [[ -n "$key" ]]; do
  # Ignorer lignes vides et commentaires
  [[ -z "$key" || "$key" == \#* ]] && continue
  # Ignorer valeurs vides
  [[ -z "$value" ]] && echo "⏭   $key  (vide, ignorée)" && continue

  # Supprimer les guillemets éventuels autour de la valeur
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"

  for target in "${TARGETS[@]}"; do
    printf '%s' "$value" | vercel env add "$key" "$target" --force 2>/dev/null \
      && echo "✅  $key → $target" \
      || echo "⚠️   $key → $target (erreur — vérifie vercel link)"
  done

done < "$ENV_FILE"

echo ""
echo "🎉  Terminé. Lance 'vercel --prod' ou pousse sur main pour redéployer."
