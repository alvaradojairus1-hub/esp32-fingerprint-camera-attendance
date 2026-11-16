import { ref, get, set, update, push } from 'firebase/database';
import { database, dbRef } from '../firebase';

// Schedule types and validation constants
const SCHEDULE_TYPES = {
  PERMANENT: 'permanent',
  COS: 'cos'  // Contract of Service
};

const SHIFT_TYPES = {
  REGULAR: 'regular',
  FLEXIBLE: 'flexible'
};

// Use an array that matches JavaScript's Date.getDay() indexing (0 = Sunday)
const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Helper function to validate time format (HH:MM)
const isValidTimeFormat = (time) => {
  if (!time) return false;
  const pattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return pattern.test(time);
};

export const scheduleService = {
  async createSchedule(userId, scheduleData) {
    try {
      const {
        type = SCHEDULE_TYPES.PERMANENT,
        shiftType = SHIFT_TYPES.REGULAR,
        schedule = {}
      } = scheduleData;

      // Validate schedule type
      if (!Object.values(SCHEDULE_TYPES).includes(type)) {
        throw new Error('Invalid schedule type');
      }

      // Validate shift type
      if (!Object.values(SHIFT_TYPES).includes(shiftType)) {
        throw new Error('Invalid shift type');
      }

      // For permanent staff, enforce 8-hour shift
      if (type === SCHEDULE_TYPES.PERMANENT) {
        for (const day of DAYS_OF_WEEK) {
          if (schedule[day]) {
            const { startTime, endTime } = schedule[day];
            if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
              throw new Error(`Invalid time format for ${day}`);
            }

            // Calculate shift duration
            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);

            // Enforce 8-hour shift for permanent staff (480 minutes)
            if (duration !== 480) {
              throw new Error(`Permanent staff must have 8-hour shifts. Invalid duration for ${day}`);
            }
          }
        }
      }

      // Create or update schedule
      const scheduleRef = ref(database, dbRef(`schedules/${userId}`));
      await set(scheduleRef, {
        type,
        shiftType,
        schedule,
        updatedAt: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      console.error('Error creating schedule:', error);
      throw error;
    }
  },

  async getSchedule(userId) {
    try {
      const scheduleRef = ref(database, dbRef(`schedules/${userId}`));
      const snapshot = await get(scheduleRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.error('Error getting schedule:', error);
      throw error;
    }
  },

  async updateSchedule(userId, updates) {
    try {
      const currentSchedule = await this.getSchedule(userId);
      if (!currentSchedule) {
        throw new Error('Schedule not found');
      }

      // Validate updates based on staff type
      if (currentSchedule.type === SCHEDULE_TYPES.PERMANENT) {
        const schedule = updates.schedule || {};
        for (const [day, times] of Object.entries(schedule)) {
          if (times) {
            const { startTime, endTime } = times;
            if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
              throw new Error(`Invalid time format for ${day}`);
            }

            // Calculate shift duration
            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);

            // Enforce 8-hour shift for permanent staff
            if (duration !== 480) {
              throw new Error(`Permanent staff must have 8-hour shifts. Invalid duration for ${day}`);
            }
          }
        }
      }

      const scheduleRef = ref(database, dbRef(`schedules/${userId}`));
      await update(scheduleRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating schedule:', error);
      throw error;
    }
  },

  async getStaffSchedules(staffType) {
    try {
      const schedulesRef = ref(database, dbRef('schedules'));
      const snapshot = await get(schedulesRef);
      
      if (!snapshot.exists()) return [];

      const schedules = [];
      const val = snapshot.val();

      for (const [userId, schedule] of Object.entries(val)) {
        if (!staffType || schedule.type === staffType) {
          schedules.push({
            userId,
            ...schedule
          });
        }
      }

      return schedules;
    } catch (error) {
      console.error('Error getting staff schedules:', error);
      throw error;
    }
  },

  // Schedule change history for auditing
  async logScheduleChange(userId, changeData) {
    try {
      const historyRef = ref(database, dbRef(`scheduleHistory/${userId}`));
      const newHistoryRef = push(historyRef);
      await set(newHistoryRef, {
        ...changeData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging schedule change:', error);
      // Don't throw here, just log the error since this is an auxiliary operation
    }
  },

  // Attendance validation against schedule
  validateAttendanceAgainstSchedule(schedule, attendanceDate, attendanceTime) {
    if (!schedule || !attendanceDate || !attendanceTime) {
      throw new Error('Missing required parameters');
    }

    // Handle both old and new schedule formats
    let startTime, endTime;
    if (schedule.startTime && schedule.endTime) {
      // New format: direct schedule object
      startTime = schedule.startTime;
      endTime = schedule.endTime;
    } else if (schedule.schedule) {
      // Old format: schedule by day
      let date;
      try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(attendanceDate))) {
          date = new Date(`${attendanceDate}T00:00:00+08:00`);
        } else {
          date = new Date(attendanceDate);
        }
      } catch (e) {
        date = new Date(attendanceDate);
      }
      const day = DAYS_OF_WEEK[date.getDay()].toLowerCase();
      const daySchedule = schedule.schedule[day];
      if (!daySchedule) {
        return { isValid: false, reason: 'No schedule for this day' };
      }
      startTime = daySchedule.startTime;
      endTime = daySchedule.endTime;
    } else {
      return { isValid: false, reason: 'Invalid schedule format' };
    }
    const attendanceTimeMinutes = this.convertTimeToMinutes(attendanceTime);
    const scheduleStartMinutes = this.convertTimeToMinutes(startTime);
    const scheduleEndMinutes = this.convertTimeToMinutes(endTime);

    // Grace period: 15 minutes for being late
    const gracePeriod = 15;
    const isLate = attendanceTimeMinutes > (scheduleStartMinutes + gracePeriod);
    const isEarlyOut = attendanceTimeMinutes < scheduleEndMinutes;

    // Log validation calculation
    console.log('[validateAttendance] Time check:', {
      attendanceTime,
      attendanceMinutes: attendanceTimeMinutes,
      startTime,
      startMinutes: scheduleStartMinutes,
      endTime,
      endMinutes: scheduleEndMinutes,
      isLate,
      isEarlyOut,
      gracePeriod
    });

    return {
      isValid: true,
      isLate,
      isEarlyOut,
      scheduleStart: startTime,
      scheduleEnd: endTime,
      gracePeriod
    };
  },

  // Helper to convert HH:MM to minutes for easier comparison
  convertTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours * 60) + minutes;
  },

  // Check current attendance status against schedule
  async checkCurrentAttendanceStatus(schedule) {
    if (!schedule) return 'no_schedule';
    
    const now = new Date();
    const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const day = DAYS_OF_WEEK[manila.getDay()].toLowerCase();
    const daySchedule = schedule.schedule?.[day];
    
    if (!daySchedule?.startTime || !daySchedule?.endTime) {
      return 'no_schedule';
    }
    
    const currentTime = `${manila.getHours().toString().padStart(2, '0')}:${manila.getMinutes().toString().padStart(2, '0')}`;
    const validation = this.validateAttendanceAgainstSchedule(schedule, manila, currentTime);
    
    if (!validation.isValid) return 'no_schedule';
    if (validation.isLate) return 'late';
    return 'on_time';
  }
};