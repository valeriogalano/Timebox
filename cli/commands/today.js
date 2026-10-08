'use strict';

const { getEntries, getProjects, getClients } = require('../../db/queries');
const { effBillable, isHourly } = require('../format');

// Le registrazioni di un giorno, in un elenco solo. Non sono divise per fascia: la
// fascia di un'ora registrata non si sceglie, quindi non è un dato da mostrare.
function getTodayData(date) {
  const projectMap = Object.fromEntries(getProjects().map(p => [p.id, p]));
  const clientMap = Object.fromEntries(getClients().map(c => [c.id, c]));

  const entries = getEntries(date, date).map(e => {
    const project = projectMap[e.projectId];
    const client = project ? clientMap[project.clientId] : null;
    return {
      hours: e.hours,
      billableHours: e.billableHours ?? null,
      project: project?.name || e.projectId,
      client: client?.name || '?',
      area: client?.name || '?',
      isBillable: isHourly(client),
      billed: e.billed,
    };
  });

  return {
    date,
    entries,
    total: entries.reduce((s, e) => s + e.hours, 0),
    totalBillable: entries.reduce((s, e) => s + (e.isBillable ? effBillable(e) : 0), 0),
  };
}

module.exports = { getTodayData };
