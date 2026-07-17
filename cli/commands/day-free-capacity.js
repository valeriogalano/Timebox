'use strict';

const { getDaySummaryData } = require('./day-summary');
const { getImportedTodoistTasksData } = require('./todoist-imported');

const { SLOTS, normalizeSlot } = require('../../lib/domain');

function roundHours(hours) {
  return Math.round((hours + Number.EPSILON) * 100) / 100;
}

function areaKey(slot, areaId) {
  return `${slot}:${areaId || '?'}`;
}

function taskHours(task) {
  return Number(task.estimatedHours || 0);
}

function taskLabel(task) {
  return task.title || task.todoistProject || task.id || '(untitled)';
}

function getDayFreeCapacityData(date) {
  const summary = getDaySummaryData(date);
  const imported = getImportedTodoistTasksData(date);
  const tasks = imported.tasks || [];
  const plannedByAreaSlot = new Map();
  const trackedByAreaSlot = new Map();

  for (const slot of SLOTS) {
    for (const block of summary.slots[slot].plannedBlocks) {
      const key = areaKey(slot, block.clientId);
      const existing = plannedByAreaSlot.get(key) || {
        slot,
        areaId: block.clientId,
        area: block.area,
        plannedHours: 0,
      };
      existing.plannedHours = roundHours(existing.plannedHours + block.hours);
      plannedByAreaSlot.set(key, existing);
    }

    for (const entry of summary.slots[slot].trackedEntries) {
      if (!entry.clientId) continue;
      const key = areaKey(slot, entry.clientId);
      trackedByAreaSlot.set(key, roundHours((trackedByAreaSlot.get(key) || 0) + entry.hours));
    }
  }

  const remainingByAreaSlot = new Map();
  for (const [key, planned] of plannedByAreaSlot.entries()) {
    const trackedHours = trackedByAreaSlot.get(key) || 0;
    remainingByAreaSlot.set(key, roundHours(Math.max(0, planned.plannedHours - trackedHours)));
  }

  const tasksWithoutTimeboxProject = [];
  const tasksOutsidePlannedArea = [];
  const tasksOverReservedCapacity = [];

  let totalEstimatedHours = 0;
  let matchedTaskHours = 0;
  let unmatchedTaskHours = 0;
  let outsidePlannedTaskHours = 0;
  let overflowTaskHours = 0;

  for (const task of tasks) {
    const hours = roundHours(taskHours(task));
    if (hours <= 0) continue;

    totalEstimatedHours = roundHours(totalEstimatedHours + hours);
    const slot = normalizeSlot(task.slot);

    if (!task.timeboxProjectId || task.matchStatus !== 'matched') {
      unmatchedTaskHours = roundHours(unmatchedTaskHours + hours);
      tasksWithoutTimeboxProject.push({
        id: task.id,
        title: taskLabel(task),
        todoistProject: task.todoistProject,
        slot,
        estimatedHours: hours,
        matchStatus: task.matchStatus,
      });
      continue;
    }

    const key = areaKey(slot, task.areaId);
    if (!plannedByAreaSlot.has(key)) {
      outsidePlannedTaskHours = roundHours(outsidePlannedTaskHours + hours);
      tasksOutsidePlannedArea.push({
        id: task.id,
        title: taskLabel(task),
        project: task.timeboxProject,
        areaId: task.areaId,
        area: task.area,
        slot,
        estimatedHours: hours,
      });
      continue;
    }

    const availableBeforeTask = remainingByAreaSlot.get(key) || 0;
    const coveredByReservedHours = roundHours(Math.min(hours, availableBeforeTask));
    const overflowHours = roundHours(hours - coveredByReservedHours);

    matchedTaskHours = roundHours(matchedTaskHours + coveredByReservedHours);
    remainingByAreaSlot.set(key, roundHours(availableBeforeTask - coveredByReservedHours));

    if (overflowHours > 0) {
      overflowTaskHours = roundHours(overflowTaskHours + overflowHours);
      const planned = plannedByAreaSlot.get(key);
      tasksOverReservedCapacity.push({
        id: task.id,
        title: taskLabel(task),
        project: task.timeboxProject,
        areaId: task.areaId,
        area: task.area,
        slot,
        estimatedHours: hours,
        coveredByReservedHours,
        availableBeforeTask,
        overflowHours,
        blockHours: planned.plannedHours,
        trackedHours: trackedByAreaSlot.get(key) || 0,
      });
    }
  }

  const reservedWithoutTasks = [];
  let reservedWithoutTasksHours = 0;
  for (const [key, planned] of plannedByAreaSlot.entries()) {
    const remainingHours = roundHours(remainingByAreaSlot.get(key) || 0);
    if (remainingHours <= 0) continue;

    const trackedHours = trackedByAreaSlot.get(key) || 0;
    const coveredByTasksHours = roundHours(Math.max(0, planned.plannedHours - trackedHours - remainingHours));
    reservedWithoutTasksHours = roundHours(reservedWithoutTasksHours + remainingHours);
    reservedWithoutTasks.push({
      slot: planned.slot,
      areaId: planned.areaId,
      area: planned.area,
      blockHours: planned.plannedHours,
      trackedHours,
      coveredByTasksHours,
      reservedWithoutTasksHours: remainingHours,
      reason: coveredByTasksHours > 0 ? 'insufficient_tasks' : 'no_tasks',
    });
  }

  const availableAfterTrackedAndTasks = roundHours(Math.max(0, summary.plannedCapacity - summary.trackedHours - totalEstimatedHours));

  return {
    date,
    syncedAt: imported.syncedAt,
    totals: {
      plannedCapacity: summary.plannedCapacity,
      trackedHours: summary.trackedHours,
      trackedInPlan: summary.trackedInPlan,
      residualCapacity: summary.residualCapacity,
      estimatedHours: totalEstimatedHours,
      matchedTaskHours,
      unmatchedTaskHours,
      outsidePlannedTaskHours,
      overflowTaskHours,
      availableAfterTrackedAndTasks,
      reservedWithoutTasksHours,
    },
    counts: {
      reservedWithoutTasks: reservedWithoutTasks.length,
      tasksWithoutTimeboxProject: tasksWithoutTimeboxProject.length,
      tasksOutsidePlannedArea: tasksOutsidePlannedArea.length,
      tasksOverReservedCapacity: tasksOverReservedCapacity.length,
    },
    reservedWithoutTasks,
    tasksWithoutTimeboxProject,
    tasksOutsidePlannedArea,
    tasksOverReservedCapacity,
  };
}

module.exports = { getDayFreeCapacityData };
