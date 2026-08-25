import { useMemo, useState } from 'react';
import type { Exercise, Tier } from '../types';
import {
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  TIER_LABELS,
  makeCustomExercise,
  searchExercises,
} from '../data/exercises';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';

interface ExercisePickerProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  onPick: (exerciseId: string) => void;
}

const TIERS: Array<Tier | 'all'> = ['all', 'rehab', 'strength', 'mobility', 'conditioning'];

export function ExercisePicker({ open, title = 'Add exercise', onClose, onPick }: ExercisePickerProps) {
  const { allExercises, client, toggleFavorite, addCustomExercise } = useApp();
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [primary, setPrimary] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const results = useMemo(
    () => searchExercises(allExercises, query, { tier, primary, equipment }),
    [allExercises, query, tier, primary, equipment],
  );

  const favorites = useMemo(
    () => allExercises.filter((e) => client.favorites.includes(e.id)),
    [allExercises, client.favorites],
  );

  const recents = useMemo(
    () =>
      client.recentExercises
        .map((id) => allExercises.find((e) => e.id === id))
        .filter((e): e is Exercise => Boolean(e)),
    [allExercises, client.recentExercises],
  );

  const showShortcuts = !query && tier === 'all' && primary === 'all' && equipment === 'all';

  const pick = (id: string) => {
    onPick(id);
    setQuery('');
    onClose();
  };

  const createCustom = () => {
    const name = draftName.trim();
    if (!name) return;
    const exercise = makeCustomExercise({
      name,
      primary: primary === 'all' ? 'other' : primary,
      equipment: equipment === 'all' ? 'other' : equipment,
      metric: 'weight_reps',
      defaultRestSec: 60,
    });
    addCustomExercise(exercise);
    setDraftName('');
    setCreating(false);
    pick(exercise.id);
  };

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <input
        type="search"
        placeholder={`Search ${allExercises.length} exercises…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search exercises"
        style={{ marginBottom: 10 }}
      />

      <div className="picker-filters">
        {TIERS.map((t) => (
          <button
            key={t}
            className="chip"
            aria-pressed={tier === t}
            onClick={() => setTier(t)}
          >
            {t === 'all' ? 'All' : TIER_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="fieldgrid" style={{ marginBottom: 12 }}>
        <div className="field">
          <label htmlFor="pk-muscle">Muscle</label>
          <select id="pk-muscle" value={primary} onChange={(e) => setPrimary(e.target.value)}>
            <option value="all">Any</option>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pk-equip">Equipment</label>
          <select id="pk-equip" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            <option value="all">Any</option>
            {EQUIPMENT_TYPES.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showShortcuts && favorites.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 4 }}>
            Favorites
          </div>
          <ExerciseList items={favorites} onPick={pick} onStar={toggleFavorite} favorites={client.favorites} />
        </>
      )}

      {showShortcuts && recents.length > 0 && (
        <>
          <div className="section-label">Recent</div>
          <ExerciseList items={recents} onPick={pick} onStar={toggleFavorite} favorites={client.favorites} />
        </>
      )}

      <div className="section-label">
        {showShortcuts ? 'All exercises' : `${results.length} result${results.length === 1 ? '' : 's'}`}
      </div>

      {results.length === 0 ? (
        <div className="empty">
          No match for “{query}”.
          <div style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={() => { setCreating(true); setDraftName(query); }}>
              Create “{query}” as a custom exercise
            </button>
          </div>
        </div>
      ) : (
        <ExerciseList
          items={results.slice(0, 300)}
          onPick={pick}
          onStar={toggleFavorite}
          favorites={client.favorites}
        />
      )}

      {creating ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="custom-name">Custom exercise name</label>
            <input
              id="custom-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Seated Band Row (clinic setup)"
            />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm primary grow" onClick={createCustom}>
              Create and add
            </button>
            <button className="btn sm ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn block ghost"
          style={{ marginTop: 14 }}
          onClick={() => setCreating(true)}
        >
          + Create custom exercise
        </button>
      )}
    </Sheet>
  );
}

interface ExerciseListProps {
  items: Exercise[];
  favorites: string[];
  onPick: (id: string) => void;
  onStar: (id: string) => void;
}

function ExerciseList({ items, favorites, onPick, onStar }: ExerciseListProps) {
  return (
    <div className="exlist">
      {items.map((ex) => (
        <div key={ex.id} className="exitem">
          <button className="grow" style={{ textAlign: 'left' }} onClick={() => onPick(ex.id)}>
            <div className="name">{ex.name}</div>
            <div className="meta">
              {ex.primary} · {ex.equipment} · {TIER_LABELS[ex.tier]} · {ex.defaultRestSec}s rest
            </div>
          </button>
          <button
            className={`star${favorites.includes(ex.id) ? ' on' : ''}`}
            aria-label={`${favorites.includes(ex.id) ? 'Unfavorite' : 'Favorite'} ${ex.name}`}
            onClick={() => onStar(ex.id)}
          >
            {favorites.includes(ex.id) ? '★' : '☆'}
          </button>
        </div>
      ))}
    </div>
  );
}
