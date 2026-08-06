#!/usr/bin/env bash
# Atualiza as convenções deste projeto a partir do repositório do baseline.
#
#   .claude/update-baseline.sh --check   mostra o que mudaria, sem escrever
#   .claude/update-baseline.sh           aplica
#
# Este script é a razão de o baseline funcionar fora desta máquina. O
# `bin/install` do repositório do baseline só existe onde a pasta dele está ao
# lado; num clone — no celular, na web, numa máquina nova — não há pasta irmã.
# Aqui o próprio projeto vai buscar no remote.
#
# Autocontido de propósito: qualquer coisa que ele precise já veio no clone.
set -euo pipefail

BASELINE_REMOTE="${BASELINE_REMOTE:-https://github.com/yvesas/yas-claude-base.git}"
BASELINE_REF="${BASELINE_REF:-main}"

PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-apply}"

if [ ! -d "$PROJECT/.git" ]; then
  echo "⛔ '$PROJECT' não é um repositório git." >&2
  exit 1
fi

# Uma pasta irmã, quando existe, é a fonte mais rápida e evita rede. O clone
# raso é o caminho de todo o resto.
LOCAL_SIBLING="$(cd "$PROJECT/.." 2>/dev/null && pwd)/claude-base"

if [ -x "$LOCAL_SIBLING/bin/install" ]; then
  echo "baseline: usando a cópia local em $LOCAL_SIBLING"
  exec "$LOCAL_SIBLING/bin/install" "$PROJECT" ${mode:+$([ "$mode" = "--check" ] && echo --check)}
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "baseline: buscando $BASELINE_REMOTE ($BASELINE_REF)…"
if ! git clone --quiet --depth 1 --branch "$BASELINE_REF" "$BASELINE_REMOTE" "$WORK/base" 2>"$WORK/err"; then
  echo "⛔ não consegui clonar o baseline." >&2
  sed 's/^/   /' "$WORK/err" >&2
  echo "   Repositório privado? Confira o acesso: gh auth status" >&2
  exit 1
fi

exec "$WORK/base/bin/install" "$PROJECT" ${mode:+$([ "$mode" = "--check" ] && echo --check)}
