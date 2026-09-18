'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getClients,
  getProjects,
  saveClient,
  saveProject,
  resetAllData,
  importTodoistProjects,
  findProjectsMissingFromTodoist,
  TODOIST_COLORS,
} = require('../../db/queries');

describe('importTodoistProjects — area color matching', () => {
  beforeEach(() => {
    createTestDb();
    resetAllData();
  });

  it('assigns a new project to the single work area sharing the Todoist color', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.lavender,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });

    const { added } = importTodoistProjects([{ id: 't1', name: 'New Todoist Project', color: 'lavender' }]);
    assert.equal(added, 1);

    const project = getProjects().find(p => p.name === 'New Todoist Project');
    assert.equal(project.clientId, 'design');
    // No generic "Todoist - Lavender" area should have been created.
    assert.equal(getClients().some(c => c.id === 'todoist-lavender'), false);
  });

  it('matches case-insensitively on the hex value', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.lavender.toUpperCase(),
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });

    importTodoistProjects([{ id: 't1', name: 'Case Insensitive Project', color: 'lavender' }]);

    const project = getProjects().find(p => p.name === 'Case Insensitive Project');
    assert.equal(project.clientId, 'design');
  });

  it('falls back to the generic area when two work areas share the same color', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.red,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });
    saveClient({
      id: 'marketing', name: 'Marketing', color: TODOIST_COLORS.red,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 1,
    });

    importTodoistProjects([{ id: 't1', name: 'Ambiguous Color Project', color: 'red' }]);

    const project = getProjects().find(p => p.name === 'Ambiguous Color Project');
    const client = getClients().find(c => c.id === project.clientId);
    assert.equal(client.id, 'todoist-red');
    assert.equal(client.name, 'Todoist - Red');
  });

  it('falls back to the generic area when no work area shares the color', () => {
    importTodoistProjects([{ id: 't1', name: 'No Match Project', color: 'teal' }]);

    const project = getProjects().find(p => p.name === 'No Match Project');
    const client = getClients().find(c => c.id === project.clientId);
    assert.equal(client.id, 'todoist-teal');
  });

  it('ignores existing generic todoist-* areas as match candidates', () => {
    // First project creates the generic "Todoist - Teal" area.
    importTodoistProjects([{ id: 't1', name: 'First Teal Project', color: 'teal' }]);
    assert.ok(getClients().some(c => c.id === 'todoist-teal'));

    // A second Teal project must not "match" the generic area created for the
    // first one — it should reuse it only through the generic-fallback path,
    // never through the color-lookup path (which excludes todoist-* ids).
    importTodoistProjects([{ id: 't2', name: 'Second Teal Project', color: 'teal' }]);
    const project = getProjects().find(p => p.name === 'Second Teal Project');
    assert.equal(project.clientId, 'todoist-teal');
    assert.equal(getClients().filter(c => c.id.startsWith('todoist-teal')).length, 1);
  });

  it('does not recreate a project that already exists by name, even archived', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.lavender,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });
    const before = getProjects().length;

    importTodoistProjects([{ id: 't1', name: 'Existing Project Name', color: 'lavender' }]);
    assert.equal(getProjects().length, before + 1);

    importTodoistProjects([{ id: 't1', name: 'Existing Project Name', color: 'lavender' }]);
    assert.equal(getProjects().length, before + 1, 'does not duplicate on a second import');
  });
});

describe('importTodoistProjects — skips organizational containers', () => {
  beforeEach(() => {
    createTestDb();
    resetAllData();
  });

  it('skips the Inbox project and any project that has children, importing only real leaf projects', () => {
    const { added } = importTodoistProjects([
      { id: 'inbox', name: 'Inbox', color: 'charcoal', is_inbox_project: true },
      { id: 'parent', name: 'Aree di responsabilità', color: 'charcoal' },
      { id: 'child', name: 'Casa', color: 'blue', parent_id: 'parent' },
    ]);

    assert.equal(added, 1);
    const names = getProjects().map(p => p.name);
    assert.ok(names.includes('Casa'));
    assert.ok(!names.includes('Inbox'));
    assert.ok(!names.includes('Aree di responsabilità'));
  });

  it('accepts the camelCase field shape too (inboxProject / parentId)', () => {
    const { added } = importTodoistProjects([
      { id: 'inbox', name: 'Inbox', color: 'charcoal', inboxProject: true },
      { id: 'parent', name: 'Archivio', color: 'charcoal' },
      { id: 'child', name: 'Progetto chiuso', color: 'blue', parentId: 'parent' },
    ]);

    assert.equal(added, 1);
    const names = getProjects().map(p => p.name);
    assert.ok(names.includes('Progetto chiuso'));
    assert.ok(!names.includes('Archivio'));
  });
});

describe('findProjectsMissingFromTodoist', () => {
  beforeEach(() => {
    createTestDb();
    resetAllData();
  });

  it('flags an active project whose name is no longer among the Todoist projects', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.lavender,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });
    saveProject({ id: 'p1', clientId: 'design', name: 'Sito clienti', archived: false, budgetHours: null });

    const missing = findProjectsMissingFromTodoist([{ id: 't1', name: 'Other project', color: 'lavender' }]);

    assert.deepEqual(missing.map(p => p.name), ['Sito clienti']);
    assert.equal(missing[0].areaName, 'Design');
  });

  it('does not flag a project still present in Todoist', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.lavender,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });
    saveProject({ id: 'p1', clientId: 'design', name: 'Sito clienti', archived: false, budgetHours: null });

    const missing = findProjectsMissingFromTodoist([{ id: 't1', name: 'Sito clienti', color: 'lavender' }]);

    assert.deepEqual(missing, []);
  });

  it('does not flag an already archived project', () => {
    saveClient({
      id: 'design', name: 'Design', color: TODOIST_COLORS.lavender,
      billable: true, billing: 'hourly', rate: 60, limitType: 'none', limitHours: null, position: 0,
    });
    saveProject({ id: 'p1', clientId: 'design', name: 'Sito vecchio', archived: true, budgetHours: null });

    const missing = findProjectsMissingFromTodoist([]);

    assert.deepEqual(missing, []);
  });
});
