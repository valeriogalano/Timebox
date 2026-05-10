import React, { useState, useEffect, useMemo } from 'react';
import { getToday, MONTHS_IT, getMondayOfWeek, addDays, fmt, fmtH } from '../utils';

const COL_OVER  = '#E05252';
const COL_UNDER = '#E8B339';
const COL_OK    = '#3DB33D';

const TREND_WEEKS  = 8;
const TREND_MONTHS = 6;

function fmtEur(n) {
  if (n == null) return '—';
  return '€' + Math.round(n).toLocaleString('it-IT');
}

function statusFor(done, capacity) {
  if (capacity === 0) return { label: '—', color: 'var(--tb-text-muted)' };
  const ratio = done / capacity;
  if (ratio > 1.1)  return { label: 'Sovraccarico', color: COL_OVER };
  if (ratio < 0.85) return { label: 'Sottocarico',  color: COL_UNDER };
  return { label: 'In linea', color: COL_OK };
}

function clientWeeklyCapacity(clientId, recurring) {
  return recurring
    .filter(r => r.clientId === clientId)
    .reduce((s, r) => s + r.hours, 0);
}

function isBillableClient(client) {
  return client.billable && client.billing === 'hourly' && client.rate > 0;
}

// Returns the monday and sunday (as fmt strings) for a week at offset from current
function weekRange(offset) {
  const monday = getMondayOfWeek(getToday());
  const start  = addDays(monday, offset * 7);
  const end    = addDays(start, 6);
  return { start, end, startStr: fmt(start), endStr: fmt(end) };
}

// Returns first and last day of a month at offset from current
function monthRange(offset) {
  const today = getToday();
  const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: d,
    end: last,
    startStr: fmt(d),
    endStr: fmt(last),
    year: d.getFullYear(),
    monthIdx: d.getMonth(),
  };
}

function periodLabel(period, offset) {
  if (period === 'week') {
    const { start, end } = weekRange(offset);
    const sm = start.getDate();
    const em = end.getDate();
    const startMonth = MONTHS_IT[start.getMonth()].slice(0, 3);
    const endMonth   = MONTHS_IT[end.getMonth()].slice(0, 3);
    if (start.getMonth() === end.getMonth()) {
      return `${sm} – ${em} ${endMonth} ${end.getFullYear()}`;
    }
    return `${sm} ${startMonth} – ${em} ${endMonth} ${end.getFullYear()}`;
  }
  const { year, monthIdx } = monthRange(offset);
  return `${MONTHS_IT[monthIdx]} ${year}`;
}

