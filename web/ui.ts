import { t } from './i18n'

export type ItemStatus = 'queued' | 'processing' | 'done' | 'error' | 'aborted' | 'skipped';

export interface ItemState {
  id: string;
  name: string;
  originalSize: number;
  status: ItemStatus;
  outputSize?: number;
  outputFormat?: string;
  error?: string;
}

export const elements = {
  dropzone: document.querySelector('[data-dropzone]') as HTMLElement,
  fileInput: document.querySelector('#fileInput') as HTMLInputElement,
  qualityInput: document.querySelector('#qualityInput') as HTMLInputElement,
  qualityValue: document.querySelector('#qualityValue') as HTMLElement,
  ditherInput: document.querySelector('#ditherInput') as HTMLInputElement,
  progressiveInput: document.querySelector('#progressiveInput') as HTMLInputElement,
  convertWebpInput: document.querySelector('#convertWebpInput') as HTMLInputElement,
  autoRotateInput: document.querySelector('#autoRotateInput') as HTMLInputElement,
  stripExifInput: document.querySelector('#stripExifInput') as HTMLInputElement,
  targetSizeInput: document.querySelector('#targetSizeInput') as HTMLInputElement,
  targetSizeUnit: document.querySelector('#targetSizeUnit') as HTMLSelectElement,
  targetSizeHint: document.querySelector('.target-size-hint') as HTMLElement,
  resizeEnabled: document.querySelector('#resizeEnabled') as HTMLInputElement,
  resizeMode: document.querySelector('#resizeMode') as HTMLSelectElement,
  resizeValue: document.querySelector('#resizeValue') as HTMLInputElement,
  resizeUnit: document.querySelector('#resizeUnit') as HTMLElement,
  resizeControls: document.querySelector('.resize-controls') as HTMLElement,
  downloadAll: document.querySelector('#downloadAll') as HTMLButtonElement,
  cancel: document.querySelector('#cancel') as HTMLButtonElement,
  list: document.querySelector('#fileList') as HTMLElement,
  stats: document.querySelector('#stats') as HTMLElement,
  status: document.querySelector('#status') as HTMLElement,
  engineVersion: document.querySelector('#engineVersion') as HTMLElement,
};

export function createRow(item: ItemState): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'file-row';
  row.dataset.id = item.id;

  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = item.name;

  const sizes = document.createElement('div');
  sizes.className = 'file-meta file-sizes';

  const reduction = document.createElement('div');
  reduction.className = 'file-meta file-reduction';

  const status = document.createElement('div');
  status.className = 'file-status';

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const preview = document.createElement('button');
  preview.className = 'ghost preview-btn';
  preview.dataset.action = 'preview';
  preview.textContent = t().preview;
  preview.disabled = true;

  const download = document.createElement('button');
  download.className = 'ghost';
  download.dataset.action = 'download';
  download.textContent = t().download;
  download.disabled = true;

  const skip = document.createElement('button');
  skip.className = 'ghost skip-btn';
  skip.dataset.action = 'skip';
  skip.textContent = t().skip;
  skip.style.display = 'none'; // 默认隐藏

  const remove = document.createElement('button');
  remove.className = 'ghost danger';
  remove.dataset.action = 'delete';
  remove.textContent = t().delete;

  actions.append(preview, download, skip, remove);

  row.append(name, sizes, reduction, status, actions);
  updateRow(row, item);
  return row;
}

export function updateRow(row: HTMLElement, item: ItemState) {
  const name = row.querySelector('.file-name') as HTMLElement | null;
  const sizes = row.querySelector('.file-sizes') as HTMLElement | null;
  const reduction = row.querySelector('.file-reduction') as HTMLElement | null;
  const status = row.querySelector('.file-status') as HTMLElement | null;
  const preview = row.querySelector('[data-action="preview"]') as HTMLButtonElement | null;
  const download = row.querySelector('[data-action="download"]') as HTMLButtonElement | null;
  const skip = row.querySelector('[data-action="skip"]') as HTMLButtonElement | null;
  const remove = row.querySelector('[data-action="delete"]') as HTMLButtonElement | null;
  const tr = t();

  if (name) name.textContent = item.name;
  if (sizes)
    sizes.textContent = item.outputSize
    ? `${formatBytes(item.originalSize)} → ${formatBytes(item.outputSize)}`
    : `${formatBytes(item.originalSize)} ${tr.original}`;

  if (reduction) {
    if (item.outputSize) {
      reduction.textContent = `${formatPercent(item.originalSize, item.outputSize)} ${tr.saved}`;
    } else if (item.error) {
      reduction.textContent = item.error;
    } else if (item.status === 'skipped') {
      reduction.textContent = tr.skippedStatus;
    } else {
      reduction.textContent = tr.waiting;
    }
  }

  // 状态文本映射
  const statusMap: Record<ItemStatus, string> = {
    queued: tr.queued,
    processing: tr.processing,
    done: tr.done,
    error: tr.error,
    aborted: tr.abortedStatus,
    skipped: tr.skipped,
  };
  if (status) {
    status.textContent = statusMap[item.status] || item.status.toUpperCase();
    status.className = `file-status ${item.status}`;
  }

  if (download) {
    download.disabled = item.status !== 'done';
    download.textContent = tr.download;
  }
  if (remove) {
    remove.textContent = tr.delete;
  }
  if (preview) {
    preview.disabled = item.status !== 'done';
    preview.textContent = tr.preview;
  }
  if (skip) {
    // 跳过按钮只在排队或处理中状态显示
    if (item.status === 'queued' || item.status === 'processing') {
      skip.style.display = 'inline-flex';
      skip.disabled = item.status === 'processing';
    } else {
      skip.style.display = 'none';
    }
  }
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatPercent(original: number, output: number): string {
  if (original === 0) return '0%';
  const diff = ((original - output) / original) * 100;
  return `${diff.toFixed(1)}%`;
}

export function getMimeTypeFromFileName(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  return mimeTypes[ext || ''] || 'image/png';
}
