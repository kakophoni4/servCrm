export type SalaryBand = {
  minSum: number;
  maxSum: number | null;
  percent: number;
};

export function pickSalaryPercent(workSum: number, bands: SalaryBand[]): number {
  const sorted = [...bands].sort((a, b) => a.minSum - b.minSum);
  for (const b of sorted) {
    const withinMax = b.maxSum == null || workSum <= Number(b.maxSum);
    if (workSum >= Number(b.minSum) && withinMax) {
      return Number(b.percent);
    }
  }
  return sorted.length ? Number(sorted[sorted.length - 1].percent) : 0;
}

export function calcPayment(paid: number, partsCost: number, masterPct: number) {
  const workSum = paid - partsCost;
  const masterSalary = workSum * masterPct;
  const toCompany = workSum - masterSalary;
  return { workSum, masterPct, masterSalary, toCompany };
}

/** paid > 500 → нужны подтверждающие документы для статуса DONE */
export function requiresDocsForDone(paid: number) {
  return paid > 500;
}
