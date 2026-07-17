import React, { useState, useEffect, useMemo } from 'react';
import { getToday, MONTHS_IT, getMondayOfWeek, addDays, fmt, fmtH, effBillable, SLOTS } from '../utils';
import { areaMix } from '../area-colors';
import { persistentAreaInsights, areaProjection, PERSIST_WINDOW, PERSIST_MIN } from '../panoramica-insights';

// Redesign: nessun colore di stato. L'identità è solo l'area (client.color).
// over/under/in-line si leggono per posizione/glyph, non per verde/arancio/rosso.
const COL_OVER  = 'var(--tb-text-primary)';
const COL_UNDER = 'var(--tb-text-muted)';
const COL_OK    = 'var(--tb-text-primary)';

const TREND_WEEKS  = 8;
const TREND_MONTHS = 6;
const PLANNING_DAYS = 7;
const SMALL_MULT_WEEKS = TREND_WEEKS;

function fmtEur(n) {
  if (n == null) return '—';
  return '€' + Math.round(n).toLocaleString('it-IT');
}

function statusFor(done, capacity) {
  if (capacity === 0) return { label: '—', glyph: '·', color: 'var(--tb-text-muted)' };
  const ratio = done / capacity;
  if (ratio > 1.1)  return { label: 'Sovraccarico', glyph: '▸', color: 'var(--tb-text-primary)' };
  if (ratio < 0.85) return { label: 'Sottocarico',  glyph: '▾', color: 'var(--tb-text-muted)' };
  return { label: 'In linea', glyph: '▪', color: 'var(--tb-text-primary)' };
}

function clientWeeklyCapacity(clientId, recurring) {
  return recurring
    .filter(r => r.clientId === clientId)
    .reduce((s, r) => s + r.hours, 0);
}