function countWeeksInMonth(monthIdx, year) {
  // Count Mon–Fri weeks that fall (even partially) in this month
  const first = new Date(year, monthIdx, 1);
  const last  = new Date(year, monthIdx + 1, 0);
  const startMonday = getMondayOfWeek(first);
  let count = 0;
  let cur = startMonday;
  while (cur <= last) {
    count++;
    cur = addDays(cur, 7);
  }
  return count;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Panoramica({ clients, projects, recurring, screen }) {
  const [period, setPeriod]             = useState('month');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [entries, setEntries]           = useState([]);

  // Compute the broadest date range we need: covers current period + full trend
  const fetchRange = useMemo(() => {
    const today = getToday();
    // Current period end
    let periodEnd;
    if (period === 'week') {
      const { end } = weekRange(periodOffset);
      periodEnd = end;
    } else {
      const { end } = monthRange(periodOffset);
      periodEnd = end;
    }
    // Trend start: farthest back
    const weekTrendStart = addDays(getMondayOfWeek(today), -(TREND_WEEKS - 1) * 7 + (periodOffset * 7));
    const monthTrendStart = new Date(today.getFullYear(), today.getMonth() - (TREND_MONTHS - 1) + periodOffset, 1);
    const earliest = weekTrendStart < monthTrendStart ? weekTrendStart : monthTrendStart;
    return { from: fmt(earliest), to: fmt(periodEnd) };
  }, [period, periodOffset]);

  useEffect(() => {
    if (screen !== 'panoramica') return;
    window.api.getEntries(fetchRange.from, fetchRange.to).then(setEntries);
  }, [screen, fetchRange.from, fetchRange.to]);

  // Build a lookup: projectId → clientId
  const projectClientMap = useMemo(() => {
    const m = {};
    projects.forEach(p => { m[p.id] = p.clientId; });
    return m;
  }, [projects]);

  // Compute stats for the current period
  const stats = useMemo(() => {
    let startStr, endStr, numWeeks;
    if (period === 'week') {
      const r = weekRange(periodOffset);
      startStr = r.startStr;
      endStr   = r.endStr;
      numWeeks = 1;
    } else {
      const r = monthRange(periodOffset);
      startStr = r.startStr;
      endStr   = r.endStr;
      numWeeks = countWeeksInMonth(r.monthIdx, r.year);
    }

    const periodEntries = entries.filter(e => e.date >= startStr && e.date <= endStr);

    const actualByClient = {};
    clients.forEach(c => { actualByClient[c.id] = 0; });
    periodEntries.forEach(e => {
      const cid = projectClientMap[e.projectId];
      if (cid != null) actualByClient[cid] = (actualByClient[cid] ?? 0) + e.hours;
    });

    const plannedByClient = {};
    clients.forEach(c => {
      plannedByClient[c.id] = clientWeeklyCapacity(c.id, recurring) * numWeeks;
    });

    const capacity  = Object.values(plannedByClient).reduce((s, v) => s + v, 0);
    const totalDone = Object.values(actualByClient).reduce((s, v) => s + v, 0);

    const billable = clients.filter(isBillableClient);
    const billedDoneEur    = billable.reduce((s, c) => s + (actualByClient[c.id] ?? 0) * c.rate, 0);
    const projectionEur    = billable.reduce((s, c) => s + Math.max(actualByClient[c.id] ?? 0, plannedByClient[c.id] ?? 0) * c.rate, 0);
    const billableDoneHours = billable.reduce((s, c) => s + (actualByClient[c.id] ?? 0), 0);

    // Hours per project in this period (for budget card)
    const actualByProject = {};
    projects.forEach(p => { actualByProject[p.id] = 0; });
    periodEntries.forEach(e => {
      if (e.projectId in actualByProject) actualByProject[e.projectId] += e.hours;
    });

    return { actualByClient, plannedByClient, actualByProject, numWeeks, capacity, totalDone, billedDoneEur, projectionEur, billableDoneHours };
  }, [entries, period, periodOffset, clients, projects, recurring, projectClientMap]);

  // Build trend data (follows the main period toggle)
  const trendData = useMemo(() => {
    const today = getToday();

    if (period === 'week') {
      const currentMonday = getMondayOfWeek(today);
      return Array.from({ length: TREND_WEEKS }, (_, i) => {
        const weekIdx = i - (TREND_WEEKS - 1) + periodOffset;
        const monday  = addDays(getMondayOfWeek(today), weekIdx * 7);
        const sunday  = addDays(monday, 6);
        const startStr = fmt(monday);
        const endStr   = fmt(sunday);
        const isCurrent = fmt(monday) === fmt(addDays(getMondayOfWeek(today), periodOffset * 7));

        const wEntries = entries.filter(e => e.date >= startStr && e.date <= endStr);
        const done = {};
        const planned = {};
        clients.forEach(c => {
          planned[c.id] = clientWeeklyCapacity(c.id, recurring);
          done[c.id] = 0;
        });
        wEntries.forEach(e => {
          const cid = projectClientMap[e.projectId];
          if (cid) done[cid] = (done[cid] ?? 0) + e.hours;
        });

        const d = monday.getDate();
        const m = MONTHS_IT[monday.getMonth()].slice(0, 3);
        return {
          label: `${d} ${m}`,
          planned: Object.values(planned).reduce((s, v) => s + v, 0),
          done:    Object.values(done).reduce((s, v) => s + v, 0),
          current: isCurrent,
        };
      });
    }

    // Monthly trend
    return Array.from({ length: TREND_MONTHS }, (_, i) => {
      const monthBack = i - (TREND_MONTHS - 1) + periodOffset;
      const { startStr, endStr, monthIdx, year } = monthRange(monthBack);
      const isCurrent = monthBack === 0;

      const mEntries = entries.filter(e => e.date >= startStr && e.date <= endStr);
      const nWeeks = countWeeksInMonth(monthIdx, year);
      const done = {};
      const planned = {};
      clients.forEach(c => {
        planned[c.id] = clientWeeklyCapacity(c.id, recurring) * nWeeks;
        done[c.id] = 0;
      });
      mEntries.forEach(e => {
        const cid = projectClientMap[e.projectId];
        if (cid) done[cid] = (done[cid] ?? 0) + e.hours;
      });

      return {
        label: MONTHS_IT[monthIdx].slice(0, 3),
        planned: Object.values(planned).reduce((s, v) => s + v, 0),
        done:    Object.values(done).reduce((s, v) => s + v, 0),
        current: isCurrent,
      };
    });
  }, [entries, period, periodOffset, clients, recurring, projectClientMap]);

  const status   = statusFor(stats.totalDone, stats.capacity);
  const deltaH   = stats.totalDone - stats.capacity;
  const label    = periodLabel(period, periodOffset);
  const isToday  = periodOffset === 0;

  const budgetProjects = projects.filter(p => p.budgetHours > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>

      {/* Period header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={() => setPeriodOffset(o => o - 1)}>‹</NavBtn>
          <div style={{
            fontSize: 15, fontWeight: 800, color: 'var(--tb-text-primary)',
            minWidth: 200, textAlign: 'center',
          }}>
            {label}
          </div>
          <NavBtn onClick={() => setPeriodOffset(o => o + 1)}>›</NavBtn>
          {!isToday && (
            <NavBtn small onClick={() => setPeriodOffset(0)}>Oggi</NavBtn>
          )}
        </div>
        <Segmented
          value={period}
          options={[{ v: 'week', l: 'Settimana' }, { v: 'month', l: 'Mese' }]}
          onChange={v => { setPeriod(v); setPeriodOffset(0); }}
        />
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 14 }}>
        {/* CARICO */}
        <Card>
          <CardLabel>Carico {period === 'month' ? 'del mese' : 'della settimana'}</CardLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmtH(stats.totalDone)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
              / {fmtH(stats.capacity)}
            </span>
          </div>
          <CapacityBar done={stats.totalDone} capacity={stats.capacity} color={status.color} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600 }}>
            <span>Capacità target {fmtH(stats.capacity)}</span>
            <span style={{ color: deltaH >= 0 ? COL_OK : 'var(--tb-text-muted)' }}>
              Δ {deltaH >= 0 ? '+' : ''}{fmtH(deltaH)}
            </span>
          </div>
        </Card>

        {/* FATTURABILE A CONSUMO */}
        <Card>
          <CardLabel>Fatturabile a consumo</CardLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: COL_OK, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmtEur(stats.billedDoneEur)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-muted)' }}>svolto</span>
          </div>
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 6,
            background: 'var(--tb-panel-bg-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ProjectionIcon />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-secondary)', letterSpacing: '0.03em' }}>
                Proiezione fine {period === 'month' ? 'mese' : 'settimana'}
              </span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)' }}>
              {fmtEur(stats.projectionEur)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600, marginTop: 8 }}>
            {fmtH(stats.billableDoneHours)} fatturabili svolte · aree fisse escluse
          </div>
        </Card>

        {/* STATO */}
        <Card>
          <CardLabel>Stato</CardLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: status.color + '22',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <StatusGlyph color={status.color} kind={status.label} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: status.color, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                {status.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600, marginTop: 2 }}>
                {stats.capacity > 0 ? Math.round(stats.totalDone / stats.capacity * 100) : 0}% capacità
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Andamento */}
      <Card padding={0}>
        <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <CardLabel inline>Andamento</CardLabel>
            <Legend />
          </div>
        </div>
        <div style={{ padding: '4px 18px 18px' }}>
          <TrendChart data={trendData} capacity={stats.capacity} mode={period} />
        </div>
      </Card>

      {/* Stato aree */}
      <div>
        <SectionHeader title="Stato aree" subtitle={`${clients.length} aree`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clients.map(c => (
            <AreaCardCockpit
              key={c.id}
              client={c}
              done={stats.actualByClient[c.id] ?? 0}
              planned={stats.plannedByClient[c.id] ?? 0}
              period={period}
              numWeeks={stats.numWeeks}
            />
          ))}
        </div>
      </div>

      {/* Budget progetti */}
      {budgetProjects.length > 0 && (
        <div>
          <SectionHeader title="Budget progetti" subtitle={`${budgetProjects.length} con budget`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {budgetProjects.map(p => (
              <ProjectCardCockpit
                key={p.id}
                project={p}
                clients={clients}
                done={stats.actualByProject[p.id] ?? 0}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AreaCardCockpit({ client, done, planned, period, numWeeks }) {
  const hasLimit    = !!client.limitType && client.limitHours > 0;
  const isBillable  = isBillableClient(client);
  const isFixed     = client.billing === 'fixed';
  const rate        = client.rate ?? 0;

  // Scale weekly limit to match the current period
  const limitBase = hasLimit
    ? (client.limitType === 'weekly' ? client.limitHours * numWeeks : client.limitHours)
    : null;

  const pct = limitBase
    ? done / limitBase
    : (planned > 0 ? done / planned : 0);

  let barColor = client.color;
  if (hasLimit && pct > 1.05) barColor = COL_OVER;
  else if (hasLimit && pct > 0.95) barColor = COL_OK;

  return (
    <div style={{
      background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
      borderRadius: 8, padding: '14px 18px', display: 'grid',
      gridTemplateColumns: '1fr auto auto auto', gap: 18, alignItems: 'center',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{client.name}</span>
          <TypeBadge client={client} />
        </div>
        <Bar value={done} max={Math.max(limitBase || planned || 1, done)} color={barColor} />
      </div>

      <div style={{ textAlign: 'right', minWidth: 90 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-text-primary)', lineHeight: 1 }}>
          {fmtH(done)}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.04em', marginTop: 3, textTransform: 'uppercase' }}>
          {hasLimit
            ? `/ ${fmtH(limitBase)} ${client.limitType === 'weekly' ? (period === 'week' ? 'sett' : 'mese') : 'tot'}`
            : `/ ${fmtH(planned)} piano`}
        </div>
      </div>

      <div style={{ textAlign: 'right', minWidth: 120 }}>
        {isBillable ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: COL_OK, lineHeight: 1 }}>
              {fmtEur(done * rate)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.04em', marginTop: 3, textTransform: 'uppercase' }}>
              proiez. {fmtEur(Math.max(done, planned) * rate)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {isFixed ? 'fisso' : 'non fatt.'}
          </div>
        )}
      </div>

      <div style={{ minWidth: 24 }}>
        <AreaStatusDot client={client} done={done} planned={planned} limit={limitBase} />
      </div>
    </div>
  );
}

function ProjectCardCockpit({ project, clients, done }) {
  const client = clients.find(c => c.id === project.clientId);
  if (!client) return null;
  const pct  = done / project.budgetHours;
  const color = pct > 1 ? COL_OVER : pct > 0.9 ? COL_UNDER : client.color;

  return (
    <div style={{
      background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
      borderRadius: 8, padding: '12px 18px',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'center',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)' }}>{project.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)' }}>· {client.name}</span>
        </div>
        <Bar value={done} max={project.budgetHours} color={color} />
      </div>
      <div style={{ textAlign: 'right', minWidth: 100 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)', lineHeight: 1 }}>
          {fmtH(done)}{' '}
          <span style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>/ {fmtH(project.budgetHours)}</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: pct > 0.9 ? color : 'var(--tb-text-muted)', letterSpacing: '0.04em', marginTop: 3, textTransform: 'uppercase' }}>
          {Math.round(pct * 100)}% budget
        </div>
      </div>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Card({ children, padding = 16 }) {
  return (
    <div style={{
      background: 'var(--tb-panel-bg)',
      border: '1px solid var(--tb-panel-border)',
      borderRadius: 10,
      padding,
    }}>{children}</div>
  );
}

function CardLabel({ children, inline }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--tb-text-muted)', marginBottom: inline ? 0 : 8,
    }}>{children}</div>
  );
}

function NavBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      width: small ? 'auto' : 30, height: 30, borderRadius: 6,
      background: 'var(--tb-navbtn-bg)', border: '1px solid var(--tb-navbtn-border)',
      color: 'var(--tb-navbtn-text)', fontSize: small ? 11 : 14, fontWeight: 700, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Open Sans',sans-serif",
      padding: small ? '0 10px' : 0,
    }}>{children}</button>
  );
}

