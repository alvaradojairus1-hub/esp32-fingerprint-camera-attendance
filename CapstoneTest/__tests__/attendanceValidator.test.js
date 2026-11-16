const { normalizeToDateStr, normalizeTimeStr, isValidTimeString } = require('../src/utils/attendanceValidator');

describe('attendanceValidator', () => {
  test('normalizeToDateStr converts various inputs', () => {
    expect(normalizeToDateStr('2023-09-01')).toBe('2023-09-01');
    expect(normalizeToDateStr('09/01/2023')).toBe('2023-09-01');
    expect(normalizeToDateStr(new Date('2023-09-01T05:00:00Z'))).toBe('2023-09-01');
  });

  test('normalizeTimeStr normalizes times', () => {
    expect(normalizeTimeStr('8:30')).toBe('08:30:00');
    expect(normalizeTimeStr('17:00')).toBe('17:00:00');
    expect(normalizeTimeStr('8:5')).toBe('08:05:00');
  });

  test('isValidTimeString validates correctly', () => {
    expect(isValidTimeString('08:30:00')).toBe(true);
    expect(isValidTimeString('24:00:00')).toBe(false);
    expect(isValidTimeString('8:30')).toBe(false);
  });
});
