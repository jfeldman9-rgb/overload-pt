import type {
  AppState,
  AuditEvent,
  BodyMetric,
  CaliperSites,
  ClientRecord,
  DexaScan,
  ExerciseEntry,
  MovementClip,
  Note,
  Prescription,
  ProgressionRule,
  Session,
  SetLog,
  Therapist,
  VoiceNote,
} from '../types';
import { placeholderPoster } from '../lib/media';
import { emptyCalipers } from '../lib/metrics';

export const STATE_VERSION = 2;

const REHAB_RULE: ProgressionRule = { type: 'double', increment: 5, gatePainMax: 3, stallLimit: 3 };
const ACCESSORY_RULE: ProgressionRule = { type: 'reps', increment: 0, gatePainMax: 4, stallLimit: 4 };
const HOLD_RULE: ProgressionRule = { type: 'none', increment: 0, gatePainMax: null, stallLimit: 99 };

/** Deterministic ids keep the demo data stable across reloads and tests. */
let counter = 0;
function seedId(prefix: string): string {
  counter += 1;
  return `${prefix}_seed${counter}`;
}

function daysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function shortLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function rx(
  id: string,
  exerciseId: string,
  order: number,
  sets: number,
  reps: number,
  repsMax: number | null,
  weightValue: number,
  restSec: number,
  progression: ProgressionRule,
  cue = '',
): Prescription {
  return {
    id,
    exerciseId,
    order,
    targetSets: sets,
    targetReps: reps,
    targetRepsMax: repsMax,
    targetWeight: weightValue,
    restSec,
    progression,
    cue,
  };
}

function set(
  n: number,
  weightValue: number,
  reps: number,
  restPrescribed: number,
  restActual: number | null,
  pain: number | null = null,
): SetLog {
  return {
    id: seedId('set'),
    setNumber: n,
    weight: weightValue,
    reps,
    restPrescribedSec: restPrescribed,
    restActualSec: restActual,
    completed: true,
    completedAt: null,
    rpe: null,
    pain,
  };
}

function entry(
  exerciseId: string,
  prescriptionId: string,
  targetReps: number,
  targetRepsMax: number | null,
  targetWeight: number,
  restSec: number,
  sets: SetLog[],
  note = '',
): ExerciseEntry {
  return {
    id: seedId('en'),
    exerciseId,
    prescriptionId,
    targetReps,
    targetRepsMax,
    targetWeight,
    restSec,
    cue: '',
    note,
    sets,
  };
}

/* ── Clinic roster ──────────────────────────────────────────────────── */

export const DANA = 'th_dana';
export const PRIYA = 'th_priya';
export const CLIENT_ALEX = 'cl_alex';
export const CLIENT_MARCUS = 'cl_marcus';

const THERAPISTS: Therapist[] = [
  { id: DANA, name: 'Dana R.', credential: 'DPT' },
  { id: PRIYA, name: 'Priya N.', credential: 'DPT, OCS' },
];

export function therapistLabel(t: Therapist): string {
  return t.credential ? `${t.name}, ${t.credential}` : t.name;
}

/* ── Client 1: Alex M. — post-op knee ───────────────────────────────── */

const LOWER_DAY: Prescription[] = [
  rx('rx_gob', 'goblet-squat', 0, 3, 8, 10, 25, 90, REHAB_RULE, 'Stop at 90° knee flexion. Slow 3s down.'),
  rx('rx_rdl', 'dumbbell-romanian-deadlift', 1, 3, 8, 10, 30, 90, REHAB_RULE, 'Neutral spine, soft knees.'),
  rx('rx_step', 'eccentric-step-down', 2, 3, 8, 10, 0, 60, ACCESSORY_RULE, '4s lower. Knee tracks over 2nd toe.'),
  rx('rx_bridge', 'single-leg-glute-bridge', 3, 3, 10, 12, 0, 60, ACCESSORY_RULE, 'Ribs down, squeeze at top.'),
  rx('rx_calf', 'single-leg-heel-raise', 4, 3, 12, 15, 0, 60, ACCESSORY_RULE, ''),
  rx('rx_bal', 'single-leg-stance-eyes-closed', 5, 3, 30, null, 0, 45, HOLD_RULE, 'Barefoot. Hold 30s each side.'),
];

