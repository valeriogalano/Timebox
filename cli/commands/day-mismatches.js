'use strict';

const { getDaySummaryData } = require('./day-summary');
const { getImportedTodoistTasksData } = require('./todoist-imported');

const SLOTS = ['am', 'pm'];

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

function getDayMismatchesData(date) {
  const summary = getDaySummaryData(date);
  const imported = getImportedTodoistTasksData(date);
  const tasks = imported.tasks || [];
  const plannedByAreaSlot = new Map();
  const trackedByAreaSlot = new Map();
  const taskEstimateByAreaSlot = new Map();

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
  const tasksOverBlockCapacity = [];

  for (const task of tasks) {
    const hours = taskHours(task);
    const slot = task.slot === 'pm' ? 'pm' : 'am';

    if (!task.timeboxProjectId || task.matchStatus !== 'matched') {
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
    taskEstimateByAreaSlot.set(key, roundHours((taskEstimateByAreaSlot.get(key) || 0) + hours));

    if (!plannedByAreaSlot.has(key)) {
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
    if (hours > availableBeforeTask) {
      const planned = plannedByAreaSlot.get(key);
      tasksOverBlockCapacity.push({
        id: task.id,
        title: taskLabel(task),
        project: task.timeboxProject,
        areaId: task.areaId,
        area: task.area,
        slot,
        estimatedHours: hours,
        availableBeforeTask,
        overflowHours: roundHours(hours - availableBeforeTask),
        blockHours: planned.plannedHours,
        trackedHours: trackedByAreaSlot.get(key) || 0,
      });
    }
    remainingByAreaSlot.set(key, roundHours(availableBeforeTask - hours));
  }

  const blocksWithoutReadyTasks = [];
  for (const [key, planned] of plannedByAreaSlot.entries()) {
    const trackedHours = trackedByAreaSlot.get(key) || 0;
    const availableHours = roundHours(Math.max(0, planned.plannedHours - trackedHours));
    if (availableHours <= 0) continue;
    const estimatedHours = taskEstimateByAreaSlot.get(key) || 0;
    if (estimatedHours >= availableHours) continue;
    blocksWithoutReadyTasks.push({
      slot: planned.slot,
      areaId: planned.areaId,
      area: planned.area,
      blockHours: planned.plannedHours,
      trackedHours,
      availableHours,
      estimatedHours,
      missingHours: roundHours(availableHours - estimatedHours),
      reason: estimatedHours > 0 ? 'insufficient_tasks' : 'no_tasks',
    });
  }

  const estimatedHours = roundHours(tasks.reduce((sum, task) => sum + taskHours(task), 0));
  const residualCapacity = summary.residualCapacity || 0;
  const estimatedBeyondResidualCapacity = estimatedHours > residualCapacity
    ? {
        estimatedHours,
        residualCapacity,
        overflowHours: roundHours(estimatedHours - residualCapacity),
      }
    : null;

  return {
    date,
    syncedAt: imported.syncedAt,
    totals: {
      plannedCapacity: summary.plannedCapacity,
      trackedHours: summary.trackedHours,
      residualCapacity,
      estimatedHours,
    },
    counts: {
      tasksWithoutTimeboxProject: tasksWithoutTimeboxProject.length,
      tasksOutsidePlannedArea: tasksOutsidePlannedArea.length,
      tasksOverBlockCapacity: tasksOverBlockCapacity.length,
      blocksWithoutReadyTasks: blocksWithoutReadyTasks.length,
      estimatedBeyondResidualCapacity: estimatedBeyondResidualCapacity ? 1 : 0,
    },
    mismatches: {
      tasksWithoutTimeboxProject,
      tasksOutsidePlannedArea,
      tasksOverBlockCapacity,
      blocksWithoutReadyTasks,
      estimatedBeyondResidualCapacity,
    },
  };
}

module.exports = { getDayMismatchesData };
