'use strict';

const { getClients } = require('../../db/queries');

function getClientsData() {
  return getClients().map(c => ({
    name: c.name,
    billable: c.billable,
    billing: c.billing,
    rate: c.rate,
    limitType: c.limitType,
    limitHours: c.limitHours,
  }));
}

module.exports = { getClientsData };
