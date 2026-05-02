import React, { useState, useEffect, useCallback } from 'react';
import { TODAY, MONTHS_IT, fmtH, fmt } from './utils';
import WeeklyView from './screens/WeeklyView';
import Dashboard from './screens/Dashboard';
import ClientsScreen from './screens/ClientsScreen';
import RecurringScreen from './screens/RecurringScreen';
import SettingsScreen from './screens/SettingsScreen';

const NAV_ITEMS = [
  { id: 'weekly',    label: 'Settimana',    icon: WeekIcon     },
  { id: 'dashboard', label: 'Dashboard',    icon: ChartIcon    },
  { id: 'clients',   label: 'Clienti',      icon: ClientsIcon  },
  { id: 'recurring', label: 'Ricorrenti',   icon: RepeatIcon   },
  { id: 'settings',  label: 'Impostazioni', icon: SettingsIcon },
];

function WeekIcon()     { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M1 6h13" stroke="currentColor" strokeWidth="1.4"/><path d="M5 1v2M10 1v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function ChartIcon()    { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="8" width="3" height="6" rx="1" fill="currentColor"/><rect x="6" y="5" width="3" height="9" rx="1" fill="currentColor"/><rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor"/></svg>; }
function ClientsIcon()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="5.5" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M1 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="11" cy="4" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M13.5 11c0-1.7-1.1-3-2.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function RepeatIcon()   { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 5h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M13 10H4a2 2 0 0 1-2-2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M10 2l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 13l-3-3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function SettingsIcon() { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M11.7 3.3l-1.1 1.1M4.4 10.6l-1.1 1.1M11.7 11.7l-1.1-1.1M4.4 4.4 3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }

const ACCENT = '#3DB33D';

export default function App() {
  const [screen, setScreen]     = useState('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  const [clients, setClients]   = useState([]);
  const [projects, setProjects] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [sidebarKey, setSidebarKey] = useState(0);
  const refreshSidebar = useCallback(() => setSidebarKey(k => k + 1), []);

  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('timebox-theme') || 'dark'; } catch { return 'dark'; }
  });
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  function setTheme(t) {
    try { localStorage.setItem('timebox-theme', t); } catch {}
    setThemeState(t);
  }

  useEffect(() => {
    Promise.all([
      window.api.getClients(),
      window.api.getProjects(),
      window.api.getRecurring(),
    ]).then(([c, p, r]) => {
      setClients(c);
      setProjects(p);
      setRecurring(r);
      setLoading(false);
    });
  }, []);

  const topbarDate = TODAY.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        background: 'var(--tb-main-bg)', fontFamily: "'Open Sans', sans-serif",
        color: 'var(--tb-text-muted)', fontSize: 13 }}>
        Caricamento…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Open Sans', sans-serif", overflow: 'hidden' }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div style={{ width: 200, background: 'var(--tb-sidebar-bg)', display: 'flex', flexDirection: 'column', flexShrink: 0, userSelect: 'none' }}>

        {/* Brand */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--tb-sidebar-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: ACCENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="white" opacity="0.9"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="white" opacity="0.6"/>
                <rect x="8" y="8" width="5" height="5" rx="1" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-sidebar-text)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Timebox</div>
              <div style={{ fontSize: 9, color: ACCENT, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Freelance</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--tb-sidebar-label)', padding: '10px 20px 5px' }}>
            Menu
          </div>
          {NAV_ITEMS.map(item => {
            const active = screen === item.id;
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => setScreen(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '9px 20px', background: 'transparent',
                  border: 'none', borderLeft: active ? `2px solid ${ACCENT}` : '2px solid transparent',
                  color: active ? 'var(--tb-sidebar-nav-active-text)' : 'var(--tb-sidebar-muted)',
                  fontFamily: "'Open Sans', sans-serif", fontSize: 13,
                  fontWeight: active ? 700 : 400, cursor: 'pointer',
                  transition: 'all 0.12s', textAlign: 'left',
                }}>
                <span style={{ color: active ? ACCENT : 'var(--tb-sidebar-faint)', flexShrink: 0 }}>
                  <Icon />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer: ore mese per cliente */}
        <SidebarFooter clients={clients} projects={projects} refreshKey={sidebarKey} />
      </div>

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--tb-main-bg)', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{
          padding: '0 28px', height: 52,
          borderBottom: '1px solid var(--tb-topbar-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--tb-topbar-bg)', flexShrink: 0,
        }}>
          <h1 style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-topbar-text)', letterSpacing: '-0.01em' }}>
            {NAV_ITEMS.find(n => n.id === screen)?.label}
          </h1>
          <div style={{ fontSize: 11, color: 'var(--tb-text-secondary)', fontWeight: 600 }}>
            {topbarDate}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {screen === 'weekly' && (
            <WeeklyView
              clients={clients} projects={projects} recurring={recurring}
              weekOffset={weekOffset} setWeekOffset={setWeekOffset}
              onEntryChange={refreshSidebar} />
          )}
          {screen === 'dashboard' && (
            <Dashboard clients={clients} projects={projects} screen={screen} />
          )}
          {screen === 'clients' && (
            <ClientsScreen
              clients={clients} projects={projects}
              setClients={setClients} setProjects={setProjects} />
          )}
          {screen === 'recurring' && (
            <RecurringScreen
              clients={clients} recurring={recurring} setRecurring={setRecurring} />
          )}
          {screen === 'settings' && <SettingsScreen theme={theme} setTheme={setTheme} />}
        </div>
      </div>
    </div>
  );
}

function SidebarFooter({ clients, projects, refreshKey }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    window.api.getEntries(from, to).then(setEntries);
  }, [refreshKey]);

  const month = MONTHS_IT[TODAY.getMonth()];
  const year = TODAY.getFullYear();
  const totalH = entries.reduce((s, e) => s + e.hours, 0);

  return (
    <div style={{ padding: '14px 20px', borderTop: '1px solid var(--tb-sidebar-border)' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--tb-sidebar-label)', marginBottom: 8 }}>
        {month} {year} · {fmtH(totalH)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {clients.map(c => {
          const h = entries
            .filter(e => {
              const p = projects.find(p2 => p2.id === e.projectId);
              return p?.clientId === c.id;
            })
            .reduce((s, e) => s + e.hours, 0);
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--tb-sidebar-muted)', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--tb-sidebar-faint)', fontWeight: 600 }}>
                {fmtH(h)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
