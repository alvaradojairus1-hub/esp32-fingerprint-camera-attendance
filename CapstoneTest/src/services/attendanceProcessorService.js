import { AttendanceValidator } from '../utils/attendanceValidator';
import { attendanceStatsService } from './attendanceStatsService';
import { scheduleService } from './scheduleService';

export const attendanceProcessorService = {
    /**
     * Process a single attendance record and update stats
     */
    async processAttendanceRecord(record) {
        try {
            // Get the schedule for this user
            const schedules = await scheduleService.getStaffSchedules();
            const userSchedule = schedules.find(s => String(s.userId) === String(record.userId || record.facultyId));
            
            if (!userSchedule || !Array.isArray(userSchedule.weekly)) {
                console.log('No schedule found for user:', record.userId || record.facultyId);
                return null;
            }

            // Convert check-in time to Manila time
            const checkIn = new Date(record.date + 'T' + record.time);
            const utc = checkIn.getTime() + (checkIn.getTimezoneOffset() * 60000);
            const checkInManila = new Date(utc + (3600000 * 8)); // Manila is UTC+8

            // Get day of week (0 = Sunday)
            const dayIndex = checkInManila.getDay();
            const daySchedule = userSchedule.weekly[dayIndex];

            if (!daySchedule || !daySchedule.startTime) {
                console.log('No schedule for this day:', dayIndex);
                return null;
            }

            // Calculate attendance status
            const { status, minutesDifference } = AttendanceValidator.calculateAttendanceStatus(
                record.time.substring(0, 5), // HH:mm
                daySchedule.startTime
            );

            // Update attendance stats
            await attendanceStatsService.updateStats(
                record.userId || record.facultyId,
                record,
                checkInManila,
                status,
                minutesDifference
            );

            return {
                status,
                minutesDifference,
                checkInTime: checkInManila.toLocaleTimeString(),
                scheduleTime: daySchedule.startTime
            };
        } catch (error) {
            console.error('Error processing attendance record:', error);
            throw error;
        }
    },

    /**
     * Process multiple attendance records
     */
    async processAttendanceRecords(records) {
        const results = [];
        for (const record of records) {
            try {
                const result = await this.processAttendanceRecord(record);
                if (result) {
                    results.push({
                        userId: record.userId || record.facultyId,
                        ...result
                    });
                }
            } catch (error) {
                console.error('Error processing record:', error);
            }
        }
        return results;
    }
};