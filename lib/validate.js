'use strict';

// Checks for the values the HTTP API (and so the CLI and MCP) receives from
// outside. Without them a slot "foo", a dayIndex 99 or a date "tomorrow" was
// saved and never shown again, or reached the domain as an Invalid Date.

const { SLOTS, isDateString } = require('./domain');

const MAX_BLOCK_HOURS = 24;

// A YYYY-MM-DD that is a real day: "2026-02-30" is not.
const isDate = isDateString;

const isSlot = value => SLOTS.includes(value);

// 0 = Monday … 6 = Sunday, as in week_overrides.dayIndex and recurring.day.
const isDayIndex = value => Number.isInteger(value) && value >= 0 && value <= 6;

const isPositiveHours = value =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_BLOCK_HOURS;

module.exports = { isDate, isSlot, isDayIndex, isPositiveHours, MAX_BLOCK_HOURS };
