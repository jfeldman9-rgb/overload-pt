import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';
import {
  audioMimeType,
  captureBlock,
  captureBlockMessage,
  formatBytes,
  speechRecognitionCtor,
  type SpeechRecognitionLike,
} from '../lib/media';
import { mmss } from '../lib/format';

interface VoiceNoteSheetProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  exerciseId?: string | null;
  title?: string;
}

type Phase = 'idle' | 'recording' | 'review';

/**
 * Dictate a note while the session is still running.
 *
 * Transcription uses the browser's own recogniser, so no audio leaves the
 * device and no API key is involved. When the browser has no recogniser the
 * audio is still captured and the note is still saved — losing transcription
 * must never lose the note.
 */
export function VoiceNoteSheet({
  open,
  onClose,
  sessionId,
  exerciseId = null,
  title = 'Voice note',
}: VoiceNoteSheetProps) {
  const { addVoiceNote, state, actor } = useApp();
  const isTrainer = state.role === 'trainer';

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [edited, setEdited] = useState('');
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [trainerOnly, setTrainerOnly] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const supportedRef = useRef(true);
  /** Recogniser callbacks outlive the render that created them. */
  const recordingRef = useRef(false);
  const finalRef = useRef('');
  const listeningRef = useRef(false);
  /** Distinguishes the user pressing stop from the browser taking the mic. */
  const stopRequestedRef = useRef(false);

  const cleanup = useCallback(() => {
    recordingRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      recognitionRef.current?.abort();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cleanup();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [cleanup],
  );

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(
      () => setElapsed((Date.now() - startedAtRef.current) / 1000),
      200,
    );
    return () => window.clearInterval(id);
  }, [phase]);

  const startTranscription = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      supportedRef.current = false;
      listeningRef.current = false;
      setNotice('Live transcription is not supported on this browser — audio is still recording.');
      return;
    }
    supportedRef.current = true;
    const recognition = new Ctor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let addition = '';
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) addition += text;
        else pending += text;
      }
      if (addition) {
        finalRef.current = `${finalRef.current}${finalRef.current ? ' ' : ''}${addition.trim()}`;
        setFinalText(finalRef.current);
      }
      setInterim(pending.trim());
    };
    recognition.onerror = (event) => {
      const code = event.error ?? 'unknown';
      // Silence and a manual stop are normal; anything else is worth saying.
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        supportedRef.current = false;
        setNotice('The browser blocked speech recognition — audio is still recording.');
        return;
      }
      // A recogniser can exist and still have no service behind it.
      supportedRef.current = false;
      setNotice(
        code === 'network'
          ? 'Live transcription is unavailable on this browser — audio is still recording.'
          : `Transcription stopped (${code}) — audio is still recording.`,
      );
    };
    recognition.onend = () => {
      // Chrome ends the session on silence; keep listening while recording.
      if (!recordingRef.current || !supportedRef.current) return;
      try {
        recognition.start();
      } catch {
        /* ignore double-start */
      }
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      listeningRef.current = true;
    } catch {
      supportedRef.current = false;
      setNotice('Speech recognition could not start — audio is still recording.');
    }
  };

  /** The transcript becomes the editable note the moment recording ends. */
  const toReview = () => {
    setEdited(finalRef.current.trim());
    // A recogniser can start, report no error, and still return nothing. Say so
    // rather than presenting an empty note as a successful transcription.
    if (listeningRef.current && !finalRef.current.trim()) {
      setNotice(
        (current) =>
          current ||
          'No words came through the transcriber — type the note instead. The audio is saved either way.',
      );
    }
    setPhase('review');
  };

  const start = async () => {
    setNotice('');
    finalRef.current = '';
    listeningRef.current = false;
    setFinalText('');
    setInterim('');
    setEdited('');
    startedAtRef.current = Date.now();
    setElapsed(0);

    const block = captureBlock();
    if (block !== 'ok') {
      toReview();
      setNotice(`${captureBlockMessage(block, 'microphone')} Type the note instead.`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = audioMimeType();
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudio({ blob, url });
        // Safari can hand the microphone to the speech recogniser and end the
        // recording under us. Say so rather than looking like a stray tap.
        const interrupted = !stopRequestedRef.current;
        cleanup();
        toReview();
        if (interrupted) {
          setNotice(
            'Recording stopped on its own — the browser took the microphone back. Everything captured up to that point is saved.',
          );
        }
      };
      recorderRef.current = recorder;
      stopRequestedRef.current = false;
      recorder.start();
      recordingRef.current = true;
      setPhase('recording');
      navigator.vibrate?.(20);
      startTranscription();
    } catch (e) {
      toReview();
      const name = e instanceof Error ? e.name : '';
      setNotice(
        name === 'NotReadableError' || name === 'AbortError'
          ? 'The microphone is busy — another app or tab has it. Type the note instead.'
          : 'Microphone access was denied — type the note instead.',
      );
    }
  };

  const stop = () => {
    stopRequestedRef.current = true;
    recordingRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanup();
      toReview();
    }
  };

  const transcript = [finalText, interim].filter(Boolean).join(' ').trim();

  const save = async () => {
    const body = edited.trim() || finalText.trim();
    if (!body) return;
    setSaving(true);
    await addVoiceNote(
      {
        sessionId,
        exerciseId,
        durationSec: Math.round(elapsed),
        transcript: finalText.trim(),
        cleaned: body,
        mimeType: audio?.blob.type ?? '',
        transcriptionSupported: supportedRef.current,
        trainerOnly: isTrainer ? trainerOnly : false,
      },
      audio?.blob ?? null,
    );
    setSaving(false);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudio(null);
    setPhase('idle');
    finalRef.current = '';
    setFinalText('');
    setEdited('');
    onClose();
  };

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {phase === 'idle' && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            Talk through the session. The words appear as you speak, and the transcript drops into
            the note when you stop — editable before it is saved.
          </p>
          <button className="mic-button" onClick={start} aria-label="Start voice note">
            <span className="mic-glyph" aria-hidden="true">
              🎙
            </span>
            <span>Start dictating</span>
          </button>
          {captureBlock() !== 'ok' && (
            <div className="notice warn">{captureBlockMessage(captureBlock(), 'microphone')}</div>
          )}
          <div className="tiny faint" style={{ marginTop: 10 }}>
            Audio stays on this device until backup runs. Nothing is sent to a transcription
            service.
          </div>
        </>
      )}

      {phase === 'recording' && (
        <>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="pill danger">● Recording</span>
            <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {mmss(elapsed)}
            </span>
          </div>
          <div className="transcript live" aria-live="polite">
            {transcript || <span className="faint">Listening…</span>}
          </div>
          {notice && <div className="notice warn">{notice}</div>}
          <button className="mic-button stop" onClick={stop} aria-label="Stop voice note">
            <span className="mic-glyph" aria-hidden="true">
              ⏹
            </span>
            <span>Stop and review</span>
          </button>
        </>
      )}

      {phase === 'review' && (
        <>
          {notice && <div className="notice warn">{notice}</div>}
          {audio && (
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="tiny faint" style={{ marginBottom: 6 }}>
                Room audio · {mmss(elapsed)} · {formatBytes(audio.blob.size)}
              </div>
              <audio src={audio.url} controls style={{ width: '100%' }} />
            </div>
          )}

          <div className="field">
            <label htmlFor="voice-note-body">Session note (editable)</label>
            <textarea
              id="voice-note-body"
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              placeholder="The transcript lands here. Tidy it up before saving."
            />
          </div>

          {finalText.trim() && finalText.trim() !== edited.trim() && (
            <details className="raw-transcript">
              <summary className="tiny faint">Raw transcript</summary>
              <div className="transcript">{finalText}</div>
            </details>
          )}

          {isTrainer && (
            <label className="toggle" style={{ marginTop: 8 }}>
              <span className="grow">
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>Clinical handoff only</span>
                <span className="tiny faint" style={{ display: 'block' }}>
                  Hidden from the client. Use for anything you would not say in front of them.
                </span>
              </span>
              <input
                type="checkbox"
                checked={trainerOnly}
                onChange={(e) => setTrainerOnly(e.target.checked)}
                style={{ width: 24, height: 24 }}
              />
            </label>
          )}

          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            onClick={save}
            disabled={saving || !edited.trim()}
          >
            {saving ? 'Saving…' : `Save note as ${actor.name}`}
          </button>
          <button
            className="btn block ghost"
            style={{ marginTop: 8 }}
            onClick={() => {
              setPhase('idle');
              finalRef.current = '';
              setFinalText('');
              setEdited('');
              setAudio(null);
            }}
          >
            Start over
          </button>
        </>
      )}
    </Sheet>
  );
}
