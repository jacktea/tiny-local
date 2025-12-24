#!/usr/bin/env bash
set -euo pipefail

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "wasm-opt not found. Install Binaryen and try again." >&2
  exit 1
fi

for wasm in web/pkg/*.wasm; do
  [ -f "$wasm" ] || continue
  wasm-opt -Oz "$wasm" -o "$wasm"
done
