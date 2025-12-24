type Language = 'en' | 'zh'

interface Translations {
  // HTML meta
  title: string
  description: string

  // Hero section
  tag: string
  heroTitle: string
  heroDescription: string
  engine: string
  privacy: string
  noUploads: string
  status: string

  // Status messages
  loading: string
  ready: string
  idle: string
  compressing: string
  complete: string
  aborted: string

  // Dropzone
  dropFilesTitle: string
  dropFilesSubtitle: string

  // Controls
  compressionMode: string
  modeQuality: string
  modeTargetSize: string
  targetFileSize: string
  targetSizeHint: string
  targetSizeWarning: string
  targetSizeTooSmall: string
  targetSizeModeHint: string
  presetMode: string
  presetCustom: string
  presetSocial: string
  presetWeb: string
  presetArchive: string
  quality: string
  ditherPNGs: string
  progressiveJPEG: string
  convertPNGToWebP: string
  downloadAll: string
  cancel: string
  privacyNote: string

  // Queue
  compressionQueue: string
  noFilesYet: string

  // File status
  waiting: string
  queued: string
  processing: string
  done: string
  error: string
  abortedStatus: string
  download: string
  delete: string
  original: string
  saved: string

  // Stats
  files: string
  doneCount: string
  pending: string
  failed: string

  // Footer
  footer: string

  // Messages
  optionsChanged: string
  reprocessConfirm: (count: number) => string

  // Preview
  preview: string
  previewModalTitle: string
  originalImage: string
  compressedImage: string
  close: string
  previewNotAvailable: string
}

