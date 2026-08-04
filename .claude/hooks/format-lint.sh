#!/usr/bin/env bash
# Regra 1 — Format + lint ao editar.
# Audiência: Claude (PostToolUse em Edit|Write|MultiEdit).
# Roda Prettier + ESLint --fix no arquivo, a partir da raiz do projeto dele.
# Nunca bloqueia (sempre exit 0): é conveniência, não gate.
set -uo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

read_hook_payload
file="$(json_field file_path)"
[ -n "$file" ] || exit 0
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

root="$(project_root_of "$file")" || exit 0
[ -f "$root/package.json" ] || exit 0
cd "$root" || exit 0

npx --no-install prettier --write "$file" >/dev/null 2>&1 || true
npx --no-install eslint --fix "$file" >/dev/null 2>&1 || true
echo "✓ format+lint: ${file#"$root"/}" >&2
exit 0
