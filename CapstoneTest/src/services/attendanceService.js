import { firebaseService } from './firebaseService';
import { scheduleService } from './scheduleService';

const processAttendanceStatus = (schedule, date, time) => {
  if (!schedule || !schedule.startTime || !schedule.endTime) {
    console.log('[processAttendanceStatus] No valid schedule:', schedule);
    return { status: 'no_status', message: 'No schedule defined' };
  }

  try {
    console.log('[processAttendanceStatus] Validating:', { schedule, date, time });
    const validation = scheduleService.validateAttendanceAgainstSchedule(schedule, date, time);
    console.log('[processAttendanceStatus] Validation result:', validation);
    
    if (!validation.isValid) {
      return { status: 'unscheduled', message: validation.reason };
    }

    if (validation.isLate) {
      return { 
        status: 'late', 
        message: `Late arrival. Schedule starts at ${validation.scheduleStart}` 
      };
    }

    if (validation.isEarlyOut) {
      return { 
        status: 'early-out', 
        message: `Early departure. Schedule ends at ${validation.scheduleEnd}` 
      };
    }

    return { status: 'present', message: 'On time' };
  } catch (error) {
    console.error('Error processing attendance status:', error);
    return { status: 'error', message: 'Failed to validate attendance' };
  }
};

// Helper: convert HH:MM time to minutes since midnight
function convertTimeToMinutes(time) {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper: get current time in Asia/Manila as minutes since midnight and date key YYYY-MM-DD
function getManilaNow() {
  const manilaStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  const manila = new Date(manilaStr);
  const hours = manila.getHours();
  const minutes = manila.getMinutes();
  const todayKey = manila.toISOString().slice(0,10);
  return { nowMinutes: hours * 60 + minutes, todayKey };
}

// Compute today's status for a single user taking schedule and actual attendance into account.
// Returns { status, message }
async function computeDailyStatusForUser(userId, dateKey = null) {
  try {
    const { nowMinutes, todayKey } = getManilaNow();
    const dateToCheck = dateKey || todayKey;

    // Load schedule (may be null)
    const schedule = await scheduleService.getSchedule(userId);

    // Load flattened attendance and find any record for this user on dateToCheck
    const allAttendance = await firebaseService.getAttendance();
    const userAttendance = (allAttendance || []).filter(a => {
      const uid = String(userId || '');
      const keys = [String(a.userId || ''), String(a.facultyId || '')];
      return keys.includes(uid) && String(a.date || '').slice(0,10) === dateToCheck;
    });

    // If there is a check-in record, prefer the recorded status
    if (userAttendance && userAttendance.length) {
      // pick latest record
      const latest = userAttendance.reduce((a,b) => (new Date(a.rawTimestamp || `${a.date}T${a.time || '00:00:00'}`) > new Date(b.rawTimestamp || `${b.date}T${b.time || '00:00:00'}`) ? a : b));
      // Prefer rawTimestamp to derive a timezone-correct HH:MM string (Asia/Manila). Fallback to stored time.
      let t = null;
      if (latest.rawTimestamp) {
        try {
          const manilaStr = new Date(latest.rawTimestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' });
          const manilaDate = new Date(manilaStr);
          t = `${manilaDate.getHours().toString().padStart(2, '0')}:${manilaDate.getMinutes().toString().padStart(2, '0')}`;
        } catch (e) {
          // fallback to provided time field
          t = latest.time ? latest.time.split(':').slice(0,2).join(':') : null;
        }
      } else {
        t = latest.time ? latest.time.split(':').slice(0,2).join(':') : null;
      }

      const statusInfo = processAttendanceStatus(schedule, latest.date || dateToCheck, t);
      return statusInfo;
    }

    // No check-in for the user today -> compute based on schedule and Manila now
    if (!schedule || !schedule.schedule) {
      return { status: 'no_status', message: 'No schedule defined' };
    }

    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const manilaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const day = dayNames[manilaDate.getDay()];
    const daySched = schedule.schedule && schedule.schedule[day];
    if (!daySched || !daySched.startTime || !daySched.endTime) {
      return { status: 'no_status', message: 'No schedule for this day' };
    }

    const scheduleStart = scheduleService.convertTimeToMinutes(daySched.startTime);
    const scheduleEnd = scheduleService.convertTimeToMinutes(daySched.endTime);
    const grace = 15; // mirror existing grace period

    // Handle overnight shifts where end < start (shift spans to next day)
    let sStart = scheduleStart;
    let sEnd = scheduleEnd;
    let nm = nowMinutes;
    if (sEnd <= sStart) {
      // shift ends next day
      sEnd = sEnd + 24 * 60; // extend end into next-day minutes
      if (nm < sStart) nm = nm + 24 * 60; // treat early-morning as next-day minutes
    }

    if (nm < sStart) {
      return { status: 'no_status', message: 'Before shift start' };
    }

    if (nm > (sStart + grace) && nm < sEnd) {
      return { status: 'late', message: `No check-in; past shift start ${daySched.startTime}` };
    }

    if (nm >= sEnd) {
      return { status: 'absent', message: `No check-in by end of shift ${daySched.endTime}` };
    }

    // between start and grace window -> still no_status
    return { status: 'no_status', message: 'Within grace period' };
  } catch (err) {
    console.error('computeDailyStatusForUser error', err);
    return { status: 'error', message: String(err) };
  }
}

// Compute daily status from already-loaded data (no DB calls). Useful for UI batch computation.
function computeDailyStatusFromData(schedule, userAttendance = [], nowMinutes = null, dateKey = null) {
  try {
    // 1. First, validate we have a schedule for today
    if (!schedule) {
      console.log('No schedule provided:', schedule);
      return { status: 'no_status', message: 'No schedule defined' };
    }

    // Handle weekly schedule format
    let startTime, endTime;
    if (Array.isArray(schedule)) {
      // If schedule is an array, it's in the weekly format
      const today = new Date();
      const dayIndex = (today.getDay() + 6) % 7; // Convert to Monday = 0, Sunday = 6
      const todaySchedule = schedule[dayIndex]?.[0];
      if (!todaySchedule) {
        return { status: 'no_status', message: 'No schedule for today' };
      }
      startTime = todaySchedule.startTime;
      endTime = todaySchedule.endTime;
    } else {
      // Direct schedule object
      startTime = schedule.startTime;
      endTime = schedule.endTime;
    }

    // Validate we have both start and end times
    if (!startTime || !endTime) {
      return { status: 'no_status', message: 'Invalid schedule times' };
    }
    
    // Log the schedule we're working with
    console.log('Schedule being checked:', { startTime, endTime });

    // 2. If we have attendance records, evaluate them against the schedule
    if (userAttendance && userAttendance.length > 0) {
      const latest = userAttendance[userAttendance.length - 1];
      let checkInTime = latest.time;
      
      if (latest.rawTimestamp) {
        const manilaStr = new Date(latest.rawTimestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' });
        const manilaDate = new Date(manilaStr);
        checkInTime = `${manilaDate.getHours().toString().padStart(2, '0')}:${manilaDate.getMinutes().toString().padStart(2, '0')}`;
      }

      // Log the check-in we're evaluating
      console.log('Processing check-in:', {
        checkInTime,
        scheduleStart: startTime,
        scheduleEnd: endTime
      });

      // Convert all times to minutes for comparison
      const checkInMinutes = convertTimeToMinutes(checkInTime);
      const scheduleStartMinutes = convertTimeToMinutes(startTime);
      const scheduleEndMinutes = convertTimeToMinutes(endTime);
      const graceMinutes = 15;

      // Simple time comparison
      if (checkInMinutes <= scheduleStartMinutes + graceMinutes) {
        return { status: 'present', message: 'On time' };
      } else if (checkInMinutes <= scheduleEndMinutes) {
        return { status: 'late', message: `Late arrival (${checkInTime})` };
      } else {
        return { status: 'early-out', message: 'Left before shift end' };
      }
    }

    // 3. No attendance record - determine status based on current time
    const manila = getManilaNow();
    const nm = (nowMinutes === null || nowMinutes === undefined) ? manila.nowMinutes : nowMinutes;
    
    const scheduleStartMinutes = convertTimeToMinutes(startTime);
    const scheduleEndMinutes = convertTimeToMinutes(endTime);
    const graceMinutes = 15;

    if (nm < scheduleStartMinutes) {
      return { status: 'no_status', message: 'Before shift start' };
    } else if (nm > scheduleEndMinutes) {
      return { status: 'absent', message: 'No check-in by shift end' };
    } else if (nm > scheduleStartMinutes + graceMinutes) {
      return { status: 'late', message: 'No check-in; past grace period' };
    } else {
      return { status: 'no_status', message: 'Within grace period' };
    }
    } catch (err) {
      console.error('Error computing daily status:', err);
      return { status: 'error', message: String(err) };
    }
}

export const attendanceService = {
  // helpers exposed
  getManilaNow,
  computeDailyStatusForUser,
  computeDailyStatusFromData,
  async getAttendance() {
    try {
      return await firebaseService.getAttendance();
    } catch (error) {
      throw new Error('Failed to fetch attendance data');
    }
  },

  async getAttendanceFor(facultyId) {
    try {
      const all = await firebaseService.getAttendance();
      return (all || []).filter(entry => String(entry.userId) === String(facultyId) || entry.facultyId === facultyId);
    } catch (error) {
      throw new Error('Failed to fetch attendance data');
    }
  },

  async getSummary() {
    try {
      // only employees, exclude HR admin accounts
      const users = await firebaseService.getEmployees();
      const leaves = await firebaseService.getLeaveRequests();

      const totalEmployees = (users || []).length;
      let todayPresent = 0;
      let todayLate = 0;
      let todayEarlyOut = 0;

      const todayKey = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }).slice(0, 10);

      // Preload attendance and schedules to avoid per-user DB calls and ensure consistent lookups
      const [allAttendance, allSchedules] = await Promise.all([
        firebaseService.getAttendance(),
        scheduleService.getStaffSchedules()
      ]);

      const scheduleMap = new Map();
      (allSchedules || []).forEach(s => { if (s && s.userId) scheduleMap.set(String(s.userId), s); });

      // For each employee, compute status using preloaded attendance and schedules
      for (const u of (users || [])) {
        try {
          const uid = u && (u.id || u.userId || u.facultyId);
          if (!uid) continue;

          // find schedule from preloaded map; if not found, try flexible matching against common id fields
          let sched = scheduleMap.get(String(uid)) || null;
          if (!sched) {
            // try to find by matching schedule.userId against various user id fields
            sched = (allSchedules || []).find(s => {
              try {
                const sid = String(s && s.userId || '');
                const candidates = [u && u.id, u && u.userId, u && u.facultyId].filter(Boolean).map(String);
                return candidates.some(c => String(c) === sid);
              } catch (e) { return false; }
            }) || null;
          }

          // find attendance records for this user for today
          const userAttendance = (allAttendance || []).filter(a => {
            const keys = [String(a.userId || ''), String(a.facultyId || '')];
            return keys.includes(String(uid)) && String(a.date || '').slice(0,10) === todayKey;
          });

          const statusInfo = computeDailyStatusFromData(sched, userAttendance, null, todayKey);
          try {
            console.log('[attendanceService] summaryStatus', { userId: uid, status: statusInfo && statusInfo.status, message: statusInfo && statusInfo.message });
          } catch (e) { }

          switch (statusInfo.status) {
            case 'present':
              todayPresent++;
              break;
            case 'late':
              todayLate++;
              break;
            case 'early-out':
              todayEarlyOut++;
              break;
            default:
              break;
          }
        } catch (e) {
          console.error('Error computing status for user in summary:', e);
        }
      }

      const pendingLeaves = (leaves || []).filter(v => (v.status || '').toString().toLowerCase() === 'pending').length;

      return {
        totalEmployees,
        todayPresent,
        todayLate,
        todayEarlyOut,
        pendingLeaves
      };
    } catch (error) {
      throw new Error('Failed to fetch attendance summary');
    }
  },

  async recordAttendance(userId, type, date = new Date().toISOString().slice(0, 10), time = new Date().toTimeString().slice(0, 5)) {
    try {
      // Get user's schedule
      const schedule = await scheduleService.getSchedule(userId);
      
      // Process attendance status against schedule
      const statusInfo = processAttendanceStatus(schedule, date, time);

      // Record attendance with status
      const result = await firebaseService.recordAttendance({
        userId,
        date,
        time,
        type,
        status: statusInfo.status,
        message: statusInfo.message,
        timestamp: new Date().toISOString()
      });

      // Log the attendance record
      await firebaseService.writeAuditLog({
        action: 'record_attendance',
        userId,
        date,
        time,
        type,
        status: statusInfo.status,
        message: statusInfo.message
      });

      return {
        success: result.success,
        status: statusInfo.status,
        message: statusInfo.message
      };
    } catch (error) {
      console.error('Error recording attendance:', error);
      throw error;
    }
  }
};
