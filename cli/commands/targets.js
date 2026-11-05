'use strict';

const {
  getEntries, getProjects, getClients, getRecurring, getWeekOverrides,
  getWeekAreaStatusMap, getWeekAreaTargets,
} = require('../../db/queries');
const { fmt, addDays } = require('../format');
const {
  SLOTS, forecastTodayIndex, templateHoursByArea, weekTargets, areaGaps, targetWarnings, GAP_EPSILON,
} = require('../../lib/domain');
const { getEffectiveBlocks, buildOverrideMap } = require('./day-summary');

// Obiettivo, fatto, blocchi rimasti e scarto per area nella settimana che inizia il lunedì
// `weekKey`, con `today` (YYYY-MM-DD) per dividere fatto e piano. Stessi conti di
// Andamento → Settimana (src/area-targets.js, gemello in lib/domain.js).
function getWeekTargetsData(weekKey, today) {
  const sunday = fmt(addDays(new Date(`${weekKey}T00:00:00`), 6));
  const clients = getClients();
  const projects = getProjects();
  const recurring = getRecurring();
  const overrides = buildOverrideMap(getWeekOverrides(weekKey));
  const statusMap = getWeekAreaStatusMap(weekKey);
  const projectArea = Object.fromEntries(projects.map(p => [p.id, p.clientId]));
  const known = new Set(clients.map(c => c.id));

  const plannedByDay = Array.from({ length: 7 }, (_, d) => {
    const day = {};
    for (const slot of SLOTS) {
      for (const b of getEffectiveBlocks(recurring, overrides, weekKey, d, slot)) {
        if (known.has(b.clientId)) day[b.clientId] = (day[b.clientId] ?? 0) + b.hours;
      }
    }
    return day;
  });
  // Fatto fino a oggi: un'ora datata nel futuro non è ancora fatta.
  const doneByDay = Array.from({ length: 7 }, () => ({}));
  for (const e of getEntries(weekKey, today < sunday ? today : sunday)) {
    const id = projectArea[e.projectId];
    if (!known.has(id)) continue;
    const day = doneByDay[forecastTodayIndex(weekKey, e.date)];
    day[id] = (day[id] ?? 0) + e.hours;
  }

  const targets = weekTargets({
    areaIds: clients.map(c => c.id),
    rows: getWeekAreaTargets(weekKey),
    templateByArea: templateHoursByArea(recurring),
  });
  const gaps = areaGaps({
    targets: Object.fromEntries(Object.entries(targets).map(([id, t]) => [id, t.target])),
    plannedByDay, doneByDay,
    todayIdx: forecastTodayIndex(weekKey, today),
  });

  const areas = clients.map(c => {
    const t = targets[c.id];
    const g = gaps.byArea[c.id];
    const status = statusMap[c.id] ?? 'active';
    return {
      areaId: c.id, area: c.name, status,
      templateHours: t.template, mondayTarget: t.monday, target: t.target, targetSet: t.set,
      done: g.done, remaining: g.remaining, gap: g.gap,
      weeklyLimit: c.limitType === 'weekly' && c.limitHours > 0 ? c.limitHours : null,
      warnings: targetWarnings({ client: c, target: t.target, status }),
    };
  });
  return {
    weekKey, today, areas,
    totals: { target: gaps.target, done: gaps.done, remaining: gaps.remaining, gap: gaps.gap },
  };
}

// Testo di un avviso su obiettivo o scarto, per status, CLI e MCP.
function gapLabel(a) {
  const g = a.gap;
  const what = g > 0 ? `${round(g)}h missing` : `${round(-g)}h over target`;
  return `${a.area}: ${what} (target ${round(a.target)}h, done ${round(a.done)}h, blocks left ${round(a.remaining)}h)`;
}

function warningLabel(a, w) {
  if (w.kind === 'over-weekly-limit') return `${a.area}: target ${round(a.target)}h is above the weekly limit (${round(w.limit)}h)`;
  return `${a.area}: area is closed this week but has a target of ${round(a.target)}h`;
}

const round = h => Math.round(h * 100) / 100;

// Avvisi della settimana: lo scarto di ogni area che non è in pari, e gli avvisi
// sull'obiettivo. Come la tabella in Andamento → Settimana: si mostrano, non suggeriscono.
function weekTargetAlerts(data) {
  const out = [];
  for (const a of data.areas) {
    if (Math.abs(a.gap) >= GAP_EPSILON) out.push({ kind: 'area-gap', area: a.area, areaId: a.areaId, gap: a.gap, label: gapLabel(a) });
    for (const w of a.warnings) out.push({ kind: w.kind, area: a.area, areaId: a.areaId, label: warningLabel(a, w) });
  }
  return out;
}

module.exports = { getWeekTargetsData, weekTargetAlerts };