const UPPER_DAY: Prescription[] = [
  rx('rx_row', 'chest-supported-row', 0, 3, 10, 12, 35, 90, REHAB_RULE, 'Pull to lower ribs, pause 1s.'),
  rx('rx_press', 'seated-dumbbell-shoulder-press', 1, 3, 8, 10, 20, 90, REHAB_RULE, 'Stop just short of lockout.'),
  rx('rx_er', 'shoulder-external-rotation-band', 2, 3, 12, 15, 0, 45, ACCESSORY_RULE, 'Elbow pinned to side.'),
  rx('rx_face', 'face-pull', 3, 3, 12, 15, 30, 60, REHAB_RULE, 'High elbows, external rotation at end range.'),
  rx('rx_serr', 'serratus-wall-slide', 4, 2, 10, 12, 0, 45, ACCESSORY_RULE, ''),
  rx('rx_deadbug', 'dead-bug', 5, 3, 8, 10, 0, 45, ACCESSORY_RULE, 'Low back flat throughout.'),
];

const MOBILITY_DAY: Prescription[] = [
  rx('rx_catcow', 'cat-cow', 0, 2, 10, null, 0, 30, HOLD_RULE, ''),
  rx('rx_9090', '90-90-hip-switch', 1, 2, 8, null, 0, 45, HOLD_RULE, ''),
  rx('rx_couch', 'couch-stretch', 2, 2, 45, null, 0, 30, HOLD_RULE, '45s each side.'),
  rx('rx_thor', 'thoracic-extension-over-roller', 3, 2, 8, null, 0, 30, HOLD_RULE, ''),
  rx('rx_walk', 'treadmill-incline-walk', 4, 1, 600, null, 0, 60, HOLD_RULE, '10 min at 3% incline, RPE 4.'),
];

