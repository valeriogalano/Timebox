'use strict';

const { getProjects } = require('../../db/queries');
const { getDayMismatchesData } = require('./day-mismatches');
const { getImportedTodoistTasksData } = require('./todoist-imported');

function roundHours(hours) {
  return Math.round((hours + Number.EPSILON) * 100) / 100;
}

function areaKey(slot, areaId) {
  return `${slot}:${areaId || '?'}`;
}

function taskLabel(task) {
  return task.title || task.todoistProject || task.id || '(untitled)';
}

function sortProjects(a, b) {
  if (b.estimatedHours !== a.estimatedHours) return b.estimatedHours - a.estimatedHours;
  if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount;
  return a.project.localeCompare(b.project, 'it');
}

function getDayReadyBlocksData(date) {
  const mismatches = getDayMismatchesData(date);
  const imported = getImportedTodoistTasksData(date);
  const areaProjects = new Map();
  const taskGroups = new Map();

  for (const project of getProjects()) {
    if (project.archived) continue;
    if (!areaProjects.has(project.clientId)) areaProjects.set(project.clientId, []);
    areaProjects.get(project.clientId).push(project);
  }

  for (const projects of areaProjects.values()) {
    projects.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'it'));
  }

  for (const task of imported.tasks || []) {
    if (!task.timeboxProjectId || task.matchStatus !== 'matched') continue;

    const slot = task.slot === 'pm' ? 'pm' : 'am';
    const key = areaKey(slot, task.areaId);
    const estimatedHours = roundHours(Number(task.estimatedHours || 0));
    if (!taskGroups.has(key)) taskGroups.set(key, new Map());
    const groupsByProject = taskGroups.get(key);
    const existing = groupsByProject.get(task.timeboxProjectId) || {
      projectId: task.timeboxProjectId,
      project: task.timeboxProject || task.timeboxProjectId,
      taskCount: 0,
      estimatedHours: 0,
      tasks: [],
    };
    existing.taskCount += 1;
    existing.estimatedHours = roundHours(existing.estimatedHours + estimatedHours);
    existing.tasks.push({
      id: task.id,
      title: taskLabel(task),
      estimatedHours,
    });
    groupsByProject.set(task.timeboxProjectId, existing);
  }

  const groups = mismatches.mismatches.blocksWithoutReadyTasks.map(block => {
    const key = areaKey(block.slot, block.areaId);
    const groupsByProject = taskGroups.get(key) || new Map();
    const projects = [];
    const seenProjectIds = new Set();

    for (const project of areaProjects.get(block.areaId) || []) {
      const projectTasks = groupsByProject.get(project.id);
      projects.push({
        projectId: project.id,
        project: project.name,
        taskCount: projectTasks?.taskCount || 0,
        estimatedHours: projectTasks?.estimatedHours || 0,
        hasReadyTasks: (projectTasks?.taskCount || 0) > 0,
        tasks: projectTasks?.tasks || [],
      });
      seenProjectIds.add(project.id);
    }

    for (const projectTasks of groupsByProject.values()) {
      if (seenProjectIds.has(projectTasks.projectId)) continue;
      projects.push({
        projectId: projectTasks.projectId,
        project: projectTasks.project,
        taskCount: projectTasks.taskCount,
        estimatedHours: projectTasks.estimatedHours,
        hasReadyTasks: projectTasks.taskCount > 0,
        tasks: projectTasks.tasks,
      });
    }

    projects.sort(sortProjects);

    return {
      slot: block.slot,
      areaId: block.areaId,
      area: block.area,
      blockHours: block.blockHours,
      trackedHours: block.trackedHours,
      availableHours: block.availableHours,
      estimatedHours: block.estimatedHours,
      missingHours: block.missingHours,
      reason: block.reason,
      projects,
    };
  });

  return {
    date,
    syncedAt: mismatches.syncedAt ?? imported.syncedAt ?? null,
    counts: {
      groups: groups.length,
      projectsWithReadyTasks: groups.reduce((sum, group) => sum + group.projects.filter(project => project.hasReadyTasks).length, 0),
      projectsWithoutReadyTasks: groups.reduce((sum, group) => sum + group.projects.filter(project => !project.hasReadyTasks).length, 0),
    },
    groups,
  };
}

module.exports = { getDayReadyBlocksData };
