'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getProjectsData } = require('../commands/projects');
const { saveProject, getProjects } = require('../../db/queries');

describe('getProjectsData', () => {
  before(() => createTestDb());

  test('returns all active projects by default', () => {
    const data = getProjectsData();
    assert.ok(data.length > 0);
    assert.ok(data.every(p => !p.archived));
  });

  test('filters by client name (partial, case-insensitive)', () => {
    const data = getProjectsData({ clientFilter: 'acme' });
    assert.ok(data.length > 0);
    assert.ok(data.every(p => p.client.toLowerCase().includes('acme')));
  });

  test('filters return empty array for unknown client', () => {
    const data = getProjectsData({ clientFilter: 'nonexistentclientxyz' });
    assert.equal(data.length, 0);
  });

  test('includes archived projects with --all', () => {
    // Archive one project
    const projects = getProjects();
    const first = projects[0];
    saveProject({ ...first, archived: true });

    const withAll = getProjectsData({ includeArchived: true });
    const withoutAll = getProjectsData({ includeArchived: false });
    assert.ok(withAll.length > withoutAll.length);
    assert.ok(withAll.some(p => p.archived));
  });

  test('shows logged hours from all-time totals', () => {
    const data = getProjectsData();
    // Seed data includes entries, so at least one project should have logged > 0
    assert.ok(data.some(p => p.logged > 0));
  });
});