const ALEX_SESSIONS: Session[] = [
  {
    id: 'ses_0a',
    name: 'Lower — Rehab Block A',
    programDayId: 'day_lower',
    status: 'completed',
    startedAt: daysAgo(17),
    endedAt: daysAgo(17, 10),
    entries: [
      entry('goblet-squat', 'rx_gob', 8, 10, 15, 90, [
        set(1, 15, 8, 90, 104, 3),
        set(2, 15, 8, 90, 112, 3),
        set(3, 15, 7, 90, 120, 4),
      ], 'First loaded squat since surgery.'),
      entry('dumbbell-romanian-deadlift', 'rx_rdl', 8, 10, 20, 90, [
        set(1, 20, 8, 90, 95, 1),
        set(2, 20, 8, 90, 99, 2),
        set(3, 20, 8, 90, 104, 2),
      ]),
      entry('eccentric-step-down', 'rx_step', 8, 10, 0, 60, [
        set(1, 0, 6, 60, 70, 4),
        set(2, 0, 6, 60, 74, 4),
        set(3, 0, 5, 60, 82, 5),
      ]),
    ],
  },
  {
    id: 'ses_0b',
    name: 'Upper — Rehab Block A',
    programDayId: 'day_upper',
    status: 'completed',
    startedAt: daysAgo(14),
    endedAt: daysAgo(14, 10),
    entries: [
      entry('chest-supported-row', 'rx_row', 10, 12, 25, 90, [
        set(1, 25, 12, 90, 88, 0),
        set(2, 25, 12, 90, 94, 0),
        set(3, 25, 12, 90, 99, 0),
      ]),
      entry('seated-dumbbell-shoulder-press', 'rx_press', 8, 10, 15, 90, [
        set(1, 15, 10, 90, 92, 1),
        set(2, 15, 10, 90, 97, 2),
        set(3, 15, 9, 90, 103, 2),
      ]),
      entry('face-pull', 'rx_face', 12, 15, 20, 60, [
        set(1, 20, 15, 60, 60, 0),
        set(2, 20, 15, 60, 63, 0),
        set(3, 20, 14, 60, 68, 0),
      ]),
    ],
  },
  {
    id: 'ses_1',
    name: 'Lower — Rehab Block A',
    programDayId: 'day_lower',
    status: 'completed',
    startedAt: daysAgo(10),
    endedAt: daysAgo(10, 10),
    entries: [
      entry('goblet-squat', 'rx_gob', 8, 10, 20, 90, [
        set(1, 20, 8, 90, 95, 2),
        set(2, 20, 8, 90, 102, 2),
        set(3, 20, 8, 90, 110, 3),
      ]),
      entry('dumbbell-romanian-deadlift', 'rx_rdl', 8, 10, 25, 90, [
        set(1, 25, 8, 90, 88, 1),
        set(2, 25, 8, 90, 94, 1),
        set(3, 25, 8, 90, 97, 2),
      ]),
      entry('eccentric-step-down', 'rx_step', 8, 10, 0, 60, [
        set(1, 0, 8, 60, 62, 3),
        set(2, 0, 8, 60, 65, 3),
        set(3, 0, 7, 60, 70, 4),
      ], 'Last set got shaky on the left side.'),
      entry('single-leg-glute-bridge', 'rx_bridge', 10, 12, 0, 60, [
        set(1, 0, 10, 60, 58, 0),
        set(2, 0, 10, 60, 61, 0),
        set(3, 0, 10, 60, 64, 1),
      ]),
    ],
  },
  {
    id: 'ses_2',
    name: 'Upper — Rehab Block A',
    programDayId: 'day_upper',
    status: 'completed',
    startedAt: daysAgo(7),
    endedAt: daysAgo(7, 10),
    entries: [
      entry('chest-supported-row', 'rx_row', 10, 12, 30, 90, [
        set(1, 30, 12, 90, 85, 0),
        set(2, 30, 12, 90, 92, 0),
        set(3, 30, 11, 90, 96, 1),
      ]),
      entry('seated-dumbbell-shoulder-press', 'rx_press', 8, 10, 17.5, 90, [
        set(1, 17.5, 10, 90, 90, 2),
        set(2, 17.5, 9, 90, 98, 2),
        set(3, 17.5, 8, 90, 105, 3),
      ], 'Right shoulder pinches slightly overhead.'),
      entry('shoulder-external-rotation-band', 'rx_er', 12, 15, 0, 45, [
        set(1, 0, 15, 45, 44, 1),
        set(2, 0, 15, 45, 47, 1),
        set(3, 0, 15, 45, 50, 1),
      ]),
      entry('face-pull', 'rx_face', 12, 15, 25, 60, [
        set(1, 25, 15, 60, 58, 0),
        set(2, 25, 15, 60, 62, 0),
        set(3, 25, 15, 60, 65, 0),
      ]),
    ],
  },
  {
    id: 'ses_3',
    name: 'Lower — Rehab Block A',
    programDayId: 'day_lower',
    status: 'completed',
    startedAt: daysAgo(3),
    endedAt: daysAgo(3, 10),
    entries: [
      entry('goblet-squat', 'rx_gob', 8, 10, 25, 90, [
        set(1, 25, 10, 90, 90, 2),
        set(2, 25, 10, 90, 93, 2),
        set(3, 25, 10, 90, 99, 2),
      ]),
      entry('dumbbell-romanian-deadlift', 'rx_rdl', 8, 10, 30, 90, [
        set(1, 30, 10, 90, 86, 1),
        set(2, 30, 10, 90, 90, 1),
        set(3, 30, 9, 90, 95, 1),
      ]),
      entry('eccentric-step-down', 'rx_step', 8, 10, 0, 60, [
        set(1, 0, 10, 60, 60, 2),
        set(2, 0, 10, 60, 62, 2),
        set(3, 0, 10, 60, 66, 2),
      ], 'Much steadier than last time.'),
      entry('single-leg-glute-bridge', 'rx_bridge', 10, 12, 0, 60, [
        set(1, 0, 12, 60, 55, 0),
        set(2, 0, 12, 60, 58, 0),
        set(3, 0, 12, 60, 60, 0),
      ]),
      entry('single-leg-heel-raise', 'rx_calf', 12, 15, 0, 60, [
        set(1, 0, 15, 60, 57, 0),
        set(2, 0, 14, 60, 60, 0),
        set(3, 0, 12, 60, 63, 1),
      ]),
    ],
  },
];

const ALEX_VOICE: VoiceNote = {
  id: 'vn_1',
  clientId: CLIENT_ALEX,
  sessionId: 'ses_3',
  exerciseId: 'eccentric-step-down',
  at: daysAgo(3, 10),
  durationSec: 41,
  transcript:
    'okay so step downs today both sides clean uh no valgus collapse on the left which is new ' +
    'quad control looks good through the last third of the range pain stayed at two out of ten ' +
    'the whole way plan is progress goblet squat to thirty next visit and open depth past ninety ' +
    'if the pain holds',
  cleaned:
    'Step-downs clean bilaterally — no valgus collapse on the left, which is new. Quad control ' +
    'good through terminal range. Pain steady 2/10. Plan: goblet squat to 30 lb next visit, open ' +
    'depth past 90° if pain holds.',
  blobKey: null,
  mimeType: 'audio/webm',
  transcriptionSupported: true,
  authorRole: 'trainer',
  authorId: DANA,
  authorName: 'Dana R., DPT',
  trainerOnly: false,
  noteId: 'note_voice',
  backup: 'local',
};

