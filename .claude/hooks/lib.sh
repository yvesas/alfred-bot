#!/usr/bin/env bash
# Helpers compartilhados pelos hooks do workspace.
# O workspace `yaslabs/` NÃO é um repo git — cada projeto dentro dele é.
# Por isso todo hook resolve a raiz do projeto a partir do arquivo/comando,
# nunca a partir do diretório do próprio hook.

# O JSON do tool chega no stdin, e stdin só pode ser consumido uma vez.
#
# `campo="$(json_field x)"` roda em subshell: se o parse lesse o stdin ali
# dentro, o subshell levaria o payload embora e a chamada seguinte voltaria
# vazia — o hook liberaria tudo sem avisar. Por isso o payload é lido pelo
# shell PAI, uma vez, e as consultas trabalham em cima da variável.
#
# Todo hook que usa json_field precisa chamar read_hook_payload primeiro, fora
# de qualquer $(...).
HOOK_PAYLOAD=""

read_hook_payload() {
  HOOK_PAYLOAD="$(cat)"
}

# Lê um campo de tool_input do payload já capturado. Uso: json_field file_path
json_field() {
  printf '%s' "$HOOK_PAYLOAD" | node -e '
    const key = process.argv[1];
    let d = "";
    process.stdin.on("data", c => (d += c)).on("end", () => {
      try {
        const j = JSON.parse(d || "{}");
        process.stdout.write((j.tool_input && j.tool_input[key]) || "");
      } catch { process.stdout.write(""); }
    });
  ' "$1"
}

# Sobe a partir de um caminho até achar a raiz do projeto (package.json ou .git).
project_root_of() {
  dir="$(cd "$(dirname "$1")" 2>/dev/null && pwd)" || return 1
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ] || [ -d "$dir/.git" ]; then
      printf '%s' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# Raiz do workspace (a pasta que contém este .claude/).
workspace_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}
