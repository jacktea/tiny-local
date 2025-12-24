import './styles.css'
import { zipSync } from 'fflate'
import {
  createRow,
  elements,
  ItemState,
  updateRow as renderRow,
  getMimeTypeFromFileName,
  formatBytes,
  formatPercent,
} from './ui'
import { t, setLanguage, getLanguage } from './i18n'

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
})

type WorkerMessage =
  | { type: 'ready'; version: string }
  | { type: 'started'; id: string }
  | { type: 'completed'; id: string; output: Uint8Array; outputFormat: string; quality?: number }
  | { type: 'error'; id: string; message: string }
  | { type: 'aborted' }

interface OutputItem {
  data: Uint8Array
  format: string
}

interface OriginalFile {
  name: string
  file: File
}

const state = {
  items: new Map<string, ItemState>(),
  rows: new Map<string, HTMLDivElement>(),
  outputs: new Map<string, OutputItem>(),
  originals: new Map<string, OriginalFile>(), // 保存原始文件数据以便重新处理
}

const mimeByFormat: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

const extensionByFormat: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  jpg: 'jpg',
  webp: 'webp',
}

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type === 'ready') {
    currentEngineVersion = `v${message.version}`
    currentStatus = 'ready'
    elements.engineVersion.textContent = currentEngineVersion
    elements.status.textContent = t().ready
    return
  }

  if (message.type === 'aborted') {
    currentStatus = 'aborted'
    elements.status.textContent = t().aborted
    updateStats()
    return
  }

  const item = state.items.get(message.id)
  if (!item) return

  if (message.type === 'started') {
    item.status = 'processing'
    currentStatus = 'compressing'
    elements.status.textContent = t().compressing
    updateRow(item)
    updateStats()
    return
  }

  if (message.type === 'completed') {
    item.status = 'done'
    item.outputSize = message.output.byteLength
    item.outputFormat = message.outputFormat
    state.outputs.set(item.id, {
      data: message.output,
      format: message.outputFormat,
    })
    updateRow(item)
    updateStats()
    return
  }

  if (message.type === 'error') {
    item.status = 'error'
    item.error = message.message
    updateRow(item)
    updateStats()
  }
}

function updateRow(item: ItemState) {
  const row = state.rows.get(item.id)
  if (!row) return
  const download = row.querySelector(
    '[data-action="download"]'
  ) as HTMLButtonElement | null
  if (download) {
    download.onclick = () => downloadSingle(item.id)
  }
  const remove = row.querySelector(
    '[data-action="delete"]'
  ) as HTMLButtonElement | null
  if (remove) {
    remove.onclick = () => removeItem(item.id)
  }
  const preview = row.querySelector(
    '[data-action="preview"]'
  ) as HTMLButtonElement | null
  if (preview) {
    preview.onclick = () => openPreview(item.id)
  }
  renderRow(row, item)
}

function removeItem(id: string) {
  const row = state.rows.get(id)
  if (row) {
    row.remove()
    state.rows.delete(id)
  }
  state.items.delete(id)
  state.outputs.delete(id)
  state.originals.delete(id)
  updateStats()
}

function updateStats() {
  const items = Array.from(state.items.values())
  const tr = t()
  if (!items.length) {
    elements.stats.textContent = tr.noFilesYet
    elements.downloadAll.disabled = true
    elements.cancel.disabled = true
    return
  }

  const done = items.filter((item) => item.status === 'done').length
  const pending = items.filter(
    (item) => item.status === 'queued' || item.status === 'processing'
  ).length
  const failed = items.filter((item) => item.status === 'error').length

  elements.stats.textContent = `${items.length} ${tr.files} · ${done} ${tr.doneCount} · ${pending} ${tr.pending} · ${failed} ${tr.failed}`
  elements.downloadAll.disabled = done === 0
  elements.cancel.disabled = pending === 0

  if (pending === 0 && done > 0) {
    currentStatus = 'complete'
    elements.status.textContent = tr.complete
  } else if (pending === 0) {
    currentStatus = 'idle'
    elements.status.textContent = tr.idle
  }
}

