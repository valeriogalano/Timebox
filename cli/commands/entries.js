'use strict';

const { getEntries, getProjects, getClients } = require('../../db/queries');
const { isHourly, effBillable } = require('../../lib/domain');

// Somma ore lavorate e fatturabili per chiave. Le fatturabili restano null fuori
// dalle aree a ore, dove non c'è niente da fatturare a ore.
function totalsBy(rows, keyOf, labelOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const g = groups.get(key) || { ...labelOf(row), hours: 0, billableHours: row.billableHours == null ? null : 0 };
    g.hours += row.hours;
    if (g.billableHours != null) g.billableHours += row.billableHours;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.hours - a.hours);
}

// Le singole entry del Registro in un intervallo di date, con filtro per area e
// progetto (parziale, senza distinguere maiuscole). Senza fascia: quella di un'ora
// registrata non si sceglie e non è un dato da esporre.
function getEntriesData({ from, to, areaFilter, projectFilter } = {}) {
  const projects = Object.fromEntries(getProjects().map(p => [p.id, p]));
  const clients = Object.fromEntries(getClients().map(c => [c.id, c]));
  const area = areaFilter?.toLowerCase();
  const project = projectFilter?.toLowerCase();

  const entries = getEntries(from, to)
    .map(e => {
      const p = projects[e.projectId];
      const c = clients[p?.clientId];
      const hourly = isHourly(c);
      return {
        id: e.id,
        date: e.date,
        project: p?.name || '?',
        projectId: e.projectId,
        area: c?.name || '?',
        areaId: c?.id || null,
        hours: e.hours,
        billableHours: hourly ? effBillable(e) : null,
        billed: hourly ? e.billed : null,
      };
    })
    .filter(e => (!area || e.area.toLowerCase().includes(area)) && (!project || e.project.toLowerCase().includes(project)))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    from,
    to,
    entries,
    byArea: totalsBy(entries, e => e.areaId, e => ({ area: e.area })),
    byProject: totalsBy(entries, e => e.projectId, e => ({ project: e.project, area: e.area })),
    total: entries.reduce((s, e) => s + e.hours, 0),
  };
}

module.exports = { getEntriesData };