const ALEX_NOTES: Note[] = [
  {
    id: 'note_1',
    scope: 'session',
    sessionId: 'ses_1',
    exerciseId: null,
    author: 'trainer',
    authorId: DANA,
    authorName: 'Dana R., DPT',
    body:
      'Baseline session for Block A. Knee flexion tolerable to ~95°. Held goblet squat at 20 lb, ' +
      'capped depth at 90°. Step-downs are the limiter — left side loses control on the last set. ' +
      'Plan: keep load flat next session, add tempo instead.',
    createdAt: daysAgo(10, 10),
    trainerOnly: false,
  },
  {
    id: 'note_2',
    scope: 'session',
    sessionId: 'ses_1',
    exerciseId: null,
    author: 'patient',
    authorId: CLIENT_ALEX,
    authorName: 'Alex M.',
    body: 'Knee felt fine during, a bit achy on stairs that evening. No swelling next morning.',
    createdAt: daysAgo(9, 20),
    trainerOnly: false,
  },
  {
    id: 'note_3',
    scope: 'session',
    sessionId: 'ses_2',
    exerciseId: null,
    author: 'trainer',
    authorId: DANA,
    authorName: 'Dana R., DPT',
    body:
      'Upper day went well. Right shoulder pinch at end range on overhead press — reduced ROM to ' +
      'eyebrow height for remaining sets. Keeping external rotation volume high. No press increase ' +
      'until the pinch clears.',
    createdAt: daysAgo(7, 10),
    trainerOnly: false,
  },
  {
    id: 'note_4',
    scope: 'session',
    sessionId: 'ses_3',
    exerciseId: null,
    author: 'trainer',
    authorId: DANA,
    authorName: 'Dana R., DPT',
    body:
      'Big step forward. Goblet squat 25 lb × 10 across all three sets with pain steady at 2/10, and ' +
      'step-downs finally clean on both sides. Cleared to progress goblet squat to 30 lb next session ' +
      'and open depth past 90° if pain stays ≤2. Add single-leg heel raises to the standing warm-up.',
    createdAt: daysAgo(3, 10),
    trainerOnly: false,
  },
  {
    id: 'note_voice',
    scope: 'exercise',
    sessionId: 'ses_3',
    exerciseId: 'eccentric-step-down',
    author: 'trainer',
    authorId: DANA,
    authorName: 'Dana R., DPT',
    body: ALEX_VOICE.cleaned,
    createdAt: daysAgo(3, 10),
    trainerOnly: false,
    voiceNoteId: 'vn_1',
  },
  {
    id: 'note_handoff',
    scope: 'session',
    sessionId: 'ses_3',
    exerciseId: null,
    author: 'trainer',
    authorId: DANA,
    authorName: 'Dana R., DPT',
    body:
      'Clinical handoff — I am out Thursday and Friday. If Priya covers: graft is 14 weeks out, no ' +
      'open-chain knee extension past 45° yet, and do not chase depth if pain breaks 3/10. Effusion ' +
      'has been quiet for three weeks; recheck girth if it returns.',
    createdAt: daysAgo(3, 11),
    trainerOnly: true,
  },
  {
    id: 'note_5',
    scope: 'session',
    sessionId: 'ses_3',
    exerciseId: null,
    author: 'patient',
    authorId: CLIENT_ALEX,
    authorName: 'Alex M.',
    body: 'Best it has felt since the injury. Calves were the sorest thing the next day.',
    createdAt: daysAgo(2, 19),
    trainerOnly: false,
  },
];

const ALEX_AUDIT: AuditEvent[] = [
  {
    id: 'aud_1',
    at: daysAgo(7, 11),
    actor: 'trainer',
    actorId: DANA,
    actorName: 'Dana R., DPT',
    entity: 'prescription',
    entityLabel: 'Goblet Squat',
    field: 'targetWeight',
    from: 20,
    to: 25,
    reason: 'All sets completed at 20 lb with pain ≤3.',
    sessionId: 'ses_1',
  },
  {
    id: 'aud_2',
    at: daysAgo(7, 11),
    actor: 'trainer',
    actorId: DANA,
    actorName: 'Dana R., DPT',
    entity: 'prescription',
    entityLabel: 'Dumbbell Romanian Deadlift',
    field: 'targetWeight',
    from: 25,
    to: 30,
    reason: 'Clean technique, pain 1/10.',
    sessionId: 'ses_1',
  },
  {
    id: 'aud_3',
    at: daysAgo(7, 10),
    actor: 'trainer',
    actorId: DANA,
    actorName: 'Dana R., DPT',
    entity: 'prescription',
    entityLabel: 'Seated Dumbbell Shoulder Press',
    field: 'cue',
    from: '',
    to: 'Stop just short of lockout.',
    reason: 'Shoulder pinch at end range.',
    sessionId: 'ses_2',
  },
  {
    id: 'aud_4',
    at: daysAgo(3, 11),
    actor: 'trainer',
    actorId: DANA,
    actorName: 'Dana R., DPT',
    entity: 'program_day',
    entityLabel: 'Lower — Rehab Block A',
    field: 'exercise added',
    from: null,
    to: 'Single-Leg Heel Raise',
    reason: 'Calf endurance deficit on the involved side.',
    sessionId: 'ses_3',
  },
  {
    id: 'aud_5',
    at: daysAgo(3, 11),
    actor: 'trainer',
    actorId: DANA,
    actorName: 'Dana R., DPT',
    entity: 'sharing',
    entityLabel: 'Alex M.',
    field: 'shared with clinic',
    from: 'no',
    to: 'yes',
    reason: 'Out Thursday and Friday — cover needs the chart.',
    sessionId: null,
  },
];