async function enqueueFiles(fileList: FileList | File[]) {
  for (const file of Array.from(fileList)) {
    const id = createId()
    const item: ItemState = {
      id,
      name: file.name,
      originalSize: file.size,
      status: 'queued',
    }
    state.items.set(id, item)

    const row = createRow(item)
    state.rows.set(id, row)
    elements.list.prepend(row)
    updateStats()

    const buffer = await file.arrayBuffer()
    // 保存原始文件引用以便后续重新处理和预览
    state.originals.set(id, { name: file.name, file })

    // 根据压缩模式确定质量参数
    const quality = currentCompressionMode === 'targetSize'
      ? 75 // 初始质量，后续会通过二分查找调整
      : Number(elements.qualityInput.value)

    worker.postMessage(
      {
        type: 'enqueue',
        items: [
          {
            id,
            name: file.name,
            data: buffer,
            quality,
            dithering: elements.ditherInput.checked,
            progressive: elements.progressiveInput.checked,
            convertToWebp: elements.convertWebpInput.checked,
            targetSize: currentCompressionMode === 'targetSize' ? getTargetSizeBytes() : undefined,
            resizeMode: elements.resizeEnabled.checked ? elements.resizeMode.value : undefined,
            resizeValue: elements.resizeEnabled.checked ? parseInt(elements.resizeValue.value) : undefined,
          },
        ],
      },
      [buffer]
    )
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  ;(self.crypto || (window as any).crypto).getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

function downloadSingle(id: string) {
  const output = state.outputs.get(id)
  const item = state.items.get(id)
  if (!output || !item) return
  const extension = extensionByFormat[output.format] ?? 'bin'
  const name = item.name.replace(/\.[^/.]+$/, '') + `.${extension}`
  const blob = new Blob([output.data.buffer as ArrayBuffer], {
    type: mimeByFormat[output.format] ?? 'application/octet-stream',
  })
  triggerDownload(blob, name)
}

function downloadAll() {
  const entries: Record<string, Uint8Array> = {}
  for (const [id, output] of state.outputs) {
    const item = state.items.get(id)
    if (!item) continue
    const extension = extensionByFormat[output.format] ?? 'bin'
    const name = item.name.replace(/\.[^/.]+$/, '') + `.${extension}`
    entries[name] = output.data
  }

  const zipped = zipSync(entries, { level: 6 })
  const blob = new Blob([zipped.buffer as ArrayBuffer], {
    type: 'application/zip',
  })
  triggerDownload(blob, `compressed-${Date.now()}.zip`)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  elements.dropzone.classList.remove('dragover')
  if (event.dataTransfer?.files?.length) {
    enqueueFiles(event.dataTransfer.files)
  }
}

function setupDragAndDrop() {
  elements.dropzone.addEventListener('dragover', (event) => {
    event.preventDefault()
    elements.dropzone.classList.add('dragover')
  })

  elements.dropzone.addEventListener('dragleave', () => {
    elements.dropzone.classList.remove('dragover')
  })

  elements.dropzone.addEventListener('drop', handleDrop)

  elements.fileInput.addEventListener('change', () => {
    if (elements.fileInput.files?.length) {
      enqueueFiles(elements.fileInput.files)
      elements.fileInput.value = ''
    }
  })
}

async function reprocessCompletedFiles() {
  const completedItems = Array.from(state.items.values()).filter(
    (item) => item.status === 'done'
  )

  if (completedItems.length === 0) return

  // 重新处理已完成的文件
  for (const item of completedItems) {
    const original = state.originals.get(item.id)
    if (!original) continue

    // 重置状态
    item.status = 'queued'
    item.outputSize = undefined
    item.outputFormat = undefined
    item.error = undefined
    state.outputs.delete(item.id)
    updateRow(item)

    // 使用新的选项重新处理
    const buffer = await original.file.arrayBuffer()
    worker.postMessage(
      {
        type: 'enqueue',
        items: [
          {
            id: item.id,
            name: original.name,
            data: buffer,
            quality: Number(elements.qualityInput.value),
            dithering: elements.ditherInput.checked,
            progressive: elements.progressiveInput.checked,
            convertToWebp: elements.convertWebpInput.checked,
            resizeMode: elements.resizeEnabled.checked ? elements.resizeMode.value : undefined,
            resizeValue: elements.resizeEnabled.checked ? parseInt(elements.resizeValue.value) : undefined,
          },
        ],
      },
      [buffer]
    )
  }

  updateStats()
}

// 预设模式
type PresetMode = 'custom' | 'social' | 'web' | 'archive'

interface PresetConfig {
  quality: number
  dithering: boolean
  progressive: boolean
  convertToWebp: boolean
  getDescription: () => string
}

const presets: Record<PresetMode, PresetConfig> = {
  custom: {
    quality: 75,
    dithering: true,
    progressive: true,
    convertToWebp: false,
    getDescription: () => '',
  },
  social: {
    quality: 82,
    dithering: true,
    progressive: true,
    convertToWebp: false,
    getDescription: () => {
      const tr = t()
      const isZh = getLanguage() === 'zh'
      return tr.presetSocial + ' · ' + (isZh ? '高质量 82' : 'High quality 82')
    },
  },
  web: {
    quality: 70,
    dithering: true,
    progressive: true,
    convertToWebp: true,
    getDescription: () => {
      const tr = t()
      const isZh = getLanguage() === 'zh'
      return tr.presetWeb + ' · ' + (isZh ? '平衡质量与大小 70' : 'Balanced 70')
    },
  },
  archive: {
    quality: 55,
    dithering: false,
    progressive: false,
    convertToWebp: false,
    getDescription: () => {
      const tr = t()
      const isZh = getLanguage() === 'zh'
      return tr.presetArchive + ' · ' + (isZh ? '最小文件大小 55' : 'Smallest size 55')
    },
  },
}

let currentPreset: PresetMode = 'custom'

function setupPresets() {
  const presetButtons = document.querySelectorAll('.preset-btn')
  const presetDescription = document.getElementById('presetDescription') as HTMLElement | null

  const applyPreset = (preset: PresetMode) => {
    currentPreset = preset
    const config = presets[preset]

    // 更新UI
    presetButtons.forEach((btn) => {
      if (btn instanceof HTMLElement && btn.dataset.preset === preset) {
        btn.classList.add('active')
      } else {
        btn.classList.remove('active')
      }
    })

    // 更新描述
    const description = config.getDescription()
    if (presetDescription && description) {
      presetDescription.textContent = description
    } else if (presetDescription) {
      presetDescription.textContent = ''
    }

    // 应用预设值（custom 模式不修改）
    if (preset !== 'custom') {
      elements.qualityInput.value = config.quality.toString()
      elements.qualityValue.textContent = config.quality.toString()
      elements.ditherInput.checked = config.dithering
      elements.progressiveInput.checked = config.progressive
      elements.convertWebpInput.checked = config.convertToWebp
    }

    // 如果有已完成的文件，提示是否重新处理
    const hasCompleted = Array.from(state.items.values()).some(
      (item) => item.status === 'done'
    )
    if (hasCompleted && preset !== 'custom') {
      const completedCount = Array.from(state.items.values()).filter(
        (item) => item.status === 'done'
      ).length
      if (completedCount > 0 && confirm(t().reprocessConfirm(completedCount))) {
        void reprocessCompletedFiles()
      }
    }
  }

  // 绑定预设按钮事件
  presetButtons.forEach((btn) => {
    if (btn instanceof HTMLElement && btn.dataset.preset) {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset as PresetMode
        if (preset in presets) {
          applyPreset(preset)
        }
      })
    }
  })
}

