# TinyLocal

TinyLocal 是一个生产就绪、隐私优先的图片压缩工具，完全在浏览器中运行。使用 Rust + WebAssembly、Vite 构建，并使用专用的 Web Worker 确保 UI 不阻塞。

## 在线预览

🌐 [https://tinylocal.851621.xyz/](https://tinylocal.851621.xyz/)

## 功能特性

- 客户端 PNG、JPEG 和 WebP 压缩
- PNG 量化（类似 PNG8）支持可选抖动
- JPEG 渐进式编码，支持质量控制（原生使用 mozjpeg，wasm32 使用纯 Rust 实现以保证可移植性）
- 可选的 PNG → WebP 转换
- 批量处理，每个图片显示统计信息
- 所有输出打包为 ZIP 下载
- 离线就绪的 PWA（首次加载后无需网络）
- 不上传、无分析、无追踪

## 前置要求

- Rust stable
- `wasm-pack`
- `wasm-opt` (Binaryen)
- Node.js 18+

## 本地开发

```bash
pnpm install
pnpm run dev
```

如果 WASM 包缺失，这将自动构建 WASM 包并启动 Vite 开发服务器。

如果使用 npm：

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

输出文件生成在 `dist/` 目录，可直接用于静态托管（Vercel、Cloudflare Pages、GitHub Pages 等）。

## 项目结构

```
tinylocal/
├── rust/                  # Rust + WASM 核心
├── web/                   # 前端 UI + worker
├── scripts/               # 构建辅助脚本
├── vite.config.ts
├── package.json
└── README.md
```

## WASM API

```ts
compress_image(
  data: Uint8Array,
  format: 'png' | 'jpeg' | 'webp',
  quality: number,
  options: { dithering?: boolean; progressive?: boolean }
): Uint8Array

detect_format(data: Uint8Array): string
get_version(): string
```

## 性能说明

- 压缩在 Web Worker 中运行，保持 UI 响应流畅
- 文件按顺序处理，保持内存使用稳定
- 支持超大文件（>20MB），但当前正在处理的作业无法在编码过程中中断（排队的作业可以取消）

## 浏览器兼容性

- 最新版本的 Chrome、Edge 和 Firefox
- Safari 16+（需要 WebAssembly + Web Workers 支持）
  - WebP 回退编码需要 Worker 中的 OffscreenCanvas 支持

## 功能标志

WebP 支持在 WASM 核心中是可选的（依赖 libwebp）。如果功能被禁用或不可用，worker 会回退到浏览器 WebP 编码。

要启用 libwebp 构建 WASM：

```bash
wasm-pack build rust --target web --out-dir web/pkg --release -- --features webp
```

如果您的工具链无法为 wasm32-unknown-unknown 编译 C 依赖，请安装 WASM sysroot（WASI SDK / Emscripten）或依赖浏览器回退。

## 国际化支持

项目支持中英文双语，会根据浏览器语言自动适配。用户也可以通过界面上的语言切换按钮手动切换语言。

## 隐私保护

所有压缩都在您的浏览器本地完成。不会上传或存储任何图片数据。

## 许可证

MIT
