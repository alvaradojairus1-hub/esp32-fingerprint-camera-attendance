// src/utils/attendanceValidator.js
// Pure helpers for normalizing and validating attendance date/time values.

export function normalizeToDateStr(v) {
  if (v === undefined || v === null) return null;
  // YYYY-MM-DD
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // MM/DD/YYYY or M/D/YYYY
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mm = String(m[1]).padStart(2, '0');
      const dd = String(m[2]).padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  if (typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  if (v instanceof Date) {
    if (!isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    return null;
  }
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (e) { /* ignore */ }
  return null;
}

export function normalizeTimeStr(t) {
  if (t === undefined || t === null) return null;
  if (typeof t === 'number') {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toTimeString().split(' ')[0];
    return null;
  }
  if (typeof t === 'string') {
    // Accept H:MM, HH:MM, H:M, H:MM:SS
    const m = t.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      const ss = m[3] ? Number(m[3]) : 0;
      if (
        Number.isInteger(hh) && Number.isInteger(mm) && Number.isInteger(ss) &&
        hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59
      ) {
        const HH = String(hh).padStart(2, '0');
        const MM = String(mm).padStart(2, '0');
        const SS = String(ss).padStart(2, '0');
        return `${HH}:${MM}:${SS}`;
      }
      return null;
    }
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toTimeString().split(' ')[0];
    return null;
  }
  return null;
}

export function isValidTimeString(t) {
  if (!t) return false;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(String(t))) return false;
  const [hh, mm, ss] = String(t).split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || !Number.isInteger(ss)) return false;
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
}

// also provide a default export for CommonJS compatibility
export default {
  normalizeToDateStr,
  normalizeTimeStr,
  isValidTimeString
};

// Named export used by the RealTimeSync component. It validates a batch of pending
// entries and returns { success: [{ record, validation }], failed: [{ record, error }] }
export const AttendanceValidator = {
  calculateAttendanceStatus(checkInTime, scheduleTime) {
    // Convert both times to minutes since midnight
    const [checkHour, checkMin] = checkInTime.split(':').map(Number);
    const [schedHour, schedMin] = scheduleTime.split(':').map(Number);
    
    const checkInMinutes = (checkHour * 60) + checkMin;
    const scheduleMinutes = (schedHour * 60) + schedMin;
    
    // Calculate difference
    const minutesDifference = scheduleMinutes - checkInMinutes;
    
    // Early if check-in is before schedule
    const status = minutesDifference > 0 ? 'early' : 'late';
    
    return {
      status,
      minutesDifference: Math.abs(minutesDifference)
    };
  },

  async processBatchValidation(pendingEntries = []) {
    const success = [];
    const failed = [];

    for (const entry of (pendingEntries || [])) {
      try {
        // entry may include { year, month, day, time, timeKey, userId, facultyId, type, status, timestamp }
        const year = entry.year || null;
        const month = entry.month || null;
        const day = entry.day || null;

        let dateStr = entry.date || null;
        if (!dateStr && year && month && day) {
          const mm = String(month).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          dateStr = `${year}-${mm}-${dd}`;
        }

        const normalizedDate = normalizeToDateStr(dateStr);

        const rawTime = entry.time || entry.timeKey || null;
        const normalizedTime = normalizeTimeStr(rawTime);

        if (!normalizedDate) throw new Error('Invalid date');
        if (!normalizedTime) throw new Error('Invalid time');

        const record = {
          userId: entry.userId || entry.facultyId || null,
          facultyId: entry.facultyId || entry.userId || null,
          date: normalizedDate,
          time: normalizedTime,
          type: entry.type || 'check_in',
          status: entry.status || 'present',
          timestamp: entry.timestamp || Date.now()
        };

        const validation = { status: record.status, message: 'Valid' };
        success.push({ record, validation });
      } catch (err) {
        failed.push({ record: entry, error: err });
      }
    }

    return { success, failed };
  }
};