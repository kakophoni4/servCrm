import {
  calcPayment,
  pickSalaryPercent,
  requiresDocsForDone,
  type SalaryBand,
} from './formulas';

describe('pickSalaryPercent', () => {
  const bands: SalaryBand[] = [
    { minSum: 0, maxSum: 1000, percent: 0.3 },
    { minSum: 1000, maxSum: 5000, percent: 0.4 },
    { minSum: 5000, maxSum: null, percent: 0.5 },
  ];

  it('returns percent for workSum inside a band range', () => {
    expect(pickSalaryPercent(2500, bands)).toBe(0.4);
  });

  it('returns percent when workSum is exactly on minSum boundary', () => {
    expect(pickSalaryPercent(5000, bands)).toBe(0.5);
  });

  it('returns percent when workSum is exactly on maxSum boundary', () => {
    expect(pickSalaryPercent(1000, bands)).toBe(0.3);
  });

  it('returns percent when maxSum is null (open upper bound)', () => {
    expect(pickSalaryPercent(10000, bands)).toBe(0.5);
  });

  it('returns last band percent when workSum is below all minSum values', () => {
    const highBands: SalaryBand[] = [
      { minSum: 100, maxSum: 500, percent: 0.2 },
      { minSum: 500, maxSum: null, percent: 0.35 },
    ];

    // Подозрительное поведение: при workSum ниже всех порогов возвращается
    // процент последнего (максимального) бэнда, а не 0 или первого бэнда.
    expect(pickSalaryPercent(50, highBands)).toBe(0.35);
  });

  it('returns 0 for empty bands array', () => {
    expect(pickSalaryPercent(1000, [])).toBe(0);
  });

  it('sorts unsorted bands before matching', () => {
    const unsorted: SalaryBand[] = [
      { minSum: 5000, maxSum: null, percent: 0.5 },
      { minSum: 0, maxSum: 1000, percent: 0.3 },
      { minSum: 1000, maxSum: 5000, percent: 0.4 },
    ];

    expect(pickSalaryPercent(2500, unsorted)).toBe(0.4);
    expect(pickSalaryPercent(10000, unsorted)).toBe(0.5);
  });
});

describe('calcPayment', () => {
  it('computes workSum, masterSalary and toCompany for a normal case', () => {
    const paid = 1000;
    const partsCost = 200;
    const masterPct = 0.4;

    const result = calcPayment(paid, partsCost, masterPct);

    expect(result.workSum).toBe(800);
    expect(result.masterPct).toBe(0.4);
    expect(result.masterSalary).toBeCloseTo(320);
    expect(result.toCompany).toBeCloseTo(480);
  });

  it('treats partsCost=0 as full paid amount for workSum', () => {
    const result = calcPayment(1000, 0, 0.25);

    expect(result.workSum).toBe(1000);
    expect(result.masterSalary).toBeCloseTo(250);
    expect(result.toCompany).toBeCloseTo(750);
  });

  it('allows negative workSum when partsCost exceeds paid', () => {
    const result = calcPayment(500, 600, 0.4);

    expect(result.workSum).toBe(-100);
    expect(result.masterSalary).toBeCloseTo(-40);
    expect(result.toCompany).toBeCloseTo(-60);
  });

  it('returns zero masterSalary when masterPct=0', () => {
    const result = calcPayment(1000, 200, 0);

    expect(result.workSum).toBe(800);
    expect(result.masterSalary).toBe(0);
    expect(result.toCompany).toBe(800);
  });
});

describe('requiresDocsForDone', () => {
  it('returns false for paid=500', () => {
    expect(requiresDocsForDone(500)).toBe(false);
  });

  it('returns true for paid=500.01', () => {
    expect(requiresDocsForDone(500.01)).toBe(true);
  });

  it('returns false for paid=0', () => {
    expect(requiresDocsForDone(0)).toBe(false);
  });

  it('returns true for paid=1000', () => {
    expect(requiresDocsForDone(1000)).toBe(true);
  });
});
