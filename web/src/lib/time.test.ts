import { describe, it, expect } from 'vitest';
import { dayPST } from './time';

describe('dayPST (America/Los_Angeles, observes DST — OQ-9)', () => {
  it('uses UTC-7 (PDT) in summer', () => {
    // 2026-06-01 05:00 UTC = 2026-05-31 22:00 PDT
    expect(dayPST(Date.parse('2026-06-01T05:00:00Z'))).toBe('2026-05-31');
  });

  it('uses UTC-8 (PST) in winter', () => {
    // 2026-01-15 05:00 UTC = 2026-01-14 21:00 PST
    expect(dayPST(Date.parse('2026-01-15T05:00:00Z'))).toBe('2026-01-14');
  });

  it('rolls the day at local midnight, not UTC midnight', () => {
    // 2026-06-02 06:59 UTC = 2026-06-01 23:59 PDT (still the 1st)
    expect(dayPST(Date.parse('2026-06-02T06:59:00Z'))).toBe('2026-06-01');
    // 2026-06-02 07:00 UTC = 2026-06-02 00:00 PDT (now the 2nd)
    expect(dayPST(Date.parse('2026-06-02T07:00:00Z'))).toBe('2026-06-02');
  });
});
