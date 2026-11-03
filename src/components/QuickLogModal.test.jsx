import { describe, test, expect, afterEach } from 'vitest';
import { parseQuickLogQuery } from './QuickLogModal';
import { setMinutesThreshold, DEFAULT_MINUTES_THRESHOLD } from '../hours-threshold';

afterEach(() => setMinutesThreshold(DEFAULT_MINUTES_THRESHOLD));

describe('parseQuickLogQuery', () => {
  test('un numero nudo sotto la soglia sono ore', () => {
    expect(parseQuickLogQuery('INVALSI+8')).toEqual({ search: 'INVALSI', addHours: 8, slot: null });
  });
  test('sopra la soglia sono minuti', () => {
    expect(parseQuickLogQuery('INVALSI+30').addHours).toBe(0.5);
  });
  test('segue la soglia configurata', () => {
    setMinutesThreshold(4);
    expect(parseQuickLogQuery('INVALSI+8').addHours).toBe(8 / 60);
  });
  test('un secondo suffisso dopo il tempo è la fascia', () => {
    expect(parseQuickLogQuery('Acme +1h +pom')).toEqual({ search: 'Acme', addHours: 1, slot: 'pm' });
    expect(parseQuickLogQuery('Acme +30 sera')).toEqual({ search: 'Acme', addHours: 0.5, slot: 'sera' });
  });
  test('senza tempo valido la fascia da sola non fa niente', () => {
    expect(parseQuickLogQuery('Acme +pom')).toEqual({ search: 'Acme', addHours: null, slot: null });
  });
});
