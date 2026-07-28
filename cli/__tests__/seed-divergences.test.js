'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getRecurring, getWeekOverridesRange } = require('../../db/queries');

function fmtLocal(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const SLOTS = ['am', 'pm', 'sera'];

function computeDivergences(recurring, rows) {
  const byWeek = {};
  rows.forEach(r => {
    const w = byWeek[r.weekKey] ?? (byWeek[r.weekKey] = {});
    const d = w[r.dayIndex] ?? (w[r.dayIndex] = {});
    d[r.slot] = r.blocks || [];
  });
  const stats = {};
  for (const wk of Object.keys(byWeek)) {
    for (let day = 0; day < 7; day++) {
      for (const slot of SLOTS) {
        const ov = byWeek[wk]?.[day]?.[slot];
        if (ov === undefined) continue;
        const tb = recurring.filter(r => r.day === day && r.slot === slot);
        const cids = new Set([...ov.map(b => b.clientId), ...tb.map(b => b.clientId)]);
        cids.forEach(cid => {
          const actual = ov.filter(b => b.clientId === cid).reduce((s, b) => s + b.hours, 0);
          const tmpl = tb.filter(b => b.clientId === cid).reduce((s, b) => s + b.hours, 0);
          const delta = actual - tmpl;
          if (Math.abs(delta) < 0.01) return;
          const k = `${day}-${slot}-${cid}`;
          if (!stats[k]) stats[k] = { day, slot, clientId: cid, deltas: [] };
          stats[k].deltas.push(delta);
        });
      }
    }
  }
  return stats;
}

describe('seed divergences', () => {
  it('seedDemoData materializes repeated overrides inside the 8-week window', () => {
    createTestDb();
    const recurring = getRecurring();
    const monday = getMonday(new Date());
    monday.setHours(0, 0, 0, 0);
    const fromWeekKey = fmtLocal(addDays(monday, -8 * 7));
    const toWeekKey = fmtLocal(addDays(monday, -7));
    const rows = getWeekOverridesRange(fromWeekKey, toWeekKey);
    assert.ok(rows.length >= 9, `expected at least 9 override rows in window, got ${rows.length}`);

    const stats = computeDivergences(recurring, rows);
    const entries = Object.entries(stats).filter(([, v]) => v.deltas.length >= 3);
    assert.ok(entries.length >= 2, `expected at least 2 divergences, got ${entries.length}: ${JSON.stringify(entries)}`);

    const c3pm = stats['3-pm-c3'];
    assert.ok(c3pm, 'expected c3 PM Wednesday divergence');
    assert.ok(c3pm.deltas.length >= 3, `expected >=3 occurrences for c3 PM Wed, got ${c3pm.deltas.length}`);
    assert.ok(c3pm.deltas.every(d => Math.abs(d - 2) < 0.01), 'c3 PM Wed deltas should be +2h');

    const c1am = stats['4-am-c1'];
    assert.ok(c1am, 'expected c1 AM Friday divergence');
    assert.ok(c1am.deltas.length >= 3, `expected >=3 occurrences for c1 AM Fri, got ${c1am.deltas.length}`);
    assert.ok(c1am.deltas.every(d => Math.abs(d + 1.5) < 0.01), 'c1 AM Fri deltas should be -1.5h');
  });
});