function isBillableClient(client) {
  return client.billing === 'hourly' && client.rate > 0;
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
export default function Panoramica({ clients, projects, recurring, screen, initialLens, onLensConsumed }) {
  const [periodOffset, setPeriodOffset] = useState(0);
  const [entries, setEntries]           = useState([]);
  const [projectTotals, setProjectTotals] = useState({});
  const [overridesByWeek, setOverridesByWeek] = useState({});
  const [trendLens, setTrendLens] = useState(initialLens || 'settimana'); // settimana | trend | prospettiva
  const [horizon, setHorizon]     = useState(2);            // 1 | 2 | 4 settimane

  // Deep-link (es. dallo specchietto in Settimana → Andamento/Settimana): consuma
  // l'intento una volta, così le aperture successive tornano al default.
  useEffect(() => { if (initialLens) onLensConsumed?.(); }, []);

  const currentWeekKey = fmt(addDays(getMondayOfWeek(getToday()), periodOffset * 7));

  // Fetch range covers current week + trend history
  const fetchRange = useMemo(() => {
    const monday = addDays(getMondayOfWeek(getToday()), periodOffset * 7);
    const trendStart = addDays(getMondayOfWeek(getToday()), -(TREND_WEEKS - 1) * 7 + periodOffset * 7);
    return { from: fmt(trendStart), to: fmt(addDays(monday, 6)) };
  }, [periodOffset]);

  useEffect(() => {
    if (screen !== 'panoramica') return;
    window.api.getEntries(fetchRange.from, fetchRange.to).then(setEntries);
    window.api.getProjectTotals().then(setProjectTotals);
    // week_overrides storicizza il pianificato effettivo delle settimane passate
    // (freezeWeeksBeforeRecurringChange lo scrive ad ogni modifica del template
    // ricorrente): usarlo al posto del template corrente rende "Nel tempo" accurato
    // anche quando la ricorrenza cambia nel frattempo.
    window.api.getWeekOverridesRange(fetchRange.from, fetchRange.to).then(rows => {
      const byWeek = {};
      rows.forEach(r => {
        const week = byWeek[r.weekKey] ?? (byWeek[r.weekKey] = {});
        const day = week[r.dayIndex] ?? (week[r.dayIndex] = {});
        day[r.slot] = r.blocks;
      });
      setOverridesByWeek(byWeek);
    });
  }, [screen, fetchRange.from, fetchRange.to]);

  // Build a lookup: projectId → clientId
  const projectClientMap = useMemo(() => {
    const m = {};
    projects.forEach(p => { m[p.id] = p.clientId; });
    return m;
  }, [projects]);

  // Effective planned hours per client for a given week: prefers the frozen
  // historical snapshot (week_overrides), falls back to the current recurring
  // template for weeks that never diverged from it.
  function plannedByClientForWeek(weekKey) {
    const result = {};
    clients.forEach(c => { result[c.id] = 0; });
    const weekOverride = overridesByWeek[weekKey];
    for (let dayIndex = 0; dayIndex < PLANNING_DAYS; dayIndex++) {
      for (const slot of SLOTS) {
        const dayOverride = weekOverride && weekOverride[dayIndex];
        const blocks = dayOverride && dayOverride[slot] !== undefined
          ? dayOverride[slot]
          : recurring.filter(r => r.day === dayIndex && r.slot === slot).map(r => ({ clientId: r.clientId, hours: r.hours }));
        blocks.forEach(b => {
          if (b.clientId in result) result[b.clientId] += b.hours;
        });
      }
    }
    return result;
  }

  const plannedByClientEffective = useMemo(
    () => plannedByClientForWeek(currentWeekKey),
    [overridesByWeek, recurring, clients, currentWeekKey],
  );

  // Compute stats for the current week
  const stats = useMemo(() => {
    const { startStr, endStr } = weekRange(periodOffset);
    const periodEntries = entries.filter(e => e.date >= startStr && e.date <= endStr);

    const actualByClient = {};
    const billableByClient = {};
    clients.forEach(c => { actualByClient[c.id] = 0; billableByClient[c.id] = 0; });
    periodEntries.forEach(e => {
      const cid = projectClientMap[e.projectId];
      if (cid != null) {
        actualByClient[cid] = (actualByClient[cid] ?? 0) + e.hours;
        const cli = clients.find(c => c.id === cid);
        if (cli && isBillableClient(cli)) {
          billableByClient[cid] = (billableByClient[cid] ?? 0) + effBillable(e);
        }
      }
    });

    const plannedByClient = plannedByClientEffective;

    const capacity  = Object.values(plannedByClient).reduce((s, v) => s + v, 0);
    const totalDone = Object.values(actualByClient).reduce((s, v) => s + v, 0);

    const billable = clients.filter(isBillableClient);
    const billedDoneEur     = billable.reduce((s, c) => s + (billableByClient[c.id] ?? 0) * c.rate, 0);
    const projectionEur     = billable.reduce((s, c) => s + Math.max(billableByClient[c.id] ?? 0, plannedByClient[c.id] ?? 0) * c.rate, 0);
    const billableDoneHours = billable.reduce((s, c) => s + (billableByClient[c.id] ?? 0), 0);

    const actualByProject = {};
    projects.forEach(p => { actualByProject[p.id] = 0; });
    periodEntries.forEach(e => {
      if (e.projectId in actualByProject) actualByProject[e.projectId] += e.hours;
    });

    return { actualByClient, plannedByClient, actualByProject, numWeeks: 1, capacity, totalDone, billedDoneEur, projectionEur, billableDoneHours };
  }, [entries, periodOffset, clients, projects, projectClientMap, plannedByClientEffective]);

  // Build trend data (weekly)
  const trendData = useMemo(() => {
    return Array.from({ length: TREND_WEEKS }, (_, i) => {
      const weekIdx  = i - (TREND_WEEKS - 1) + periodOffset;
      const monday   = addDays(getMondayOfWeek(getToday()), weekIdx * 7);
      const sunday   = addDays(monday, 6);
      const startStr = fmt(monday);
      const endStr   = fmt(sunday);
      const isCurrent = startStr === currentWeekKey;

      const wEntries = entries.filter(e => e.date >= startStr && e.date <= endStr);
      const planned = plannedByClientForWeek(startStr);
      const done = {};
      clients.forEach(c => { done[c.id] = 0; });
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
  }, [entries, periodOffset, clients, recurring, overridesByWeek, projectClientMap, currentWeekKey]);

  // Small-multiples per area (lente "Nel tempo", REDLINE §8: grid 3 colonne, SMALL_MULT_WEEKS settimane).
  // planned per settimana usa lo storicizzato (week_overrides) quando disponibile;
  // la linea tratteggiata nel card resta il ritmo della settimana corrente.
  const perAreaWeekly = useMemo(() => {
    return clients.map(c => {
      const planned = plannedByClientEffective[c.id] ?? 0;
      const weeks = Array.from({ length: SMALL_MULT_WEEKS }, (_, i) => {
        const weekIdx  = i - (SMALL_MULT_WEEKS - 1) + periodOffset;
        const monday   = addDays(getMondayOfWeek(getToday()), weekIdx * 7);
        const sunday   = addDays(monday, 6);
        const startStr = fmt(monday);
        const endStr   = fmt(sunday);
        const done = entries
          .filter(e => e.date >= startStr && e.date <= endStr && projectClientMap[e.projectId] === c.id)
          .reduce((s, e) => s + e.hours, 0);
        const weekPlanned = plannedByClientForWeek(startStr)[c.id] ?? 0;
        return { done, planned: weekPlanned, isCurrent: startStr === currentWeekKey };
      });
      return { client: c, planned, weeks };
    });
  }, [clients, recurring, entries, overridesByWeek, periodOffset, projectClientMap, currentWeekKey, plannedByClientEffective]);

  const status  = statusFor(stats.totalDone, stats.capacity);
  const deltaH  = stats.totalDone - stats.capacity;
  const label   = periodLabel('week', periodOffset);
  const isToday = periodOffset === 0;

  const budgetProjects = projects.filter(p => p.budgetHours > 0 || p.weeklyHours > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>

      {/* Period header + lens tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
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
        <div className="tb-seg">
          {[
            { key: 'settimana', label: 'Settimana', help: 'Consuntivo della settimana chiusa: carico vs capacità e stato, fatturabile a consumo, per area (pianificato/tracciato/extra/Δ) e budget progetti. Serve la chiusura settimanale.' },
            { key: 'trend', label: 'Trend', help: 'Le ultime 8 settimane: aggregato pianificato/svolto/capacità, mini-trend per area e le divergenze persistenti da decidere. Serve a scoprire la deriva del ritmo.' },
            { key: 'prospettiva', label: 'In prospettiva', help: 'Dove sto andando: proiezione a ritmo template su 2 o 4 settimane, confronto con limiti/envelope e valore atteso (o ore perse).' },
          ].map((o, idx) => (
            <span
              key={o.key}
              data-on={trendLens === o.key ? 'true' : 'false'}
              onClick={() => setTrendLens(o.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...(idx > 0 ? { borderLeft: '1px solid var(--tb-border-mid)' } : {}) }}
            >
              {o.label}
              <HelpDot text={o.help} />
            </span>
          ))}
        </div>
      </div>

      {/* ── Lente "Settimana" ── consuntivo della settimana chiusa ── */}
      {trendLens === 'settimana' && (
        <>
          <RetroSummary stats={stats} status={status} deltaH={deltaH} />
          <AreaConsuntivo clients={clients} stats={stats} />
          {budgetProjects.length > 0 && (
            <div>
              <SectionHeader title="Budget progetti" subtitle="da inizio progetto · indipendente dal periodo" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {budgetProjects.map(p => (
                  <ProjectCardCockpit
                    key={p.id}
                    project={p}
                    clients={clients}
                    cumulativeDone={projectTotals[p.id] ?? 0}
                    periodDone={stats.actualByProject[p.id] ?? 0}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Lente "Trend" ── 8 settimane: aggregato + per area + divergenze persistenti ── */}
      {trendLens === 'trend' && (
        <>
          {/* Da decidere: divergenze area↔piano PERSISTENTI (non la settimana singola) */}
          <DaDecidereInsights perAreaWeekly={perAreaWeekly} />

          <Card padding={0}>
            <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <CardLabel inline help={'Ogni coppia di barre è una settimana (ultime 8): totale pianificato e totale svolto su tutte le aree. La linea tratteggiata è la capacità della settimana corrente.'}>Aggregato settimanale</CardLabel>
                <Legend />
              </div>
            </div>
            <div style={{ padding: '4px 18px 18px' }}>
              <TrendChart data={trendData} capacity={stats.capacity} mode="week" />
            </div>
          </Card>

          {/* Per-area: small-multiples, posizione vs linea-piano = segnale */}
          <div>
            <SectionHeader title="Per area" subtitle={`${SMALL_MULT_WEEKS} settimane · piano = ritmo template`}
              help={`Mini-trend per area sulle ultime ${SMALL_MULT_WEEKS} settimane. Le barre sono le ore svolte (la più chiara è la settimana corrente); la linea tratteggiata è il piano = ritmo del template. Le settimane oltre-piano sono tratteggiate.`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {perAreaWeekly.map(({ client, planned, weeks }) => (
                <AreaSparkCard key={client.id} client={client} planned={planned} weeks={weeks} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Lente "In prospettiva" ── proiezione a ritmo template per area ── */}
      {trendLens === 'prospettiva' && (
        <ProspettivaLens
          clients={clients} projects={projects} recurring={recurring}
          horizon={horizon} setHorizon={setHorizon} capacity={stats.capacity}
          weekProjectHours={{}} projectTotals={projectTotals}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// Lente "Settimana" → consuntivo della settimana chiusa: carico vs capacità,
// fatturabile a consumo, stato. Serve la chiusura settimanale v4.
function RetroSummary({ stats, status, deltaH }) {
  const pct = stats.capacity > 0 ? Math.round(stats.totalDone / stats.capacity * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {/* Carico + Stato fusi, modellati sullo specchietto capacità della Settimana */}
      <Card>
        <CardLabel help={'Ore svolte (tracciate) sulla capacità della settimana.\n\n% = svolto ÷ capacità. Δ = svolto − capacità. Stato: sotto-carico sotto 0,85×, in linea fino a 1,1×, sovraccarico oltre.'}>Carico della settimana</CardLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmtH(stats.totalDone)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tb-text-muted)' }}>/ {fmtH(stats.capacity)}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={status.label}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{pct}%</span>
            <span className="tb-glyph" style={{ fontSize: 16 }}>{status.glyph}</span>
          </span>
        </div>
        <CapacityBar done={stats.totalDone} capacity={stats.capacity} color={status.color} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600 }}>
          <span>{status.label} · capacità {fmtH(stats.capacity)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="tb-glyph">{deltaH >= 0 ? '▸' : '▾'}</span>
            Δ {deltaH >= 0 ? '+' : ''}{fmtH(deltaH)}
          </span>
        </div>
      </Card>

      <Card>
        <CardLabel help={'Ricavo delle ore fatturabili già svolte = ore fatturabili × tariffa dell\'area.\n\nProiezione fine settimana = ricavo atteso completando il piano fatturabile. Le aree non fatturabili (fisse) sono escluse.'}>Fatturabile a consumo</CardLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
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
              Proiezione fine settimana
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
    </div>
  );
}

// Lente "Settimana" → consuntivo PER AREA della settimana: pianificato,
// tracciato, extra (ore oltre il piano) e Δ. È il passo v4 "confronta ore pianificate,
// tracciate ed extra per area / identifica aree in disavanzo o sovraccarico".
function AreaConsuntivo({ clients, stats }) {
  const rows = clients
    .map(c => {
      const planned = stats.plannedByClient[c.id] ?? 0;
      const done = stats.actualByClient[c.id] ?? 0;
      return { c, planned, done, extra: Math.max(0, done - planned), delta: done - planned };
    })
    .filter(r => r.planned > 0 || r.done > 0);
  if (!rows.length) return null;
  const COLS = 'minmax(0,1fr) 64px 64px 64px 84px';
  const numCell = { fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)', textAlign: 'right' };
  const headCell = { fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' };
  return (
    <div>
      <SectionHeader title="Per area · consuntivo" subtitle="pianificato · tracciato · extra"
        help={'Per ogni area, nella settimana selezionata: Piano = ore pianificate, Fatto = ore tracciate, Extra = ore fatte oltre il piano (max(0, fatto − piano)), Δ = fatto − piano. Il glyph è lo stato (sotto/in linea/sovraccarico).'} />
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '2px 12px', alignItems: 'center' }}>
        <span />
        <span style={headCell}>Piano</span>
        <span style={headCell}>Fatto</span>
        <span style={headCell}>Extra</span>
        <span style={headCell}>Δ</span>
        {rows.map(({ c, planned, done, extra, delta }) => {
          const v = statusFor(done, planned);
          return (
            <React.Fragment key={c.id}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </span>
              <span style={{ ...numCell, borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6, color: 'var(--tb-text-muted)' }}>{fmtH(planned)}</span>
              <span style={{ ...numCell, borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6 }}>{fmtH(done)}</span>
              <span style={{ ...numCell, borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6, color: extra > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>{extra > 0 ? fmtH(extra) : '—'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--tb-text-muted)', borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6 }}>
                <span className="tb-glyph" title={v.label}>{v.glyph}</span>
                {delta >= 0 ? '+' : ''}{fmtH(delta)}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Lente "Trend" → "Da decidere": divergenze area↔piano PERSISTENTI (fuori piano
// in >= PERSIST_MIN delle ultime PERSIST_WINDOW settimane chiuse), non lo scarto della
// singola settimana — quello è rumore e non giustifica di toccare il ritmo/template.
// Logica pura in ../panoramica-insights. Link indirizzano alla vista utile.
function DaDecidereInsights({ perAreaWeekly }) {
  const items = persistentAreaInsights(perAreaWeekly);
  if (!items.length) return null;
  return (
    <div>
      <SectionHeader title="Da decidere" subtitle={`persistente · ≥${PERSIST_MIN} sett fuori piano su ${PERSIST_WINDOW}`}
        help={`Un'area compare solo se è fuori piano (svolto sotto 0,85× o oltre 1,1× il piano) in almeno ${PERSIST_MIN} delle ultime ${PERSIST_WINDOW} settimane chiuse — la settimana in corso è esclusa. Il badge N/${PERSIST_WINDOW} è la gravità: più settimane fuori piano, più in alto l'area.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ position: 'relative', border: '1px solid var(--tb-border)', borderLeft: `3px solid ${it.color}`, borderRadius: 8, background: 'var(--tb-panel-bg)', padding: '10px 12px' }}>
            {/* Gravità = magnitudine: quanto ci si avvicina a PERSIST_WINDOW/PERSIST_WINDOW */}
            <span
              title={`Gravità ${it.weeksOff} su ${PERSIST_WINDOW} settimane fuori piano`}
              style={{ position: 'absolute', top: 8, right: 10, fontSize: 10, fontWeight: 800, color: it.color, letterSpacing: '0.02em' }}
            >{it.weeksOff}/{PERSIST_WINDOW}</span>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', paddingRight: 28 }}>{it.area}</div>
            <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginTop: 2 }}>
              {it.kind === 'under' ? 'sotto-piano' : 'oltre piano'} → {it.to}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Lente "In prospettiva": proiezione a ritmo del template, per area, su orizzonte
// configurabile (2/4 settimane, default 2). Il confronto ha senso solo contro un
// TETTO: senza tetto non c'è envelope da sforare (kind='uncapped', nessun verdetto
// over/under). Verdetto via glyph ▸/▪/·. Logica pura in ../panoramica-insights.
// Il ritmo è una stima (README §Dipendenze-dati p.2): a livello area si usa `recurring`.
function ProspettivaLens({ clients, recurring, horizon, setHorizon, capacity }) {
  const rows = clients.map(c => {
    const rhythm = clientWeeklyCapacity(c.id, recurring);     // h/sett a ritmo template
    const billable = isBillableClient(c);
    const p = areaProjection({
      rhythm, horizon,
      limitType: c.limitType, limitHours: c.limitHours,
      rate: c.rate ?? 0, billable,
    });
    const verdict = p.kind === 'uncapped' ? { glyph: '·', label: 'Senza tetto' }
      : p.kind === 'over' ? { glyph: '▸', label: billable ? 'Oltre tetto · ore non pagate' : 'Oltre tetto' }
      : { glyph: '▪', label: 'Entro tetto' };
    return { c, rhythm, billable, verdict, ...p };
  });
  // Aree con tetto in cima (sono quelle decisionali), le più vicine/oltre il tetto prima;
  // le aree senza tetto in fondo e smorzate.
  rows.sort((a, b) => (a.hasCap !== b.hasCap ? (a.hasCap ? -1 : 1) : b.ratio - a.ratio));
  const totalProjected = rows.reduce((s, r) => s + r.projected, 0);
  const totalValue = rows.reduce((s, r) => s + r.potentialEur, 0);
  const totalLost = rows.reduce((s, r) => s + r.lostEur, 0);
  const capWindow = capacity > 0 ? capacity * horizon : 0;
  const capPct = capWindow > 0 ? Math.round(totalProjected / capWindow * 100) : null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <SectionHeader inline title="Carico in prospettiva" subtitle={`${horizon} settimane a ritmo template`}
          help={'Proiezione = ritmo del template (ore ricorrenti/sett) × orizzonte, sommato su tutte le aree. Non tiene conto degli override né dello stato area della settimana: è "se il template gira così".\n\n% capacità = proiettato ÷ (capacità × orizzonte). Valore/perso = somma su tutte le aree fatturabili del ricavo proiettato e delle ore perse oltre il tetto.'} />
        <div className="tb-seg" style={{ marginLeft: 'auto' }}>
          {[2, 4].map((n, idx) => (
            <span key={n} data-on={horizon === n ? 'true' : 'false'} onClick={() => setHorizon(n)}
              style={idx > 0 ? { borderLeft: '1px solid var(--tb-border-mid)' } : undefined}>{n} sett</span>
          ))}
        </div>
      </div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{fmtH(totalProjected)}</span>
          <span style={{ fontSize: 13, color: 'var(--tb-text-muted)' }}>carico proiettato · {horizon} sett</span>
        </div>
        {capPct != null && (
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600, marginTop: 6 }}>
            ≈ {capPct}% della capacità ({fmtH(capWindow)} su {horizon} sett)
          </div>
        )}
        {totalValue > 0 && (
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600, marginTop: 4 }}>
            valore proiettato <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtEur(totalValue)}</strong>
            {totalLost > 0 && <span> · perso <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtEur(totalLost)}</strong></span>}
          </div>
        )}
      </Card>

      <SectionHeader title="Per area · limiti e valore" subtitle="ritmo vs tetto"
        help={'Per area: ritmo template/sett × orizzonte = proiettato, confrontato col tetto (limite settimanale × orizzonte, oppure limite globale fisso). Senza tetto non c\'è verdetto over/under. Valore = proiettato × tariffa; perso = ore oltre il tetto × tariffa (solo aree fatturabili).'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(({ c, rhythm, billable, projected, cap, hasCap, ratio, over, potentialEur, lostEur, verdict }) => (
          <Card key={c.id} style={hasCap ? undefined : { opacity: 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)', flex: 1 }}>{c.name}</span>
              <span className="tb-glyph" title={verdict.label} style={{ fontSize: 15 }}>{verdict.glyph}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--tb-text-muted)' }}>
              <span><strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(rhythm)}</strong>/sett · proiettato <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(projected)}</strong></span>
              {hasCap && <span>· tetto {fmtH(cap)}</span>}
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--tb-bar-track)', marginTop: 8, overflow: 'visible' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${hasCap ? Math.min(100, ratio * 100) : 100}%`, background: c.color, borderRadius: 4, opacity: hasCap ? 1 : 0.4 }} />
              {over && <span className="tb-hatch" style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', width: `${Math.min(30, (ratio - 1) * 100)}%`, borderRadius: '0 4px 4px 0' }} />}
              {hasCap && <span className="tb-tick" style={{ left: '100%' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
              <span>{verdict.label}</span>
              {billable && (
                <span>valore <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtEur(potentialEur)}</strong>
                  {lostEur > 0 && <span style={{ marginLeft: 8 }}>· perso <strong>{fmtEur(lostEur)}</strong></span>}
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

// Small-multiples: mini-trend per area (SMALL_MULT_WEEKS settimane). La linea-piano tratteggiata è il
// riferimento; sotto/sopra si legge dalla posizione delle barre rispetto ad essa, oltre-piano
// è tratteggiato (.tb-hatch) — nessun colore di stato, solo l'identità (client.color).
function AreaSparkCard({ client, planned, weeks }) {
  const CHART_H = 44;
  const maxVal = Math.max(planned, ...weeks.map(w => w.done), 1) * 1.15;
  const planLineY = CHART_H - (planned / maxVal) * CHART_H;
  const lastWeek = weeks[weeks.length - 1];
  const verdict = statusFor(lastWeek.done, lastWeek.planned ?? planned);

  return (
    <div style={{
      background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
      borderLeft: `3px solid ${client.color}`, borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.name}
        </span>
        <span className="tb-glyph" title={verdict.label} style={{ fontSize: 12 }}>{verdict.glyph}</span>
      </div>

      <div style={{ position: 'relative', height: CHART_H }}>
        {planned > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: planLineY, borderTop: '1.5px dashed var(--tb-tick)' }} />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%' }}>
          {weeks.map((w, i) => {
            const weekPlanned = w.planned ?? planned;
            const barH = Math.max(1, (w.done / maxVal) * CHART_H);
            const over = weekPlanned > 0 && w.done > weekPlanned;
            return (
              <div key={i} title={`${fmtH(w.done)} / ${fmtH(weekPlanned)}`} style={{
                flex: 1, height: barH, borderRadius: '2px 2px 0 0',
                background: w.isCurrent ? client.color : areaMix(client.color, 55),
              }}>
                {over && <div className="tb-hatch" style={{ height: '100%', borderRadius: '2px 2px 0 0' }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)' }}>
        <span>{fmtH(lastWeek.done)} <span style={{ color: 'var(--tb-text-faint)', fontWeight: 600 }}>/ {fmtH(planned)}</span></span>
        <span>{verdict.label}</span>
      </div>
    </div>
  );
}

function ProjectCardCockpit({ project, clients, cumulativeDone, periodDone }) {
  const client = clients.find(c => c.id === project.clientId);
  if (!client) return null;

  const hasBudget = project.budgetHours > 0;
  const hasWeekly = project.weeklyHours > 0;

  // Budget: always cumulative (all-time hours vs total budget)
  const budgetPct   = hasBudget ? cumulativeDone / project.budgetHours : null;
  const budgetColor = client.color;

  const weeklyLimit = hasWeekly ? project.weeklyHours : null;
  const weeklyPct   = weeklyLimit ? periodDone / weeklyLimit : null;
  const weeklyColor = client.color;

  const labelStyle = { fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 };

  return (
    <div style={{
      background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
      borderRadius: 8, padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)' }}>{project.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)' }}>· {client.name}</span>
      </div>

      {hasWeekly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={labelStyle}>Limite settimanale</span>
              <span style={{ fontSize: 9, color: 'var(--tb-text-faint)' }}>·</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', letterSpacing: '0.06em' }}>{Math.round(weeklyPct * 100)}%</span>
              {weeklyPct > 1 && <span style={{ fontSize: 10, color: COL_OVER }} title="Superato">⚠</span>}
            </div>
            <Bar value={periodDone} max={Math.max(weeklyLimit, periodDone)} color={weeklyColor} />
          </div>
          <div style={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)', lineHeight: 1 }}>
              {fmtH(periodDone)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.04em', marginTop: 2, textTransform: 'uppercase' }}>
              / {fmtH(weeklyLimit)}
            </div>
          </div>
        </div>
      )}

      {hasBudget && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={labelStyle}>Budget totale</span>
              <span style={{ fontSize: 9, color: 'var(--tb-text-faint)' }}>·</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', letterSpacing: '0.06em' }}>{Math.round(budgetPct * 100)}%</span>
              {budgetPct > 1 && <span style={{ fontSize: 10, color: COL_OVER }} title="Superato">⚠</span>}
            </div>
            <Bar value={cumulativeDone} max={Math.max(project.budgetHours, cumulativeDone)} color={budgetColor} />
          </div>
          <div style={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)', lineHeight: 1 }}>
              {fmtH(cumulativeDone)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.04em', marginTop: 2, textTransform: 'uppercase' }}>
              / {fmtH(project.budgetHours)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Card({ children, padding = 16, style }) {
  return (
    <div style={{
      background: 'var(--tb-panel-bg)',
      border: '1px solid var(--tb-panel-border)',
      borderRadius: 10,
      padding,
      ...style,
    }}>{children}</div>
  );
}

function CardLabel({ children, inline, help }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--tb-text-muted)', marginBottom: inline ? 0 : 8,
    }}>
      <span>{children}</span>
      {help && <HelpDot text={help} />}
    </div>
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
  const over = pct > 1;
  return (
    <div style={{
      position: 'relative', height: 10, borderRadius: 5,
      background: 'var(--tb-bar-track)', marginTop: 14, overflow: 'visible',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: Math.min(100, pct * 100) + '%',
        background: 'var(--tb-bar-tracked)', borderRadius: 5, transition: 'width 0.4s ease',
      }} />
      {over && <span className="tb-hatch" style={{ position: 'absolute', top: 0, bottom: 0, left: `${100}%`, width: `${Math.min(20, (pct - 1) * 100)}%`, borderRadius: '0 5px 5px 0' }} />}
      <div style={{
        position: 'absolute', left: '100%', top: -3, bottom: -3, width: 0,
        borderLeft: '2px dashed var(--tb-tick)',
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
        <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--tb-tick)', display: 'inline-block' }} />
        Capacità
      </span>
    </div>
  );
}

// inline: titolo e sottotitolo affiancati con gap (per le righe con selettore a destra),
// invece che agli estremi via space-between (che si attacca se il contenitore lo restringe).
// Pallino "?" con tooltip (title). stopPropagation così non attiva eventuali click del contenitore.
function HelpDot({ text }) {
  return (
    <span title={text} onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', border: '1px solid var(--tb-border-mid)', color: 'var(--tb-text-muted)', fontSize: 9, cursor: 'help', letterSpacing: 0, flexShrink: 0 }}
    >?</span>
  );
}

function SectionHeader({ title, subtitle, inline, help }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: inline ? 10 : undefined, justifyContent: inline ? 'flex-start' : 'space-between', marginBottom: inline ? 0 : 10 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.01em', margin: 0 }}>{title}</h3>
        {help && <HelpDot text={help} />}
      </span>
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
            borderTop: '2px dashed var(--tb-tick)', zIndex: 2,
          }}>
            <span style={{
              position: 'absolute', right: -2, top: -16, fontSize: 9, fontWeight: 800,
              color: 'var(--tb-text-secondary)', background: 'var(--tb-panel-bg)', padding: '1px 4px', borderRadius: 3,
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
                  background: t.current ? 'var(--tb-bar-tracked)' : 'var(--tb-text-secondary)',
                  height: Math.max(1, (t.done / maxVal) * height),
                  transition: 'height 0.4s ease',
                  position: 'relative',
                }} title={`Svolto: ${fmtH(t.done)}`}>
                  {t.current && t.done > 0 && (
                    <div style={{
                      position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: -16,
                      whiteSpace: 'nowrap', fontSize: 9, fontWeight: 800, color: 'var(--tb-text-primary)',
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
            color: t.current ? 'var(--tb-text-primary)' : 'var(--tb-text-muted)',
          }}>{t.label}</div>
        ))}
      </div>
    </div>
  );
}
