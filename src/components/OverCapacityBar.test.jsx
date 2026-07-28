import { describe, it, expect } from 'vitest';
import { barFill } from './OverCapacityBar';

describe('barFill', () => {
  it('non supera mai la traccia', () => {
    for (const [v, c] of [[58.25, 48.5], [120, 100], [1000, 1], [0, 8], [8, 8]]) {
      expect(barFill(v, c).fill).toBeLessThanOrEqual(100);
    }
  });

  it('sotto capacità: proporzionale, nessun segnale', () => {
    expect(barFill(4, 8)).toEqual({ fill: 50, over: false });
  });

  it('oltre capacità: barra piena + segnale', () => {
    expect(barFill(58.25, 48.5)).toEqual({ fill: 100, over: true });
  });

  it('esattamente al tetto: nessun segnale', () => {
    expect(barFill(8, 8).over).toBe(false);
  });

  it('senza capacità: barra piena senza segnale', () => {
    expect(barFill(5, 0)).toEqual({ fill: 100, over: false });
  });
});
