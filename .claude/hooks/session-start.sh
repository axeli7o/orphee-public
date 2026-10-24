#!/bin/bash
# Prépare l'environnement d'une session Claude Code on the web :
#  - deps Cloud Functions (lint, tests, génération)
#  - outillage de vérification visuelle (Playwright ; chromium pré-provisionné)
# Synchrone, idempotent, non-interactif.
set -euo pipefail

# Sessions distantes (web) uniquement — en local l'environnement est déjà prêt.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --no-package-lock : ne JAMAIS réécrire les lockfiles. Selon la version de npm,
# `install` réordonne/strip des métadonnées (champs `libc`…) et salit l'arbre à
# chaque session. On installe sans toucher au lock (l'arbre reste propre).
NPM_FLAGS="--no-package-lock --no-audit --no-fund"

# 1. Cloud Functions : lint + tests + génération.
npm --prefix functions install $NPM_FLAGS

# 2. Harness visuel (Playwright pinné). Le binaire chromium est pré-provisionné
#    dans l'image (PLAYWRIGHT_BROWSERS_PATH) ; on tente l'install au cas où, sans
#    faire échouer le hook si le CDN est injoignable.
npm --prefix tools/visual install $NPM_FLAGS
( cd tools/visual && npx playwright install chromium ) || true

echo "session-start: dépendances prêtes (functions + tools/visual)."
