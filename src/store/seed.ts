import type {
  AppState,
  AuditEvent,
  ExerciseEntry,
  Note,
  Prescription,
  ProgressionRule,
  Session,
  SetLog,
} from '../types';

const REHAB_RULE: ProgressionRule = { type: 'double', increment: 5, gatePainMax: 3, stallLimit: 3 };
const ACCESSORY_RULE: ProgressionRule = { type: 'reps', increment: 0, gatePainMax: 4, stallLimit: 4 };
const HOLD_RULE: ProgressionRule = { type: 'none', increment: 0, gatePainMax: null, stallLimit: 99 };

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

function daysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
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
    id: `set_${Math.random().toString(36).slice(2, 9)}`,
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
    id: `en_${Math.random().toString(36).slice(2, 9)}`,
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

const SESSIONS: Session[] = [
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

const NOTES: Note[] = [
  {
    id: 'note_1',
    scope: 'session',
    sessionId: 'ses_1',
    exerciseId: null,
    author: 'trainer',
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
    authorName: 'You',
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
    authorName: 'Dana R., DPT',
    body:
      'Big step forward. Goblet squat 25 lb × 10 across all three sets with pain steady at 2/10, and ' +
      'step-downs finally clean on both sides. Cleared to progress goblet squat to 30 lb next session ' +
      'and open depth past 90° if pain stays ≤2. Add single-leg heel raises to the standing warm-up.',
    createdAt: daysAgo(3, 10),
    trainerOnly: false,
  },
  {
    id: 'note_5',
    scope: 'session',
    sessionId: 'ses_3',
    exerciseId: null,
    author: 'patient',
    authorName: 'You',
    body: 'Best it has felt since the injury. Calves were the sorest thing the next day.',
    createdAt: daysAgo(2, 19),
    trainerOnly: false,
  },
];

const AUDIT: AuditEvent[] = [
  {
    id: 'aud_1',
    at: daysAgo(7, 11),
    actor: 'trainer',
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
    actorName: 'Dana R., DPT',
    entity: 'program_day',
    entityLabel: 'Lower — Rehab Block A',
    field: 'exercise added',
    from: null,
    to: 'Single-Leg Heel Raise',
    reason: 'Calf endurance deficit on the involved side.',
    sessionId: 'ses_3',
  },
];

export function seedState(): AppState {
  return {
    version: 1,
    role: 'trainer',
    patientName: 'Alex M.',
    trainerName: 'Dana R., DPT',
    settings: {
      units: 'lb',
      autoStartRest: true,
      restAlerts: true,
      clinicalFields: true,
    },
    program: {
      id: 'prog_1',
      name: 'Rehab Block A — Progressive Overload',
      days: [
        { id: 'day_lower', name: 'Lower — Rehab Block A', prescriptions: LOWER_DAY },
        { id: 'day_upper', name: 'Upper — Rehab Block A', prescriptions: UPPER_DAY },
        { id: 'day_mobility', name: 'Mobility + Gait', prescriptions: MOBILITY_DAY },
      ],
    },
    sessions: SESSIONS,
    notes: NOTES,
    audit: AUDIT,
    customExercises: [],
    favorites: ['goblet-squat', 'eccentric-step-down', 'face-pull'],
    recentExercises: ['goblet-squat', 'dumbbell-romanian-deadlift', 'face-pull'],
  };
}
