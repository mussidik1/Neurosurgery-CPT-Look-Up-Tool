#!/usr/bin/env bash
# Build, test, and publish ./site to the gh-pages branch of the "origin" remote.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node tools/build.mjs
node tools/test.mjs >/dev/null
REMOTE="$(git remote get-url origin)"
TMP="$(mktemp -d)"
cp -R site/. "$TMP"/
cd "$TMP"
git init -q -b gh-pages
git add -A
# Optional extra commit-message lines (for example attribution trailers) come from DEPLOY_TRAILERS.
git commit -q -m "Deploy site from $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)" ${DEPLOY_TRAILERS:+-m "$DEPLOY_TRAILERS"}
git push -f "$REMOTE" gh-pages
echo "Deployed to gh-pages."