/* ── Body metrics ───────────────────────────────────────────────────── */

type MetricRow = [
  days: number,
  bodyweight: number,
  bodyFatPct: number,
  waist: number,
  hip: number,
  thigh: number,
  arm: number,
  restingHr: number,
  vo2max: number | null,
];

const ALEX_ROWS: MetricRow[] = [
  [98, 198.4, 26.4, 36.5, 41.0, 22.4, 13.2, 68, 34.5],
  [91, 197.6, 26.1, 36.4, 41.0, 22.5, 13.2, 67, null],
  [84, 196.2, 25.7, 36.1, 40.8, 22.6, 13.3, 67, null],
  [77, 195.8, 25.4, 36.0, 40.8, 22.7, 13.3, 66, null],
  [70, 194.6, 25.0, 35.8, 40.7, 22.8, 13.3, 65, 35.8],
  [63, 194.1, 24.6, 35.6, 40.6, 22.9, 13.4, 65, null],
  [56, 193.2, 24.3, 35.4, 40.6, 23.0, 13.4, 64, null],
  [49, 192.8, 24.0, 35.3, 40.5, 23.0, 13.4, 63, null],
  [42, 192.0, 23.6, 35.0, 40.4, 23.1, 13.5, 63, 37.1],
  [35, 191.4, 23.3, 34.9, 40.3, 23.1, 13.5, 62, null],
  [28, 190.8, 23.0, 34.7, 40.3, 23.2, 13.5, 61, null],
  [21, 190.2, 22.7, 34.6, 40.2, 23.2, 13.6, 61, null],
  [14, 189.9, 22.4, 34.4, 40.2, 23.3, 13.6, 60, 38.6],
  [7, 189.6, 22.2, 34.3, 40.1, 23.3, 13.6, 60, null],
  [2, 189.4, 22.1, 34.2, 40.1, 23.4, 13.7, 59, 39.2],
];

const MARCUS_ROWS: MetricRow[] = [
  [42, 176.2, 19.8, 32.8, 39.5, 22.0, 13.9, 62, 41.0],
  [35, 175.8, 19.6, 32.7, 39.4, 22.0, 13.9, 62, null],
  [28, 175.4, 19.4, 32.6, 39.4, 22.1, 14.0, 61, null],
  [21, 175.0, 19.2, 32.4, 39.3, 22.1, 14.0, 60, 42.4],
  [10, 174.4, 19.0, 32.3, 39.3, 22.1, 14.1, 59, null],
  [3, 174.1, 18.9, 32.2, 39.3, 22.1, 14.1, 59, 43.2],
];

function calipers(values: Partial<CaliperSites>): CaliperSites {
  return { ...emptyCalipers(), ...values };
}

function dexa(scan: Partial<DexaScan>): DexaScan {
  return {
    totalFatPct: null,
    leanMassLb: null,
    fatMassLb: null,
    visceralFatLb: null,
    trunkFatPct: null,
    armsLeanLb: null,
    legsLeanLb: null,
    ...scan,
  };
}

function bodyMetrics(
  clientId: string,
  rows: MetricRow[],
  loggedById: string,
  loggedByName: string,
  extras: Record<number, { calipers?: CaliperSites; dexa?: DexaScan; note?: string }> = {},
): BodyMetric[] {
  return rows.map(([days, bodyweight, bodyFatPct, waist, hip, thigh, arm, restingHr, vo2max]) => {
    const extra = extras[days] ?? {};
    return {
      id: `bm_${clientId}_${days}`,
      clientId,
      at: daysAgo(days, 8),
      bodyweight,
      bodyFatPct,
      waist,
      hip,
      thigh,
      arm,
      restingHr,
      vo2max,
      calipers: extra.calipers ?? emptyCalipers(),
      dexa: extra.dexa ?? null,
      note: extra.note ?? '',
      units: 'lb',
      lengthUnits: 'in',
      loggedBy: 'trainer',
      loggedById,
      loggedByName,
    };
  });
}

