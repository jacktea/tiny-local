#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${WASI_SDK_PATH:-}" ]]; then
  echo "WASI_SDK_PATH is not set." >&2
  exit 1
fi

SYSROOT="${WASI_SDK_PATH}/share/wasi-sysroot"
if [[ ! -d "${SYSROOT}" ]]; then
  SYSROOT="${WASI_SDK_PATH}/wasi-sysroot"
fi

if [[ ! -d "${SYSROOT}" ]]; then
  echo "WASI sysroot not found under ${WASI_SDK_PATH}." >&2
  exit 1
fi

args=()
for arg in "$@"; do
  if [[ "${arg}" == "--target=wasm32-unknown-unknown" ]]; then
    continue
  fi
  args+=("${arg}")
done

exec "${WASI_SDK_PATH}/bin/clang" \
  --target=wasm32-wasi \
  --sysroot="${SYSROOT}" \
  -isystem "${SYSROOT}/include" \
  -D__wasi__=1 \
  "${args[@]}"
