'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getProjects, getEntries, deleteProject, hasProjectEntries } = require('../../db/queries');

describe('deleteProject', () => {
  before(() => createTestDb());

  test('removes the project entries instead of leaving them orphaned', () => {
    const [project] = getProjects();
    assert.ok(hasProjectEntries(project.id), 'seed data should give this project entries to delete');

    deleteProject(project.id);

    assert.equal(getProjects().some(p => p.id === project.id), false);
    const remainingEntries = getEntries('2000-01-01', '2999-12-31')
      .filter(e => e.projectId === project.id);
    assert.equal(remainingEntries.length, 0);
  });
});
