/// <reference lib="webworker" />
import init, { compress_image, detect_format, get_version } from './pkg/tinylocal.js'
import wasmUrl from './pkg/tinylocal_bg.wasm?url'

type QueueItem = {
  id: string
  name: string
  data: ArrayBuffer
  quality: number
  dithering: boolean
  progressive: boolean
  convertToWebp: boolean
}

type WorkerRequest =
  | { type: 'enqueue'; items: QueueItem[] }
  | { type: 'abort' }
  | { type: 'ping' }

let initialized = false
let processing = false
let abortRequested = false

const queue: QueueItem[] = []

async function ensureInit() {
  if (initialized) return
  await init(wasmUrl)
  initialized = true
  self.postMessage({ type: 'ready', version: get_version() })
}

async function processQueue() {
  if (processing) return
  processing = true

  while (queue.length > 0) {
    if (abortRequested) {
      abortRequested = false
      queue.length = 0
      self.postMessage({ type: 'aborted' })
      break
    }

    const job = queue.shift()
    if (!job) continue

    const data = new Uint8Array(job.data)

    try {
      const detected = detect_format(data)
      if (detected === 'unknown') {
        throw new Error('Unsupported image format')
      }

      let outputFormat = detected
      if (job.convertToWebp && detected === 'png') {
        outputFormat = 'webp'
      }

      self.postMessage({ type: 'started', id: job.id })

      let output: Uint8Array
      try {
        output = compress_image(data, outputFormat, job.quality, {
          dithering: job.dithering,
          progressive: job.progressive,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (
          outputFormat === 'webp' &&
          message.includes('WebP feature not enabled')
        ) {
          output = await encodeWebpFallback(data, job.quality)
        } else {
          throw error
        }
      }

      self.postMessage(
        { type: 'completed', id: job.id, output, outputFormat },
        [output.buffer as ArrayBuffer]
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ type: 'error', id: job.id, message })
    }
  }

  processing = false
}

async function encodeWebpFallback(
  data: Uint8Array,
  quality: number
): Promise<Uint8Array> {
  if (!('OffscreenCanvas' in self)) {
    throw new Error('WebP encoding not supported in this browser')
  }

  const blob = new Blob([data.buffer as ArrayBuffer])
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('WebP encoding unavailable (no 2D context)')
  }
  ctx.drawImage(bitmap, 0, 0)
  const outBlob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: quality / 100,
  })
  const buffer = await outBlob.arrayBuffer()
  return new Uint8Array(buffer)
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  if (message.type === 'ping') {
    await ensureInit()
    return
  }

  if (message.type === 'abort') {
    abortRequested = true
    if (!processing) {
      queue.length = 0
      self.postMessage({ type: 'aborted' })
    }
    return
  }

  if (message.type === 'enqueue') {
    await ensureInit()
    queue.push(...message.items)
    processQueue()
  }
}

export {}
