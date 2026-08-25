import { useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { HomeScreen } from './screens/HomeScreen';
import { ActiveWorkout } from './screens/ActiveWorkout';
import { ProgramScreen } from './screens/ProgramScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { BodyScreen } from './screens/BodyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { BackupBar } from './components/BackupBar';
import { ClientSwitcher } from './components/ClientSwitcher';
import './styles.css';

export type Tab = 'home' | 'workout' | 'program' | 'history' | 'body' | 'settings';

const TABS: Array<{ id: Tab; label: string; glyph: string }> = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'workout', label: 'Workout', glyph: '▶' },
  { id: 'program', label: 'Program', glyph: '📋' },
  { id: 'history', label: 'History', glyph: '📈' },
  { id: 'body', label: 'Body', glyph: '⚖' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

const TITLES: Record<Tab, string> = {
  home: 'Overload PT',
  workout: 'Workout',
  program: 'Program',
  history: 'History',
  body: 'Body',
  settings: 'Settings',
};

function Shell() {
  const { state, setRole, activeSession, client, actingTherapist } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  const [rosterOpen, setRosterOpen] = useState(false);
  /** The rest timer portals in here so it stacks above the tab bar, never over it. */
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);

  const isTrainer = state.role === 'trainer';

  return (
    <div className="app">
      <div className="topstack">
        <header className="topbar">
          <div className="grow">
            <h1>{TITLES[tab]}</h1>
            <button className="chartswitch" onClick={() => setRosterOpen(true)}>
              {isTrainer
                ? `${actingTherapist.name} · viewing ${client.name}`
                : `${client.name} · PT ${state.therapists.find((t) => t.id === client.therapistId)?.name ?? '—'}`}
              <span aria-hidden="true"> ⌄</span>
            </button>
          </div>
          <div className="roleswitch" role="group" aria-label="Switch role">
            <button aria-pressed={!isTrainer} onClick={() => setRole('patient')}>
              Patient
            </button>
            <button aria-pressed={isTrainer} onClick={() => setRole('trainer')}>
              Trainer
            </button>
          </div>
        </header>
        <BackupBar />
      </div>

      <main className="content">
        {tab === 'home' && <HomeScreen onNavigate={setTab} onOpenRoster={() => setRosterOpen(true)} />}
        {tab === 'workout' && <ActiveWorkout onNavigate={setTab} dockSlot={dockSlot} />}
        {tab === 'program' && <ProgramScreen />}
        {tab === 'history' && <HistoryScreen onNavigate={setTab} />}
        {tab === 'body' && <BodyScreen />}
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

      <ClientSwitcher open={rosterOpen} onClose={() => setRosterOpen(false)} />
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
