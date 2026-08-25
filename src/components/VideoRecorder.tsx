import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import {
  captureBlock,
  captureBlockMessage,
  formatBytes,
  posterFromVideo,
  videoMimeType,
} from '../lib/media';

interface VideoRecorderProps {
  exerciseId: string;
  exerciseLabel: string;
  sessionId: string | null;
  /** Pre-filled clip label, e.g. "Set 3 — 25 lb × 10". */
  defaultLabel: string;
  onSaved: () => void;
  onCancel: () => void;
}

type Phase = 'idle' | 'live' | 'recording' | 'review' | 'error';

/**
 * A rear camera is the right default for filming someone lift, but a device
 * that only has a front camera rejects the constraint outright rather than
 * falling back, so ask again without it before giving up.
 */
async function requestCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 1280 } },
      audio: false,
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'OverconstrainedError' || name === 'NotFoundError') {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw e;
  }
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was denied. Allow it in the browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'This device has no camera the browser can use.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is busy — another app or tab has it. Close that and try again.';
  }
  return 'The camera could not be opened in this browser.';
}

/**
 * Phone-camera capture for a single movement. Clips are capped short by
 * default because a reviewable rep is three seconds, not three minutes, and
 * because these blobs have to fit on the device and then upload.
 */
export function VideoRecorder({
  exerciseId,
  exerciseLabel,
  sessionId,
  defaultLabel,
  onSaved,
  onCancel,
}: VideoRecorderProps) {
  const { state, addClip } = useApp();
  const maxSec = state.settings.clipMaxSec;

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; poster: string } | null>(null);
  const [label, setLabel] = useState(defaultLabel);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const posterRef = useRef('');
  const startedAtRef = useRef(0);
  const clipUrlRef = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopStream();
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    },
    [stopStream],
  );

  /**
   * Attach the stream once the <video> is actually in the DOM.
   *
   * `openCamera` runs while the phase is still `idle`, and the preview element
   * only mounts for `live` and `recording` — so assigning `srcObject` there
   * silently did nothing (the ref was null) and the user got the frame's black
   * background after granting permission. Recording still worked because it
   * reads the stream from the ref, which is why this survived several passes:
   * nothing asserted that the preview was showing anything.
   */
  useEffect(() => {
    const video = previewRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    // iOS additionally needs muted + playsInline, which are set on the element.
    void video.play().catch(() => undefined);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= maxSec) recorderRef.current?.stop();
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, maxSec]);

  const openCamera = async () => {
    const block = captureBlock();
    if (block !== 'ok') {
      setPhase('error');
      setError(
        `${captureBlockMessage(block, 'camera')} You can still compare clips recorded elsewhere.`,
      );
      return;
    }
    try {
      const stream = await requestCameraStream();
      streamRef.current = stream;
      // The effect above attaches it once the element exists.
      setPhase('live');
    } catch (e) {
      setPhase('error');
      setError(cameraErrorMessage(e));
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = videoMimeType();
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      clipUrlRef.current = url;
      // Grab the still while the preview is still live. A frame from the end
      // of the rep beats the early one, which can land before the camera has
      // warmed up and come back black.
      const late = previewRef.current ? posterFromVideo(previewRef.current) : '';
      setClip({ blob, url, poster: late || posterRef.current });
      setElapsed((Date.now() - startedAtRef.current) / 1000);
      setPhase('review');
      stopStream();
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start();
    setPhase('recording');
    navigator.vibrate?.(20);

    // Grab the poster a moment in, so it is not the first black frame.
    setTimeout(() => {
      if (previewRef.current) posterRef.current = posterFromVideo(previewRef.current);
    }, 400);
  };

  const stopRecording = () => recorderRef.current?.stop();

  const retake = () => {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = null;
    setClip(null);
    setPhase('idle');
    void openCamera();
  };

  const save = async () => {
    if (!clip) return;
    setSaving(true);
    await addClip(
      {
        exerciseId,
        sessionId,
        durationSec: Math.min(maxSec, Math.round(elapsed)),
        mimeType: clip.blob.type || 'video/webm',
        posterUrl: clip.poster,
        label: label.trim() || defaultLabel,
        note: note.trim(),
      },
      clip.blob,
    );
    setSaving(false);
    onSaved();
  };

  const remaining = Math.max(0, maxSec - elapsed);

  return (
    <div className="recorder">
      {phase === 'error' && (
        <>
          <div className="notice danger">{error}</div>
          <button className="btn block" style={{ marginTop: 10 }} onClick={onCancel}>
            Back to clips
          </button>
        </>
      )}

      {phase === 'idle' && (
        <>
          <div className="recorder-frame placeholder">
            <div className="center">
              <div style={{ fontSize: 30 }} aria-hidden="true">
                ⏺
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {exerciseLabel}
              </div>
              <div className="tiny faint">
                Clips are capped at {maxSec}s and stay on the device until backup runs.
              </div>
              {captureBlock() !== 'ok' && (
                <div className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>
                  {captureBlockMessage(captureBlock(), 'camera')}
                </div>
              )}
            </div>
          </div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={openCamera}>
            📷 Open camera
          </button>
          <button className="btn block ghost" style={{ marginTop: 8 }} onClick={onCancel}>
            Cancel
          </button>
        </>
      )}

      {(phase === 'live' || phase === 'recording') && (
        <>
          <div className={`recorder-frame${phase === 'recording' ? ' live' : ''}`}>
            <video ref={previewRef} muted playsInline autoPlay />
            {phase === 'recording' && (
              <div className="recorder-badge">
                <span className="dot" aria-hidden="true" />
                {remaining.toFixed(0)}s left
              </div>
            )}
          </div>
          {phase === 'live' ? (
            <>
              <button className="btn primary block" style={{ marginTop: 12 }} onClick={startRecording}>
                ⏺ Record ({maxSec}s max)
              </button>
              <button
                className="btn block ghost"
                style={{ marginTop: 8 }}
                onClick={() => {
                  stopStream();
                  onCancel();
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button className="btn danger block" style={{ marginTop: 12 }} onClick={stopRecording}>
              ⏹ Stop and review
            </button>
          )}
        </>
      )}

      {phase === 'review' && clip && (
        <>
          <div className="recorder-frame">
            <video src={clip.url} controls playsInline poster={clip.poster || undefined} />
          </div>
          <div className="tiny faint" style={{ margin: '8px 0 10px' }}>
            {Math.round(elapsed)}s · {formatBytes(clip.blob.size)} ·{' '}
            {clip.blob.type || 'video/webm'}
          </div>
          <div className="field">
            <label htmlFor="clip-label">Label</label>
            <input
              id="clip-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Set 3 — 25 lb × 10"
            />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="clip-note">What to look for</label>
            <input
              id="clip-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Knee tracking, trunk lean, tempo…"
            />
          </div>
          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save clip to this exercise'}
          </button>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn grow" onClick={retake}>
              Retake
            </button>
            <button className="btn grow ghost" onClick={onCancel}>
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
