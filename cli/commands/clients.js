'use strict';

const { getClients } = require('../../db/queries');

function getClientsData({ nameFilter } = {}) {
  let clients = getClients();
  if (nameFilter) {
    const s = nameFilter.toLowerCase();
    clients = clients.filter(c => c.name.toLowerCase().includes(s));
  }
  return clients.map(c => ({
    id: c.id,
    name: c.name,
    billable: c.billable,
    billing: c.billing,
    rate: c.rate,
    limitType: c.limitType,
    limitHours: c.limitHours,
  }));
}

module.exports = { getClientsData };
