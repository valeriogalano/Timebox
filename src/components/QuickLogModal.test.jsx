import { describe, test, expect, afterEach } from 'vitest';
import { parseQuickLogQuery } from './QuickLogModal';
import { setMinutesThreshold, DEFAULT_MINUTES_THRESHOLD } from '../hours-threshold';

afterEach(() => setMinutesThreshold(DEFAULT_MINUTES_THRESHOLD));

describe('parseQuickLogQuery', () => {
  test('un numero nudo sotto la soglia sono ore', () => {
    expect(parseQuickLogQuery('INVALSI+8')).toEqual({ search: 'INVALSI', addHours: 8 });
  });
  test('sopra la soglia sono minuti', () => {
    expect(parseQuickLogQuery('INVALSI+30').addHours).toBe(0.5);
  });
  test('segue la soglia configurata', () => {
    setMinutesThreshold(4);
    expect(parseQuickLogQuery('INVALSI+8').addHours).toBe(8 / 60);
  });
});
