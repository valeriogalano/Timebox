import React, { useState, useEffect, useCallback } from 'react';
import { getToday, MONTHS_IT, fmtH, fmt } from './utils';
import QuickLogModal from './components/QuickLogModal';
import WeeklyView from './screens/WeeklyView';
import Panoramica from './screens/Panoramica';
import BillingScreen from './screens/BillingScreen';
import ClientsScreen from './screens/ClientsScreen';
import RecurringScreen from './screens/RecurringScreen';
import SettingsScreen from './screens/SettingsScreen';
import EntriesScreen from './screens/EntriesScreen';
import TodoistLog from './screens/TodoistLog';

const NAV_ITEMS = [
  { id: 'weekly',     label: 'Timesheet',      icon: WeekIcon      },
  { id: 'panoramica', label: 'Dashboard',       icon: ChartIcon     },
  { id: 'billing',    label: 'Rendiconto',      icon: BillingIcon   },
  { id: 'entries',    label: 'Registro',        icon: ListIcon      },
  { id: 'todoist-log', label: 'Task Todoist',   icon: TodoistIcon   },
  { id: 'clients',    label: 'Aree',            icon: ClientsIcon   },
  { id: 'recurring',  label: 'Ricorrenza',      icon: RepeatIcon    },
  { id: 'settings',   label: 'Impostazioni',    icon: SettingsIcon  },
];