function Segmented({ value, options, onChange, small }) {
  return (
    <div style={{
      display: 'inline-flex', padding: 2, borderRadius: 7,
      background: 'var(--tb-panel-bg-subtle)', border: '1px solid var(--tb-border-soft)',
    }}>
      {options.map(o => {
        const active = o.v === value;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            padding: small ? '4px 10px' : '5px 14px',
            border: 'none', borderRadius: 5, cursor: 'pointer',
            fontFamily: "'Open Sans',sans-serif",
            fontSize: small ? 11 : 12, fontWeight: active ? 800 : 600,
            background: active ? 'var(--tb-panel-bg)' : 'transparent',
            color: active ? 'var(--tb-text-primary)' : 'var(--tb-text-muted)',
            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            letterSpacing: '0.01em',
          }}>{o.l}</button>
        );
      })}
    </div>
  );
}

function CapacityBar({ done, capacity, color }) {
  const pct = capacity > 0 ? Math.min(1.2, done / capacity) : 0;
  return (
    <div style={{
      position: 'relative', height: 10, borderRadius: 5,
      background: 'var(--tb-panel-bg-subtle)', marginTop: 14, overflow: 'visible',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: Math.min(100, pct * 100) + '%',
        background: color, borderRadius: 5, transition: 'width 0.4s ease',
      }} />
      <div style={{
        position: 'absolute', left: '100%', top: -3, bottom: -3, width: 0,
        borderLeft: '2px dashed var(--tb-text-muted)',
        transform: 'translateX(-1px)',
      }} />
    </div>
  );
}