// 压缩模式：quality 或 targetSize
type CompressionMode = 'quality' | 'targetSize'

let currentCompressionMode: CompressionMode = 'quality'

function setupCompressionMode() {
  const modeButtons = document.querySelectorAll('.mode-btn')
  const targetSizeContainer = document.querySelector('.target-size-container') as HTMLElement
  const sliderContainer = document.querySelector('.slider') as HTMLElement

  const updateModeUI = (mode: CompressionMode) => {
    currentCompressionMode = mode
    modeButtons.forEach((btn) => {
      if (btn instanceof HTMLElement && btn.dataset.mode === mode) {
        btn.classList.add('active')
      } else {
        btn.classList.remove('active')
      }
    })

    if (mode === 'targetSize') {
      targetSizeContainer.style.display = 'flex'
      sliderContainer.style.opacity = '0.5'
      elements.qualityInput.disabled = true
      updateTargetSizeHint()
    } else {
      targetSizeContainer.style.display = 'none'
      sliderContainer.style.opacity = '1'
      elements.qualityInput.disabled = false
      elements.targetSizeHint.textContent = ''
    }
  }

  // 绑定模式按钮事件
  modeButtons.forEach((btn) => {
    if (btn instanceof HTMLElement && btn.dataset.mode) {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as CompressionMode
        updateModeUI(mode)
      })
    }
  })

  // 目标大小输入验证
  const validateTargetSize = () => {
    const value = parseFloat(elements.targetSizeInput.value)
    const unit = elements.targetSizeUnit.value
    let bytes = value

    if (unit === 'KB') {
      bytes = value * 1024
    } else if (unit === 'MB') {
      bytes = value * 1024 * 1024
    }

    // 检查是否有文件在队列中
    const items = Array.from(state.items.values())
    if (items.length > 0) {
      const totalOriginalSize = items.reduce((sum, item) => sum + item.originalSize, 0)
      const avgOriginalSize = totalOriginalSize / items.length

      const tr = t()
      if (bytes > avgOriginalSize * 0.99) {
        elements.targetSizeHint.textContent = tr.targetSizeWarning || '目标大小可能大于原图，建议设置更小的值'
        elements.targetSizeHint.style.color = 'var(--danger)'
      } else if (bytes < avgOriginalSize * 0.1) {
        elements.targetSizeHint.textContent = tr.targetSizeTooSmall || '目标大小非常小，可能导致严重的质量损失'
        elements.targetSizeHint.style.color = 'var(--danger)'
      } else {
        elements.targetSizeHint.textContent = ''
      }
    }
  }

  elements.targetSizeInput.addEventListener('input', validateTargetSize)
  elements.targetSizeUnit.addEventListener('change', validateTargetSize)
}