function WeekIcon()     { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M1 6h13" stroke="currentColor" strokeWidth="1.4"/><path d="M5 1v2M10 1v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function ChartIcon()    { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="8" width="3" height="6" rx="1" fill="currentColor"/><rect x="6" y="5" width="3" height="9" rx="1" fill="currentColor"/><rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor"/></svg>; }
function ClientsIcon()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="4" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 4V2.5C5 1.67 5.67 1 6.5 1H8.5C9.33 1 10 1.67 10 2.5V4" stroke="currentColor" strokeWidth="1.4"/><path d="M2 7.5h11" stroke="currentColor" strokeWidth="1.4"/></svg>; }
function RepeatIcon()   { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 5h13M1 9h13" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5v9M10 5v9" stroke="currentColor" strokeWidth="1.2"/></svg>; }
function SettingsIcon() { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M11.7 3.3l-1.1 1.1M4.4 10.6l-1.1 1.1M11.7 11.7l-1.1-1.1M4.4 4.4 3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function ListIcon()     { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 4h9M3 7.5h9M3 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function TodoistIcon()   { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7.5l1.8 1.8L10 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function BillingIcon()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="2" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 5.5h13" stroke="currentColor" strokeWidth="1.2"/><path d="M4 9h2M9 9h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function CollapseIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ExpandIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

const ACCENT = '#3DB33D';

export default function App() {
  const [screen, setScreen]     = useState('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  const [clients, setClients]   = useState([]);
  const [projects, setProjects] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [weekRefreshTick, setWeekRefreshTick] = useState(0);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('timebox-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [autoFocusProject, setAutoFocusProject] = useState(null);
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

  const toggleSidebar = useCallback(() => {
    setCollapsed(prev => {
      const newVal = !prev;
      try { localStorage.setItem('timebox-sidebar-collapsed', String(newVal)); } catch {}
      return newVal;
    });
  }, []);

  function refreshData() {
    return Promise.all([
      window.api.getClients(),
      window.api.getProjects(),
      window.api.getRecurring(),
    ]).then(([c, p, r]) => {
      setClients(c);
      setProjects(p);
      setRecurring(r);
    });
  }

  useEffect(() => {
    refreshData().then(() => setLoading(false));
  }, []);

  useEffect(() => {
    return window.api.onDbChanged(type => {
      if (type === 'structure') refreshData();
      setWeekRefreshTick(t => t + 1);
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (!e.metaKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case 'l':
          e.preventDefault();
          setQuickLogOpen(o => !o);
          break;
        case 't':
          e.preventDefault();
          setScreen('weekly');
          setWeekOffset(0);
          break;
        case 'ArrowLeft':
          if (screen === 'weekly') { e.preventDefault(); setWeekOffset(o => o - 1); }
          break;
        case 'ArrowRight':
          if (screen === 'weekly') { e.preventDefault(); setWeekOffset(o => o + 1); }
          break;
        case 'b':
          e.preventDefault();
          toggleSidebar();
          break;
        case ',':
          e.preventDefault();
          setScreen('settings');
          break;
        default: {
          const idx = parseInt(e.key, 10) - 1;
          if (!isNaN(idx) && idx >= 0 && idx < NAV_ITEMS.length) {
            e.preventDefault();
            setScreen(NAV_ITEMS[idx].id);
          }
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [screen, toggleSidebar]);

  const topbarDate = getToday().toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        background: 'var(--tb-main-bg)', fontFamily: "'Open Sans', sans-serif",
        color: 'var(--tb-text-muted)', fontSize: 13 }}>
        Caricamento…
      </div>
    );
  }

  function handleQuickLogSelect(projectId) {
    setQuickLogOpen(false);
    setScreen('weekly');
    setWeekOffset(0);
    setAutoFocusProject(projectId);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Open Sans', sans-serif", overflow: 'hidden' }}>
      {quickLogOpen && (
        <QuickLogModal
          projects={projects}
          clients={clients}
          onSelect={handleQuickLogSelect}
          onClose={() => setQuickLogOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div style={{
        width: collapsed ? 64 : 200,
        background: 'var(--tb-sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        userSelect: 'none',
        transition: 'width 0.2s ease-in-out',
        overflow: 'hidden'
      }}>

        {/* Brand */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 20px 16px',
          borderBottom: '1px solid var(--tb-sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between'
        }}>
          {!collapsed && (
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
          )}

          <button onClick={toggleSidebar} style={{
            background: 'transparent', border: 'none', color: 'var(--tb-sidebar-faint)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '6px',
            borderRadius: 4, transition: 'all 0.2s',
            marginRight: collapsed ? 0 : -4,
            flexShrink: 0
          }} onMouseOver={e => {
            e.currentTarget.style.background = 'var(--tb-sidebar-border)';
            e.currentTarget.style.color = 'var(--tb-sidebar-text)';
          }} onMouseOut={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--tb-sidebar-faint)';
          }}>
            {collapsed ? <ExpandIcon /> : <CollapseIcon />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0' }}>
          {!collapsed && (
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--tb-sidebar-label)', padding: '10px 20px 5px' }}>
              Menu
            </div>
          )}
          {NAV_ITEMS.map(item => {
            const active = screen === item.id;
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => setScreen(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9, width: '100%',
                  padding: collapsed ? '12px 0' : '9px 20px', background: 'transparent',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  border: 'none', borderLeft: !collapsed && active ? `2px solid ${ACCENT}` : '2px solid transparent',
                  color: active ? 'var(--tb-sidebar-nav-active-text)' : 'var(--tb-sidebar-muted)',
                  fontFamily: "'Open Sans', sans-serif", fontSize: 13,
                  fontWeight: active ? 700 : 400, cursor: 'pointer',
                  transition: 'all 0.12s', textAlign: 'left',
                  position: 'relative'
                }}>
                {collapsed && active && (
                  <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, background: ACCENT, borderRadius: '0 2px 2px 0' }} />
                )}
                <span style={{ color: active ? ACCENT : 'var(--tb-sidebar-faint)', flexShrink: 0, display: 'flex' }}>
                  <Icon />
                </span>
                {!collapsed && item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer: ore mese per area */}
        <SidebarFooter clients={clients} projects={projects} refreshKey={sidebarKey} collapsed={collapsed} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-topbar-text)', letterSpacing: '-0.01em' }}>
              {NAV_ITEMS.find(n => n.id === screen)?.label}
            </h1>
          </div>
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
              onEntryChange={refreshSidebar}
              externalRefreshTick={weekRefreshTick}
              autoFocusProject={autoFocusProject}
              onAutoFocusConsumed={() => setAutoFocusProject(null)} />
          )}
          {screen === 'panoramica' && (
            <Panoramica clients={clients} projects={projects} recurring={recurring} screen={screen} />
          )}
          {screen === 'billing' && (
            <BillingScreen clients={clients} projects={projects} screen={screen} />
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
          {screen === 'entries' && (
            <EntriesScreen clients={clients} projects={projects} onEntryChange={refreshSidebar} />
          )}
          {screen === 'todoist-log' && <TodoistLog clients={clients} projects={projects} />}
          {screen === 'settings' && <SettingsScreen theme={theme} setTheme={setTheme} onDataChange={refreshData} />}
        </div>
      </div>
    </div>
  );
}

function SidebarFooter({ clients, projects, refreshKey, collapsed }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (collapsed) return;
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    window.api.getEntries(from, to).then(setEntries);
  }, [refreshKey, collapsed]);

  if (collapsed) return null;

  const month = MONTHS_IT[getToday().getMonth()];
  const year = getToday().getFullYear();
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
      <div style={{ marginTop: 10, fontSize: 9, color: 'var(--tb-sidebar-faint)', letterSpacing: '0.05em' }}>
        v{__APP_VERSION__}
      </div>
    </div>
  );
}
