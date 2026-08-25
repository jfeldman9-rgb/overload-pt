import { useEffect, useState } from 'react';
import { getBlob } from './idb';

/* ── Recorder support ───────────────────────────────────────────────── */

const VIDEO_TYPES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

const AUDIO_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

function pickType(candidates: string[]): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function videoMimeType(): string {
  return pickType(VIDEO_TYPES);
}

export function audioMimeType(): string {
  return pickType(AUDIO_TYPES);
}

/** Why capture is unavailable, so the message can name the real cause. */
export type CaptureBlock = 'ok' | 'insecure' | 'no-recorder' | 'no-devices';

/**
 * Order matters. Over plain http — which is how a phone reaches a laptop dev
 * server on the same Wi-Fi — Safari and Chrome both hide
 * `navigator.mediaDevices` entirely. Checking the secure context first stops
 * the app blaming the device for a transport problem.
 */
export function captureBlock(): CaptureBlock {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
  if (typeof MediaRecorder === 'undefined') return 'no-recorder';
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'no-devices';
  }
  return 'ok';
}

export function captureBlockMessage(block: CaptureBlock, device: 'camera' | 'microphone'): string {
  switch (block) {
    case 'insecure':
      return `The ${device} needs a secure connection. This page is on http, so the browser hides it — open the app over https (or on localhost) and it becomes available.`;
    case 'no-recorder':
      return `This browser cannot record media. On iPhone this needs iOS 14.3 or newer.`;
    case 'no-devices':
      return `No ${device} is available to this browser.`;
    default:
      return '';
  }
}

/** Chrome exposes `webkitSpeechRecognition`; Firefox exposes nothing. */
export function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/* ── Posters ────────────────────────────────────────────────────────── */

/**
 * Grab a still from the live preview so clip lists are scannable without
 * autoplaying every video. Kept small on purpose: this string is stored in
 * the chart document, not in the blob store.
 */
export function posterFromVideo(video: HTMLVideoElement, width = 160): string {
  try {
    const ratio = video.videoHeight / (video.videoWidth || 1) || 1.4;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  }
}

/**
 * Placeholder frame for the seeded demo clips, generated as a data-URL SVG so
 * the repository ships no binary video. It is labelled as demo everywhere it
 * appears.
 */
export function placeholderPoster(label: string, hue = 168): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220" viewBox="0 0 160 220">
<rect width="160" height="220" fill="#131a25"/>
<rect x="0.5" y="0.5" width="159" height="219" fill="none" stroke="hsl(${hue} 60% 40% / 0.5)"/>
<circle cx="80" cy="62" r="13" fill="none" stroke="hsl(${hue} 70% 62%)" stroke-width="4"/>
<path d="M80 76 v46 M80 96 l-24 -14 M80 96 l24 -14 M80 122 l-20 34 M80 122 l20 34"
 fill="none" stroke="hsl(${hue} 70% 62%)" stroke-width="4" stroke-linecap="round"/>
<text x="80" y="196" font-family="system-ui,sans-serif" font-size="13" font-weight="600"
 fill="#93a3b8" text-anchor="middle">${label.replace(/[<>&]/g, '')}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ── Blob access ────────────────────────────────────────────────────── */

/**
 * Resolve an IndexedDB blob key to an object URL, revoking it on unmount so a
 * long review session does not leak a URL per clip.
 */
export function useBlobUrl(blobKey: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blobKey) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    void getBlob(blobKey).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [blobKey]);

  return url;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface FileShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

/**
 * Whether this browser can hand a file to the OS share sheet.
 *
 * On iPhone this is the route that actually saves a backup: the share sheet
 * offers "Save to Files", where an anchor with a `download` attribute may just
 * display the file. Detection has to pass a real File, because Safari reports
 * `canShare` true for text while refusing files.
 */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & FileShareCapableNavigator;
  if (!nav.share || !nav.canShare) return false;
  try {
    const probe = new File([new Uint8Array([0])], 'probe.zip', { type: 'application/zip' });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Must be called straight from a tap: both `share()` and a programmatic
 * download need transient activation, which any preceding `await` spends.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveOutcome> {
  const nav = navigator as Navigator & FileShareCapableNavigator;
  if (canShareFiles() && nav.share) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (error) {
      // The user dismissing the sheet is not a failure to fall back from.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
