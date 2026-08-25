import type { Note } from '../types';
import { clockTime, longDate, relativeDay } from '../lib/format';

interface NotesLedgerProps {
  notes: Note[];
  sessionNameFor?: (sessionId: string | null) => string;
  emptyText?: string;
}

/**
 * The running ledger the trainer asked for: every note ever written, newest
 * first, attributed and dated, with the session it belongs to.
 */
export function NotesLedger({ notes, sessionNameFor, emptyText = 'No notes yet.' }: NotesLedgerProps) {
  if (!notes.length) return <div className="empty">{emptyText}</div>;

  const sorted = [...notes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="ledger">
      {sorted.map((note) => (
        <div key={note.id} className={`ledger-item ${note.author}`}>
          <div className="note-meta">
            <span className={`pill ${note.author}`}>
              {note.author === 'trainer' ? 'Trainer' : 'Patient'}
            </span>
            <span>{note.authorName}</span>
            <span>·</span>
            <span>{longDate(note.createdAt)}</span>
            <span className="faint">{clockTime(note.createdAt)}</span>
            {note.trainerOnly && <span className="pill danger">Clinical</span>}
          </div>
          {sessionNameFor && note.sessionId && (
            <div className="tiny faint" style={{ marginBottom: 4 }}>
              {sessionNameFor(note.sessionId)} · {relativeDay(note.createdAt)}
            </div>
          )}
          <div className="note-body">{note.body}</div>
        </div>
      ))}
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
      </div>
      <div className="tiny faint" style={{ marginBottom: 6 }}>
        {sessionName}
      </div>
      <div className="note-body">{note.body}</div>
    </div>
  );
}