const ALEX_METRICS = bodyMetrics(CLIENT_ALEX, ALEX_ROWS, DANA, 'Dana R., DPT', {
  98: {
    calipers: calipers({ chest: 14, abdominal: 26, thigh: 19, suprailiac: 22, triceps: 15 }),
    dexa: dexa({
      totalFatPct: 26.8,
      leanMassLb: 138.1,
      fatMassLb: 53.2,
      visceralFatLb: 1.4,
      trunkFatPct: 28.9,
      armsLeanLb: 17.2,
      legsLeanLb: 44.6,
    }),
    note: 'Baseline. DEXA shows 3.1 lb lean deficit in the operated leg.',
  },
  56: {
    calipers: calipers({ chest: 12, abdominal: 22, thigh: 17, suprailiac: 18, triceps: 13 }),
  },
  14: {
    calipers: calipers({ chest: 10, abdominal: 18, thigh: 15, suprailiac: 15, triceps: 11 }),
    dexa: dexa({
      totalFatPct: 22.6,
      leanMassLb: 141.9,
      fatMassLb: 42.8,
      visceralFatLb: 1.0,
      trunkFatPct: 23.4,
      armsLeanLb: 17.6,
      legsLeanLb: 47.1,
    }),
    note: 'Leg lean mass up 2.5 lb; side-to-side deficit down to 1.4 lb.',
  },
});

const MARCUS_METRICS = bodyMetrics(CLIENT_MARCUS, MARCUS_ROWS, PRIYA, 'Priya N., DPT, OCS', {
  42: { calipers: calipers({ chest: 9, abdominal: 17, thigh: 13, suprailiac: 14 }), note: 'Intake.' },
});

/* ── Movement clips (demo placeholders, no binaries shipped) ────────── */

function placeholderClip(
  clientId: string,
  exerciseId: string,
  sessionId: string | null,
  days: number,
  label: string,
  recordedById: string,
  recordedByName: string,
  hue: number,
): MovementClip {
  const recordedAt = daysAgo(days, 10);
  return {
    id: `clip_${clientId}_${exerciseId}_${days}`,
    clientId,
    exerciseId,
    sessionId,
    recordedAt,
    durationSec: 12,
    mimeType: 'video/webm',
    byteSize: 0,
    blobKey: null,
    posterUrl: placeholderPoster(shortLabel(recordedAt), hue),
    label,
    note: '',
    recordedBy: 'trainer',
    recordedById,
    recordedByName,
    placeholder: true,
    backup: 'local',
  };
}

const ALEX_CLIPS: MovementClip[] = [
  placeholderClip(CLIENT_ALEX, 'goblet-squat', 'ses_1', 10, 'Set 3 — 20 lb × 8', DANA, 'Dana R., DPT', 22),
  placeholderClip(CLIENT_ALEX, 'goblet-squat', 'ses_3', 3, 'Set 3 — 25 lb × 10', DANA, 'Dana R., DPT', 168),
  placeholderClip(CLIENT_ALEX, 'eccentric-step-down', 'ses_1', 10, 'Set 3 — left side', DANA, 'Dana R., DPT', 22),
  placeholderClip(CLIENT_ALEX, 'eccentric-step-down', 'ses_3', 3, 'Set 3 — left side', DANA, 'Dana R., DPT', 168),
  placeholderClip(CLIENT_ALEX, 'dumbbell-romanian-deadlift', 'ses_3', 3, 'Set 2 — 30 lb × 10', DANA, 'Dana R., DPT', 168),
];

/* ── Client 2: Marcus T. — shoulder, return to golf ─────────────────── */

const MARCUS_PUSH: Prescription[] = [
  rx('rxm_press', 'half-kneeling-landmine-press', 0, 3, 8, 10, 45, 90, REHAB_RULE, 'Ribs down. Stop at ear height.'),
  rx('rxm_er', 'side-lying-external-rotation', 1, 3, 12, 15, 8, 45, ACCESSORY_RULE, 'Towel under the elbow.'),
  rx('rxm_row', 'landmine-row', 2, 3, 10, 12, 70, 90, REHAB_RULE, 'Pull to the hip, no shrug.'),
  rx('rxm_y', 'prone-y-raise', 3, 3, 12, 15, 0, 45, ACCESSORY_RULE, 'Thumbs up, lower trap driving.'),
  rx('rxm_pallof', 'pallof-press', 4, 3, 10, 12, 25, 60, REHAB_RULE, 'Resist rotation, breathe out at full reach.'),
];