function updateTargetSizeHint() {
  const tr = t()
  elements.targetSizeHint.textContent = tr.targetSizeModeHint || '使用二分查找自动确定最佳质量参数'
  elements.targetSizeHint.style.color = 'var(--muted)'
}

function getTargetSizeBytes(): number {
  const value = parseFloat(elements.targetSizeInput.value)
  const unit = elements.targetSizeUnit.value

  if (unit === 'KB') {
    return value * 1024
  } else if (unit === 'MB') {
    return value * 1024 * 1024
  }
  return value * 1024
}

function setupResize() {
  // 尺寸调整开关
  elements.resizeEnabled.addEventListener('change', () => {
    if (elements.resizeEnabled.checked) {
      elements.resizeControls.style.display = 'flex'
    } else {
      elements.resizeControls.style.display = 'none'
    }
  })

  // 更新单位显示
  const updateResizeUnit = () => {
    const mode = elements.resizeMode.value
    if (mode === 'percentage') {
      elements.resizeUnit.textContent = '%'
      elements.resizeValue.max = '99'
      elements.resizeValue.value = Math.min(80, parseInt(elements.resizeValue.value) || 80).toString()
    } else {
      elements.resizeUnit.textContent = 'px'
      elements.resizeValue.max = '10000'
      if (mode === 'fixed' || mode === 'maxWidth') {
        elements.resizeValue.value = '1920'
      } else {
        elements.resizeValue.value = '1080'
      }
    }
  }

  elements.resizeMode.addEventListener('change', updateResizeUnit)
  updateResizeUnit() // 初始化
}