function Bar({ value, max, color, thin }) {
  const pct = max > 0 ? Math.min(1.2, value / max) : 0;
  return (
    <div style={{
      position: 'relative', height: thin ? 5 : 7, borderRadius: 4,
      background: 'var(--tb-panel-bg-subtle)', overflow: 'visible',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: Math.min(100, pct * 100) + '%',
        background: color, borderRadius: 4, transition: 'width 0.4s ease',
      }} />
      {pct > 1 && (
        <div style={{
          position: 'absolute', left: '100%', top: -1, bottom: -1,
          width: Math.min(20, (pct - 1) * 100) + '%',
          background: COL_OVER, borderRadius: '0 4px 4px 0',
        }} />
      )}
    </div>
  );
}

function TypeBadge({ client }) {
  const isFixed = client.billing === 'fixed';
  const nonBillable = !client.billable || client.rate === 0;
  const text = isFixed
    ? `Fisso${client.limitType === 'weekly' ? ' · sett' : client.limitType === 'global' ? ' · tot' : ''}`
    : nonBillable ? 'non fatt.' : 'A ore';
  const color = nonBillable ? 'var(--tb-text-muted)' : isFixed ? '#9B59B6' : COL_OK;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 3,
      background: color + '18', color,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>{text}</span>
  );
}