const translations: Record<Language, Translations> = {
  en: {
    title: 'TinyLocal',
    description: 'Client-side image compression in your browser. No uploads, no tracking.',
    tag: 'Privacy-First · Offline Ready · WASM',
    heroTitle: 'TinyLocal',
    heroDescription:
      'TinyPNG-class compression, entirely in your browser. Drop PNG, JPEG, or WebP images and keep everything local.',
    engine: 'Engine',
    privacy: 'Privacy',
    noUploads: 'No uploads',
    status: 'Status',
    loading: 'Loading...',
    ready: 'Ready',
    idle: 'Idle',
    compressing: 'Compressing',
    complete: 'Complete',
    aborted: 'Aborted',
    dropFilesTitle: 'Drop files to compress',
    dropFilesSubtitle: 'or click to select images',
    compressionMode: 'Compression Mode',
    modeQuality: 'Quality',
    modeTargetSize: 'Target Size',
    targetFileSize: 'Target File Size',
    targetSizeHint: '',
    targetSizeWarning: 'Target size may be larger than original, consider a smaller value',
    targetSizeTooSmall: 'Target size is very small, may cause severe quality loss',
    targetSizeModeHint: 'Using binary search to find optimal quality',
    presetMode: 'Preset Mode',
    presetCustom: 'Custom',
    presetSocial: 'Social',
    presetWeb: 'Web',
    presetArchive: 'Archive',
    quality: 'Quality',
    ditherPNGs: 'Dither PNGs',
    progressiveJPEG: 'Progressive JPEG',
    convertPNGToWebP: 'Convert PNG to WebP',
    downloadAll: 'Download all',
    cancel: 'Cancel',
    privacyNote: 'Your images never leave this device. No analytics or tracking.',
    compressionQueue: 'Compression queue',
    noFilesYet: 'No files yet.',
    waiting: 'Waiting',
    queued: 'QUEUED',
    processing: 'PROCESSING',
    done: 'DONE',
    error: 'ERROR',
    abortedStatus: 'ABORTED',
    download: 'Download',
    delete: 'Delete',
    original: 'original',
    saved: 'saved',
    files: 'files',
    doneCount: 'done',
    pending: 'pending',
    failed: 'failed',
    footer: 'Built with Rust + WebAssembly. Ready for static hosting and offline use.',
    optionsChanged: 'Options changed.',
    reprocessConfirm: (count) =>
      `Options changed. Do you want to reprocess ${count} completed file${count > 1 ? 's' : ''}?`,
    preview: 'Preview',
    previewModalTitle: 'Preview Comparison',
    originalImage: 'Original',
    compressedImage: 'Compressed',
    close: 'Close',
    previewNotAvailable: 'Preview not available',
  },
  zh: {
    title: 'TinyLocal',
    description: '在浏览器中进行客户端图片压缩。不上传，不追踪。',
    tag: '隐私优先 · 离线可用 · WASM',
    heroTitle: 'TinyLocal',
    heroDescription:
      '类 TinyPNG 压缩效果，完全在您的浏览器中完成。拖放 PNG、JPEG 或 WebP 图片，所有处理都在本地进行。',
    engine: '引擎',
    privacy: '隐私',
    noUploads: '不上传',
    status: '状态',
    loading: '加载中...',
    ready: '就绪',
    idle: '空闲',
    compressing: '压缩中',
    complete: '完成',
    aborted: '已取消',
    dropFilesTitle: '拖放文件进行压缩',
    dropFilesSubtitle: '或点击选择图片',
    compressionMode: '压缩模式',
    modeQuality: '质量模式',
    modeTargetSize: '目标大小',
    targetFileSize: '目标文件大小',
    targetSizeHint: '',
    targetSizeWarning: '目标大小可能大于原图，建议设置更小的值',
    targetSizeTooSmall: '目标大小非常小，可能导致严重的质量损失',
    targetSizeModeHint: '使用二分查找自动确定最佳质量参数',
    presetMode: '预设模式',
    presetCustom: '自定义',
    presetSocial: '社交分享',
    presetWeb: 'Web 发布',
    presetArchive: '长期存档',
    quality: '质量',
    ditherPNGs: 'PNG 抖动',
    progressiveJPEG: '渐进式 JPEG',
    convertPNGToWebP: '将 PNG 转换为 WebP',
    downloadAll: '全部下载',
    cancel: '取消',
    privacyNote: '您的图片永远不会离开此设备。无分析，无追踪。',
    compressionQueue: '压缩队列',
    noFilesYet: '暂无文件。',
    waiting: '等待中',
    queued: '排队中',
    processing: '处理中',
    done: '完成',
    error: '错误',
    abortedStatus: '已取消',
    download: '下载',
    delete: '删除',
    original: '原始',
    saved: '已节省',
    files: '个文件',
    doneCount: '完成',
    pending: '等待中',
    failed: '失败',
    footer: '使用 Rust + WebAssembly 构建。支持静态托管和离线使用。',
    optionsChanged: '选项已更改。',
    reprocessConfirm: (count) => `选项已更改。是否重新处理 ${count} 个已完成的文件？`,
    preview: '预览',
    previewModalTitle: '预览对比',
    originalImage: '原图',
    compressedImage: '压缩后',
    close: '关闭',
    previewNotAvailable: '预览不可用',
  },
}

function detectLanguage(): Language {
  // 从 localStorage 读取用户设置的语言
  const saved = localStorage.getItem('language') as Language | null
  if (saved && (saved === 'en' || saved === 'zh')) {
    return saved
  }

  // 从浏览器语言检测
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

let currentLanguage: Language = detectLanguage()

export function getLanguage(): Language {
  return currentLanguage
}

export function setLanguage(lang: Language) {
  currentLanguage = lang
  localStorage.setItem('language', lang)
  updatePageLanguage()
  // 触发自定义事件，通知其他模块更新
  window.dispatchEvent(new CustomEvent('languagechange', { detail: lang }))
}

export function t(): Translations {
  return translations[currentLanguage]
}

// 更新 HTML lang 属性
function updatePageLanguage() {
  document.documentElement.lang = currentLanguage
}

// 初始化时更新
updatePageLanguage()
