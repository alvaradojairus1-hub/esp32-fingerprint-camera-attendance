import { attendanceService } from '../src/services/attendanceService';

describe('computeDailyStatusFromData', () => {
  const schedule = {
    schedule: {
      monday: { startTime: '09:00', endTime: '17:00' },
      tuesday: { startTime: '09:00', endTime: '17:00' },
      wednesday: { startTime: '09:00', endTime: '17:00' },
      thursday: { startTime: '09:00', endTime: '17:00' },
      friday: { startTime: '09:00', endTime: '17:00' },
    }
  };

  test('before start returns no_status', () => {
    const nowMinutes = 8 * 60 + 30; // 08:30
    const res = attendanceService.computeDailyStatusFromData(schedule, [], nowMinutes, '2025-11-03');
    expect(res.status).toBe('no_status');
  });

  test('within grace period returns no_status', () => {
    const nowMinutes = 9 * 60 + 10; // 09:10 (within 15min grace)
    const res = attendanceService.computeDailyStatusFromData(schedule, [], nowMinutes, '2025-11-03');
    expect(res.status).toBe('no_status');
  });

  test('past grace returns late', () => {
    const nowMinutes = 9 * 60 + 20; // 09:20
    const res = attendanceService.computeDailyStatusFromData(schedule, [], nowMinutes, '2025-11-03');
    expect(res.status).toBe('late');
  });

  test('after end returns absent', () => {
    const nowMinutes = 17 * 60 + 5; // 17:05
    const res = attendanceService.computeDailyStatusFromData(schedule, [], nowMinutes, '2025-11-03');
    expect(res.status).toBe('absent');
  });

  test('present when attendance exists', () => {
    const attendance = [{ date: '2025-11-03', time: '09:05', status: 'present', rawTimestamp: '2025-11-03T09:05:00' }];
    const res = attendanceService.computeDailyStatusFromData(schedule, attendance, null, '2025-11-03');
    expect(res.status).toBe('present');
  });
});
