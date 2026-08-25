import { useState } from 'react';
import type { Note, VoiceNote } from '../types';
import { clockTime, longDate, mmss, relativeDay } from '../lib/format';
import { useBlobUrl } from '../lib/media';

interface NotesLedgerProps {
  notes: Note[];
  sessionNameFor?: (sessionId: string | null) => string;
  emptyText?: string;
  /** Lets a dictated note offer its audio without ever autoplaying it. */
  voiceNotes?: VoiceNote[];
}

/** Audio is opt-in: nobody should be made to listen to a room recording. */
function AudioNote({ voice }: { voice: VoiceNote }) {
  const [expanded, setExpanded] = useState(false);
  const url = useBlobUrl(expanded ? voice.blobKey : null);

  return (
    <div className="voicerow">
      <button className="btn sm ghost" onClick={() => setExpanded((v) => !v)}>
        🎙 {expanded ? 'Hide audio' : `Play audio (${mmss(voice.durationSec)})`}
      </button>
      {!voice.transcriptionSupported && (
        <span className="tiny faint">transcription unavailable on the recording browser</span>
      )}
      {expanded &&
        (url ? (
          <audio src={url} controls style={{ width: '100%', marginTop: 6 }} />
        ) : (
          <div className="tiny faint" style={{ marginTop: 6 }}>
            {voice.blobKey
              ? 'Audio is not on this device — restore it from a media export.'
              : 'This note was saved without audio.'}
          </div>
        ))}
    </div>
  );
}

/**
 * The running ledger the trainer asked for: every note ever written, newest
 * first, attributed and dated, with the session it belongs to.
 */
export function NotesLedger({
  notes,
  sessionNameFor,
  emptyText = 'No notes yet.',
  voiceNotes = [],
}: NotesLedgerProps) {
  if (!notes.length) return <div className="empty">{emptyText}</div>;

  const sorted = [...notes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="ledger">
      {sorted.map((note) => {
        const voice = note.voiceNoteId
          ? voiceNotes.find((v) => v.id === note.voiceNoteId) ?? null
          : null;
        return (
          <div key={note.id} className={`ledger-item ${note.author}`}>
            <div className="note-meta">
              <span className={`pill ${note.author}`}>
                {note.author === 'trainer' ? 'Trainer' : 'Patient'}
              </span>
              <span>{note.authorName}</span>
              <span>·</span>
              <span>{longDate(note.createdAt)}</span>
              <span className="faint">{clockTime(note.createdAt)}</span>
              {note.voiceNoteId && <span className="pill">🎙 Dictated</span>}
              {note.trainerOnly && <span className="pill danger">Clinical</span>}
            </div>
            {sessionNameFor && note.sessionId && (
              <div className="tiny faint" style={{ marginBottom: 4 }}>
                {sessionNameFor(note.sessionId)} · {relativeDay(note.createdAt)}
              </div>
            )}
            <div className="note-body">{note.body}</div>
            {voice && <AudioNote voice={voice} />}
          </div>
        );
      })}
    </div>
  );
}

export function PinnedNote({ note, sessionName }: { note: Note; sessionName: string }) {
  return (
    <div className="note-pinned">
      <div className="note-meta">
        <span className={`pill ${note.author}`}>
          {note.author === 'trainer' ? 'Trainer' : 'Patient'}
        </span>
        <span>{note.authorName}</span>
        <span>·</span>
        <span>{longDate(note.createdAt)}</span>
        <span className="faint">({relativeDay(note.createdAt)})</span>
        {note.voiceNoteId && <span className="pill">🎙 Dictated</span>}
      </div>
      <div className="tiny faint" style={{ marginBottom: 6 }}>
        {sessionName}
      </div>
      <div className="note-body">{note.body}</div>
    </div>
  );
}
