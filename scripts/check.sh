#!/usr/bin/env bash
# Espelha o CI. Se isto passa, o CI passa — e o contrário também.
#
#   ./scripts/check.sh          os dois projetos
#   ./scripts/check.sh bot      só o bot
#   ./scripts/check.sh web      só o web
#
# O ocr-service é Python e opcional; não entra aqui (ver .github/workflows/).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

target="${1:-all}"
failed=0

run_project() {
  local project="$1"
  shift
  echo ""
  echo "── $project ──────────────────────────────────────────"
  if ! ( cd "$project" && "$@" ); then
    echo "⛔ $project falhou"
    failed=1
  fi
}

case "$target" in
  all) projects="bot web" ;;
  bot) projects="bot" ;;
  web) projects="web" ;;
  *) echo "uso: ./scripts/check.sh [all|bot|web]" >&2; exit 1 ;;
esac

for project in $projects; do
  run_project "$project" pnpm run check
done

echo ""
if [ "$failed" -ne 0 ]; then
  echo "⛔ check falhou — o trabalho não está pronto."
  exit 1
fi
echo "✅ check passou."