const MARCUS_LOWER: Prescription[] = [
  rx('rxm_split', 'split-squat', 0, 3, 8, 10, 35, 90, REHAB_RULE, 'Front shin vertical.'),
  rx('rxm_rdl', 'dumbbell-romanian-deadlift', 1, 3, 8, 10, 45, 90, REHAB_RULE, ''),
  rx('rxm_carry', 'farmer-s-carry', 2, 3, 40, null, 50, 75, ACCESSORY_RULE, '40s per side, tall posture.'),
  rx('rxm_bird', 'bird-dog', 3, 3, 10, 12, 0, 45, ACCESSORY_RULE, ''),
];

const MARCUS_SESSIONS: Session[] = [
  {
    id: 'ses_m1',
    name: 'Push + Rotate — Return to Golf',
    programDayId: 'day_m_push',
    status: 'completed',
    startedAt: daysAgo(11),
    endedAt: daysAgo(11, 10),
    entries: [
      entry('half-kneeling-landmine-press', 'rxm_press', 8, 10, 40, 90, [
        set(1, 40, 10, 90, 92, 2),
        set(2, 40, 10, 90, 98, 2),
        set(3, 40, 9, 90, 104, 3),
      ]),
      entry('side-lying-external-rotation', 'rxm_er', 12, 15, 8, 45, [
        set(1, 8, 15, 45, 46, 2),
        set(2, 8, 15, 45, 49, 2),
        set(3, 8, 14, 45, 52, 3),
      ]),
      entry('landmine-row', 'rxm_row', 10, 12, 70, 90, [
        set(1, 70, 12, 90, 88, 1),
        set(2, 70, 12, 90, 93, 1),
        set(3, 70, 11, 90, 97, 1),
      ]),
      entry('pallof-press', 'rxm_pallof', 10, 12, 25, 60, [
        set(1, 25, 12, 60, 61, 0),
        set(2, 25, 12, 60, 64, 0),
        set(3, 25, 12, 60, 66, 0),
      ]),
    ],
  },
  {
    id: 'ses_m2',
    name: 'Push + Rotate — Return to Golf',
    programDayId: 'day_m_push',
    status: 'completed',
    startedAt: daysAgo(4),
    endedAt: daysAgo(4, 10),
    entries: [
      entry('half-kneeling-landmine-press', 'rxm_press', 8, 10, 45, 90, [
        set(1, 45, 9, 90, 118, 4),
        set(2, 45, 8, 90, 136, 5),
        set(3, 45, 6, 90, 152, 6),
      ], 'Front of the shoulder lit up on the second set. Cut the third short.'),
      entry('side-lying-external-rotation', 'rxm_er', 12, 15, 8, 45, [
        set(1, 8, 15, 45, 58, 3),
        set(2, 8, 13, 45, 66, 4),
        set(3, 8, 12, 45, 72, 4),
      ]),
      entry('landmine-row', 'rxm_row', 10, 12, 70, 90, [
        set(1, 70, 12, 90, 96, 1),
        set(2, 70, 12, 90, 101, 1),
        set(3, 70, 12, 90, 108, 1),
      ]),
      entry('pallof-press', 'rxm_pallof', 10, 12, 25, 60, [
        set(1, 25, 12, 60, 70, 0),
        set(2, 25, 12, 60, 74, 1),
        set(3, 25, 12, 60, 78, 1),
      ]),
    ],
  },
];

const MARCUS_NOTES: Note[] = [
  {
    id: 'note_m1',
    scope: 'session',
    sessionId: 'ses_m1',
    exerciseId: null,
    author: 'trainer',
    authorId: PRIYA,
    authorName: 'Priya N., DPT, OCS',
    body:
      'Six weeks into loading for supraspinatus tendinopathy. Landmine press at 40 lb pain 2–3/10, ' +
      'settles within the hour. Cleared to try 45 lb next session.',
    createdAt: daysAgo(11, 10),
    trainerOnly: false,
  },
  {
    id: 'note_m2',
    scope: 'session',
    sessionId: 'ses_m2',
    exerciseId: null,
    author: 'patient',
    authorId: CLIENT_MARCUS,
    authorName: 'Marcus T.',
    body:
      'The 45 was too much — sharp pain at the front of the shoulder on the second set and I had to ' +
      'stop the third early. Ached overnight. Range felt tighter the next morning.',
    createdAt: daysAgo(4, 19),
    trainerOnly: false,
  },
  {
    id: 'note_m3',
    scope: 'session',
    sessionId: 'ses_m2',
    exerciseId: null,
    author: 'trainer',
    authorId: PRIYA,
    authorName: 'Priya N., DPT, OCS',
    body:
      'Back the press down to 40 lb and add a 3s eccentric. Do not progress load again until pain ' +
      'sits at ≤3/10 for two consecutive sessions.',
    createdAt: daysAgo(4, 11),
    trainerOnly: false,
  },
];

