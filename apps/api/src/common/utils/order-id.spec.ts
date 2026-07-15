import {
  buildOrderPrefix,
  buildPublicId,
  weekOfMonth,
} from './order-id';

describe('weekOfMonth', () => {
  it.each([
    [2026, 0, 1, 1],
    [2026, 0, 6, 1],
    [2026, 0, 7, 1],
    [2026, 0, 8, 2],
    [2026, 0, 14, 2],
    [2026, 0, 15, 3],
    [2026, 0, 21, 3],
    [2026, 0, 22, 4],
    [2026, 0, 28, 4],
    [2026, 0, 29, 5],
    [2026, 0, 30, 5],
    [2026, 0, 31, 5],
  ])(
    'day %i → week %i (ceil(day/7), max 5)',
    (year, month, day, expectedWeek) => {
      expect(weekOfMonth(new Date(year, month, day))).toBe(expectedWeek);
    },
  );
});

describe('buildOrderPrefix', () => {
  it('formats MM+YY(2 digits)+W for 2026-07-15 → 07263', () => {
    expect(buildOrderPrefix(new Date(2026, 6, 15))).toBe('07263');
  });

  it('pads month with leading zero (January → 01)', () => {
    expect(buildOrderPrefix(new Date(2026, 0, 10))).toBe('01262');
  });

  it('uses year % 100 for two-digit year (2005 → 05)', () => {
    expect(buildOrderPrefix(new Date(2005, 6, 15))).toBe('07053');
  });
});

describe('buildPublicId', () => {
  it('pads seq to 4 digits (seq=1 → 0001)', () => {
    expect(buildPublicId('07263', 1)).toBe('072630001');
  });

  it('pads seq to 4 digits (seq=42 → 0042)', () => {
    expect(buildPublicId('07263', 42)).toBe('072630042');
  });

  it('does not truncate seq longer than 4 digits (seq=12345)', () => {
    expect(buildPublicId('07263', 12345)).toBe('0726312345');
  });
});
