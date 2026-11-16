import { computeHourlyEarnings } from '../src/services/hourlyCalculator';

describe('computeHourlyEarnings', () => {
  test('calculates base earnings without overtime or late', () => {
    const paired = [
      { userId: 'u1', date: '2025-10-01', hours: 5, status: 'present' }
    ];
    const res = computeHourlyEarnings(paired, { baseRate: 100, overtimeRate: 150, lateDeduction: 50, expectedDailyHours: 8 });
    expect(res.totalHours).toBe(5);
    expect(res.totalOvertime).toBe(0);
    expect(res.baseEarnings).toBe(500);
    expect(res.overtimeEarnings).toBe(0);
    expect(res.totalLateDeductions).toBe(0);
    expect(res.computedGross).toBe(500);
  });

  test('calculates overtime correctly', () => {
    const paired = [
      { userId: 'u1', date: '2025-10-01', hours: 10, status: 'present' }
    ];
    const res = computeHourlyEarnings(paired, { baseRate: 100, overtimeRate: 150, lateDeduction: 50, expectedDailyHours: 8 });
    expect(res.totalHours).toBe(8);
    expect(res.totalOvertime).toBe(2);
    expect(res.baseEarnings).toBe(800);
    expect(res.overtimeEarnings).toBe(300);
    expect(res.computedGross).toBe(1100);
  });

  test('applies late deductions per late occurrence', () => {
    const paired = [
      { userId: 'u1', date: '2025-10-01', hours: 8, status: 'late' },
      { userId: 'u1', date: '2025-10-02', hours: 6, status: 'late' }
    ];
    const res = computeHourlyEarnings(paired, { baseRate: 100, overtimeRate: 150, lateDeduction: 20, expectedDailyHours: 8 });
    expect(res.totalHours).toBe(14); // 8 + 6
    expect(res.totalOvertime).toBe(0);
    expect(res.baseEarnings).toBe(1400);
    expect(res.totalLateDeductions).toBe(40);
    expect(res.computedGross).toBe(1360);
  });

  test('handles empty records gracefully', () => {
    const res = computeHourlyEarnings([], { baseRate: 100, overtimeRate: 150, lateDeduction: 20, expectedDailyHours: 8 });
    expect(res.totalHours).toBe(0);
    expect(res.totalOvertime).toBe(0);
    expect(res.baseEarnings).toBe(0);
    expect(res.computedGross).toBe(0);
  });
});
