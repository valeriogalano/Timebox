import React, { useState, useEffect, useMemo } from 'react';
import { getToday, MONTHS_IT, getMondayOfWeek, addDays, fmt, fmtH, effBillable, SLOTS } from '../utils';
import { areaMix } from '../area-colors';
import { areaPlanFitInsights, capRunway, statusFor, PERSIST_WINDOW, MIN_HISTORY, RUNWAY_WINDOW } from '../panoramica-insights';
import OverCapacityBar from '../components/OverCapacityBar';
import Glyph from '../components/Glyph';

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
export default function Panoramica({ clients, projects, recurring, screen, initialLens, onLensConsumed, weekOffset, setWeekOffset }) {
  // Settimana condivisa con la vista Settimana (stato sollevato in App), così la
  // selezione si mantiene passando da una schermata all'altra.
  const periodOffset = weekOffset;
  const setPeriodOffset = setWeekOffset;
  const [entries, setEntries]           = useState([]);
  const [projectTotals, setProjectTotals] = useState({});
  const [overridesByWeek, setOverridesByWeek] = useState({});
  const [trendLens, setTrendLens] = useState(initialLens || 'settimana'); // settimana | trend | prospettiva

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

    // Settimana in corso: il consuntivo è "fino al giorno corrente" (esclude
    // eventuali entry datate in avanti). La proiezione fine settimana (vedi sotto)
    // parte da questo consuntivo.
    const isCurrentWeek = periodOffset === 0;
    const todayStr = fmt(getToday());
    const consuntivoEntries = isCurrentWeek
      ? periodEntries.filter(e => e.date <= todayStr)
      : periodEntries;

    const actualByClient = {};
    const billableByClient = {};
    clients.forEach(c => { actualByClient[c.id] = 0; billableByClient[c.id] = 0; });
    consuntivoEntries.forEach(e => {
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
    consuntivoEntries.forEach(e => {
      if (e.projectId in actualByProject) actualByProject[e.projectId] += e.hours;
    });

    // Proiezione fine settimana, solo sulla settimana in corso non ancora conclusa.
    // - a piano: consuntivo + ore pianificate (override o template) dei giorni da
    //   domani a domenica. Risponde a "se completo il piano, dove arrivo?".
    // - a ritmo: consuntivo / giorni trascorsi × 7. Risponde a "se continuo così,
    //   dove arrivo?" indipendentemente dal piano.
    let projTemplateHours = null, projRhythmHours = null, daysElapsed = null, projByClient = null;
    if (isCurrentWeek) {
      const monday = addDays(getMondayOfWeek(getToday()), periodOffset * 7);
      const de = Math.floor((getToday() - monday) / 86400000) + 1; // lun=1 … dom=7
      daysElapsed = de;
      if (de < PLANNING_DAYS) {
        const todayIdx = de - 1;
        const remainingByClient = {};
        clients.forEach(c => { remainingByClient[c.id] = 0; });
        const weekOverride = overridesByWeek[currentWeekKey];
        for (let d = todayIdx + 1; d < PLANNING_DAYS; d++) {
          for (const slot of SLOTS) {
            const dayOverride = weekOverride && weekOverride[d];
            const blocks = dayOverride && dayOverride[slot] !== undefined
              ? dayOverride[slot]
              : recurring.filter(r => r.day === d && r.slot === slot).map(r => ({ clientId: r.clientId, hours: r.hours }));
            blocks.forEach(b => { if (b.clientId in remainingByClient) remainingByClient[b.clientId] += b.hours; });
          }
        }
        const remainingPlanned = Object.values(remainingByClient).reduce((s, v) => s + v, 0);
        projTemplateHours = totalDone + remainingPlanned;
        projRhythmHours  = de > 0 ? totalDone / de * PLANNING_DAYS : 0;
        // Per area, stessa definizione "a piano": consuntivo (fino a oggi) + piano dei giorni restanti.
        projByClient = {};
        clients.forEach(c => { projByClient[c.id] = (actualByClient[c.id] ?? 0) + remainingByClient[c.id]; });
      }
    }

    return {
      actualByClient, plannedByClient, actualByProject, numWeeks: 1,
      capacity, totalDone, billedDoneEur, projectionEur, billableDoneHours,
      projTemplateHours, projRhythmHours, daysElapsed, projByClient,
    };
  }, [entries, periodOffset, clients, projects, projectClientMap, plannedByClientEffective, recurring, overridesByWeek, currentWeekKey]);

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
        return { week: startStr, done, planned: weekPlanned, isCurrent: startStr === currentWeekKey };
      });
      return { client: c, planned, weeks };
    });
  }, [clients, recurring, entries, overridesByWeek, periodOffset, projectClientMap, currentWeekKey, plannedByClientEffective]);

  // Ritmo MISURATO: media delle ore tracciate sulle ultime RUNWAY_WINDOW settimane
  // CHIUSE (la corrente è in corso e leggerebbe sempre basso). Una settimana vuota conta
  // come zero solo se il soggetto era già attivo prima della finestra: per un progetto
  // appena nato le settimane precedenti alla prima entry sono "non ancora nato", non
  // "fermo", e includerle dimezzerebbe il ritmo.
  function measuredRhythm(matches) {
    const weeks = Array.from({ length: RUNWAY_WINDOW }, (_, i) => {
      const monday   = addDays(getMondayOfWeek(getToday()), (i - RUNWAY_WINDOW + periodOffset) * 7);
      const startStr = fmt(monday);
      const endStr   = fmt(addDays(monday, 6));
      const done = entries
        .filter(e => e.date >= startStr && e.date <= endStr && matches(e))
        .reduce((s, e) => s + e.hours, 0);
      return { startStr, done };
    });
    const hadHistoryBefore = entries.some(e => e.date < weeks[0].startStr && matches(e));
    const firstActive = weeks.findIndex(w => w.done > 0);
    const counted = hadHistoryBefore ? weeks : (firstActive === -1 ? [] : weeks.slice(firstActive));
    const hours = counted.reduce((s, w) => s + w.done, 0);
    return { rhythm: counted.length ? hours / counted.length : 0, weeksCounted: counted.length };
  }

  // Righe della lente "In prospettiva": SOLO tetti cumulativi (limite globale d'area,
  // budget totale di progetto). I tetti settimanali non compaiono — si azzerano ogni
  // settimana, quindi non li si raggiunge mai: il loro numero utile è il margine della
  // settimana corrente, che si legge in Settimana.
  const capRows = useMemo(() => {
    const rows = [];
    clients.forEach(c => {
      if (c.limitType !== 'global' || !(c.limitHours > 0)) return;
      const ids = new Set(projects.filter(p => p.clientId === c.id).map(p => p.id));
      const consumed = [...ids].reduce((s, id) => s + (projectTotals[id] ?? 0), 0);
      const { rhythm, weeksCounted } = measuredRhythm(e => ids.has(e.projectId));
      rows.push({
        key: `area-${c.id}`, kind: 'Area', name: c.name, color: c.color,
        template: clientWeeklyCapacity(c.id, recurring),
        rate: isBillableClient(c) ? c.rate : 0, weeksCounted,
        ...capRunway({ cap: c.limitHours, consumed, rhythm }),
      });
    });
    projects.forEach(p => {
      if (!(p.budgetHours > 0) || p.archived) return;   // budget di un progetto chiuso = storia
      const area = clients.find(c => c.id === p.clientId);
      const { rhythm, weeksCounted } = measuredRhythm(e => e.projectId === p.id);
      rows.push({
        key: `proj-${p.id}`, kind: 'Progetto', name: p.name, subtitle: area?.name,
        color: area?.color ?? 'var(--tb-text-muted)',
        template: null,   // `recurring` mappa le aree, non i progetti: nessun ritmo template
        rate: area && isBillableClient(area) ? area.rate : 0, weeksCounted,
        // Se l'area ha già un tetto cumulativo, questo budget è ANNIDATO dentro quello:
        // la riga si mostra comunque, ma nei totali va contata una volta sola o le ore
        // (e il valore) risulterebbero raddoppiate.
        insideCappedArea: !!(area && area.limitType === 'global' && area.limitHours > 0),
        ...capRunway({ cap: p.budgetHours, consumed: projectTotals[p.id] ?? 0, rhythm }),
      });
    });
    // Il più vicino al tetto in cima: è la riga su cui si decide.
    const order = { esaurito: 0, entro2: 1, entro4: 2, entro8: 3, oltre8: 4, nessuno: 5 };
    return rows.sort((a, b) => (order[a.band] - order[b.band]) || (b.ratio - a.ratio));
  }, [clients, projects, recurring, projectTotals, entries, periodOffset]);

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
            { key: 'settimana', label: 'Settimana', help: 'Consuntivo della settimana: carico vs capacità e stato, fatturabile a consumo, per area (pianificato/tracciato/extra/Δ) e budget progetti. Sulla settimana in corso il carico è fino a oggi con proiezione fine settimana (a piano e a ritmo); sulle settimane chiuse è il consuntivo completo e serve la chiusura settimanale.' },
            { key: 'trend', label: 'Trend', help: 'Le ultime 8 settimane: aggregato pianificato/svolto/capacità, mini-trend per area e le divergenze persistenti da decidere. Serve a scoprire la deriva del ritmo.' },
            { key: 'prospettiva', label: 'In prospettiva', help: `Quanto manca a esaurire i tetti cumulativi: budget totale dei progetti e limite globale delle aree, proiettati sul ritmo misurato nelle ultime ${RUNWAY_WINDOW} settimane chiuse. I tetti settimanali non stanno qui: si azzerano ogni settimana, il loro margine si legge in Settimana.` },
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

          {/* Da decidere: divergenze area↔piano PERSISTENTI (non la settimana singola) */}
          <DaDecidereInsights perAreaWeekly={perAreaWeekly} />
        </>
      )}

      {/* ── Lente "In prospettiva" ── runway sui tetti cumulativi ── */}
      {trendLens === 'prospettiva' && <ProspettivaLens rows={capRows} />}
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
        <CardLabel help={'Ore svolte (tracciate) sulla capacità della settimana.\n\n% = svolto ÷ capacità. Δ = svolto − capacità. Stato: sotto-carico sotto 0,85×, in linea fino a 1,1×, sovraccarico oltre.\n\nSulla settimana in corso il valore è il consuntivo fino a oggi; sotto, la proiezione fine settimana: "a piano" = consuntivo + piano dei giorni restanti; "a ritmo" = consuntivo / giorni trascorsi × 7.'}>Carico della settimana</CardLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmtH(stats.totalDone)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tb-text-muted)' }}>/ {fmtH(stats.capacity)}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={status.label}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{pct}%</span>
            <Glyph glyph={status.glyph} size={16} className="tb-glyph" title={status.label} />
          </span>
        </div>
        <CapacityBar done={stats.totalDone} capacity={stats.capacity} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600 }}>
          <span>{status.label} · capacità {fmtH(stats.capacity)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Glyph glyph={deltaH >= 0 ? '▴' : '▾'} size={11} className="tb-glyph" />
            Δ {deltaH >= 0 ? '+' : ''}{fmtH(deltaH)}
          </span>
        </div>
        {stats.projTemplateHours != null && stats.daysElapsed > 0 && stats.daysElapsed < PLANNING_DAYS && (
          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--tb-border-soft)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <ProjectionIcon />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-secondary)', letterSpacing: '0.03em' }}>
                Proiezione fine settimana
                <span style={{ color: 'var(--tb-text-muted)', fontWeight: 600, marginLeft: 6 }}>· {PLANNING_DAYS - stats.daysElapsed}g al termine</span>
              </span>
            </div>
            <ProjRow label="a piano" value={stats.projTemplateHours} capacity={stats.capacity}
              hint="consuntivo + ore pianificate (override o template) dei giorni da domani a domenica" />
            <ProjRow label="a ritmo" value={stats.projRhythmHours} capacity={stats.capacity}
              hint="consuntivo / giorni trascorsi × 7: estrapolazione del ritmo attuale" />
          </div>
        )}
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
  const proj = stats.projByClient; // presente solo sulla settimana in corso non conclusa
  const COLS = proj
    ? '40px minmax(0,1fr) 64px 64px 64px 64px 64px'
    : '40px minmax(0,1fr) 64px 64px 64px 64px';
  const numCell = { fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)', textAlign: 'right' };
  const headCell = { fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' };
  const topCell = { borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6 };
  return (
    <div>
      <SectionHeader title="Per area · consuntivo" subtitle="pianificato · tracciato · extra"
        help={'Per ogni area, nella settimana selezionata: Piano = ore pianificate, Fatto = ore tracciate, Extra = ore fatte oltre il piano (max(0, fatto − piano)), Δ = fatto − piano. La colonna Stato è il verdetto: sotto mezz\'ora (o 10% del piano) di scarto si resta "in linea"; oltre, un glifo ▴/▾, e due glifi quando lo scarto supera 2h (o il 30% del piano).\n\nSulla settimana in corso compare anche Previsto = consuntivo fino a oggi + ore pianificate dei giorni restanti (proiezione "a piano").'} />
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '2px 12px', alignItems: 'center' }}>
        <span />
        <span />
        <span style={headCell}>Piano</span>
        <span style={headCell}>Fatto</span>
        {proj && <span style={headCell}>Previsto</span>}
        <span style={headCell}>Extra</span>
        <span style={headCell}>Δ</span>
        {rows.map(({ c, planned, done, extra, delta }) => {
          const v = statusFor(done, planned);
          return (
            <React.Fragment key={c.id}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...topCell }}>
                <Glyph glyph={v.glyph} size={13} className="tb-glyph" title={v.label} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, ...topCell }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </span>
              <span style={{ ...numCell, ...topCell, color: 'var(--tb-text-muted)' }}>{fmtH(planned)}</span>
              <span style={{ ...numCell, ...topCell }}>{fmtH(done)}</span>
              {proj && <span style={{ ...numCell, ...topCell, color: 'var(--tb-text-secondary)' }}>{fmtH(proj[c.id] ?? done)}</span>}
              <span style={{ ...numCell, ...topCell, color: extra > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>{extra > 0 ? fmtH(extra) : '—'}</span>
              <span style={{ ...numCell, borderTop: '1px solid var(--tb-border-soft)', paddingTop: 6, color: 'var(--tb-text-muted)' }}>{delta >= 0 ? '+' : ''}{fmtH(delta)}</span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Lente "Trend" → "Da decidere": la domanda è "la ricorrenza di quest'area è tarata
// male?". Media dello svolto contro media del pianificato sulle settimane chiuse — una
// sopra e una sotto si compensano, perché la ricorrenza è una media per costruzione.
// Logica pura in ../panoramica-insights. `to` è la vista dove si agisce, resa come
// suggerimento testuale: non è un link, la navigazione resta al tab bar.
// Tooltip di verifica: svolto contro pianificato settimana per settimana, così un -9h di
// media si riconosce a colpo d'occhio come otto settimane fiacche o una sola saltata.
// Il ▾/▴ marca le settimane che il verdetto conta come fuori piano.
function weeklyBreakdownTitle({ weeks, kind }) {
  const rows = weeks.map(w => {
    const off = statusFor(w.done, w.planned).kind === kind;
    return `${w.week.slice(8, 10)}/${w.week.slice(5, 7)}  ${fmtH(w.done)} / ${fmtH(w.planned)}${off ? (kind === 'under' ? '  ▾' : '  ▴') : ''}`;
  });
  return `Settimana per settimana (svolto / pianificato)\n${rows.join('\n')}`;
}

function DaDecidereInsights({ perAreaWeekly }) {
  const items = areaPlanFitInsights(perAreaWeekly);
  if (!items.length) return null;
  return (
    <div>
      <SectionHeader title="Da decidere" subtitle={`media su ${PERSIST_WINDOW} settimane chiuse`}
        help={`Un'area compare se la MEDIA dello svolto diverge dalla media del pianificato (sotto 0,85× o oltre 1,1×) sulle ultime ${PERSIST_WINDOW} settimane chiuse con un piano — la settimana in corso è esclusa. Le settimane sopra e sotto si compensano: la domanda è se la ricorrenza è tarata male, non se una singola settimana è andata storta. Servono almeno ${MIN_HISTORY} settimane di storia. Le aree con lo scarto proporzionale più grande stanno in cima.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
            borderLeft: `3px solid ${it.color}`, borderRadius: 8, padding: '12px 14px',
          }}>
            {/* Stessa griglia di AreaSparkCard: nome a sinistra, verdetto a destra. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.area}
              </span>
              {/* Il bordo è il colore dell'area, non lo stato: under/over lo porta il glifo. */}
              <Glyph glyph={it.kind === 'under' ? '▾' : '▴'} size={12} className="tb-glyph"
                title={it.kind === 'under' ? 'Sotto il piano' : 'Oltre il piano'} />
            </div>

            {/* Niente split valore/stato come in AreaSparkCard: lì i due angoli incorniciano il
                grafico, qui non c'è. Una frase sola. Le due medie a confronto, non lo scarto:
                avgDone è già il numero da scrivere nella ricorrenza. `of` = settimane chiuse
                con piano realmente in archivio, non sempre PERSIST_WINDOW. */}
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
              {/* nowrap: il numero non deve restare orfano a capo dalla sua unità */}
              <span style={{ color: it.color, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtH(it.avgDone)}/sett</span>
              {' '}contro <span style={{ fontWeight: 800, color: 'var(--tb-text-primary)', whiteSpace: 'nowrap' }}>{fmtH(it.avgPlanned)} pianificate</span>
              {' '}su {it.of} sett
            </div>

            {/* Distribuzione: la media non distingue un ritmo da un episodio, e le due cose
                portano a decisioni opposte. Il dettaglio settimana per settimana sta nel
                tooltip (stesso `title` nativo di HelpDot) invece che in un blocco espandibile:
                è una lettura di verifica, non un secondo livello di navigazione. */}
            <div title={weeklyBreakdownTitle(it)} style={{ fontSize: 10, fontWeight: 600, color: 'var(--tb-text-muted)', marginTop: 3, cursor: 'help', borderBottom: '1px dotted var(--tb-border-mid)', display: 'inline-block' }}>
              {it.weeksOff === 1 ? '1 settimana' : `${it.weeksOff} settimane`} {it.kind === 'under' ? 'sotto' : 'sopra'}
              {' · picco '}<span style={{ whiteSpace: 'nowrap' }}>{fmtH(it.peakDelta)}</span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginTop: 6 }}>
              {it.kind === 'under' ? `Rivedi il ritmo in ${it.to}` : `Ribilancia in ${it.to}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Lente "In prospettiva": quanto manca a esaurire i tetti CUMULATIVI. Non proietta più
// il ritmo template su un orizzonte: quel calcolo era invariante (ritmo x N contro
// limite x N dà sempre lo stesso rapporto, qualunque N) e il template sovrastima il
// ritmo reale. Qui il ritmo è misurato sulle settimane chiuse, e l'esito è una FASCIA
// (entro 2/4/8 settimane), non un numero: il ritmo misurato non è preciso al punto di
// distinguere 3 settimane da 4. Logica pura in ../panoramica-insights.
function ProspettivaLens({ rows }) {
  // I totali sommano solo i tetti NON annidati: il budget di un progetto la cui area ha
  // già un limite globale è compreso in quel limite, e contarli entrambi raddoppierebbe
  // ore e valore. Le righe restano tutte, il doppio conteggio riguarda solo la somma.
  const topLevel = rows.filter(r => !r.insideCappedArea);
  const totalRemaining = topLevel.reduce((s, r) => s + Math.max(0, r.remaining), 0);
  const totalRemainingEur = topLevel.reduce((s, r) => s + Math.max(0, r.remaining) * r.rate, 0);
  const nested = rows.length - topLevel.length;
  const urgent = rows.filter(r => r.band === 'esaurito' || r.band === 'entro2' || r.band === 'entro4').length;

  if (rows.length === 0) {
    return (
      <Card>
        <CardLabel>Nessun tetto cumulativo</CardLabel>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--tb-text-muted)', lineHeight: 1.5 }}>
          Questa lente legge i budget totali dei progetti e i limiti globali delle aree.
          Non ce n'è nessuno impostato: aggiungi un budget a un progetto (schermata Progetti)
          o un limite globale a un'area (schermata Aree) e comparirà qui.
        </div>
      </Card>
    );
  }

  return (
    <>
      <SectionHeader inline title="Tetti cumulativi" subtitle={`ritmo misurato · ultime ${RUNWAY_WINDOW} settimane chiuse`}
        help={`Per ogni tetto cumulativo: consumato dall'inizio, ore residue e fra quante settimane lo esaurisci al ritmo misurato sulle ultime ${RUNWAY_WINDOW} settimane chiuse (la corrente è in corso e leggerebbe sempre basso).\n\nL'esito è una fascia — entro 2, 4, 8 settimane, oltre — non un numero esatto: il ritmo misurato ha un'incertezza più larga della distanza fra 3 e 4 settimane.\n\nI tetti settimanali non compaiono qui: si azzerano ogni settimana, quindi non li si raggiunge mai. Il loro margine si legge in Settimana.`} />

      <div style={{ display: 'grid', gridTemplateColumns: totalRemainingEur > 0 ? '1fr 1fr' : '1fr', gap: 14 }}>
        <Card>
          <CardLabel help={'Somma delle ore che restano prima di esaurire i tetti cumulativi (tetto − consumato). I tetti già sfondati contano zero, non un residuo negativo.\n\nLa somma conta solo i tetti non annidati: il budget di un progetto la cui area ha già un limite globale è compreso in quel limite, quindi contribuisce una volta sola. Le righe sotto li mostrano comunque tutti.'}>Ore residue sui tetti</CardLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtH(totalRemaining)}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
              · {topLevel.length} {topLevel.length === 1 ? 'tetto' : 'tetti'}{nested > 0 ? ` · ${nested} annidati` : ''}
            </span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--tb-text-muted)', fontWeight: 600 }}>
            {urgent > 0 ? `${urgent} da decidere entro 4 settimane` : 'nessuno entro 4 settimane'}
          </div>
        </Card>
        {totalRemainingEur > 0 && (
          <Card>
            <CardLabel help={'Ore residue × tariffa oraria dell\'area: quanto puoi ancora fatturare dentro i tetti. Solo aree fatturabili a ore.\n\nCome le ore, conta solo i tetti non annidati, per non fatturare due volte lo stesso residuo.'}>Valore residuo fatturabile</CardLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtEur(totalRemainingEur)}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-muted)' }}>· entro i tetti</span>
            </div>
          </Card>
        )}
      </div>

      <SectionHeader title="Per tetto · consumo e residuo" subtitle="il più vicino al tetto in cima"
        help={`Una riga per tetto cumulativo, aree e progetti insieme, ordinate per urgenza: prima le fasce più vicine all'esaurimento, e a pari fascia il tetto con la percentuale di consumo più alta.\n\nOgni riga: ore consumate dall'inizio sul tetto, ore residue, ritmo misurato al netto della settimana in corso e — sulle aree, dove esiste — il ritmo del template accanto, per vedere se stai lavorando come avevi pianificato. La barra è normalizzata sul tetto: il bordo destro è il tetto, oltre si tratteggia.\n\nQuando la finestra di misura è incompleta la riga lo dichiara ("ritmo su N settimane"): succede se il tetto è nato di recente o se il lavoro è iniziato dentro le ultime ${RUNWAY_WINDOW} settimane.\n\nI verdetti: entro 2/4/8 settimane o oltre 8 sono la fascia di esaurimento; "Tetto esaurito" è già oltre il tetto; "Fermo" significa nessuna ora nella finestra, quindi nessun esaurimento prevedibile — non un esaurimento lontano.\n\nUn budget di progetto la cui area ha già un limite globale compare qui ma non nei totali in testa, dove sarebbe contato due volte.`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <Card key={r.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{r.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {r.kind}{r.subtitle ? ` · ${r.subtitle}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <Glyph glyph={r.glyph} size={15} className="tb-glyph" title={r.label} />
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--tb-text-muted)', flexWrap: 'wrap' }}>
              <span>consumato <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(r.consumed)}</strong> su {fmtH(r.cap)}</span>
              <span>· {r.remaining > 0 ? 'restano' : 'oltre di'} <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(Math.abs(r.remaining))}</strong></span>
              <span>· ritmo <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(r.rhythm)}</strong>/sett</span>
              {r.template > 0 && <span>· template {fmtH(r.template)}/sett</span>}
            </div>

            {/* Barra sul consumo: il bordo destro è il tetto, oltre si tratteggia. */}
            <OverCapacityBar value={r.consumed} cap={r.cap} color={r.color} style={{ marginTop: 8 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
              <span>{r.label}</span>
              <span>
                {r.weeksCounted < RUNWAY_WINDOW && (
                  <span style={{ marginRight: 8 }}>ritmo su {r.weeksCounted} {r.weeksCounted === 1 ? 'settimana' : 'settimane'}</span>
                )}
                {r.rate > 0 && r.remaining > 0 && (
                  <>residuo <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtEur(r.remaining * r.rate)}</strong></>
                )}
              </span>
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
        <Glyph glyph={verdict.glyph} size={12} className="tb-glyph" title={verdict.label} />
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

function CapacityBar({ done, capacity }) {
  return <OverCapacityBar value={done} cap={capacity} height={10} style={{ marginTop: 14 }} />;
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

// Riga di proiezione fine settimana (carico): valore orario + Δ vs capacità.
// Usata solo sulla settimana in corso non ancora conclusa.
function ProjRow({ label, value, capacity, hint }) {
  const delta = value - capacity;
  return (
    <div title={hint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', letterSpacing: '0.02em' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)', lineHeight: 1 }}>{fmtH(value)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Glyph glyph={delta >= 0 ? '▴' : '▾'} size={10} className="tb-glyph" />
          {delta >= 0 ? '+' : ''}{fmtH(delta)}
        </span>
      </span>
    </div>
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