const MARCUS_AUDIT: AuditEvent[] = [
  {
    id: 'aud_m1',
    at: daysAgo(11, 11),
    actor: 'trainer',
    actorId: PRIYA,
    actorName: 'Priya N., DPT, OCS',
    entity: 'prescription',
    entityLabel: 'Half-Kneeling Landmine Press',
    field: 'targetWeight',
    from: 40,
    to: 45,
    reason: 'Pain 2–3/10 at 40 lb and settling within the hour.',
    sessionId: 'ses_m1',
  },
  {
    id: 'aud_m2',
    at: daysAgo(4, 11),
    actor: 'trainer',
    actorId: PRIYA,
    actorName: 'Priya N., DPT, OCS',
    entity: 'prescription',
    entityLabel: 'Half-Kneeling Landmine Press',
    field: 'cue',
    from: 'Ribs down. Stop at ear height.',
    to: 'Ribs down. Stop at ear height. 3s lower.',
    reason: 'Symptom flare at 45 lb — add eccentric emphasis before load.',
    sessionId: 'ses_m2',
  },
];

const MARCUS_CLIPS: MovementClip[] = [
  placeholderClip(
    CLIENT_MARCUS,
    'half-kneeling-landmine-press',
    'ses_m2',
    4,
    'Set 2 — 45 lb, flare',
    PRIYA,
    'Priya N., DPT, OCS',
    38,
  ),
];

/* ── Assembly ───────────────────────────────────────────────────────── */

function alex(): ClientRecord {
  return {
    id: CLIENT_ALEX,
    name: 'Alex M.',
    condition: 'R ACL reconstruction · 14 weeks post-op',
    therapistId: DANA,
    sharedTherapistIds: [PRIYA],
    sharedWithClinic: true,
    program: {
      id: 'prog_alex',
      name: 'Rehab Block A — Progressive Overload',
      days: [
        { id: 'day_lower', name: 'Lower — Rehab Block A', prescriptions: LOWER_DAY },
        { id: 'day_upper', name: 'Upper — Rehab Block A', prescriptions: UPPER_DAY },
        { id: 'day_mobility', name: 'Mobility + Gait', prescriptions: MOBILITY_DAY },
      ],
    },
    sessions: ALEX_SESSIONS,
    notes: ALEX_NOTES,
    audit: ALEX_AUDIT,
    bodyMetrics: ALEX_METRICS,
    clips: ALEX_CLIPS,
    voiceNotes: [ALEX_VOICE],
    favorites: ['goblet-squat', 'eccentric-step-down', 'face-pull'],
    recentExercises: ['goblet-squat', 'dumbbell-romanian-deadlift', 'face-pull'],
  };
}

function marcus(): ClientRecord {
  return {
    id: CLIENT_MARCUS,
    name: 'Marcus T.',
    condition: 'L supraspinatus tendinopathy · return to golf',
    therapistId: PRIYA,
    sharedTherapistIds: [],
    sharedWithClinic: false,
    program: {
      id: 'prog_marcus',
      name: 'Return to Golf — Loading Block',
      days: [
        { id: 'day_m_push', name: 'Push + Rotate — Return to Golf', prescriptions: MARCUS_PUSH },
        { id: 'day_m_lower', name: 'Lower + Carry — Return to Golf', prescriptions: MARCUS_LOWER },
      ],
    },
    sessions: MARCUS_SESSIONS,
    notes: MARCUS_NOTES,
    audit: MARCUS_AUDIT,
    bodyMetrics: MARCUS_METRICS,
    clips: MARCUS_CLIPS,
    voiceNotes: [],
    favorites: ['half-kneeling-landmine-press', 'pallof-press'],
    recentExercises: ['half-kneeling-landmine-press', 'landmine-row'],
  };
}

export function seedState(): AppState {
  counter = 0;
  return {
    version: STATE_VERSION,
    clinicName: 'Riverside Sports PT',
    therapists: THERAPISTS,
    clients: [alex(), marcus()],
    role: 'trainer',
    actingTherapistId: DANA,
    activeClientId: CLIENT_ALEX,
    settings: {
      units: 'lb',
      lengthUnits: 'in',
      autoStartRest: true,
      restAlerts: true,
      clinicalFields: true,
      clipMaxSec: 25,
    },
    customExercises: [],
  };
}
