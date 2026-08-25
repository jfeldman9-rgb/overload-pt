import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { canRecordMedia, formatBytes, posterFromVideo, videoMimeType } from '../lib/media';

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
    if (!canRecordMedia()) {
      setPhase('error');
      setError(
        'This browser cannot record video. You can still compare clips recorded on another device.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play().catch(() => undefined);
      }
      setPhase('live');
    } catch (e) {
      setPhase('error');
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow it in the browser settings to record a clip.'
          : 'No camera available on this device.',
      );
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
      setClip({ blob, url, poster: posterRef.current });
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