function setupControls() {
  elements.qualityValue.textContent = elements.qualityInput.value
  elements.qualityInput.addEventListener('input', () => {
    elements.qualityValue.textContent = elements.qualityInput.value
  })

  // 当选项改变时，如果有已完成的文件，可以重新处理
  const handleOptionChange = () => {
    // 手动修改选项时，切换到 custom 模式
    if (currentPreset !== 'custom') {
      currentPreset = 'custom'
      const presetButtons = document.querySelectorAll('.preset-btn')
      presetButtons.forEach((btn) => {
        if (btn instanceof HTMLElement) {
          if (btn.dataset.preset === 'custom') {
            btn.classList.add('active')
          } else {
            btn.classList.remove('active')
          }
        }
      })
      const presetDescription = document.getElementById('presetDescription') as HTMLElement | null
      if (presetDescription) {
        presetDescription.textContent = ''
      }
    }

    const hasCompleted = Array.from(state.items.values()).some(
      (item) => item.status === 'done'
    )
    if (hasCompleted) {
      // 选项改变后，已完成的文件可以使用新选项重新处理
      // 这里可以选择自动重新处理，或者添加一个"重新处理"按钮
      // 为了更好的用户体验，我们添加一个提示
      const completedCount = Array.from(state.items.values()).filter(
        (item) => item.status === 'done'
      ).length
      if (completedCount > 0 && confirm(t().reprocessConfirm(completedCount))) {
        void reprocessCompletedFiles()
      }
    }
  }

  elements.ditherInput.addEventListener('change', handleOptionChange)
  elements.progressiveInput.addEventListener('change', handleOptionChange)
  elements.convertWebpInput.addEventListener('change', handleOptionChange)
  // quality 滑块在拖动时也会触发，所以只在值改变时提示
  let qualityTimeout: number | null = null
  elements.qualityInput.addEventListener('input', () => {
    elements.qualityValue.textContent = elements.qualityInput.value
    // 延迟处理，避免拖动时频繁提示
    if (qualityTimeout) clearTimeout(qualityTimeout)
    qualityTimeout = window.setTimeout(handleOptionChange, 1000)
  })

  elements.downloadAll.addEventListener('click', downloadAll)
  elements.cancel.addEventListener('click', () => {
    worker.postMessage({ type: 'abort' })
    for (const item of state.items.values()) {
      if (item.status === 'queued') {
        item.status = 'aborted'
        updateRow(item)
      }
    }
    updateStats()
  })
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
  }
}

// 保存当前状态，以便语言切换时恢复
let currentStatus: 'ready' | 'idle' | 'compressing' | 'complete' | 'aborted' =
  'idle'
let currentEngineVersion: string | null = null

// 预览模态框状态
let previewUrls: { original: string; compressed: string } | null = null
let currentPreviewId: string | null = null // 当前预览的文件ID

// 打开预览模态框
function openPreview(id: string) {
  const original = state.originals.get(id)
  const output = state.outputs.get(id)
  const item = state.items.get(id)

  if (!original || !output || !item) return

  currentPreviewId = id

  // 清理之前的 URL（如果存在）
  if (previewUrls) {
    URL.revokeObjectURL(previewUrls.original)
    URL.revokeObjectURL(previewUrls.compressed)
    previewUrls = null
  }

  // 创建原图 Blob URL
  const originalMimeType =
    original.file.type || getMimeTypeFromFileName(original.name)
  const originalBlob = original.file.slice(
    0,
    original.file.size,
    originalMimeType
  )
  const originalUrl = URL.createObjectURL(originalBlob)

  // 创建压缩图 Blob URL - 使用与下载函数相同的方式
  const outputMimeType = mimeByFormat[output.format]
  const outputBlob = new Blob([output.data.buffer as ArrayBuffer], {
    type: outputMimeType ?? 'application/octet-stream',
  })
  const outputUrl = URL.createObjectURL(outputBlob)

  // 保存 URL 以便清理
  previewUrls = { original: originalUrl, compressed: outputUrl }

  // 显示模态框
  showPreviewModal({
    originalUrl,
    outputUrl,
    originalSize: item.originalSize,
    outputSize: item.outputSize!,
  })
}

