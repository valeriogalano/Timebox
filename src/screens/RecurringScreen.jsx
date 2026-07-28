import React, { useState, useEffect } from 'react';
import { DAY_SHORT, fmtH, SLOTS, getToday, getMondayOfWeek, fmt, addDays } from '../utils';
import MultiSlotCell from '../components/MultiSlotCell';
import { withAreaStatus } from './WeeklyView';

const RECURRING_DAYS = DAY_SHORT.length;
const SLOT_ROW_LABELS = { am: 'Mattina', pm: 'Pomeriggio', sera: 'Sera' };
const DIVERGENCE_HISTORY_WEEKS = 8;
const DIVERGENCE_MIN_OCCURRENCES = 3;

export default function RecurringScreen({ clients, recurring, setRecurring, slotCapacity }) {
  const [dragging, setDragging] = useState(null); // { blockId, fromDay, fromSlot, clientId, hours }
  const [dragOver, setDragOver] = useState(null); // { day, slot }

  // Override ripetuti: confronta lo storicizzato (week_overrides, congelato da
  // freezeWeeksBeforeRecurringChange o da un override manuale in Settimana/Oggi)
  // col template attuale per le ultime settimane passate.
  const [pastOverrides, setPastOverrides] = useState([]);
  const [dismissedDivergences, setDismissedDivergences] = useState(new Set()); // ponytail: solo di sessione, persisti se serve tenerlo tra riavvii
  useEffect(() => {
    const currentMonday = getMondayOfWeek(getToday());
    const fromWeekKey = fmt(addDays(currentMonday, -DIVERGENCE_HISTORY_WEEKS * 7));
    const toWeekKey = fmt(addDays(currentMonday, -7));
    window.api.getWeekOverridesRange(fromWeekKey, toWeekKey).then(setPastOverrides);
  }, []);

  const divergences = React.useMemo(() => {
    // Difensiva: una sola delta per (weekKey, day, slot, clientId). Il PRIMARY KEY
    // su week_overrides garantisce al più uno snapshot per combinazione, ma il
    // conteggio via forEach poteva gonfiarsi in presenza di duplicati per
    // weekKey (mai possibile per schema, ma isolato qui per evitare ribilanci
    // errati di occurrences > DIVERGENCE_HISTORY_WEEKS).
    const unique = new Map();
    pastOverrides.forEach(r => {
      const blocks = r.blocks || [];
      const templateBlocks = recurring.filter(rr => rr.day === r.dayIndex && rr.slot === r.slot);
      const clientIds = new Set([
        ...blocks.map(b => b.clientId),
        ...templateBlocks.map(b => b.clientId),
      ]);
      clientIds.forEach(clientId => {
        const actual = blocks.filter(b => b.clientId === clientId).reduce((s, b) => s + b.hours, 0);
        const template = templateBlocks.filter(b => b.clientId === clientId).reduce((s, b) => s + b.hours, 0);
        const delta = actual - template;
        if (Math.abs(delta) < 0.01) return;
        const id = `${r.weekKey}|${r.dayIndex}|${r.slot}|${clientId}`;
        unique.set(id, { day: r.dayIndex, slot: r.slot, clientId, weekKey: r.weekKey, delta });
      });
    });

    const stats = {};
    unique.forEach(entry => {
      const key = `${entry.day}-${entry.slot}-${entry.clientId}`;
      const stat = stats[key] ?? (stats[key] = {
        day: entry.day, slot: entry.slot, clientId: entry.clientId,
        deltas: [], weekKeys: new Set(),
      });
      if (stat.weekKeys.has(entry.weekKey)) return; // difensiva: mai più di una delta per settimana
      stat.weekKeys.add(entry.weekKey);
      stat.deltas.push(entry.delta);
    });

    return Object.values(stats)
      .filter(s => s.deltas.length >= DIVERGENCE_MIN_OCCURRENCES)
      .map(s => ({
        ...s,
        avgDelta: s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length,
        occurrences: s.deltas.length,
      }))
      .filter(s => !dismissedDivergences.has(`${s.day}-${s.slot}-${s.clientId}`))
      // Ordine di lettura settimanale: giorno → fascia → più corretti prima.
      .sort((a, b) => a.day - b.day || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || b.occurrences - a.occurrences);
  }, [pastOverrides, recurring, dismissedDivergences]);

  async function applyDivergence(item) {
    const client = clients.find(c => c.id === item.clientId);
    const template = recurring.find(r => r.day === item.day && r.slot === item.slot && r.clientId === item.clientId);
    const templateHours = template?.hours ?? 0;
    const newHours = Math.max(0, Math.round((templateHours + item.avgDelta) * 4) / 4);
    const action = template
      ? (newHours <= 0 ? 'eliminare' : 'aggiornare')
      : 'aggiungere';
    const msg =
      `Confermi di ${action} il blocco ricorrente per ${client?.name ?? '—'} in ${SLOT_ROW_LABELS[item.slot]} di ${DAY_SHORT[item.day]}?\n\n` +
      `Template attuale: ${fmtH(templateHours)}\n` +
      `Effettivo medio: ${fmtH(templateHours + item.avgDelta)} (${item.avgDelta > 0 ? '+' : ''}${fmtH(item.avgDelta)})\n` +
      `Nuovo template: ${fmtH(newHours)}\n` +
      `Occorrenze: ${item.occurrences}/${DIVERGENCE_HISTORY_WEEKS}`;
    if (!window.confirm(msg)) return;
    if (template && newHours <= 0) await removeBlock(template.id);
    else if (template) await updateBlock(template.id, newHours);
    else if (newHours > 0) await addBlock(item.day, item.slot, item.clientId, newHours);
    dismissDivergence(item);
  }

  function dismissDivergence(item) {
    setDismissedDivergences(prev => new Set(prev).add(`${item.day}-${item.slot}-${item.clientId}`));
  }

  // Stato A/M/C dell'area — contestuale (settimana corrente), il template è week-agnostic.
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    const weekKey = fmt(getMondayOfWeek(getToday()));
    window.api.getWeekAreaStatuses(weekKey).then(rows => {
      setStatuses(Object.fromEntries(rows.map(row => [row.areaId, row.status])));
    });
  }, []);
  const clientsWithStatus = withAreaStatus(clients, statuses);

  useEffect(() => {
    function onDragEnd() { setDragging(null); setDragOver(null); }
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, []);

  async function addBlock(day, slot, clientId, hours) {
    if (!clientId) return;
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    const position = recurring.filter(r => r.day === day && r.slot === slot).length;
    const r = { id: `r-${crypto.randomUUID()}`, clientId, slot, day, hours, position };
    window.api.saveRecurring(r);
    setRecurring(prev => [...prev, r]);
  }

  async function updateBlock(id, hours) {
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    setRecurring(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, hours };
      window.api.saveRecurring(updated);
      return updated;
    }));
  }

  async function removeBlock(id) {
    if (!window.confirm('Eliminare questo blocco ricorrente?')) return;
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    window.api.deleteRecurring(id);
    setRecurring(prev => prev.filter(r => r.id !== id));
  }

  async function duplicateBlock(sourceId) {
    const src = recurring.find(r => r.id === sourceId);
    if (!src) return;
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    const position = recurring.filter(r => r.day === src.day && r.slot === src.slot).length;
    const newBlock = { id: `r-${crypto.randomUUID()}`, clientId: src.clientId, slot: src.slot, day: src.day, hours: src.hours, position };
    window.api.saveRecurring(newBlock);
    setRecurring(prev => [...prev, newBlock]);
  }

  // Called by MultiSlotCell when blocks are reordered within the same slot/day
  async function reorderBlocks(reorderedBlocks) {
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    const withPositions = reorderedBlocks.map((b, i) => ({ ...b, position: i }));
    setRecurring(prev => {
      const map = new Map(withPositions.map(b => [b.id, b]));
      return prev.map(r => map.get(r.id) ?? r);
    });
    withPositions.forEach(b => window.api.saveRecurring(b));
  }

  // Called when a block is dropped onto a different slot/day
  async function handleDrop(toDay, toSlot) {
    if (!dragging) return;
    const { blockId, fromDay, fromSlot, clientId, hours } = dragging;
    if (fromDay === toDay && fromSlot === toSlot) { setDragging(null); setDragOver(null); return; }
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    window.api.deleteRecurring(blockId);
    const position = recurring.filter(r => r.day === toDay && r.slot === toSlot).length;
    const newBlock = { id: `r-${crypto.randomUUID()}`, clientId, slot: toSlot, day: toDay, hours, position };
    window.api.saveRecurring(newBlock);
    setRecurring(prev => [...prev.filter(r => r.id !== blockId), newBlock]);
    setDragging(null);
    setDragOver(null);
  }

  const totalPerDay = Array.from({ length: RECURRING_DAYS }, (_, i) =>
    recurring.filter(r => r.day === i).reduce((s, r) => s + r.hours, 0)
  );
  const weekTotal = totalPerDay.reduce((s, h) => s + h, 0);

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--tb-text-secondary)', marginBottom: 20, maxWidth: 560, lineHeight: 1.6 }}>
        Il template settimanale con il nuovo sistema di segnali (colore = area;
        A/M/C con forma; <span className="tb-delta">Δ</span> dove correggi spesso lo
        stesso slot). Le modifiche qui si applicano a tutte le settimane future; puoi
        sovrascrivere singole settimane dalla vista <strong>Settimana</strong>.
      </p>

      {/* Override ripetuti — drill-down (redesign #5a): slot dove lo storicizzato
          diverge dal template per almeno DIVERGENCE_MIN_OCCURRENCES delle ultime
          DIVERGENCE_HISTORY_WEEKS settimane passate. */}
      <details open style={{ border: '1px solid var(--tb-border)', borderRadius: 10, background: 'var(--tb-panel-bg)', marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', padding: '12px 14px', listStyle: 'revert' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, verticalAlign: 'middle' }}>
            <span className="tb-delta">Δ</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)' }}>Override ripetuti</span>
            {divergences.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-secondary)', background: 'var(--tb-panel-bg-subtle)', borderRadius: 8, padding: '1px 7px' }}>{divergences.length}</span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)' }}>slot che correggi a mano di continuo — il template non riflette come lavori</span>
          </span>
        </summary>
        <div style={{ padding: '0 14px 12px' }}>
        {divergences.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>
            Nessuna divergenza ricorrente nelle ultime {DIVERGENCE_HISTORY_WEEKS} settimane.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              const DIVERGENCE_COLUMNS = '14px minmax(150px, 1fr) 64px 80px 60px 48px 188px';
              const buttonBase = {
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                border: '1px solid var(--tb-border)', cursor: 'pointer',
                fontFamily: "'Open Sans', sans-serif",
              };
              const th = (label, align = 'right') => ({
                textAlign: align, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--tb-text-faint)', paddingBottom: 4,
              });
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: DIVERGENCE_COLUMNS, gap: 8, padding: '0 8px' }}>
                    <div />
                    <div style={th('Fascia · Area', 'left')}>Fascia · Area</div>
                    <div style={th()}>Template</div>
                    <div style={th()}>Effettivo</div>
                    <div style={th()}>Δ</div>
                    <div style={th()}>Sett.</div>
                    <div style={th('Azioni', 'right')}>Azioni</div>
                  </div>
                  {divergences.map((item, idx) => {
                    const client = clients.find(c => c.id === item.clientId);
                    const template = recurring.find(r => r.day === item.day && r.slot === item.slot && r.clientId === item.clientId);
                    const templateHours = template?.hours ?? 0;
                    const effettivo = templateHours + item.avgDelta;
                    const key = `${item.day}-${item.slot}-${item.clientId}`;
                    const showDayHeader = idx === 0 || divergences[idx - 1].day !== item.day;
                    const cellNum = { textAlign: 'right', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--tb-text-secondary)', whiteSpace: 'nowrap' };
                    return (
                      <React.Fragment key={key}>
                        {showDayHeader && (
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', marginTop: idx === 0 ? 2 : 6, marginBottom: 2 }}>
                            {DAY_SHORT[item.day]}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: DIVERGENCE_COLUMNS, gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'var(--tb-panel-bg-subtle)' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: client?.color ?? 'var(--tb-border)' }} />
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {SLOT_ROW_LABELS[item.slot]} · {client?.name ?? '—'}
                          </div>
                          <div style={cellNum}>{fmtH(templateHours)}</div>
                          <div style={{ ...cellNum, color: 'var(--tb-text-primary)', fontWeight: 800 }}>{fmtH(effettivo)}</div>
                          <div style={{ ...cellNum, color: item.avgDelta > 0 ? 'var(--tb-tone-positive, green)' : 'var(--tb-tone-negative, red)' }}>
                            {item.avgDelta > 0 ? '+' : ''}{fmtH(item.avgDelta)}
                          </div>
                          <div style={cellNum}>{`${item.occurrences}/${DIVERGENCE_HISTORY_WEEKS}`}</div>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button onClick={() => applyDivergence(item)} style={{ ...buttonBase, background: 'var(--tb-panel-bg)', color: 'var(--tb-text-primary)' }}>Applica</button>
                            <button onClick={() => dismissDivergence(item)} style={{ ...buttonBase, background: 'transparent', color: 'var(--tb-text-muted)' }}>Ignora</button>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </>
              );
            })()}
          </div>
        )}
        </div>
      </details>

      <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${RECURRING_DAYS}, 1fr)` }}>

          {/* Header */}
          <div style={{ background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)', padding: '10px 14px',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }} />
          {DAY_SHORT.map((d, i) => (
            <div key={i} style={{ background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)',
              borderLeft: '1px solid var(--tb-border-soft)', padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-muted)' }}>{d}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-primary)', marginTop: 2 }}>{fmtH(totalPerDay[i])}</div>
            </div>
          ))}

          {/* One row per slot (AM / PM / Sera) */}
          {SLOTS.map((slot, si) => {
            const isLast = si === SLOTS.length - 1;
            const rowBottom = isLast ? {} : { borderBottom: '2px solid var(--tb-border)' };
            return (
              <React.Fragment key={slot}>
                <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'flex-start', ...rowBottom }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', paddingTop: 4 }}>{SLOT_ROW_LABELS[slot]}</div>
                </div>
                {Array.from({ length: RECURRING_DAYS }, (_, i) => {
                  const blocks = recurring.filter(r => r.day === i && r.slot === slot).sort((a, b) => a.position - b.position);
                  const isDropTarget = dragOver?.day === i && dragOver?.slot === slot;
                  return (
                    <MultiSlotCell
                      key={i}
                      blocks={blocks}
                      clients={clientsWithStatus}
                      onAdd={(cid, h) => addBlock(i, slot, cid, h)}
                      onUpdate={updateBlock}
                      onRemove={removeBlock}
                      onDuplicate={duplicateBlock}
                      onReorder={reorderBlocks}
                      onDragStart={(blockId, cid, h) => setDragging({ blockId, fromDay: i, fromSlot: slot, clientId: cid, hours: h })}
                      draggingId={dragging?.blockId}
                      isDropTarget={isDropTarget}
                      onDragOver={() => setDragOver({ day: i, slot })}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => handleDrop(i, slot)}
                      capacityHours={slotCapacity[slot]}
                      style={{ borderLeft: '1px solid var(--tb-border-soft)', ...rowBottom }}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Weekly summary */}
      <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', padding: 16,
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--tb-text-faint)', marginBottom: 2 }}>Totale settimana</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{fmtH(weekTotal)}</div>
        </div>
        {clients.map(c => {
          const h = recurring.filter(r => r.clientId === c.id).reduce((s, r) => s + r.hours, 0);
          if (!h) return null;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
              <span style={{ fontSize: 12, color: 'var(--tb-text-secondary)', fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)' }}>{fmtH(h)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
