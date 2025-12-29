#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${WASI_SDK_PATH:-}" ]]; then
  echo "WASI_SDK_PATH is not set." >&2
  exit 1
fi

exec "${WASI_SDK_PATH}/bin/clang" \
  --sysroot="${WASI_SDK_PATH}/share/wasi-sysroot" \
  -D__wasi__=1 \
  "$@"
