export function computeHourlyEarnings(pairedRows = [], options = {}) {
  const baseRate = Number(options.baseRate || 0);
  const overtimeRate = Number(options.overtimeRate || (baseRate * 1.25));
  const lateDeduction = Number(options.lateDeduction || 0);
  const expectedDailyHours = Number(options.expectedDailyHours || 8);
  const maxOvertimeHours = Number(options.maxOvertimeHours || 2); // Cap OT to 2 hours per day by default
  const schedule = options.schedule;

  // DEBUG: Log what schedule we received
  console.error('[computeHourlyEarnings] RECEIVED schedule:', {
    scheduleExists: !!schedule,
    scheduleKeys: schedule ? Object.keys(schedule) : 'no schedule',
    scheduleValue: schedule
  });

  // Days array used when a schedule object (with named days) is provided.
  const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Helper: convert HH:MM time to minutes since midnight
  const convertTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours * 60) + minutes;
  };

  // Helper: determine if a check-in time is late based on schedule
  const isLateBySchedule = (schedule, date, checkInTime) => {
    if (!schedule || !date || !checkInTime) return false;
    
    try {
      // Handle multiple schedule formats
      let startTime;
      if (schedule.startTime) {
        // Format 1: direct schedule object with startTime
        startTime = schedule.startTime;
      } else if (schedule.schedule) {
        // Format 2: schedule by day of week (old format with named day keys)
        const dateObj = new Date(date + 'T00:00:00+08:00');
        const dayKey = DAYS_OF_WEEK[dateObj.getDay()].toLowerCase();
        const daySchedule = schedule.schedule[dayKey];
        if (!daySchedule || !daySchedule.startTime) return false;
        startTime = daySchedule.startTime;
      } else if (schedule.weekly && Array.isArray(schedule.weekly)) {
        // Format 3: schedule stored as weekly array by day-of-week index (roleData.schedule.weekly)
        const dateObj = new Date(date + 'T00:00:00+08:00');
        const dayIndex = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.
        const dayScheduleArray = schedule.weekly[dayIndex];
        if (!Array.isArray(dayScheduleArray) || dayScheduleArray.length === 0) return false;
        const daySchedule = dayScheduleArray[0];
        if (!daySchedule || !daySchedule.startTime) return false;
        startTime = daySchedule.startTime;
      } else {
        return false;
      }

      const checkInMinutes = convertTimeToMinutes(checkInTime);
      const scheduleStartMinutes = convertTimeToMinutes(startTime);
      const gracePeriod = 15; // 15-minute grace period

      const isLate = checkInMinutes > (scheduleStartMinutes + gracePeriod);
      try {
        // Use error-level logs so these are visible in browser consoles during debugging
        console.error('[isLateBySchedule]', { date, startTime, checkInTime, scheduleStartMinutes, checkInMinutes, gracePeriod, isLate });
      } catch (e) { /* ignore logging errors */ }

      return isLate;
    } catch (e) {
      console.error('Error determining late status:', e);
      return false;
    }
  };

  let totalHours = 0;
  let totalOvertime = 0;
  let lateCount = 0;

  (pairedRows || []).forEach(row => {
    const hrs = Number(row.hours || 0);
    if (!isFinite(hrs) || hrs <= 0) return;

    let overtimeH = 0;

    try {
      // If a schedule object was provided in options, prefer schedule-aware overtime
      const schedule = options.schedule || null;
      let endTime = null;
      
      if (schedule && row.date && row.checkOut) {
        // Extract endTime from schedule (supports multiple shapes)
        if (schedule.endTime) {
          // Shape 1: flat schedule with endTime at root
          endTime = schedule.endTime;
        } else if (schedule.schedule) {
          // Shape 2: weekly schedule with day keys (old format)
          const dateObj = new Date(row.date + 'T00:00:00');
          const dayKey = DAYS_OF_WEEK[dateObj.getDay()];
          const daySchedule = (schedule.schedule || {})[dayKey];
          if (daySchedule && daySchedule.endTime) endTime = daySchedule.endTime;
        } else if (schedule.weekly && Array.isArray(schedule.weekly)) {
          // Shape 3: weekly schedule stored as array by day-of-week index
          const dateObj = new Date(row.date + 'T00:00:00');
          const dayIndex = dateObj.getDay();
          const dayScheduleArray = schedule.weekly[dayIndex];
          if (Array.isArray(dayScheduleArray) && dayScheduleArray.length > 0) {
            const daySchedule = dayScheduleArray[0];
            if (daySchedule && daySchedule.endTime) endTime = daySchedule.endTime;
          }
        }
        
        if (endTime) {
          // compute scheduled end as an ISO datetime on the row.date
          const scheduledEndIso = `${row.date}T${endTime}`;
          let scheduledEnd = new Date(scheduledEndIso);
          let actualCheckOut = new Date(row.checkOut);
          // if checkout is before scheduled end, but likely represents next day (night shift), adjust
          if (actualCheckOut < scheduledEnd) {
            // if the difference is large negative, try adding a day to checkOut
            const alt = new Date(actualCheckOut);
            alt.setDate(alt.getDate() + 1);
            if (alt > scheduledEnd) actualCheckOut = alt;
          }
          const diffMins = (actualCheckOut.getTime() - scheduledEnd.getTime()) / (1000 * 60);
          const diffHours = Math.max(0, diffMins / 60);
          overtimeH = Math.max(0, diffHours);
        }
      }
    } catch (e) {
      // fallback to default calculation below
      overtimeH = 0;
    }

    // fallback to original behavior if no schedule-derived overtime was computed
    if (!overtimeH || overtimeH <= 0) {
      overtimeH = Math.max(0, hrs - expectedDailyHours);
    }

    // Cap overtime to maxOvertimeHours per day
    const cappedOvertime = Math.min(overtimeH, maxOvertimeHours);
    const baseH = Math.max(0, hrs - overtimeH);
    totalHours += baseH;
    totalOvertime += cappedOvertime;

    // Determine late status by comparing check-in timestamp against schedule start
    const schedule = options.schedule || null;
    if (row.date && row.checkIn) {
      let determinedLate = false;
      try {
        // Determine startTime from schedule (supports multiple shapes)
        let startTime = null;
        if (schedule && schedule.startTime) {
          // Shape 1: flat schedule with startTime/endTime at root
          startTime = schedule.startTime;
        } else if (schedule && schedule.schedule) {
          // Shape 2: weekly schedule with day keys (old format)
          const dateObj = new Date(row.date + 'T00:00:00+08:00');
          const dayKey = DAYS_OF_WEEK[dateObj.getDay()].toLowerCase();
          const daySchedule = schedule.schedule[dayKey];
          if (daySchedule && daySchedule.startTime) startTime = daySchedule.startTime;
        } else if (schedule && schedule.weekly && Array.isArray(schedule.weekly)) {
          // Shape 3: weekly schedule stored as array by day-of-week index
          const dateObj = new Date(row.date + 'T00:00:00+08:00');
          const dayIndex = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.
          const dayScheduleArray = schedule.weekly[dayIndex];
          // dayScheduleArray is an array like [{ startTime: "09:00", endTime: "17:00" }]
          if (Array.isArray(dayScheduleArray) && dayScheduleArray.length > 0) {
            const daySchedule = dayScheduleArray[0];
            if (daySchedule && daySchedule.startTime) startTime = daySchedule.startTime;
          }
        }

        // Attempt epoch-based comparison using scheduled start datetime in Manila
        if (startTime) {
          const scheduledStartIso = `${row.date}T${startTime}+08:00`;
          const scheduledStart = new Date(scheduledStartIso);
          // Parse actualCheckIn. If the timestamp lacks timezone info, assume Asia/Manila (+08:00).
          let actualCheckIn = null;
          try {
            const raw = String(row.checkIn || '');
            // Detect if time string already contains timezone info (Z or ±HH:MM)
            const hasTZ = /Z$|[+\-]\d{2}:?\d{2}$/.test(raw);
            const parseInput = hasTZ ? raw : `${raw}+08:00`;
            actualCheckIn = new Date(parseInput);
            // If still invalid, attempt fallback using date + HH:MM
            if (isNaN(actualCheckIn.getTime())) {
              const rawTime = row.checkIn?.split('T')[1]?.split(':').slice(0,2).join(':');
              if (rawTime) actualCheckIn = new Date(`${row.date}T${rawTime}+08:00`);
            }
          } catch (e) {
            actualCheckIn = new Date(row.checkIn);
          }

          const graceMs = 15 * 60 * 1000; // 15 minutes
          const diffMs = actualCheckIn.getTime() - scheduledStart.getTime();
          const diffMinutes = Math.round(diffMs / (1000 * 60));
          determinedLate = diffMs > graceMs;

          try {
            console.error('[computeHourlyEarnings] Late-check (epoch):', {
              date: row.date,
              rawCheckIn: row.checkIn,
              scheduledStartIso,
              scheduledStartEpoch: scheduledStart.getTime(),
              actualCheckInEpoch: actualCheckIn.getTime(),
              diffMinutes,
              graceMinutes: 15,
              isLate: determinedLate
            });
          } catch (e) { /* ignore logging errors */ }
        } else {
          // No startTime found for this date; fallback to string-minute comparison
          let checkInTime = null;
          try {
            const checkInDate = new Date(row.checkIn);
            checkInTime = checkInDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false, hour: '2-digit', minute: '2-digit' });
          } catch (e) {
            checkInTime = row.checkIn?.split('T')[1]?.split(':').slice(0, 2).join(':') || null;
          }
          try {
            console.error('[computeHourlyEarnings] Late-check (fallback):', { date: row.date, rawCheckIn: row.checkIn, checkInTime, scheduleProvided: !!schedule });
          } catch (e) { }
          determinedLate = isLateBySchedule(schedule, row.date, checkInTime);
        }
      } catch (e) {
        // If any error occurs during schedule-based detection, fallback to stored status
        console.error('Error during schedule-based late detection:', e);
        determinedLate = false;
      }

      if (determinedLate) lateCount += 1;
    } else if ((row.status || '').toString().toLowerCase() === 'late') {
      // Fallback: use stored status if schedule is not available
      lateCount += 1;
    }
  });

  const baseEarnings = Math.round(totalHours * baseRate * 100) / 100;
  const overtimeEarnings = Math.round(totalOvertime * overtimeRate * 100) / 100;
  const totalLateDeductions = Math.round(lateCount * lateDeduction * 100) / 100;

  const computedGross = Math.round((baseEarnings + overtimeEarnings) * 100) / 100;

  return {
    computedGross,
    totalHours: Math.round(totalHours * 100) / 100,
    totalOvertime: Math.round(totalOvertime * 100) / 100,
    lateCount,
    baseEarnings,
    overtimeEarnings,
    totalLateDeductions
  };
}
