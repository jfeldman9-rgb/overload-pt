import { useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { HomeScreen } from './screens/HomeScreen';
import { ActiveWorkout } from './screens/ActiveWorkout';
import { ProgramScreen } from './screens/ProgramScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import './styles.css';

export type Tab = 'home' | 'workout' | 'program' | 'history' | 'settings';

const TABS: Array<{ id: Tab; label: string; glyph: string }> = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'workout', label: 'Workout', glyph: '▶' },
  { id: 'program', label: 'Program', glyph: '📋' },
  { id: 'history', label: 'History', glyph: '📈' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

const TITLES: Record<Tab, string> = {
  home: 'Overload PT',
  workout: 'Workout',
  program: 'Program',
  history: 'History',
  settings: 'Settings',
};

function Shell() {
  const { state, setRole, activeSession } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  /** The rest timer portals in here so it stacks above the tab bar, never over it. */
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="grow">
          <h1>{TITLES[tab]}</h1>
          <div className="sub">
            {state.role === 'trainer'
              ? `${state.trainerName} · viewing ${state.patientName}`
              : `${state.patientName} · PT ${state.trainerName}`}
          </div>
        </div>
        <div className="roleswitch" role="group" aria-label="Switch role">
          <button
            aria-pressed={state.role === 'patient'}
            onClick={() => setRole('patient')}
          >
            Patient
          </button>
          <button
            aria-pressed={state.role === 'trainer'}
            onClick={() => setRole('trainer')}
          >
            Trainer
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'home' && <HomeScreen onNavigate={setTab} />}
        {tab === 'workout' && <ActiveWorkout onNavigate={setTab} dockSlot={dockSlot} />}
        {tab === 'program' && <ProgramScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <div className="bottombar">
        <div ref={setDockSlot} />
        <nav className="tabbar" aria-label="Main navigation">
          {TABS.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <span className="glyph" aria-hidden="true">
                {t.id === 'workout' && activeSession ? '⏺' : t.glyph}
              </span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
