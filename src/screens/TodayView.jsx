import React, { useEffect, useState } from 'react';
import { fmt, fmtH, getToday } from '../utils';

function formatSyncDate(value) {
  if (!value) return 'Mai sincronizzato';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function mismatchTotal(counts = {}) {
  return (counts.tasksWithoutTimeboxProject || 0)
    + (counts.tasksOutsidePlannedArea || 0)
    + (counts.tasksOverBlockCapacity || 0)
    + (counts.blocksWithoutReadyTasks || 0)
    + (counts.estimatedBeyondResidualCapacity || 0);
}

export default function TodayView({ externalRefreshTick, projects, onSynced }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const today = fmt(getToday());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await window.api.getDayInsights(today));
    } catch (err) {
      setError(err.message || 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [today, externalRefreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function syncFromTodoist() {
    setSyncing(true);
    try {
      const debug = localStorage.getItem('timebox-todoist-debug') === 'true';
      const result = await window.api.syncTodoist(projects, [today], debug);
      if (result.error === 'no_token') {
        alert('Token Todoist non configurato. Vai in Impostazioni → Todoist per inserirlo.');
        return;
      }
      const now = new Date().toISOString();
      const tasks = result.byDate[today] ?? [];
      await window.api.setTodoistCache(today, tasks, now);
      await load();
      onSynced?.();
    } catch (err) {
      alert(`Errore sincronizzazione Todoist: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const totals = data?.freeCapacity?.totals ?? {};
  const readyGroups = data?.readyBlocks?.groups ?? [];
  const counts = data?.mismatches?.counts ?? {};
  const mismatches = data?.mismatches?.mismatches ?? {};
  const totalMismatches = mismatchTotal(counts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 850, color: 'var(--tb-text-primary)', lineHeight: 1.1 }}>Oggi</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginTop: 4 }}>
            {new Date(`${today}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            {data?.syncedAt ? ` · Todoist ${formatSyncDate(data.syncedAt)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <TodoistSyncButton onClick={syncFromTodoist} busy={syncing} />
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', border: '1px solid #E0525240', background: '#E0525210', color: '#E05252', borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <MetricCard
          label="Capacità libera"
          value={loading ? '...' : fmtH(totals.freeUnallocatedHours || 0)}
          sub={`${fmtH(totals.availableAfterTrackedAndTasks || 0)} dopo tracciate + Todoist`}
          tone={(totals.freeUnallocatedHours || 0) > 0 ? 'green' : 'muted'}
        />
        <MetricCard
          label="Blocchi senza azione"
          value={loading ? '...' : String(readyGroups.length)}
          sub={`${fmtH(totals.reservedWithoutTasksHours || 0)} ancora riservate`}
          tone={readyGroups.length ? 'orange' : 'green'}
        />
        <MetricCard
          label="Mismatch"
          value={loading ? '...' : String(totalMismatches)}
          sub={`${fmtH(totals.estimatedHours || 0)} stimate in Todoist`}
          tone={totalMismatches ? 'orange' : 'green'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Panel title="Blocchi senza prossima azione" empty={!loading && readyGroups.length === 0 ? 'Coperti' : null}>
          {loading ? <SkeletonRows /> : readyGroups.slice(0, 8).map((group, index) => (
            <InsightRow
              key={`${group.slot}-${group.areaId}-${index}`}
              title={`${group.area} · ${group.slot.toUpperCase()}`}
              value={fmtH(group.missingHours)}
              meta={`${fmtH(group.estimatedHours)} Todoist su ${fmtH(group.availableHours)} disponibili`}
              color="#E07B3A"
            />
          ))}
        </Panel>

        <Panel title="Mismatch dopo sync" empty={!loading && totalMismatches === 0 ? 'Pulito' : null}>
          {loading ? <SkeletonRows /> : (
            <>
              <MismatchGroup label="Non mappati" count={counts.tasksWithoutTimeboxProject} items={mismatches.tasksWithoutTimeboxProject} itemLabel={item => item.title} />
              <MismatchGroup label="Fuori pianificazione" count={counts.tasksOutsidePlannedArea} items={mismatches.tasksOutsidePlannedArea} itemLabel={item => `${item.title} · ${item.area}`} />
              <MismatchGroup label="Oltre blocco" count={counts.tasksOverBlockCapacity} items={mismatches.tasksOverBlockCapacity} itemLabel={item => `${item.title} · +${fmtH(item.overflowHours)}`} />
              <MismatchGroup label="Capacità oltre residuo" count={counts.estimatedBeyondResidualCapacity} items={mismatches.estimatedBeyondResidualCapacity ? [mismatches.estimatedBeyondResidualCapacity] : []} itemLabel={item => `+${fmtH(item.overflowHours)} oltre residuo`} />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function TodoistSyncButton({ onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      title="Aggiorna i task da Todoist per oggi"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5,
        background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border)', color: 'var(--tb-text-secondary)',
        cursor: busy ? 'wait' : 'pointer', fontFamily: "'Open Sans', sans-serif",
        opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{ animation: busy ? 'tbspin 0.8s linear infinite' : 'none', flexShrink: 0 }}>
        <path d="M9 5a4 4 0 1 1-1.2-2.8M9 1.5V3.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <span>Aggiorna da Todoist</span>
      <style>{`@keyframes tbspin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

function MetricCard({ label, value, sub, tone }) {
  const color = tone === 'orange' ? '#E07B3A' : tone === 'green' ? '#3DB33D' : 'var(--tb-text-muted)';
  return (
    <div style={{ border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', padding: '14px 16px', minHeight: 104 }}>
      <div style={{ fontSize: 9, fontWeight: 850, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 850, color, lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, empty, children }) {
  return (
    <section style={{ border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', overflow: 'hidden', minHeight: 260 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 12, fontWeight: 850, color: 'var(--tb-text-primary)' }}>{title}</h2>
        {empty && <span style={{ fontSize: 10, fontWeight: 800, color: '#3DB33D' }}>{empty}</span>}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function InsightRow({ title, value, meta, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '8px 9px', borderRadius: 6, background: 'var(--tb-panel-bg-subtle)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--tb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 850, color }}>{value}</div>
    </div>
  );
}

function MismatchGroup({ label, count = 0, items = [], itemLabel }) {
  if (!count) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 850, color: 'var(--tb-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label} · {count}
      </div>
      {items.slice(0, 4).map((item, index) => (
        <InsightRow
          key={`${label}-${index}`}
          title={itemLabel(item)}
          value={item.slot?.toUpperCase?.() || ''}
          meta={item.project || item.todoistProject || ''}
          color="#E07B3A"
        />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} style={{ height: 47, borderRadius: 6, background: 'var(--tb-panel-bg-subtle)', opacity: 0.7 }} />
  ));
}
