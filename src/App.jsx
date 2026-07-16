import React, { useState, useEffect, useCallback } from 'react';
import { getToday, fmt, getMondayOfWeek, currentSlot } from './utils';
import QuickLogModal from './components/QuickLogModal';
import TodayView from './screens/TodayView';
import WeeklyView, { AreaStatusPanel } from './screens/WeeklyView';
import Panoramica from './screens/Panoramica';
import BillingScreen from './screens/BillingScreen';
import ClientsScreen from './screens/ClientsScreen';
import RecurringScreen from './screens/RecurringScreen';
import SettingsScreen from './screens/SettingsScreen';
import EntriesScreen from './screens/EntriesScreen';
import TodoistLog from './screens/TodoistLog';
import { DEFAULT_SLOT_CAPACITY_HOURS, SLOT_CAPACITY_SETTING_KEY, normalizeSlotCapacityHours } from './slot-capacity';

const NAV_ITEMS = [
  { id: 'weekly',     label: 'Settimana',      icon: WeekIcon      },
  { id: 'today',      label: 'Oggi',           icon: TodayIcon     },
  { id: 'panoramica', label: 'Andamento',       icon: ChartIcon     },
  { id: 'billing',    label: 'Rendiconto',      icon: BillingIcon   },
  { id: 'entries',    label: 'Registro',        icon: ListIcon      },
  { id: 'todoist-log', label: 'Import Todoist', icon: TodoistIcon   },
  { id: 'clients',    label: 'Aree',            icon: ClientsIcon   },
  { id: 'recurring',  label: 'Ricorrenza',      icon: RepeatIcon    },
  { id: 'settings',   label: 'Impostazioni',    icon: SettingsIcon  },
];

