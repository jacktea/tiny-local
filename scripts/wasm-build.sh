#!/usr/bin/env bash
set -euo pipefail

WASI_SDK_VERSION="${WASI_SDK_VERSION:-29}"
WASI_SDK_DIR_DEFAULT="$(pwd)/tools/wasi-sdk-${WASI_SDK_VERSION}"

detect_wasi_sdk() {
  if [[ -n "${WASI_SDK_PATH:-}" && -x "${WASI_SDK_PATH}/bin/clang" ]]; then
    return 0
  fi

  if [[ -x "${WASI_SDK_DIR_DEFAULT}/bin/clang" ]]; then
    export WASI_SDK_PATH="${WASI_SDK_DIR_DEFAULT}"
    return 0
  fi

  return 1
}

download_wasi_sdk() {
  local os arch archive_url archive_name extracted_dir
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m | tr '[:upper:]' '[:lower:]')"
  case "${arch}" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64) arch="x86_64" ;;
    *)
      echo "Unsupported CPU architecture for WASI SDK download: ${arch}" >&2
      return 1
      ;;
  esac
  case "${os}" in
    darwin)
      archive_name="wasi-sdk-${WASI_SDK_VERSION}.0-${arch}-macos.tar.gz"
      extracted_dir="wasi-sdk-${WASI_SDK_VERSION}.0-${arch}-macos"
      ;;
    linux)
      archive_name="wasi-sdk-${WASI_SDK_VERSION}.0-${arch}-linux.tar.gz"
      extracted_dir="wasi-sdk-${WASI_SDK_VERSION}.0-${arch}-linux"
      ;;
    *)
      echo "Unsupported OS for automatic WASI SDK download: ${os}" >&2
      return 1
      ;;
  esac

  archive_url="https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION}/${archive_name}"
  echo "Downloading WASI SDK from ${archive_url}"

  mkdir -p "$(dirname "${WASI_SDK_DIR_DEFAULT}")"

  if command -v curl >/dev/null 2>&1; then
    curl -L --fail -o "${archive_name}" "${archive_url}"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "${archive_name}" "${archive_url}"
  else
    echo "Neither curl nor wget is available to download WASI SDK." >&2
    return 1
  fi

  tar -xzf "${archive_name}"
  rm -f "${archive_name}"

  if [[ -n "${extracted_dir}" && -d "${extracted_dir}" ]]; then
    mv "${extracted_dir}" "${WASI_SDK_DIR_DEFAULT}"
  elif [[ -d "wasi-sdk-${WASI_SDK_VERSION}.0" ]]; then
    mv "wasi-sdk-${WASI_SDK_VERSION}.0" "${WASI_SDK_DIR_DEFAULT}"
  fi

  export WASI_SDK_PATH="${WASI_SDK_DIR_DEFAULT}"
}

if ! detect_wasi_sdk; then
  echo "WASI SDK not found. Downloading to ${WASI_SDK_DIR_DEFAULT}..." >&2
  download_wasi_sdk
fi

if [[ -n "${WASI_SDK_PATH:-}" && -x "${WASI_SDK_PATH}/bin/clang" ]]; then
  export CC_wasm32_unknown_unknown="$(pwd)/scripts/clang-wasi-wrapper.sh"
elif command -v xcrun >/dev/null 2>&1; then
  SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
  export CFLAGS_wasm32_unknown_unknown="${CFLAGS_wasm32_unknown_unknown:-} -isysroot ${SDKROOT}"
fi

wasm-pack build rust --target web --out-dir ../web/pkg --release --no-opt --features avif,webp
