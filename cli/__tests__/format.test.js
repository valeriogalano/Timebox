'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fmtH, parseHours } = require('../format');
const domain = require('../../lib/domain');

describe('fmtH', () => {
  test('rolls minutes into the next hour instead of showing 60m', () => {
    assert.equal(fmtH(2.999), '3h');
    assert.equal(fmtH(1.9917), '2h');
  });

  test('formats exact hours without minutes', () => {
    assert.equal(fmtH(3), '3h');
  });

  test('formats fractional hours normally', () => {
    assert.equal(fmtH(1.5), '1h 30m');
  });

  test('formats negative hours', () => {
    assert.equal(fmtH(-2.999), '-3h');
  });
});

describe('format shared domain wrappers', () => {
  test('CLI format reuses shared domain functions', () => {
    assert.equal(fmtH, domain.fmtH);
    assert.equal(parseHours, domain.parseHours);
  });
});