function TodayIcon()    { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 4v3.6l2.4 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
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

// Accento neutro (REDLINE §1: nav attivo non ha colore di brand, solo forma/peso).
const ACCENT = 'var(--tb-sidebar-nav-active-text)';

function mergeProjectDayEntries(entries, projectId) {
  const matches = entries.filter(entry => entry.projectId === projectId);
  if (matches.length === 0) return { matches: [], merged: null };

  const first = matches[0];
  const hours = matches.reduce((sum, entry) => sum + entry.hours, 0);
  const billableTotal = matches.reduce((sum, entry) => sum + (entry.billableHours ?? entry.hours), 0);

  return {
    matches,
    merged: {
      ...first,
      hours,
      billableHours: Math.abs(billableTotal - hours) < 0.001 ? null : billableTotal,
      billed: matches.every(entry => entry.billed),
    },
  };
}

export default function App() {
  // ponytail: dev-only deep-link so headless screenshots can target a screen via ?screen=id
  const [screen, setScreen]     = useState(() => new URLSearchParams(location.search).get('screen') || 'weekly');
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
  const [showHelp, setShowHelp] = useState(false);
  const [autoFocusProject, setAutoFocusProject] = useState(null);
  const [slotCapacityHours, setSlotCapacityHours] = useState(DEFAULT_SLOT_CAPACITY_HOURS);
  const refreshSidebar = useCallback(() => setSidebarKey(k => k + 1), []);

  const [theme, setThemeState] = useState(() => {
    const q = new URLSearchParams(location.search).get('theme'); // ponytail: dev deep-link for screenshots
    if (q) return q;
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
    window.api.getSetting?.(SLOT_CAPACITY_SETTING_KEY)
      .then(value => setSlotCapacityHours(normalizeSlotCapacityHours(value)))
      .catch(() => setSlotCapacityHours(DEFAULT_SLOT_CAPACITY_HOURS));
  }, []);

  async function updateSlotCapacityHours(value) {
    const normalized = normalizeSlotCapacityHours(value);
    setSlotCapacityHours(normalized);
    await window.api.setSetting?.(SLOT_CAPACITY_SETTING_KEY, String(normalized));
  }

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
      const blurActiveInput = () => {
        if (tag === 'INPUT' || tag === 'TEXTAREA') document.activeElement.blur();
      };

      switch (e.key) {
        case 'l':
          e.preventDefault();
          blurActiveInput();
          setQuickLogOpen(o => !o);
          break;
        case 't':
          e.preventDefault();
          blurActiveInput();
          setScreen('weekly');
          setWeekOffset(0);
          break;
        case 'ArrowLeft':
          if (screen === 'weekly') { e.preventDefault(); blurActiveInput(); setWeekOffset(o => o - 1); }
          break;
        case 'ArrowRight':
          if (screen === 'weekly') { e.preventDefault(); blurActiveInput(); setWeekOffset(o => o + 1); }
          break;
        case 'b':
          e.preventDefault();
          blurActiveInput();
          toggleSidebar();
          break;
        case ',':
          e.preventDefault();
          blurActiveInput();
          setScreen('settings');
          break;
        default: {
          const idx = parseInt(e.key, 10) - 1;
          if (!isNaN(idx) && idx >= 0 && idx < NAV_ITEMS.length) {
            e.preventDefault();
            blurActiveInput();
            setScreen(NAV_ITEMS[idx].id);
          }
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [screen, toggleSidebar]);

  useEffect(() => {
    function onHelpKey(e) {
      if (e.key !== '?') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setShowHelp(v => !v);
    }
    document.addEventListener('keydown', onHelpKey);
    return () => document.removeEventListener('keydown', onHelpKey);
  }, []);

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

  function handleQuickLogSelect(projectId, addHours) {
    setQuickLogOpen(false);
    if (addHours == null) {
      setScreen('weekly');
      setWeekOffset(0);
      setAutoFocusProject(projectId);
      return;
    }
    addHoursToToday(projectId, addHours);
  }

  async function addHoursToToday(projectId, addHours) {
    const today = fmt(getToday());
    const entries = await window.api.getEntries(today, today);
    const { matches, merged } = mergeProjectDayEntries(entries, projectId);
    const newHours = (merged?.hours || 0) + addHours;
    const slot = merged?.slot || currentSlot();
    const entry = merged
      ? { ...merged, hours: newHours }
      : { id: crypto.randomUUID(), projectId, date: today, hours: newHours, billableHours: null, slot, billed: false };
    await window.api.saveEntry(entry);
    for (const match of matches) {
      if (match.id === entry.id) continue;
      await window.api.deleteEntry(match.id);
    }
    setWeekRefreshTick(t => t + 1);
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
      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}

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

        {/* Brand (also a draggable macOS title region; interactive children opt out) */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 20px 16px',
          // macOS: leave room for the traffic lights when the sidebar is collapsed too.
          paddingLeft: (collapsed && navigator.userAgent.includes('Mac')) ? 0 : (navigator.userAgent.includes('Mac') ? 70 : (collapsed ? 0 : 20)),
          borderBottom: '1px solid var(--tb-sidebar-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          WebkitAppRegion: 'drag',
        }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--tb-brand-icon-bg)',
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
                <div style={{ fontSize: 9, color: ACCENT, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Capacity</div>
              </div>
            </div>
          )}

          <button onClick={toggleSidebar} style={{
            background: 'transparent', border: 'none', color: 'var(--tb-sidebar-faint)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '6px',
            borderRadius: 4, transition: 'all 0.2s',
            marginRight: collapsed ? 0 : -4,
            flexShrink: 0,
            WebkitAppRegion: 'no-drag',
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
        <SidebarFooter clients={clients} refreshKey={sidebarKey} collapsed={collapsed} />
      </div>

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--tb-main-bg)', overflow: 'hidden' }}>

        {/* Topbar (also the draggable window title region on macOS) */}
        <div style={{
          padding: '0 28px', height: 52,
          // macOS: left padding so the native traffic lights keep breathing room.
          paddingLeft: navigator.userAgent.includes('Mac') ? 78 : 28,
          borderBottom: '1px solid var(--tb-topbar-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--tb-topbar-bg)', flexShrink: 0,
          WebkitAppRegion: 'drag',
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
          {screen === 'today' && (
            <TodayView
              externalRefreshTick={weekRefreshTick}
              clients={clients} projects={projects} recurring={recurring}
              slotCapacityHours={slotCapacityHours}
              onEntryChange={refreshSidebar}
              onSynced={() => setWeekRefreshTick(t => t + 1)}
            />
          )}
          {screen === 'weekly' && (
            <WeeklyView
              clients={clients} projects={projects} recurring={recurring}
              weekOffset={weekOffset} setWeekOffset={setWeekOffset}
              onEntryChange={refreshSidebar}
              externalRefreshTick={weekRefreshTick}
              autoFocusProject={autoFocusProject}
              slotCapacityHours={slotCapacityHours}
              onAutoFocusConsumed={() => setAutoFocusProject(null)}
              onNavigateToAndamento={() => setScreen('panoramica')} />
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
              clients={clients} recurring={recurring} setRecurring={setRecurring}
              slotCapacityHours={slotCapacityHours} />
          )}
          {screen === 'entries' && (
            <EntriesScreen clients={clients} projects={projects} onEntryChange={refreshSidebar} />
          )}
          {screen === 'todoist-log' && <TodoistLog clients={clients} projects={projects} />}
          {screen === 'settings' && (
            <SettingsScreen
              theme={theme}
              setTheme={setTheme}
              onDataChange={refreshData}
              slotCapacityHours={slotCapacityHours}
              onSlotCapacityChange={updateSlotCapacityHours}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function KeyboardHelp({ onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shortcuts = [
    ['⌘ L',     'Apre il QuickLog'],
    ['⌘ T',     'Timesheet della settimana corrente'],
    ['⌘ ← / →', 'Settimana precedente / successiva'],
    ['⌥ ← / →', 'In una cella del timesheet: salva e si sposta di giorno sulla stessa riga'],
    ['⌘ B',     'Espande / riduce la sidebar'],
    ['⌘ ,',     'Impostazioni'],
    ['⌘ 1–9',   'Naviga alle schermate in ordine sidebar'],
    ['⌘ ⇧ H',  'Nascondi / mostra vuoti nel Timesheet'],
    ['⌘ ⇧ P',  'Cicla Completa / Compatta / Nascosta'],
    ['⌘ ⇧ V',  'Alterna Ore tracciate / Ore fatturabili'],
    ['?',        'Mostra / nasconde questa guida'],
  ];

  const kbd = txt => (
    <kbd style={{
      fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
      background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
      borderRadius: 4, padding: '2px 6px', color: 'var(--tb-text-primary)',
    }}>{txt}</kbd>
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--tb-panel-bg)', borderRadius: 12,
        border: '1px solid var(--tb-border)',
        width: 460, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--tb-border-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)' }}>
            Scorciatorie da tastiera
          </span>
          {kbd('Esc')}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {shortcuts.map(([keys, desc], i) => (
              <tr key={i} style={{ borderBottom: i < shortcuts.length - 1 ? '1px solid var(--tb-border-soft)' : 'none' }}>
                <td style={{ padding: '9px 12px 9px 20px', width: 120, whiteSpace: 'nowrap' }}>{kbd(keys)}</td>
                <td style={{ padding: '9px 20px 9px 0', fontSize: 11, color: 'var(--tb-text-secondary)' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SidebarFooter({ clients, refreshKey, collapsed }) {
  const [statuses, setStatuses] = useState({});
  const weekKey = fmt(getMondayOfWeek(getToday()));

  useEffect(() => {
    if (collapsed) return;
    window.api.getWeekAreaStatuses(weekKey).then(rows => {
      setStatuses(Object.fromEntries(rows.map(row => [row.areaId, row.status])));
    });
  }, [refreshKey, collapsed, weekKey]);

  if (collapsed) return null;

  function setAreaStatus(areaId, status) {
    setStatuses(prev => {
      const next = { ...prev };
      if (status === 'active') delete next[areaId];
      else next[areaId] = status;
      return next;
    });
    window.api.saveWeekAreaStatus({ weekKey, areaId, status });
  }

  const clientsWithStatus = clients.map(c => ({ ...c, areaStatus: statuses[c.id] ?? 'active' }));

  return (
    <div style={{ padding: '14px 20px', borderTop: '1px solid var(--tb-sidebar-border)' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--tb-sidebar-label)', marginBottom: 8 }}>
        Stato aree · settimana
      </div>
      <AreaStatusPanel clients={clientsWithStatus} statuses={statuses} onChange={setAreaStatus} compact />
      <div style={{ marginTop: 10, fontSize: 9, color: 'var(--tb-sidebar-faint)', letterSpacing: '0.05em' }}>
        v{__APP_VERSION__}
      </div>
    </div>
  );
}
