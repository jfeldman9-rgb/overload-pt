import { useCallback, useEffect, useRef, useState } from 'react';

export interface RestTimerState {
  running: boolean;
  /** Seconds remaining; negative once the prescribed rest is exceeded. */
  remaining: number;
  duration: number;
  elapsed: number;
  overdue: boolean;
  label: string;
  start: (durationSec: number, label?: string) => void;
  extend: (deltaSec: number) => void;
  skip: () => number | null;
  reset: () => void;
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.(pattern);
  }
}

function notify(body: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification('Rest complete', { body, silent: false });
  }
}

/** Short rising tone so the cue lands even with the phone face-down in a bag. */
function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* audio is a nicety, never a failure path */
  }
}

/**
 * Rest timer driven by wall-clock timestamps rather than an accumulating
 * interval, so backgrounding the tab or locking the phone cannot drift it.
 */
export function useRestTimer(alertsEnabled: boolean): RestTimerState {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // Recompute immediately when the tab regains focus after being throttled.
  useEffect(() => {
    const sync = () => setNow(Date.now());
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const elapsed = startedAt == null ? 0 : (now - startedAt) / 1000;
  const remaining = startedAt == null ? 0 : duration - elapsed;

  useEffect(() => {
    if (startedAt == null || firedRef.current) return;
    if (remaining > 0) return;
    firedRef.current = true;
    if (alertsEnabled) {
      vibrate([120, 80, 120]);
      chime();
      notify(label ? `Time for ${label}` : 'Start your next set');
    }
  }, [remaining, startedAt, alertsEnabled, label]);

  const start = useCallback((durationSec: number, nextLabel = '') => {
    firedRef.current = false;
    setDuration(Math.max(1, durationSec));
    setLabel(nextLabel);
    setStartedAt(Date.now());
    setNow(Date.now());
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const extend = useCallback((deltaSec: number) => {
    setDuration((d) => Math.max(1, d + deltaSec));
    firedRef.current = false;
  }, []);

  const skip = useCallback(() => {
    if (startedAt == null) return null;
    const actual = Math.round((Date.now() - startedAt) / 1000);
    setStartedAt(null);
    setDuration(0);
    setLabel('');
    firedRef.current = false;
    return actual;
  }, [startedAt]);

  const reset = useCallback(() => {
    setStartedAt(null);
    setDuration(0);
    setLabel('');
    firedRef.current = false;
  }, []);

  return {
    running: startedAt != null,
    remaining,
    duration,
    elapsed,
    overdue: startedAt != null && remaining <= 0,
    label,
    start,
    extend,
    skip,
    reset,
  };
}
