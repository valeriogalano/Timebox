import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMondayOfWeek, addDays, fmt, fmtH, toHHMM, parseHHMM,
  effBillable, normalizeSlot, slotForDate,
} from '../utils.js';
import {
  DEFAULT_MINUTES_THRESHOLD, normalizeMinutesThreshold,
  getMinutesThreshold, setMinutesThreshold,
} from '../hours-threshold.js';

describe('getMondayOfWeek', () => {
  test('returns the same week Monday for a mid-week date', () => {
    // 2026-07-15 is a Wednesday
    assert.equal(fmt(getMondayOfWeek(new Date('2026-07-15T10:00:00'))), '2026-07-13');
  });
  test('Sunday belongs to the week that started six days earlier', () => {
    // 2026-07-19 is a Sunday -> Monday 2026-07-13
    assert.equal(fmt(getMondayOfWeek(new Date('2026-07-19T10:00:00'))), '2026-07-13');
  });
});

describe('addDays', () => {
  test('adds and subtracts across month boundaries', () => {
    assert.equal(fmt(addDays(new Date('2026-07-31T00:00:00'), 1)), '2026-08-01');
    assert.equal(fmt(addDays(new Date('2026-08-01T00:00:00'), -1)), '2026-07-31');
  });
});

describe('fmtH', () => {
  test('zero and falsy render as 0h', () => {
    assert.equal(fmtH(0), '0h');
    assert.equal(fmtH(null), '0h');
  });
  test('rolls 60 minutes into the next hour', () => {
    assert.equal(fmtH(2.999), '3h');
  });
  test('formats fractional hours and keeps the sign', () => {
    assert.equal(fmtH(1.5), '1h 30m');
    assert.equal(fmtH(-1.5), '-1h 30m');
  });
});

describe('toHHMM', () => {
  test('pads minutes and rolls 60 up', () => {
    assert.equal(toHHMM(1.5), '1:30');
    assert.equal(toHHMM(1.999), '2:00');
    assert.equal(toHHMM(0), '');
  });
});

describe('parseHHMM', () => {
  test('parses colon clock format as hours', () => {
    assert.equal(parseHHMM('1:30'), 1.5);
  });
  test('treats a bare number above the threshold as minutes', () => {
    assert.equal(parseHHMM('90'), 1.5);
  });
  test('treats a bare number up to the threshold as hours', () => {
    assert.equal(parseHHMM('8'), 8);
  });
  // Fissa il default, non solo la meccanica: a 9, "10" sono minuti.
  test('col default, 9 sono ore e 10 sono minuti', () => {
    assert.equal(DEFAULT_MINUTES_THRESHOLD, 9);
    assert.equal(parseHHMM('9'), 9);
    assert.equal(parseHHMM('10'), 10 / 60);
  });
  test('accepts comma decimals', () => {
    assert.equal(parseHHMM('1,5'), 1.5);
  });

  // La soglia si passa esplicitamente: i test non devono dipendere dallo stato del modulo.
  test('la soglia sposta il confine fra ore e minuti', () => {
    assert.equal(parseHHMM('8', 6), 8 / 60);   // 8 > 6 -> minuti
    assert.equal(parseHHMM('8', 12), 8);       // 8 <= 12 -> ore
    assert.equal(parseHHMM('20', 24), 20);     // soglia alta: restano ore
  });
  test('il confine e inclusivo: il valore uguale alla soglia resta ore', () => {
    assert.equal(parseHHMM('6', 6), 6);
    assert.equal(parseHHMM('7', 6), 7 / 60);
  });
  test('i due punti vincono sulla soglia, qualunque essa sia', () => {
    assert.equal(parseHHMM('1:30', 1), 1.5);
    assert.equal(parseHHMM('20:00', 1), 20);
  });
});

describe('normalizeMinutesThreshold', () => {
  test('default su valori non numerici', () => {
    assert.equal(normalizeMinutesThreshold(undefined), DEFAULT_MINUTES_THRESHOLD);
    assert.equal(normalizeMinutesThreshold('abc'), DEFAULT_MINUTES_THRESHOLD);
    assert.equal(normalizeMinutesThreshold(null), DEFAULT_MINUTES_THRESHOLD);
    assert.equal(normalizeMinutesThreshold(''), DEFAULT_MINUTES_THRESHOLD);
  });
  test('clamp fra 1 e 24 e arrotondamento a intero', () => {
    assert.equal(normalizeMinutesThreshold(0), 1);
    assert.equal(normalizeMinutesThreshold(-5), 1);
    assert.equal(normalizeMinutesThreshold(99), 24);
    assert.equal(normalizeMinutesThreshold('7.6'), 8);
  });
  test('legge la stringa che arriva dal setting', () => {
    assert.equal(normalizeMinutesThreshold('10'), 10);
  });
});

describe('setMinutesThreshold', () => {
  test('cambia la soglia usata da parseHHMM senza argomento', () => {
    const original = getMinutesThreshold();
    try {
      setMinutesThreshold(6);
      assert.equal(parseHHMM('8'), 8 / 60);
      setMinutesThreshold(12);
      assert.equal(parseHHMM('8'), 8);
    } finally {
      setMinutesThreshold(original);
    }
  });
});

describe('effBillable', () => {
  test('falls back to hours when billableHours is null', () => {
    assert.equal(effBillable({ hours: 4, billableHours: null }), 4);
  });
  test('uses billableHours when present (including zero)', () => {
    assert.equal(effBillable({ hours: 4, billableHours: 0 }), 0);
    assert.equal(effBillable({ hours: 4, billableHours: 2 }), 2);
  });
  test('returns 0 for a missing entry', () => {
    assert.equal(effBillable(null), 0);
  });
});

describe('normalizeSlot', () => {
  test('keeps valid slots and defaults invalid ones to am', () => {
    assert.equal(normalizeSlot('pm'), 'pm');
    assert.equal(normalizeSlot('bogus'), 'am');
    assert.equal(normalizeSlot(undefined), 'am');
  });
});

describe('slotForDate', () => {
  test('splits the day at 13 and 18', () => {
    assert.equal(slotForDate(new Date('2026-07-15T09:00:00')), 'am');
    assert.equal(slotForDate(new Date('2026-07-15T13:00:00')), 'pm');
    assert.equal(slotForDate(new Date('2026-07-15T18:00:00')), 'sera');
  });
});
