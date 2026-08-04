#!/usr/bin/env bash
# Regra 4 — Typecheck ao finalizar.
# Audiência: Claude (hook Stop).
#
# O mesmo hook serve os dois modos de abrir o Claude Code, porque o baseline é
# instalado tanto na raiz de um workspace quanto dentro de um projeto:
#   - raiz é um repo   → typecheca o próprio projeto
#   - raiz não é repo  → typecheca os projetos irmãos (workspace multi-projeto)
#
# Só typecheca o que está sujo: rodar em projeto sem alteração é caro e ruidoso.
# exit 2 = sinaliza o erro de volta ao Claude.
set -uo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ROOT="$(workspace_root)"
failed=""

typecheck_project() {
  proj="$1"
  name="$(basename "$proj")"

  [ -f "$proj/package.json" ] || return 0
  # Sem alteração pendente não há o que conferir.
  [ -n "$(git -C "$proj" status --porcelain 2>/dev/null)" ] || return 0

  echo "› typecheck ($name)…" >&2
  if (cd "$proj" && npm run --silent typecheck >/dev/null 2>&1); then
    echo "✓ typecheck ok ($name)" >&2
    return 0
  fi

  # Sem script `typecheck` no package.json, ou ele falhou: roda o tsc direto
  # para conseguir mostrar os erros. Sem tsconfig, não há o que rodar.
  [ -f "$proj/tsconfig.json" ] || return 0
  if out="$(cd "$proj" && npx --no-install tsc --noEmit 2>&1)"; then
    echo "✓ typecheck ok ($name)" >&2
    return 0
  fi

  echo "⛔ typecheck falhou em '$name':" >&2
  printf '%s\n' "$out" | tail -30 >&2
  failed="$failed $name"
}

if [ -d "$ROOT/.git" ]; then
  typecheck_project "$ROOT"
else
  for proj in "$ROOT"/*/; do
    [ -d "$proj/.git" ] || continue
    typecheck_project "${proj%/}"
  done
fi

if [ -n "$failed" ]; then
  echo "⛔ Erros de tipo em:$failed — corrija antes de considerar pronto." >&2
  echo "   Ver .claude/rules/code-style.md." >&2
  exit 2
fi
exit 0
