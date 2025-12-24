import './styles.css'
import { zipSync } from 'fflate'
import { createRow, elements, ItemState, updateRow as renderRow } from './ui'
import { t, setLanguage, getLanguage } from './i18n'

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
})

type WorkerMessage =
  | { type: 'ready'; version: string }
  | { type: 'started'; id: string }
  | { type: 'completed'; id: string; output: Uint8Array; outputFormat: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'aborted' }

interface OutputItem {
  data: Uint8Array
  format: string
}

interface OriginalFile {
  name: string
  data: ArrayBuffer
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
    // 保存原始文件数据以便后续重新处理
    state.originals.set(id, { name: file.name, data: buffer })

    worker.postMessage(
      {
        type: 'enqueue',
        items: [
          {
            id,
            name: file.name,
            data: buffer,
            quality: Number(elements.qualityInput.value),
            dithering: elements.ditherInput.checked,
            progressive: elements.progressiveInput.checked,
            convertToWebp: elements.convertWebpInput.checked,
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

function reprocessCompletedFiles() {
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
    const buffer = original.data.slice(0) // 创建新的 ArrayBuffer
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
          },
        ],
      },
      [buffer]
    )
  }

  updateStats()
}

function setupControls() {
  elements.qualityValue.textContent = elements.qualityInput.value
  elements.qualityInput.addEventListener('input', () => {
    elements.qualityValue.textContent = elements.qualityInput.value
  })

  // 当选项改变时，如果有已完成的文件，可以重新处理
  const handleOptionChange = () => {
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
        reprocessCompletedFiles()
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

setupDragAndDrop()
setupControls()
setupServiceWorker()
setupI18n()
updateStats()

worker.postMessage({ type: 'ping' })

window.addEventListener('beforeunload', () => {
  for (const output of state.outputs.values()) {
    output.data = new Uint8Array()
  }
})