// 显示预览模态框
function showPreviewModal(data: {
  originalUrl: string
  outputUrl: string
  originalSize: number
  outputSize: number
}) {
  const modal = document.getElementById('previewModal') as HTMLElement
  if (!modal) return

  // 设置图片源
  const originalImg = modal.querySelector(
    '#previewOriginal'
  ) as HTMLImageElement
  const compressedImg = modal.querySelector(
    '#previewCompressed'
  ) as HTMLImageElement

  if (!originalImg || !compressedImg) return

  // 先清除旧的图片源，确保重新加载
  originalImg.src = ''
  compressedImg.src = ''

  // 重置图片状态
  originalImg.style.opacity = '0'
  compressedImg.style.opacity = '0'

  // 图片加载完成后的处理
  let originalLoaded = false
  let compressedLoaded = false

  const checkAndShow = () => {
    if (originalLoaded && compressedLoaded) {
      originalImg.style.opacity = '1'
      compressedImg.style.opacity = '1'
    }
  }

  originalImg.onload = () => {
    originalLoaded = true
    checkAndShow()
  }
  originalImg.onerror = (e) => {
    console.error('Failed to load original image', {
      url: data.originalUrl,
      src: originalImg.src,
      error: e,
    })
    originalLoaded = true
    checkAndShow()
  }

  compressedImg.onload = () => {
    compressedLoaded = true
    checkAndShow()
  }
  compressedImg.onerror = (e) => {
    console.error('Failed to load compressed image', {
      url: data.outputUrl,
      src: compressedImg.src,
      error: e,
    })
    compressedLoaded = true
    checkAndShow()
  }

  // 设置新的图片源（使用 setTimeout 确保清除操作完成）
  setTimeout(() => {
    originalImg.src = data.originalUrl
    compressedImg.src = data.outputUrl
  }, 0)

  // 设置统计信息
  const stats = modal.querySelector('#previewStats') as HTMLElement
  if (stats) {
    stats.textContent = `${formatBytes(data.originalSize)} → ${formatBytes(
      data.outputSize
    )} (${formatPercent(data.originalSize, data.outputSize)} ${t().saved})`
  }

  // 重置滑块位置
  const handle = modal.querySelector('.preview-slider-handle') as HTMLElement
  if (handle) {
    handle.style.left = '50%'
  }
  if (compressedImg) {
    compressedImg.style.clipPath = 'inset(0 50% 0 0)'
  }

  // 显示模态框
  modal.classList.add('active')
}

// 关闭预览模态框
function closePreviewModal() {
  const modal = document.getElementById('previewModal') as HTMLElement
  if (!modal) return

  currentPreviewId = null

  // 释放 Blob URL
  if (previewUrls) {
    URL.revokeObjectURL(previewUrls.original)
    URL.revokeObjectURL(previewUrls.compressed)
    previewUrls = null
  }

  const originalImg = modal.querySelector(
    '#previewOriginal'
  ) as HTMLImageElement
  const compressedImg = modal.querySelector(
    '#previewCompressed'
  ) as HTMLImageElement

  if (originalImg) originalImg.src = ''
  if (compressedImg) compressedImg.src = ''

  modal.classList.remove('active')
}