function AreaStatusDot({ client, done, planned, limit }) {
  let color = 'var(--tb-text-faint)';
  let title = '';
  if (limit) {
    const r = done / limit;
    if (r > 1.05)     { color = COL_OVER;  title = 'Oltre limite'; }
    else if (r > 0.95){ color = COL_OK;    title = 'Vicino al limite'; }
    else if (r > 0.3) { color = COL_UNDER; title = 'In corso'; }
    else              { color = 'var(--tb-text-faint)'; title = 'Basso utilizzo'; }
  } else if (planned > 0) {
    const r = done / planned;
    if (r > 1.2)     { color = COL_OVER;  title = 'Sopra piano'; }
    else if (r >= 0.85){ color = COL_OK;  title = 'In linea'; }
    else if (r > 0)  { color = COL_UNDER; title = 'Sotto piano'; }
  }
  return <div title={title} style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />;
}

function Legend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--tb-text-faint)', opacity: 0.4, display: 'inline-block' }} />
        Pianificato
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--tb-text-secondary)', display: 'inline-block' }} />
        Svolto
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 14, height: 0, borderTop: '2px dashed #3DB33D', display: 'inline-block' }} />
        Capacità
      </span>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.01em', margin: 0 }}>{title}</h3>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{subtitle}</span>
    </div>
  );
}

function ProjectionIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1 9L4 6L6 7.5L10 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 2H10V4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusGlyph({ color, kind }) {
  if (kind === 'In linea') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 9.5L7.5 13L14 5.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (kind === 'Sovraccarico') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 4V10M9 13V14" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M5 8L9 12L13 8" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendChart({ data, capacity, mode }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.planned, d.done)), 1) * 1.1;
  const capLine = capacity;
  const capPct  = capLine / maxVal;
  const height  = 200;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 24, width: 30,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        fontSize: 9, color: 'var(--tb-text-muted)', fontWeight: 700, textAlign: 'right', paddingRight: 6,
      }}>
        <span>{Math.round(maxVal)}h</span>
        <span>{Math.round(maxVal / 2)}h</span>
        <span>0</span>
      </div>
      <div style={{ marginLeft: 36, position: 'relative', height, borderBottom: '1px solid var(--tb-border-soft)' }}>
        {[0.25, 0.5, 0.75].map(p => (
          <div key={p} style={{
            position: 'absolute', left: 0, right: 0, bottom: p * height,
            borderTop: '1px dashed var(--tb-border-faint)',
          }} />
        ))}
        {capPct > 0 && capPct < 1 && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: capPct * height,
            borderTop: '2px dashed #3DB33D88', zIndex: 2,
          }}>
            <span style={{
              position: 'absolute', right: -2, top: -16, fontSize: 9, fontWeight: 800,
              color: '#3DB33D', background: 'var(--tb-panel-bg)', padding: '1px 4px', borderRadius: 3,
            }}>Capacità {Math.round(capLine)}h</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%', position: 'relative' }}>
          {data.map((t, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              flex: 1, height: '100%', justifyContent: 'flex-end',
            }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }}>
                <div style={{
                  width: 16, borderRadius: '3px 3px 0 0',
                  background: 'var(--tb-text-faint)', opacity: 0.45,
                  height: Math.max(1, (t.planned / maxVal) * height),
                  transition: 'height 0.4s ease',
                }} title={`Pianificato: ${fmtH(t.planned)}`} />
                <div style={{
                  width: 16, borderRadius: '3px 3px 0 0',
                  background: t.current ? '#3DB33D' : 'var(--tb-text-secondary)',
                  height: Math.max(1, (t.done / maxVal) * height),
                  transition: 'height 0.4s ease',
                  position: 'relative',
                }} title={`Svolto: ${fmtH(t.done)}`}>
                  {t.current && t.done > 0 && (
                    <div style={{
                      position: 'absolute', left: 0, right: 0, top: -16, textAlign: 'center',
                      fontSize: 9, fontWeight: 800, color: '#3DB33D',
                    }}>{fmtH(t.done)}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginLeft: 36, marginTop: 6, display: 'flex', justifyContent: 'space-around' }}>
        {data.map((t, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', fontSize: 10, fontWeight: t.current ? 800 : 600,
            color: t.current ? '#3DB33D' : 'var(--tb-text-muted)',
          }}>{t.label}</div>
        ))}
      </div>
    </div>
  );
}
