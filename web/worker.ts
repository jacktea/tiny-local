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
  pngTruecolor: boolean
  autoRotate: boolean
  stripExif: boolean
  targetSize?: number // 目标文件大小（字节）
  resizeMode?: string // 尺寸调整模式
  resizeValue?: number // 尺寸调整值
}

type WorkerRequest =
  | { type: 'enqueue'; items: QueueItem[] }
  | { type: 'abort' }
  | { type: 'ping' }
  | { type: 'skip'; id: string } // 新增跳过请求

let initialized = false
let processing = false
let abortRequested = false
const skippedIds = new Set<string>() // 跟踪被跳过的文件ID

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

    // 检查是否被跳过
    if (skippedIds.has(job.id)) {
      skippedIds.delete(job.id)
      self.postMessage({ type: 'skipped', id: job.id })
      continue
    }

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
      let finalQuality = job.quality

      // 如果设置了目标大小，使用二分查找找到最佳质量
      if (job.targetSize) {
        const result = await findQualityForTargetSize(
          data,
          outputFormat,
          job.targetSize,
          job.dithering,
          job.progressive,
          job.resizeMode,
          job.resizeValue,
          job.pngTruecolor,
          job.autoRotate,
          job.stripExif
        )
        output = result.output
        finalQuality = result.quality
      } else {
        try {
          output = compress_image(data, outputFormat, job.quality, {
            dithering: job.dithering,
            progressive: job.progressive,
            resize_mode: job.resizeMode || 'none',
            resize_value: job.resizeValue || 100,
            png_truecolor: job.pngTruecolor,
            auto_rotate: job.autoRotate,
            strip_exif: job.stripExif,
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
      }

      self.postMessage(
        { type: 'completed', id: job.id, output, outputFormat, quality: finalQuality },
        [output.buffer as ArrayBuffer]
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ type: 'error', id: job.id, message })
    }
  }

  processing = false
}

// 使用二分查找找到符合目标大小的最佳质量
async function findQualityForTargetSize(
  data: Uint8Array,
  format: string,
  targetSize: number,
  dithering: boolean,
  progressive: boolean,
  resizeMode?: string,
  resizeValue?: number,
  pngTruecolor?: boolean,
  autoRotate?: boolean,
  stripExif?: boolean
): Promise<{ output: Uint8Array; quality: number }> {
  const minQuality = 40
  const maxQuality = 100
  const tolerance = 0.05 // 允许5%的误差

  const compress = async (quality: number): Promise<Uint8Array> => {
    try {
      return compress_image(data, format, quality, {
        dithering,
        progressive,
        resize_mode: resizeMode || 'none',
        resize_value: resizeValue || 100,
        png_truecolor: pngTruecolor,
        auto_rotate: autoRotate,
        strip_exif: stripExif,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (format === 'webp' && message.includes('WebP feature not enabled')) {
        return await encodeWebpFallback(data, quality)
      }
      throw error
    }
  }

  // 二分查找
  let low = minQuality
  let high = maxQuality
  let bestOutput: Uint8Array | null = null
  let bestQuality = minQuality

  // 先检查最大质量是否已经满足目标大小
  const maxOutput = await compress(maxQuality)
  if (maxOutput.length <= targetSize * (1 + tolerance)) {
    return { output: maxOutput, quality: maxQuality }
  }

  // 检查最小质量是否仍然太大
  const minOutput = await compress(minQuality)
  if (minOutput.length > targetSize) {
    // 无法达到目标大小，返回最小质量的结果
    return { output: minOutput, quality: minQuality }
  }

  // 二分查找最佳质量
  while (high - low > 2) {
    const mid = Math.floor((low + high) / 2)
    const output = await compress(mid)

    if (output.length > targetSize * (1 + tolerance)) {
      // 文件太大，需要更低的质量
      high = mid
    } else if (output.length < targetSize * (1 - tolerance)) {
      // 文件太小，可以尝试更高质量
      low = mid
      bestOutput = output
      bestQuality = mid
    } else {
      // 在容忍范围内
      bestOutput = output
      bestQuality = mid
      break
    }
  }

  // 尝试 low 和 high，找到最接近目标大小的
  const lowOutput = await compress(low)
  const highOutput = await compress(high)

  const lowDiff = Math.abs(lowOutput.length - targetSize)
  const highDiff = Math.abs(highOutput.length - targetSize)
  const bestDiff = bestOutput ? Math.abs(bestOutput.length - targetSize) : Infinity

  if (lowDiff <= highDiff && lowDiff <= bestDiff) {
    return { output: lowOutput, quality: low }
  } else if (highDiff <= bestDiff) {
    return { output: highOutput, quality: high }
  } else if (bestOutput) {
    return { output: bestOutput, quality: bestQuality }
  }

  return { output: highOutput, quality: high }
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

  if (message.type === 'skip') {
    skippedIds.add(message.id)
    return
  }

  if (message.type === 'enqueue') {
    await ensureInit()
    queue.push(...message.items)
    processQueue()
  }
}

export {}