// 设置预览滑块交互
function setupPreviewSlider() {
  const container = document.querySelector(
    '.preview-compare-container'
  ) as HTMLElement
  const handle = document.querySelector('.preview-slider-handle') as HTMLElement
  const compressedImg = document.getElementById(
    'previewCompressed'
  ) as HTMLImageElement
  const closeBtn = document.querySelector('.preview-modal-close') as HTMLElement
  const modal = document.getElementById('previewModal') as HTMLElement

  if (!container || !handle || !compressedImg || !closeBtn || !modal) return

  let isDragging = false

  // 更新滑块位置
  const updateSlider = (clientX: number) => {
    const rect = container.getBoundingClientRect()
    let percent = ((clientX - rect.left) / rect.width) * 100
    percent = Math.max(0, Math.min(100, percent))

    handle.style.left = `${percent}%`
    compressedImg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`
  }

  // 鼠标事件
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging = true
  })
  document.addEventListener('mouseup', () => (isDragging = false))
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    e.preventDefault()
    updateSlider(e.clientX)
  })

  // 触摸事件
  handle.addEventListener('touchstart', (e) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging = true
  })
  document.addEventListener('touchend', () => (isDragging = false))
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!isDragging) return
      e.preventDefault()
      updateSlider(e.touches[0].clientX)
    },
    { passive: false }
  )

  // 点击容器跳转滑块
  container.addEventListener('click', (e) => {
    if (e.target === handle || handle.contains(e.target as Node)) return
    updateSlider(e.clientX)
  })

  // 关闭按钮
  closeBtn.addEventListener('click', closePreviewModal)

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePreviewModal()
    }
  })

  // ESC 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closePreviewModal()
    }
  })
}

function setupI18n() {
  // 更新所有带有 data-i18n 属性的元素
  const updateI18nElements = () => {
    const tr = t()
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (key && key in tr) {
        const text = tr[key as keyof typeof tr]
        if (typeof text === 'string') {
          if (el.tagName === 'TITLE' || el.tagName === 'META') {
            if (el instanceof HTMLMetaElement && key === 'description') {
              el.content = text
            } else if (el instanceof HTMLTitleElement) {
              el.textContent = text
            }
          } else {
            // 跳过 engineVersion 和 status，它们需要特殊处理
            if (el.id !== 'engineVersion' && el.id !== 'status') {
              el.textContent = text
            }
          }
        }
      }
    })

    // 恢复状态文本（使用当前语言）
    if (currentEngineVersion !== null) {
      elements.engineVersion.textContent = currentEngineVersion
    } else {
      elements.engineVersion.textContent = tr.loading
    }

    // 根据当前状态更新状态文本
    const statusMap = {
      ready: tr.ready,
      idle: tr.idle,
      compressing: tr.compressing,
      complete: tr.complete,
      aborted: tr.aborted,
    }
    elements.status.textContent = statusMap[currentStatus] || tr.idle

    // 更新所有文件行的文本
    for (const [id, item] of state.items) {
      const row = state.rows.get(id)
      if (row) {
        updateRow(item)
      }
    }

    // 更新统计信息
    updateStats()

    // 更新预设模式描述
    const presetDescription = document.getElementById('presetDescription') as HTMLElement | null
    if (presetDescription && currentPreset !== 'custom') {
      const config = presets[currentPreset]
      presetDescription.textContent = config.getDescription()
    }
  }

  // 初始更新
  updateI18nElements()

  // 监听语言变化
  window.addEventListener('languagechange', updateI18nElements)

  // 设置语言切换按钮
  const langToggle = document.querySelector('#langToggle') as HTMLButtonElement
  if (langToggle) {
    langToggle.textContent = getLanguage() === 'zh' ? 'EN' : '中'
    langToggle.addEventListener('click', () => {
      const newLang = getLanguage() === 'zh' ? 'en' : 'zh'
      setLanguage(newLang)
      langToggle.textContent = newLang === 'zh' ? 'EN' : '中'
      updateI18nElements() // 更新所有国际化元素
    })
  }
}

// 主题管理
type Theme = 'light' | 'dark' | 'auto'

function getStoredTheme(): Theme {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored
  }
  return 'auto'
}

function setStoredTheme(theme: Theme) {
  localStorage.setItem('theme', theme)
}

function getEffectiveTheme(): 'light' | 'dark' {
  const stored = getStoredTheme()
  if (stored !== 'auto') {
    return stored
  }
  // 检测系统偏好
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.removeAttribute('data-theme')

  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
  }
  // auto 模式下不设置 data-theme，由 CSS media query 处理
}

function setupTheme() {
  const themeToggle = document.querySelector('#themeToggle') as HTMLButtonElement | null
  if (!themeToggle) return

  // 初始化主题
  const storedTheme = getStoredTheme()
  applyTheme(storedTheme)

  // 主题切换逻辑
  themeToggle.addEventListener('click', () => {
    const currentTheme = getStoredTheme()
    const effectiveTheme = getEffectiveTheme()

    // 切换顺序: auto -> light -> dark -> auto (基于当前有效主题)
    let newTheme: Theme
    if (currentTheme === 'auto') {
      // 当前是自动模式，切换到与当前有效主题相反的模式
      newTheme = effectiveTheme === 'dark' ? 'light' : 'dark'
    } else {
      // 当前是固定模式，切换回自动
      newTheme = 'auto'
    }

    setStoredTheme(newTheme)
    applyTheme(newTheme)
  })

  // 监听系统主题变化
  if (window.matchMedia) {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    darkModeQuery.addEventListener('change', () => {
      // 只有在 auto 模式下才响应系统变化
      if (getStoredTheme() === 'auto') {
        applyTheme('auto')
      }
    })
  }
}

setupDragAndDrop()
setupPresets()
setupCompressionMode()
setupResize()
setupControls()
setupServiceWorker()
setupI18n()
setupPreviewSlider()
setupTheme()
updateStats()

worker.postMessage({ type: 'ping' })

window.addEventListener('beforeunload', () => {
  for (const output of state.outputs.values()) {
    output.data = new Uint8Array()
  }
})
