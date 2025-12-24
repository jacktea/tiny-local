#!/usr/bin/env bash
set -euo pipefail

npm run wasm:build
npm run wasm:opt
npx vite build
