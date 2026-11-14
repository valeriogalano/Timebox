'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { initDb } = require('../../db/schema');
const q = require('../../db/queries');
const { saveWeekTarget } = require('../commands/targets');

// Lunedì 2 novembre 2026. Alfa ha 20h di template (4h da lunedì a venerdì), Beta nessun blocco.
const WEEK = '2026-11-02';
const MON = WEEK, WED = '2026-11-04', NEXT_WEEK_DAY = '2026-11-10';

const rows = areaId => q.getWeekAreaTargets(WEEK).filter(r => r.areaId === areaId);
const hoursOf = areaId => rows(areaId).map(r => r.hours);

describe('the first target saved after Monday keeps the old value as the Monday target', () => {
  beforeEach(() => {
    q.init(initDb(':memory:'));
    for (const [i, id] of ['a', 'b'].entries()) {
      q.saveClient({ id, name: id, color: '#000', billable: true, billing: 'none', rate: null, limitType: null, limitHours: null, position: i });
    }
    for (let day = 0; day < 5; day++) q.saveRecurring({ id: `ra${day}`, clientId: 'a', slot: 'am', day, hours: 4, position: 0 });
  });

  it('saved on Monday: unchanged, one row', () => {
    saveWeekTarget({ weekKey: WEEK, areaId: 'a', hours: 12 }, MON);
    assert.deepEqual(hoursOf('a'), [12]);
  });

  it('first save on Wednesday: Monday row with the template, then the new value', () => {
    saveWeekTarget({ weekKey: WEEK, areaId: 'a', hours: 12 }, WED);
    assert.deepEqual(hoursOf('a'), [20, 12]);
    assert.equal(rows('a')[0].createdAt.slice(0, 10), MON);
    assert.equal(q.getWeekAreaTargets(WEEK).find(r => r.hours === 12).createdAt.slice(0, 10) > MON, true);
  });

  it('a second save in the same week adds no Monday row', () => {
    saveWeekTarget({ weekKey: WEEK, areaId: 'a', hours: 12 }, WED);
    saveWeekTarget({ weekKey: WEEK, areaId: 'a', hours: 15 }, '2026-11-05');
    assert.deepEqual(hoursOf('a'), [20, 12, 15]);
  });

  it('an area whose template is 0 gets a Monday row of 0', () => {
    saveWeekTarget({ weekKey: WEEK, areaId: 'b', hours: 5 }, WED);
    assert.deepEqual(hoursOf('b'), [0, 5]);
  });

  it('a first save equal to the template leaves the Monday row only', () => {
    saveWeekTarget({ weekKey: WEEK, areaId: 'a', hours: 20 }, WED);
    assert.deepEqual(hoursOf('a'), [20]);
  });

  it('a week that has not started yet gets no Monday row', () => {
    saveWeekTarget({ weekKey: '2026-11-09', areaId: 'a', hours: 12 }, WED);
    assert.deepEqual(q.getWeekAreaTargets('2026-11-09').map(r => r.hours), [12]);
    saveWeekTarget({ weekKey: '2026-11-09', areaId: 'a', hours: 8 }, NEXT_WEEK_DAY);
    assert.deepEqual(q.getWeekAreaTargets('2026-11-09').map(r => r.hours), [12, 8]);
  });
});
