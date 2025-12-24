# Rust WASM Core

This crate provides the image compression engine compiled to WebAssembly. It exposes a small wasm-bindgen API that the frontend worker calls.

## Build

```bash
wasm-pack build --target web --out-dir ../web/pkg --release
```

WebP support is optional. Enable it when your toolchain can compile libwebp for wasm32:

```bash
wasm-pack build --target web --out-dir ../web/pkg --release -- --features webp
```

## Notes

- PNG compression uses `imagequant` for palette quantization (PNG8-style) with optional dithering.
- JPEG compression uses `mozjpeg` on native targets and a pure Rust encoder on wasm32 for portability.
- WebP compression uses `libwebp` via the `webp` crate (feature-gated).
- All metadata is stripped by decode + re-encode.
