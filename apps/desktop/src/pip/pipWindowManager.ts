import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export const PIP_PAYLOAD_KEY = 'movie_app_pip_payload';

/**
 * pip 窗口尺寸下限 = 收缩态（DOCK_SIZE）尺寸。
 * 收缩态要把窗口缩到只剩一个还原按钮，minWidth/minHeight 必须允许该尺寸，
 * 否则 setSize 会被系统夹回 200x150，收缩功能失效。
 */
export const PIP_MIN_SIZE = 44;

let openSeqCounter = 0;
let createPromise: Promise<WebviewWindow> | null = null;

export function nextOpenSeq(): number {
  openSeqCounter += 1;
  return openSeqCounter;
}

export function ensurePipWindow(): Promise<WebviewWindow> {
  if (createPromise) return createPromise;
  createPromise = (async () => {
    const existing = await WebviewWindow.getByLabel('pip');
    if (existing) return existing;
    return new WebviewWindow('pip', {
      url: '/?view=pip',
      title: '画中画',
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      // 缩放由 JS 主导（PipWindow 的 pointer 拖动）：必须关掉系统缩放，
      // 否则系统自由拖动会先贴一帧不合比例的矩形、再由 JS 事后回正，拖动全程抖动，
      // 并与系统最小尺寸（PIP_MIN_SIZE=44，dock 收缩态需要）互搏。
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      hiddenTitle: true,
      visible: false,
      width: 400,
      height: 261,
      minWidth: PIP_MIN_SIZE,
      minHeight: PIP_MIN_SIZE,
    });
  })().finally(() => {
    createPromise = null;
  });
  return createPromise;
}

export function writePipPayload(payload: unknown): void {
  try {
    localStorage.setItem(PIP_PAYLOAD_KEY, JSON.stringify(payload));
  } catch {}
}

export function readPipPayload<T>(): T | null {
  try {
    const raw = localStorage.getItem(PIP_PAYLOAD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearPipPayload(): void {
  try {
    localStorage.removeItem(PIP_PAYLOAD_KEY);
  } catch {}
}