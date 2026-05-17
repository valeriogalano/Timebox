'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { logHours, findProject } = require('../commands/log');
const { getEntries } = require('../../db/queries');

const TEST_DATE = '2020-06-15';

describe('findProject', () => {
  before(() => createTestDb());

  test('finds a unique project by partial name', () => {
    const { project, client } = findProject('website');
    assert.equal(project.name, 'Website Redesign');
    assert.equal(client.name, 'Acme Corp');
  });

  test('finds a project by client name', () => {
    const { project } = findProject('studio nova');
    assert.equal(project.name, 'Brand Identity');
  });

  test('throws on no match', () => {
    assert.throws(() => findProject('xyznotexist'), /No project found/);
  });

  test('throws on ambiguous match', () => {
    // 'acme' matches both Website Redesign and API Integration (same client)
    assert.throws(() => findProject('acme'), /Ambiguous/);
  });
});

describe('logHours', () => {
  before(() => createTestDb());

  test('creates a new entry', () => {
    const result = logHours({ projectName: 'website', hoursStr: '2:30', slot: 'am', date: TEST_DATE, add: false });
    assert.equal(result.action, 'created');
    assert.equal(result.hours, 2.5);
    assert.equal(result.slot, 'am');
    assert.equal(result.project, 'Website Redesign');
  });

  test('replaces an existing entry by default', () => {
    // entry for TEST_DATE already exists from previous test
    const result = logHours({ projectName: 'website', hoursStr: '4', slot: 'am', date: TEST_DATE, add: false });
    assert.equal(result.action, 'updated');
    assert.equal(result.hours, 4);
    const entries = getEntries(TEST_DATE, TEST_DATE);
    const match = entries.filter(e => e.projectId === result.project || e.hours === 4);
    assert.equal(entries.filter(e => e.hours === 4).length, 1);
  });

  test('adds to existing hours with --add', () => {
    // existing entry has 4h from previous test
    const result = logHours({ projectName: 'website', hoursStr: '1', slot: 'am', date: TEST_DATE, add: true });
    assert.equal(result.action, 'updated');
    assert.equal(result.hours, 5);
  });

  test('deletes entry when hours === 0', () => {
    const result = logHours({ projectName: 'website', hoursStr: '0', slot: 'am', date: TEST_DATE, add: false });
    assert.equal(result.action, 'deleted');
    const entries = getEntries(TEST_DATE, TEST_DATE);
    const found = entries.find(e => e.projectId === result.projectId);
    assert.equal(found, undefined);
  });

  test('noop when 0h on non-existing entry', () => {
    const result = logHours({ projectName: 'website', hoursStr: '0', slot: 'am', date: TEST_DATE, add: false });
    assert.equal(result.action, 'noop');
  });

  test('parses decimal hours', () => {
    const result = logHours({ projectName: 'brand', hoursStr: '1.5', slot: 'pm', date: TEST_DATE, add: false });
    assert.equal(result.hours, 1.5);
  });

  test('parses hh:mm hours', () => {
    const result = logHours({ projectName: 'brand', hoursStr: '1:30', slot: 'pm', date: TEST_DATE, add: false });
    assert.equal(result.hours, 1.5);
  });
});
